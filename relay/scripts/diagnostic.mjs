import { pathToFileURL } from 'node:url';

export async function runDiagnostic(address) {
  const url = new URL(address);
  if (url.username || url.password || url.search || url.hash) throw new Error('URL sans identifiants, paramètres ni fragment attendue');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) throw new Error('HTTPS requis hors localhost');
  if (!['/', '/mcp', ''].includes(url.pathname)) throw new Error('Donnez l’origine du relais ou son URL /mcp');
  const origin = url.origin;
  const result = { relay_ready: false, stage: 'unknown', voice_test: 'not_observed',
    android_control: 'not_observed', checks: {}, errors: [] };
  async function request(path, options = {}) {
    return fetch(new URL(path, origin), { ...options, redirect: 'error', signal: AbortSignal.timeout(3000) });
  }
  try {
    const health = await request('/health');
    const state = await health.json();
    result.checks.health_configured = health.status === 200 && state.service === 'speed-car' && state.configured === true;
    if (result.checks.health_configured) {
      result.stage = typeof state.stage === 'string' ? state.stage : 'unknown';
      result.server_version = typeof state.version === 'string' ? state.version : 'unknown';
      result.android_control = state.android_control === 'available_when_paired' ? 'requires_authenticated_phone_test' : 'not_observed';
    }
  } catch { result.checks.health_configured = false; result.errors.push('health_unreachable_or_invalid'); }
  try {
    const protectedResponse = await request('/mcp');
    result.checks.unauthenticated_mcp_blocked = protectedResponse.status === 401;
    const challenge = protectedResponse.headers.get('www-authenticate') ?? '';
    await protectedResponse.body?.cancel();
    const anonymousPost = await request('/mcp', {
      method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      // A read-only listing avoids mutating even a misconfigured public endpoint.
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
    });
    result.checks.unauthenticated_mcp_post_blocked = anonymousPost.status === 401;
    await anonymousPost.body?.cancel();
    const metadataAddress = challenge.match(/resource_metadata="([^"]+)"/)?.[1];
    if (!metadataAddress || new URL(metadataAddress).origin !== origin) throw new Error('Unsafe or missing resource metadata');
    const resourceResponse = await request(metadataAddress);
    const metadata = await resourceResponse.json();
    result.checks.oauth_resource = resourceResponse.status === 200 && metadata.resource === `${origin}/mcp`
      && Array.isArray(metadata.authorization_servers) && metadata.authorization_servers.includes(origin);
    const oauthResponse = await request('/.well-known/oauth-authorization-server');
    const oauth = await oauthResponse.json();
    result.checks.oauth_pkce = oauthResponse.status === 200 && oauth.code_challenge_methods_supported?.includes('S256') === true
      && oauth.authorization_endpoint === `${origin}/authorize` && oauth.token_endpoint === `${origin}/oauth/token`
      && oauth.scopes_supported?.includes('speedcar:test') === true;
  } catch { result.errors.push('oauth_discovery_missing_or_invalid'); }
  result.relay_ready = ['health_configured', 'unauthenticated_mcp_blocked', 'unauthenticated_mcp_post_blocked', 'oauth_resource', 'oauth_pkce']
    .every((name) => result.checks[name] === true);
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv[2]) throw new Error('Usage : npm run diagnostic -- https://votre-relais.workers.dev');
    const result = await runDiagnostic(process.argv[2]);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    process.exitCode = result.relay_ready ? 0 : 1;
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 2;
  }
}
