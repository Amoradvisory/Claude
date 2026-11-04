import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import worker from '../src/index';
import { consent } from '../src/consent';

const origin = 'https://speedcar.test';
const secret = 'local-test-only-owner-secret-not-for-deployment-0123456789';
const verifier = 'a'.repeat(64);
const chatgptClient = 'https://chatgpt.com/oauth/client.json';
const chatgptCallback = 'https://chatgpt.com/connector_platform_oauth_redirect';
const nativeFetch = globalThis.fetch.bind(globalThis);

beforeEach(async () => {
  // Only the external client document is substituted; the OAuth/PKCE flow,
  // stored consent, grant and access tokens all use the real provider.
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(new Request(input, init).url);
    if (['https://chatgpt.com/oauth/client.json', 'https://chatgpt.com.evil.test/oauth/client.json'].includes(url.href)) {
      return Response.json({
      client_id: url.href, client_name: 'ChatGPT',
      redirect_uris: [chatgptCallback, 'https://chatgpt.com/other-callback'],
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
      }, { headers: { 'cache-control': 'no-store' } });
    }
    return nativeFetch(input, init);
  });
  // Storage is persistent across requests; each case starts with a fresh owner state.
  await runInDurableObject((env as any).OWNER_STATE.getByName('speed-car-owner'), async (_instance, state) => {
    await state.storage.deleteAll();
  });
});
afterEach(() => vi.restoreAllMocks());

async function begin(clientName = 'ChatGPT local integration test',scopes='speedcar:test speedcar:phone offline_access',clientId?: string,redirectUri='https://chatgpt.test/callback') {
  let client = { client_id: clientId! };
  if (!clientId) {
    const response = await SELF.fetch(`${origin}/oauth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: clientName, redirect_uris: [redirectUri],
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
    });
    expect(response.status).toBe(201);
    client = await response.json() as {client_id: string};
  }
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(`${origin}/authorize`);
  url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: redirectUri,
    response_type: 'code', scope: scopes, state: 'user-request-1',
    code_challenge: challenge, code_challenge_method: 'S256', resource: `${origin}/mcp` }).toString();
  const page = await SELF.fetch(url);
  expect(page.status).toBe(200);
  const html = await page.text();
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  expect(handle).toBeTruthy();
  const cookie = page.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { client, html, page, cookie, handle: handle!, authorizeUrl: url.toString() };
}

async function approve(flow: Awaited<ReturnType<typeof begin>>, value = secret, requestOrigin = origin, cookie = flow.cookie) {
  return SELF.fetch(`${origin}/authorize`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: requestOrigin, cookie },
    body: new URLSearchParams({ handle: flow.handle, owner_secret: value, decision: 'approve' }).toString() });
}

async function grant(scopes?:string,clientId?:string,redirectUri='https://chatgpt.test/callback',tokenScope?:string) {
  const flow = await begin(undefined,scopes,clientId,redirectUri);
  const consent = await approve(flow);
  expect(consent.status).toBe(302);
  const callback = new URL(consent.headers.get('location')!);
  expect(callback.origin).toBe(new URL(redirectUri).origin);
  expect(callback.searchParams.get('state')).toBe('user-request-1');
  const response = await SELF.fetch(`${origin}/oauth/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: flow.client.client_id,
      code: callback.searchParams.get('code')!, code_verifier: verifier, redirect_uri: redirectUri,
      resource: `${origin}/mcp`, ...(tokenScope === undefined ? {} : { scope: tokenScope }) }).toString() });
  expect(response.status).toBe(200);
  return { ...await response.json() as { access_token: string; refresh_token: string; scope: string }, client_id: flow.client.client_id };
}

