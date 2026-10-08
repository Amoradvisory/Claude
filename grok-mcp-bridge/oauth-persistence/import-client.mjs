#!/usr/bin/env node
// Owner-only recovery: re-attach the public client_id that ChatGPT still presents
// (visible in the authorize URL as ?client_id=...). Not a secret.
// Run with the OAuth gateway STOPPED (the store is locked by its owner process).
//
//   node import-client.mjs <store.json> <client_id> <redirect_uri>
//
// redirect_uri: copy the exact `redirect_uri` parameter from ChatGPT's authorize URL
// (URL-decoded). Only https URIs on chatgpt.com / openai.com are accepted here.
import { openOAuthStore } from './oauth-store.mjs';

const [file, clientId, redirectUri] = process.argv.slice(2);
if (!file || !clientId || !redirectUri) {
  console.error('usage: node import-client.mjs <store.json> <client_id> <redirect_uri>');
  process.exit(2);
}
const host = (() => { try { return new URL(redirectUri).hostname; } catch { return ''; } })();
if (!/^https:/.test(redirectUri) || !/(^|\.)(chatgpt\.com|openai\.com)$/.test(host)) {
  console.error('refused: redirect_uri must be an https URL on chatgpt.com or openai.com');
  process.exit(2);
}
const store = await openOAuthStore(file);
try {
  const added = await store.importPublicClient({ client_id: clientId, redirect_uris: [redirectUri], client_name: 'ChatGPT (restored)' });
  console.log(added ? 'client restored' : 'client already present (nothing changed)');
  console.log(store.stats());
} finally {
  await store.close();
}
