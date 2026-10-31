import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import worker from '../src/index';
import { consent } from '../src/consent';

const origin = 'https://speedcar.test';
const secret = 'local-test-only-owner-secret-not-for-deployment-0123456789';
const verifier = 'a'.repeat(64);

beforeEach(async () => {
  // Storage is persistent across requests; each case starts with a fresh owner state.
  await runInDurableObject((env as any).OWNER_STATE.getByName('speed-car-owner'), async (_instance, state) => {
    await state.storage.deleteAll();
  });
});

async function begin(clientName = 'ChatGPT local integration test') {
  const response = await SELF.fetch(`${origin}/oauth/register`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: clientName, redirect_uris: ['https://chatgpt.test/callback'],
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  });
  expect(response.status).toBe(201);
  const client = await response.json() as {client_id: string};
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const url = new URL(`${origin}/authorize`);
  url.search = new URLSearchParams({ client_id: client.client_id, redirect_uri: 'https://chatgpt.test/callback',
    response_type: 'code', scope: 'speedcar:test speedcar:phone offline_access', state: 'user-request-1',
    code_challenge: challenge, code_challenge_method: 'S256', resource: `${origin}/mcp` }).toString();
  const page = await SELF.fetch(url);
  expect(page.status).toBe(200);
  const html = await page.text();
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  expect(handle).toBeTruthy();
  const cookie = page.headers.get('set-cookie')?.split(';')[0] ?? '';
  return { client, html, page, cookie, handle: handle! };
}

async function approve(flow: Awaited<ReturnType<typeof begin>>, value = secret, requestOrigin = origin, cookie = flow.cookie) {
  return SELF.fetch(`${origin}/authorize`, { method: 'POST', redirect: 'manual',
    headers: { 'content-type': 'application/x-www-form-urlencoded', origin: requestOrigin, cookie },
    body: new URLSearchParams({ handle: flow.handle, owner_secret: value, decision: 'approve' }).toString() });
}

async function grant() {
  const flow = await begin();
  const consent = await approve(flow);
  expect(consent.status).toBe(302);
  const callback = new URL(consent.headers.get('location')!);
  expect(callback.origin).toBe('https://chatgpt.test');
  expect(callback.searchParams.get('state')).toBe('user-request-1');
  const response = await SELF.fetch(`${origin}/oauth/token`, { method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: flow.client.client_id,
      code: callback.searchParams.get('code')!, code_verifier: verifier, redirect_uri: 'https://chatgpt.test/callback',
      resource: `${origin}/mcp` }).toString() });
  expect(response.status).toBe(200);
  return await response.json() as { access_token: string; refresh_token: string; scope: string };
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