async function mcp(token: string, method: string, params: Record<string, unknown> = {}, id = 1) {
  const response = await SELF.fetch(`${origin}/mcp`, { method: 'POST', headers: {
    authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
    'mcp-protocol-version': '2025-11-25',
  }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
  expect(response.status).toBe(200);
  const text = await response.text();
  if (response.headers.get('content-type')?.includes('text/event-stream')) {
    const messages = text.split('\n').filter((line) => line.startsWith('data: ')).map((line) => JSON.parse(line.slice(6)));
    return messages.find((message) => message.id === id);
  }
  return JSON.parse(text);
}

describe('MCP authentication boundary', () => {
  it('denies an unauthenticated MCP request with discoverable OAuth metadata', async () => {
    // Catches exposing the write tool without OAuth or losing discovery.
    const response = await SELF.fetch('https://speedcar.test/mcp', { method: 'POST' });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=');
  });

  it('rejects a forged bearer token', async () => {
    const response = await SELF.fetch(`${origin}/mcp`, { method: 'POST', headers: { authorization: 'Bearer forged' } });
    expect(response.status).toBe(401);
  });

  it('advertises the configured resource and OAuth PKCE discovery', async () => {
    const challenge = await SELF.fetch(`${origin}/mcp`);
    const metadata = challenge.headers.get('www-authenticate')!.match(/resource_metadata="([^"]+)"/)![1];
    expect(metadata).toContain(`${origin}/.well-known/oauth-protected-resource`);
    const resource = await (await SELF.fetch(metadata)).json() as any;
    expect(resource.resource).toBe(`${origin}/mcp`);
    expect(resource.authorization_servers).toEqual([origin]);
    // Missing optional resource scopes makes a client without a scope challenge
    // request only base rights again on an explicit reconnect.
    expect(resource.scopes_supported).toEqual([
      'speedcar:test', 'speedcar:phone', 'speedcar:location',
      'speedcar:notifications', 'speedcar:screen',
    ]);
    const alias = await (await SELF.fetch(`${origin}/.well-known/oauth-protected-resource/mcp`)).json() as any;
    expect(alias.scopes_supported).toEqual(resource.scopes_supported);
    // A narrower scope here would override the resource's discovery scopes.
    expect(challenge.headers.get('www-authenticate')!.match(/scope="([^"]+)"/)![1].split(' ')).toEqual(resource.scopes_supported);
    const oauth = await (await SELF.fetch(`${origin}/.well-known/oauth-authorization-server`)).json() as any;
    expect(oauth.code_challenge_methods_supported).toContain('S256');
    expect(oauth.token_endpoint).toBe(`${origin}/oauth/token`);
  });

  it('fails closed when the owner secret is an example or the service uses remote HTTP', async () => {
    const ctx = { waitUntil() {} } as unknown as ExecutionContext;
    const bindings = env as any;
    const badSecret = await worker.fetch(new Request(`${origin}/mcp`), { ...bindings, OWNER_SETUP_SECRET: 'REPLACE_WITH_A_LONG_RANDOM_OWNER_SECRET' }, ctx);
    expect(badSecret.status).toBe(503);
    const plainHttp = await worker.fetch(new Request('http://remote.test/mcp'), { ...bindings, PUBLIC_ORIGIN: 'http://remote.test' }, ctx);
    expect(plainHttp.status).toBe(503);
  });
});

describe('Owner consent', () => {
  it('shows and grants all five owner-approved rights when the real ChatGPT client pins test only', async () => {
    const flow = await begin(undefined, 'speedcar:test', chatgptClient, chatgptCallback);
    for (const label of ['Localisation ponctuelle', 'Notifications', 'Contexte d’écran']) {
      expect(flow.html).toContain(`<strong>${label}</strong>`);
    }
    expect(flow.html).toContain('consentement groupé');
    expect(flow.html).toContain('Droits proposés pour cette connexion');
    const token = await grant('speedcar:test', chatgptClient, chatgptCallback);
    expect(token.scope.split(' ').sort()).toEqual([
      'speedcar:location', 'speedcar:notifications', 'speedcar:phone', 'speedcar:screen', 'speedcar:test',
    ]);
    for (const name of ['phone_get_location', 'phone_get_notifications', 'phone_get_screen_context']) {
      const result = await mcp(token.access_token, 'tools/call', { name, arguments: {} });
      expect(result.result.structuredContent.status).toBe('phone_offline');
    }
  });

  it.each(['speedcar:phone', 'speedcar:test speedcar:phone'])('groups a validated ChatGPT base request: %s', async (requested) => {
    const token = await grant(requested, chatgptClient, chatgptCallback);
    expect(token.scope.split(' ').sort()).toEqual([
      'speedcar:location', 'speedcar:notifications', 'speedcar:phone', 'speedcar:screen', 'speedcar:test',
    ]);
  });

  it('preserves explicitly requested offline access without adding it to every request', async () => {
    const token = await grant('speedcar:test offline_access', chatgptClient, chatgptCallback);
    expect(token.scope.split(' ').sort()).toEqual([
      'offline_access', 'speedcar:location', 'speedcar:notifications', 'speedcar:phone', 'speedcar:screen', 'speedcar:test',
    ]);
  });

  it.each([
    ['https://chatgpt.com.evil.test/oauth/client.json', chatgptCallback],
    [chatgptClient, 'https://chatgpt.com/other-callback'],
  ])('does not group a different client or callback: %s %s', async (client, callback) => {
    const token = await grant('speedcar:test', client, callback);
    expect(token.scope).toBe('speedcar:test');
  });

  it('respects explicit token-exchange downscoping after grouped owner consent', async () => {
    const token = await grant('speedcar:test', chatgptClient, chatgptCallback, 'speedcar:test');
    expect(token.scope).toBe('speedcar:test');
    const response = await SELF.fetch(`${origin}/mcp`, { method: 'POST', headers: {
      authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'phone_get_location', arguments: {} } }) });
    expect(response.status).toBe(403);
  });

  it.each([
    ['resource', 'https://other.test/mcp'],
    ['redirect_uri', 'https://evil.test/callback'],
    ['code_challenge_method', 'unsupported'],
    ['scope', 'speedcar:admin'],
  ])('validates the original ChatGPT request before offering grouped rights: %s', async (key, value) => {
    const flow = await begin(undefined, 'speedcar:test', chatgptClient, chatgptCallback);
    const invalid = new URL(flow.authorizeUrl);
    invalid.searchParams.set(key, value);
    expect((await SELF.fetch(invalid)).status).toBe(400);
  });

  it('explains each requested private right before the owner approves grouped consent', async () => {
    const flow = await begin(undefined, 'speedcar:test speedcar:phone speedcar:location speedcar:notifications speedcar:screen offline_access');
    for (const label of ['Localisation ponctuelle', 'Notifications', 'Contexte d’écran']) {
      expect(flow.html).toContain(`<strong>${label}</strong>`);
    }
    expect(flow.html).toContain('interrupteurs locaux');
    expect(flow.html).toContain('demande explicite');
    expect(flow.html).toContain('Code propriétaire');
    expect(flow.html).toContain('type="password" name="owner_secret"');
    expect(flow.html).not.toContain(secret);
  });

  it('escapes untrusted client metadata and prevents framing or caching', async () => {
    const flow = await begin('<script>alert(1)</script>');
    expect(flow.html).not.toContain('<script>alert(1)</script>');
    expect(flow.html).toContain('chatgpt.test');
    expect(flow.html).toContain('speedcar:test');
    expect(flow.html).not.toContain(secret);
    expect(flow.page.headers.get('content-security-policy')).toContain("frame-ancestors 'none'");
    expect(flow.page.headers.get('cache-control')).toContain('no-store');
    expect(flow.page.headers.get('set-cookie')).toContain('Secure');
    // Native browser form POSTs may send Origin:null under no-referrer.
    // same-origin preserves CSRF origin checking and hides cross-site referrers.
    expect(flow.page.headers.get('referrer-policy')).toBe('same-origin');
    // Chromium also applies form-action to the OAuth POST's redirect.
    expect(flow.page.headers.get('content-security-policy')).toContain("form-action 'self' https://chatgpt.test;");
  });

  it('does not grant access with a wrong owner secret', async () => {
    expect((await approve(await begin(), 'wrong')).status).toBe(403);
  });

  it('keeps an existing base grant usable and limited after same-client grouped reauthorization', async () => {
    const base = await grant();
    const grouped = await grant('speedcar:test speedcar:phone speedcar:location speedcar:notifications speedcar:screen offline_access', base.client_id);
    expect(grouped.scope.split(' ').sort()).toEqual([
      'offline_access', 'speedcar:location', 'speedcar:notifications',
      'speedcar:phone', 'speedcar:screen', 'speedcar:test',
    ]);
    for (const name of ['phone_get_location', 'phone_get_notifications', 'phone_get_screen_context']) {
      const result = await mcp(grouped.access_token, 'tools/call', { name, arguments: {} });
      expect(result.result.structuredContent.status).toBe('phone_offline');
    }
    const oldStatus = await mcp(base.access_token, 'tools/call', { name: 'speedcar_status', arguments: {} });
    expect(oldStatus.result.structuredContent.proof_scope).toBe('relay_storage_only');
    const refresh = await SELF.fetch(`${origin}/oauth/token`, { method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', client_id: base.client_id,
        refresh_token: base.refresh_token, resource: `${origin}/mcp` }).toString() });
    expect(refresh.status).toBe(200);
    const renewed = await refresh.json() as { access_token: string; scope: string };
    expect(renewed.scope.split(' ').sort()).toEqual(['offline_access', 'speedcar:phone', 'speedcar:test']);
    const privateCall = await SELF.fetch(`${origin}/mcp`, { method: 'POST', headers: {
      authorization: `Bearer ${renewed.access_token}`, 'content-type': 'application/json',
    }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'phone_get_location', arguments: {} } }) });
    expect(privateCall.status).toBe(403);
    expect(privateCall.headers.get('www-authenticate')).toContain('insufficient_scope');
  });

  it('refuses cross-origin consent even with the right secret', async () => {
    expect((await approve(await begin(), secret, 'https://attacker.test')).status).toBe(403);
  });

  it('requires the browser cookie as well as the owner secret', async () => {
    expect((await approve(await begin(), secret, origin, '')).status).toBe(400);
  });

  it('does not approve an already consumed consent form', async () => {
    const flow = await begin();
    expect((await approve(flow)).status).toBe(302);
    expect((await approve(flow)).status).toBe(400);
  });

  it('bounds repeated owner login attempts', async () => {
    const flow = await begin();
    for (let i = 0; i < 8; i++) expect((await approve(flow, 'wrong')).status).toBe(403);
    expect((await approve(flow, 'wrong')).status).toBe(429);
  });

  it('allows denying without entering an owner secret', async () => {
    const flow = await begin();
    const denied = await SELF.fetch(`${origin}/authorize`, { method: 'POST', redirect: 'manual',
      headers: { origin, cookie: flow.cookie, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ handle: flow.handle, decision: 'deny' }).toString() });
    expect(denied.status).toBe(302);
    expect(new URL(denied.headers.get('location')!).searchParams.get('error')).toBe('access_denied');
  });

  it('rejects an oversized chunked form without buffering the rest of the stream', async () => {
    let pulls = 0;
    const body = new ReadableStream({ pull(controller) {
      pulls++;
      if (pulls === 1) controller.enqueue(new Uint8Array(4097).fill(97));
      else controller.error(new Error('The unbounded remainder must not be read'));
    } });
    const response = await consent(new Request(`${origin}/authorize`, { method: 'POST', headers: {
      origin, 'content-type': 'application/x-www-form-urlencoded',
    }, body }), env as any);
    expect(response.status).toBe(413);
  });
});

