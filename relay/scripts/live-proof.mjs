import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes, createHash } from 'node:crypto';
import { runDiagnostic } from './diagnostic.mjs';

// Uses the private owner setup file; never prints cookies, codes or bearer tokens.
const origin = new URL(process.argv[2]).origin;
const ownerSecret = JSON.parse(readFileSync(process.argv[3], 'utf8')).OWNER_SETUP_SECRET;
const destination = process.argv[4];
if (!origin.startsWith('https://') || !destination) throw Error('HTTPS origin, private key file and proof destination required');
const proof = { origin, startedAt: new Date().toISOString(), stage: 'starting',
  proof_scope: 'relay_storage_only', chatgpt_voice: 'not_observed', phone_control: 'not_tested_by_this_script' };
const save = () => writeFileSync(destination, `${JSON.stringify(proof, null, 2)}\n`);
async function request(path, options = {}, status = 200) {
  const response = await fetch(new URL(path, origin), {
    ...options, redirect: 'manual', signal: AbortSignal.timeout(12000),
  });
  if (response.status !== status) throw Error(`${proof.stage}: HTTP ${response.status}, expected ${status}`);
  return response;
}
const formHeaders = { 'content-type': 'application/x-www-form-urlencoded' };
try {
  proof.preparation = await runDiagnostic(origin);
  if (!proof.preparation.relay_ready) throw Error('Public readiness probes failed');
  proof.stage = 'register_client'; save();
  const callback = `${origin}/diagnostic-callback`;
  const client = await (await request('/oauth/register', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ client_name: 'Speed Car deployment diagnostic', redirect_uris: [callback],
      token_endpoint_auth_method: 'none', grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'] }),
  }, 201)).json();
  const verifier = randomBytes(48).toString('base64url');
  const state = randomBytes(24).toString('base64url');
  const params = new URLSearchParams({ client_id: client.client_id, redirect_uri: callback,
    response_type: 'code', scope: process.env.SPEEDCAR_SCOPES ?? 'speedcar:test speedcar:phone offline_access', state,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', resource: `${origin}/mcp` });
  proof.stage = 'owner_consent'; save();
  const page = await request(`/authorize?${params}`);
  const cookie = page.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const html = await page.text();
  const handle = html.match(/name="handle" value="([^"]+)"/)?.[1];
  if (!handle || !cookie) throw Error('Owner consent form incomplete');
  const approved = await request('/authorize', { method: 'POST',
    headers: { ...formHeaders, origin, cookie },
    body: new URLSearchParams({ handle, owner_secret: ownerSecret, decision: 'approve' }),
  }, 302);
  const redirect = new URL(approved.headers.get('location'));
  if (`${redirect.origin}${redirect.pathname}` !== callback || redirect.searchParams.get('state') !== state) {
    throw Error('OAuth callback mismatch');
  }
  proof.stage = 'pkce_token_exchange'; save();
  const token = await (await request('/oauth/token', { method: 'POST', headers: formHeaders,
    body: new URLSearchParams({ grant_type: 'authorization_code', client_id: client.client_id,
      code: redirect.searchParams.get('code'), code_verifier: verifier, redirect_uri: callback,
      resource: `${origin}/mcp` }),
  })).json();
  if (!token.access_token || !token.refresh_token) throw Error('OAuth grant incomplete');
  if (process.env.SPEEDCAR_TOKEN_OUT) {
    writeFileSync(process.env.SPEEDCAR_TOKEN_OUT, JSON.stringify({...token,client_id:client.client_id}), { mode: 0o600 });
  }
  proof.oauth_pkce_verified = true;
  let counter = 0;
  async function mcp(method, params = {}) {
    const id = ++counter;
    const response = await request('/mcp', { method: 'POST', headers: {
      authorization: `Bearer ${token.access_token}`, 'content-type': 'application/json',
      accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25',
    }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    const body = await response.text();
    const message = response.headers.get('content-type')?.includes('text/event-stream')
      ? body.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).find(value => value.id === id)
      : JSON.parse(body);
    if (message?.error || message?.result?.isError || !message?.result) throw Error(`MCP ${method} failed`);
    return message.result;
  }
  proof.stage = 'mcp_initialize'; save();
  const initialized = await mcp('initialize', { protocolVersion: '2025-11-25', capabilities: {},
    clientInfo: { name: 'Speed Car deployment diagnostic', version: '1' } });
  proof.server = initialized.serverInfo;
  const listing = await mcp('tools/list');
  proof.tools = listing.tools.map(({ name, annotations }) => ({ name, annotations }));
  const before = await mcp('tools/call', { name: 'speedcar_status', arguments: {} });
  proof.count_before = before.structuredContent.count;
  proof.stage = 'write_requested_no_automatic_retry'; save();
  const write = await mcp('tools/call', { name: 'speedcar_test_action', arguments: {} });
  proof.write = write.structuredContent; save();
  proof.stage = 'readback'; save();
  const readback = await mcp('tools/call', { name: 'speedcar_status', arguments: {} });
  proof.readback = readback.structuredContent;
  proof.verified = proof.write?.status === 'verified'
    && proof.write.receipt.id === proof.readback.last_receipt?.id
    && proof.readback.count === proof.count_before + 1;
  if (!proof.verified) throw Error('Written receipt and readback do not agree');
  proof.stage = 'verified'; proof.finishedAt = new Date().toISOString(); save();
  console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.verified = false; proof.error = error.message; save();
  console.error(JSON.stringify(proof, null, 2)); process.exitCode = 1;
}
