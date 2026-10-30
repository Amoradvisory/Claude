import { AuthorizationError, CimdFetchError, type ConsentDescription } from '@cloudflare/workers-oauth-provider';
import { owner, scope, type Env } from './env';

const escape = (value: string) => value.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));

async function boundedForm(request: Request): Promise<string | undefined> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 4096) { await reader.cancel().catch(() => {}); return; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function page(details: ConsentDescription, handle: string): string {
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Speed Car — autorisation initiale</title><h1>Connecter Speed Car</h1>
<p>Client : <strong>${escape(details.clientName)}</strong>. ${details.clientDomain ? `Domaine : ${escape(details.clientDomain)}.` : 'Nom déclaré par le client, non vérifié.'}</p>
<p>Destination de l'autorisation : <strong>${escape(details.redirectHost)}</strong>.</p>
${details.redirectIsLoopback ? '<p>Attention : cette destination est une application locale sur votre ordinateur.</p>' : ''}
<p>Droits demandés : ${details.scope.map(escape).join(', ')}.</p>
<p>Ce prototype écrit uniquement un reçu de test dans le relais. Il ne commande pas encore le téléphone.</p>
<p>Autorisez seulement une connexion que vous venez de demander dans ChatGPT. Effectuez cette préparation à l'arrêt.</p>
<form method="post" action="/authorize"><input type="hidden" name="handle" value="${escape(handle)}">
<label>Secret propriétaire <input type="password" name="owner_secret" autocomplete="current-password" maxlength="256" required></label>
<p><button name="decision" value="approve">Autoriser</button> <button name="decision" value="deny" formnovalidate>Refuser</button></p></form></html>`;
}

export async function consent(request: Request, env: Env): Promise<Response> {
  const oauth = env.OAUTH_PROVIDER;
  try {
    if (request.method === 'GET') {
      const authRequest = await oauth.parseAuthRequest(request);
      const details = await oauth.describeConsent(authRequest);
      // This application grants no rights outside the two explicitly supported scopes.
      if (details.scope.some((s) => ![scope, 'offline_access'].includes(s))) return new Response('Droit non pris en charge', { status: 400 });
      const transaction = await oauth.beginConsent(authRequest);
      transaction.headers.set('content-type', 'text/html; charset=utf-8');
      transaction.headers.set('cache-control', 'no-store');
      transaction.headers.set('content-security-policy', "default-src 'none'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'");
      transaction.headers.set('referrer-policy', 'no-referrer');
      transaction.headers.set('x-content-type-options', 'nosniff');
      return new Response(page(details, transaction.handle), { headers: transaction.headers });
    }
    if (request.method !== 'POST') return new Response('Méthode refusée', { status: 405 });
    if (request.headers.get('origin') !== env.PUBLIC_ORIGIN) return new Response('Origine refusée', { status: 403 });
    if (!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded')) return new Response('Formulaire attendu', { status: 415 });
    if (Number(request.headers.get('content-length') ?? 0) > 4096) return new Response('Formulaire trop grand', { status: 413 });
    const body = await boundedForm(request);
    if (body === undefined) return new Response('Formulaire trop grand', { status: 413 });
    const form = new URLSearchParams(body);
    const handle = form.get('handle') ?? '';
    if (form.get('decision') === 'deny') {
      const denied = await oauth.denyConsent(request, handle);
      return new Response(null, { status: 302, headers: denied.headers });
    }
    if (form.get('decision') !== 'approve') return new Response('Décision attendue', { status: 400 });
    const rawKey = new Uint8Array(await digest(request.headers.get('cf-connecting-ip') ?? 'local'));
    const key = Array.from(rawKey.slice(0, 12), (x) => x.toString(16).padStart(2, '0')).join('');
    if (!await env.OWNER_STATE.getByName(owner).allowLoginAttempt(key)) return new Response('Réessayez dans une minute', { status: 429, headers: { 'retry-after': '60' } });
    if (!crypto.subtle.timingSafeEqual(await digest(form.get('owner_secret') ?? ''), await digest(env.OWNER_SETUP_SECRET))) return new Response('Autorisation refusée', { status: 403 });
    const approved = await oauth.approveConsent(request, handle);
    // Only the scopes from the validated, stored request are granted; never trust form-supplied scopes or a redirect URL.
    const { redirectTo } = await oauth.completeAuthorization({
      request: approved.request, userId: owner, metadata: { label: 'Speed Car personnel' },
      scope: approved.request.scope, props: { owner },
    });
    approved.headers.set('location', redirectTo);
    return new Response(null, { status: 302, headers: approved.headers });
  } catch (error) {
    if (error instanceof AuthorizationError || error instanceof CimdFetchError) {
      return new Response('Autorisation invalide, expirée ou déjà utilisée. Recommencez depuis ChatGPT.', { status: 400 });
    }
    throw error;
  }
}