describe('MCP test action', () => {
  it('authenticates with a real PKCE token and honestly exposes a write tool', async () => {
    const token = await grant();
    expect(token.refresh_token).toBeTruthy();
    const init = await mcp(token.access_token, 'initialize', {
      protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'integration-test', version: '1' },
    });
    expect(init.result.serverInfo.name).toBe('speed-car');
    const listing = await mcp(token.access_token, 'tools/list');
    const action = listing.result.tools.find((t: any) => t.name === 'speedcar_test_action');
    expect(action.annotations.readOnlyHint).toBe(false);
    expect(action.annotations.idempotentHint).toBe(false);
    const status = listing.result.tools.find((t: any) => t.name === 'speedcar_status');
    expect(status.annotations.readOnlyHint).toBe(true);
  });

  it('persists an observed receipt and does not swallow two voluntary identical actions', async () => {
    const { access_token } = await grant();
    const a = await mcp(access_token, 'tools/call', { name: 'speedcar_test_action', arguments: {} }, 11);
    const b = await mcp(access_token, 'tools/call', { name: 'speedcar_test_action', arguments: {} }, 12);
    expect(a.result.structuredContent.status).toBe('verified');
    expect(a.result.structuredContent.proof_scope).toBe('relay_storage_only');
    expect(b.result.structuredContent.receipt.sequence).toBe(a.result.structuredContent.receipt.sequence + 1);
    expect(b.result.structuredContent.receipt.id).not.toBe(a.result.structuredContent.receipt.id);
    const status = await mcp(access_token, 'tools/call', { name: 'speedcar_status', arguments: {} }, 13);
    expect(status.result.structuredContent.last_receipt.id).toBe(b.result.structuredContent.receipt.id);
    expect(status.result.structuredContent.android_control).toBe('device_link_available');
  });

  it('rejects unexpected action parameters without creating a receipt', async () => {
    const { access_token } = await grant();
    const before = await mcp(access_token, 'tools/call', { name: 'speedcar_status', arguments: {} }, 20);
    const invalid = await mcp(access_token, 'tools/call', { name: 'speedcar_test_action', arguments: { command: 'shell' } }, 21);
    expect(Boolean(invalid.error) || invalid.result?.isError === true).toBe(true);
    const after = await mcp(access_token, 'tools/call', { name: 'speedcar_status', arguments: {} }, 22);
    expect(after.result.structuredContent.count).toBe(before.result.structuredContent.count);
  });
});

