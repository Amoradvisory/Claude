// Run: node --test oauth-store.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fsp } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { openOAuthStore, OAuthStoreError, hashToken } from './oauth-store.mjs';

const CHATGPT_REDIRECT = 'https://chatgpt.com/connector_platform_oauth_redirect';
const quiet = { warn() {}, info() {} };
const recorder = () => { const lines = []; return { lines, warn: (m) => lines.push(m), info: (m) => lines.push(m) }; };

async function tmpFile() {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'oauth-store-'));
  return path.join(dir, 'state', 'oauth-store.json');
}

test('DCR client_id survives a restart (the invalid_client regression)', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  const reg = await s.registerClient({ client_name: 'ChatGPT', redirect_uris: [CHATGPT_REDIRECT] });
  await s.close();

  s = await openOAuthStore(file, { logger: quiet }); // simulated process restart
  assert.equal(s.getClient(reg.client_id)?.client_id, reg.client_id);
  assert.ok(s.isRedirectUriAllowed(reg.client_id, CHATGPT_REDIRECT));
  await s.close();
});

test('unknown client and wrong redirect_uri are refused', async () => {
  const s = await openOAuthStore(await tmpFile(), { logger: quiet });
  const reg = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  assert.equal(s.getClient('does-not-exist-123'), null);
  assert.equal(s.isRedirectUriAllowed(reg.client_id, 'https://evil.example/cb'), false);
  assert.equal(s.isRedirectUriAllowed(reg.client_id, CHATGPT_REDIRECT + '/'), false); // exact match only
  await assert.rejects(s.registerClient({ redirect_uris: ['javascript:alert(1)'] }), OAuthStoreError);
  await assert.rejects(s.registerClient({ redirect_uris: ['http://evil.example/cb'] }), OAuthStoreError);
  await assert.rejects(s.registerClient({ redirect_uris: [] }), OAuthStoreError);
  await s.close();
});

test('confidential client: secret returned once, only its hash is stored', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  const reg = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT], token_endpoint_auth_method: 'client_secret_post' });
  assert.ok(reg.client_secret);
  await s.close();
  const raw = await fsp.readFile(file, 'utf8');
  assert.ok(!raw.includes(reg.client_secret));
  s = await openOAuthStore(file, { logger: quiet });
  assert.ok(s.authenticateClient(reg.client_id, reg.client_secret));
  assert.ok(!s.authenticateClient(reg.client_id, 'wrong'));
  assert.equal(s.getClient(reg.client_id).client_secret_hash, undefined);
  await s.close();
});

test('missing file creates an empty registry with 0600 / 0700 permissions', async () => {
  const file = await tmpFile();
  const s = await openOAuthStore(file, { logger: quiet });
  assert.deepEqual(s.stats(), { clients: 0, refreshTokens: 0, accessTokens: 0 });
  assert.equal((await fsp.stat(file)).mode & 0o777, 0o600);
  assert.equal((await fsp.stat(path.dirname(file))).mode & 0o777, 0o700);
  await s.close();
});

test('too-open permissions are repaired on load', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  await s.close();
  await fsp.chmod(file, 0o644);
  const log = recorder();
  s = await openOAuthStore(file, { logger: log });
  assert.equal((await fsp.stat(file)).mode & 0o777, 0o600);
  assert.ok(log.lines.some((l) => l.includes('0600')));
  await s.close();
});

test('corrupt main file falls back to .bak and is quarantined', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  const a = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] }); // .bak now holds client a
  await s.close();
  await fsp.writeFile(file, '{"version":1,"clients":{', { mode: 0o600 }); // partial write
  s = await openOAuthStore(file, { logger: quiet });
  assert.ok(s.getClient(a.client_id));
  const names = await fsp.readdir(path.dirname(file));
  assert.ok(names.some((n) => n.includes('.corrupt-')));
  await s.close();
});

test('corrupt file with no valid backup fails fast instead of starting empty', async () => {
  const file = await tmpFile();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, 'not json', { mode: 0o600 });
  await assert.rejects(openOAuthStore(file, { logger: quiet, lock: false }), /refusing to start/);
});

test('schema-invalid content is rejected (validation, not just JSON parse)', async () => {
  const file = await tmpFile();
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const bad = { version: 1, clients: { 'abcdefgh-1': { client_id: 'other', redirect_uris: [CHATGPT_REDIRECT] } }, refreshTokens: {}, accessTokens: {} };
  await fsp.writeFile(file, JSON.stringify(bad), { mode: 0o600 });
  await assert.rejects(openOAuthStore(file, { logger: quiet, lock: false }), OAuthStoreError);
});

test('concurrent registrations are all persisted', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  const regs = await Promise.all(Array.from({ length: 25 }, (_, i) =>
    s.registerClient({ client_name: `c${i}`, redirect_uris: [CHATGPT_REDIRECT] })));
  await s.close();
  s = await openOAuthStore(file, { logger: quiet });
  assert.equal(s.stats().clients, 25);
  for (const r of regs) assert.ok(s.getClient(r.client_id));
  const leftovers = (await fsp.readdir(path.dirname(file))).filter((n) => n.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
  await s.close();
});

