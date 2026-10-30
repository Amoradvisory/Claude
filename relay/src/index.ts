import OAuthProvider from '@cloudflare/workers-oauth-provider';
import { consent } from './consent';
import { configuredOrigin, scope, type Env } from './env';
import { mcpApi } from './mcp';
export { OwnerState } from './owner-state';

export default {
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const origin = configuredOrigin(env);
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return Response.json({
      service: 'speed-car', version: '0.1.0', configured: Boolean(origin),
      stage: 'gate0', android_control: 'not_implemented', voice_test: 'not_observed',
    }, { status: origin ? 200 : 503, headers: { 'cache-control': 'no-store' } });
    if (!origin) return new Response('Configuration Speed Car manquante', { status: 503 });
    if (url.origin !== origin) return new Response('Origine de service refusée', { status: 403 });
    const provider = new OAuthProvider<Env>({
      apiRoute: '/mcp', apiHandler: mcpApi,
      defaultHandler: { fetch: (req, bindings) => new URL(req.url).pathname === '/authorize' ? consent(req, bindings) : new Response('Introuvable', { status: 404 }) },
      authorizeEndpoint: '/authorize', tokenEndpoint: '/oauth/token', clientRegistrationEndpoint: '/oauth/register',
      scopesSupported: [scope, 'offline_access'], requiredScopes: [scope],
      clientIdMetadataDocumentEnabled: true,
      accessTokenTTL: 3600, refreshTokenTTL: 2_592_000,
      resourceMetadata: { resource: `${origin}/mcp`, authorization_servers: [origin] },
    });
    const response = await provider.fetch(request, env, context);
    const headers = new Headers(response.headers);
    headers.set('cache-control', 'no-store');
    headers.set('referrer-policy', 'no-referrer');
    headers.set('x-content-type-options', 'nosniff');
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
} satisfies ExportedHandler<Env>;