describe('Speed Car 2 assistant contracts', () => {
  it('exposes Maps GPS media apps and device tools while retaining the original seven', async () => {
    const token = await grant();
    const listing = await mcp(token.access_token, 'tools/list');
    const names = listing.result.tools.map((t: any) => t.name);
    for (const name of ['phone_get_location','phone_open_maps','phone_navigate','phone_open_app','phone_list_apps','phone_open_url','phone_open_settings','phone_media_play','phone_media_pause','phone_media_next','phone_media_previous','phone_media_status','phone_set_media_volume','phone_flashlight','phone_find_device','phone_get_battery_details','phone_get_connectivity','phone_share_location','phone_get_notifications','phone_get_screen_context','phone_ui_action','phone_speak','phone_set_alarm','phone_prepare_sms','phone_dial','phone_share','phone_notification_action','phone_status','phone_media_volume_up','phone_media_volume_down','phone_open_youtube_brave','phone_command_status','speedcar_test_action','speedcar_status']) expect(names).toContain(name);
    expect(listing.result.tools.find((t: any) => t.name === 'phone_get_location').annotations.readOnlyHint).toBe(true);
    expect(listing.result.tools.find((t: any) => t.name === 'phone_navigate').annotations.readOnlyHint).toBe(false);
  });
});

