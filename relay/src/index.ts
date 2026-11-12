import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { consent } from './consent';
import { configuredOrigin, scope, phoneScope, sensitiveScopes, owner, type Env } from './env';
import { mcpApi } from './mcp';
export { OwnerState } from './owner-state';
export { PhoneLink } from './phone-link';

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const origin = configuredOrigin(env);
    const url = new URL(request.url);
    if (url.pathname === '/device') {
      if (!env.PHONE_TOKEN_HASH || !env.PHONE_DEVICE_ID) return new Response('Device pairing not configured', { status: 503 });
      const token = request.headers.get('authorization')?.match(/^Bearer ([A-Za-z0-9_-]{43,128})$/)?.[1];
      if (!token) return new Response('Unauthorized', { status: 401 });
      const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)))].map(b => b.toString(16).padStart(2, '0')).join('');
      if (!crypto.subtle.timingSafeEqual(new TextEncoder().encode(hash), new TextEncoder().encode(env.PHONE_TOKEN_HASH))) return new Response('Unauthorized', { status: 401 });
      return env.PHONE_LINK.getByName(owner).fetch(request);
    }
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({
      service: 'speed-car', version: '2.1.0', configured: Boolean(origin),
      stage: 'device-link', android_control: 'available_when_paired', voice_test: 'not_observed',
    }, { status: origin ? 200 : 503, headers: { 'cache-control': 'no-store' } });
    if (!origin) return new Response('Configuration Speed Car manquante', { status: 503 });
    if (url.origin !== origin) return new Response('Origine de service refusée', { status: 403 });
    const provider = new OAuthProvider<Env>({
      apiRoute: '/mcp', apiHandler: mcpApi,
      defaultHandler: { fetch: (req, bindings) => new URL(req.url).pathname === '/authorize' ? consent(req, bindings) : new Response('Introuvable', { status: 404 }) },
      authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token', clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: [scope, phoneScope, ...sensitiveScopes, 'offline_access'],
      // Owner-chosen grouped consent: in provider 1.2.4 requiredScopes advertises
      // both resource metadata and the initial 401; per-tool checks still enforce
      // the actual grant, so existing base tokens remain usable and limited.
      requiredScopes: [scope, phoneScope, ...sensitiveScopes],
      clientIdMetadataDocumentEnabled: true,
      accessTokenTTL: 3600, refreshTokenTTL: 2_592_000,
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
    });
    const response = await provider.fetch(request, env, context);
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    // Keep the browser's same-origin form Origin header for CSRF validation,
    // while suppressing referrers on the cross-site OAuth callback.
    headers.set('referrer-policy', 'same-origin');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