test('access and refresh tokens survive restart, stored hashed only', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  const { client_id } = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  await s.saveAccessToken('AT-secret-value', { clientId: client_id, scope: 'bridge', resource: 'https://x/mcp', ttlMs: 3600e3 });
  await s.saveRefreshToken('RT-secret-value', { clientId: client_id, scope: 'bridge', resource: 'https://x/mcp', ttlMs: 30 * 86400e3 });
  await s.close();
  const raw = await fsp.readFile(file, 'utf8');
  assert.ok(!raw.includes('AT-secret-value') && !raw.includes('RT-secret-value'));
  assert.ok(raw.includes(hashToken('AT-secret-value')));
  s = await openOAuthStore(file, { logger: quiet });
  assert.equal(s.verifyAccessToken('AT-secret-value')?.scope, 'bridge');
  assert.equal(s.verifyAccessToken('forged'), null);
  assert.ok(await s.consumeRefreshToken('RT-secret-value', client_id));
  await s.close();
});

test('expired tokens are rejected and pruned', async () => {
  let t = 1_000_000;
  const file = await tmpFile();
  const s = await openOAuthStore(file, { logger: quiet, now: () => t });
  const { client_id } = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  await s.saveAccessToken('AT', { clientId: client_id, ttlMs: 1000 });
  await s.saveRefreshToken('RT', { clientId: client_id, ttlMs: 1000 });
  t += 1001;
  assert.equal(s.verifyAccessToken('AT'), null);
  assert.equal(await s.consumeRefreshToken('RT', client_id), null);
  await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] }); // triggers a write -> prune
  assert.equal(s.stats().accessTokens, 0);
  assert.equal(s.stats().refreshTokens, 0);
  await s.close();
});

test('refresh rotation: reuse of a used token revokes the whole family', async () => {
  const s = await openOAuthStore(await tmpFile(), { logger: quiet });
  const { client_id } = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  await s.saveRefreshToken('RT1', { clientId: client_id, ttlMs: 86400e3 });
  const rec = await s.consumeRefreshToken('RT1', client_id);
  await s.saveRefreshToken('RT2', { clientId: client_id, ttlMs: 86400e3, familyId: rec.familyId });
  assert.equal(await s.consumeRefreshToken('RT1', client_id), null); // replay
  assert.equal(await s.consumeRefreshToken('RT2', client_id), null); // family revoked
  await s.close();
});

test('refresh token bound to its client', async () => {
  const s = await openOAuthStore(await tmpFile(), { logger: quiet });
  const a = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  const b = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  await s.saveRefreshToken('RT', { clientId: a.client_id, ttlMs: 86400e3 });
  assert.equal(await s.consumeRefreshToken('RT', b.client_id), null);
  await s.close();
});

test('revocation removes access and refresh tokens', async () => {
  const s = await openOAuthStore(await tmpFile(), { logger: quiet });
  const { client_id } = await s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] });
  await s.saveAccessToken('AT', { clientId: client_id, ttlMs: 3600e3 });
  await s.saveRefreshToken('RT', { clientId: client_id, ttlMs: 86400e3 });
  assert.ok(await s.revokeToken('AT'));
  assert.ok(await s.revokeToken('RT'));
  assert.equal(s.verifyAccessToken('AT'), null);
  assert.equal(await s.consumeRefreshToken('RT', client_id), null);
  assert.equal(await s.revokeToken('unknown'), false);
  await s.close();
});

test('owner recovery: re-attach the client_id ChatGPT still holds', async () => {
  const file = await tmpFile();
  let s = await openOAuthStore(file, { logger: quiet });
  assert.equal(await s.importPublicClient({ client_id: '3f1c2d9e-aaaa-bbbb-cccc-0123456789ab', redirect_uris: [CHATGPT_REDIRECT] }), true);
  assert.equal(await s.importPublicClient({ client_id: '3f1c2d9e-aaaa-bbbb-cccc-0123456789ab', redirect_uris: [CHATGPT_REDIRECT] }), false);
  await assert.rejects(s.importPublicClient({ client_id: 'x', redirect_uris: [CHATGPT_REDIRECT] }), OAuthStoreError);
  await s.close();
  s = await openOAuthStore(file, { logger: quiet });
  assert.ok(s.isRedirectUriAllowed('3f1c2d9e-aaaa-bbbb-cccc-0123456789ab', CHATGPT_REDIRECT));
  await s.close();
});

test('a second live process cannot own the same store', async () => {
  const file = await tmpFile();
  const s = await openOAuthStore(file, { logger: quiet });
  await s.close();
  await fsp.writeFile(`${file}.lock`, '');
  const child = spawn(process.execPath, ['-e', 'setTimeout(()=>{},10000)']);
  try {
    await fsp.writeFile(`${file}.lock`, String(child.pid));
    await assert.rejects(openOAuthStore(file, { logger: quiet }), /already owned/);
  } finally {
    child.kill();
  }
  await new Promise((r) => child.on('exit', r));
  const s2 = await openOAuthStore(file, { logger: quiet }); // stale lock reclaimed
  await s2.close();
});

test('writes after close are refused', async () => {
  const s = await openOAuthStore(await tmpFile(), { logger: quiet });
  await s.close();
  await assert.rejects(s.registerClient({ redirect_uris: [CHATGPT_REDIRECT] }), /closed/);
});