it('challenges a private capability with incremental OAuth consent before dispatch', async () => {
 const token=await grant();
 const response=await SELF.fetch(`${origin}/mcp`,{method:'POST',headers:{authorization:`Bearer ${token.access_token}`,'content-type':'application/json',accept:'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'phone_get_location',arguments:{}}})});
 expect(response.status).toBe(403);
 const challenge=response.headers.get('www-authenticate')!;
 expect(challenge).toContain('error="insufficient_scope"');
 expect(challenge.match(/scope="([^"]+)"/)![1].split(' ')).toEqual(expect.arrayContaining(['speedcar:test','speedcar:phone','speedcar:location']));
 expect(challenge).not.toContain('speedcar:notifications');
 const metadata=challenge.match(/resource_metadata="([^"]+)"/)![1];
 expect((await SELF.fetch(metadata)).status).toBe(200);
 const next=await mcp(token.access_token,'tools/call',{name:'speedcar_status',arguments:{}});
 expect(next.result.structuredContent.proof_scope).toBe('relay_storage_only');
});

it('rejects a non-web URL before attempting delivery',async()=>{
 const token=await grant();const r=await mcp(token.access_token,'tools/call',{name:'phone_open_url',arguments:{command_id:crypto.randomUUID(),url:'javascript:alert(1)',browser:'Brave'}});expect(Boolean(r.error)||r.result?.isError===true).toBe(true);
});

it('accepts an explicitly granted private scope while preserving the original tools',async()=>{
 const token=await grant('speedcar:test speedcar:phone speedcar:location offline_access');
 const result=await mcp(token.access_token,'tools/call',{name:'phone_get_location',arguments:{}});
 expect(result.result.structuredContent.status).toBe('phone_offline');
 const old=await mcp(token.access_token,'tools/call',{name:'speedcar_status',arguments:{}});
 expect(old.result.structuredContent.proof_scope).toBe('relay_storage_only');
});
