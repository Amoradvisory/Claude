// Persistent OAuth registry for the Grok Linux MCP bridge.
//
// Fixes the `invalid_client` failure: clients created by Dynamic Client
// Registration (DCR) used to live only in memory and vanished on restart,
// while ChatGPT kept presenting its old client_id.
//
// Guarantees:
//  - atomic writes (temp file + fsync + rename), previous good state kept as .bak
//  - file mode 0600, directory mode 0700, permissions repaired on load
//  - strict validation on load; corrupt main file -> automatic fallback to .bak,
//    and a hard error (fail fast) if both are unusable
//  - writes serialized in-process; a pid lockfile refuses a second live owner
//  - tokens are stored only as SHA-256 hashes, never in clear
//  - refresh-token rotation with replay detection (reuse revokes the family)
//  - nothing secret is ever passed to the logger
//
// Zero dependencies, Node >= 18, ESM.

import { promises as fsp, constants as fsc } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const SCHEMA_VERSION = 1;
const CLIENT_ID_RE = /^[A-Za-z0-9._~-]{8,128}$/;
const HASH_RE = /^[0-9a-f]{64}$/;

export const hashToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex');

export class OAuthStoreError extends Error {}

function emptyState() {
  return { version: SCHEMA_VERSION, clients: {}, refreshTokens: {}, accessTokens: {} };
}

// Redirect URIs must be absolute https URLs (or loopback http for local tests),
// without fragment. Matching at authorize/token time is exact string equality.
export function validateRedirectUri(uri) {
  let u;
  try { u = new URL(uri); } catch { return false; }
  if (u.hash) return false;
  if (u.protocol === 'https:') return true;
  return u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname);
}

function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }

function validateState(s) {
  if (!isObj(s) || s.version !== SCHEMA_VERSION) throw new OAuthStoreError('bad schema version');
  for (const k of ['clients', 'refreshTokens', 'accessTokens']) {
    if (!isObj(s[k])) throw new OAuthStoreError(`missing section ${k}`);
  }
  for (const [id, c] of Object.entries(s.clients)) {
    if (!CLIENT_ID_RE.test(id) || !isObj(c) || c.client_id !== id) throw new OAuthStoreError('bad client entry');
    if (!Array.isArray(c.redirect_uris) || c.redirect_uris.length === 0 ||
        !c.redirect_uris.every(validateRedirectUri)) throw new OAuthStoreError('bad client redirect_uris');
    if (c.client_secret_hash !== undefined && !HASH_RE.test(c.client_secret_hash)) throw new OAuthStoreError('bad client secret hash');
  }
  for (const section of ['refreshTokens', 'accessTokens']) {
    for (const [h, t] of Object.entries(s[section])) {
      if (!HASH_RE.test(h) || !isObj(t) || typeof t.clientId !== 'string' ||
          typeof t.expiresAt !== 'number') throw new OAuthStoreError(`bad ${section} entry`);
    }
  }
  return s;
}

async function readState(file) {
  const raw = await fsp.readFile(file, 'utf8');
  return validateState(JSON.parse(raw));
}

async function exists(p) {
  try { await fsp.access(p, fsc.F_OK); return true; } catch { return false; }
}

function pidAlive(pid) {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

async function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await fsp.open(lockPath, 'wx', 0o600);
      await fh.writeFile(String(process.pid));
      await fh.close();
      return;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      const pid = Number((await fsp.readFile(lockPath, 'utf8').catch(() => '')).trim());
      if (pid && pid !== process.pid && pidAlive(pid)) {
        throw new OAuthStoreError(`OAuth store already owned by live process ${pid}`);
      }
      await fsp.rm(lockPath, { force: true }); // stale lock
    }
  }
  throw new OAuthStoreError('could not acquire OAuth store lock');
}

/**
 * Open (or create) the persistent store.
 * @param {string} file absolute path, e.g. /home/box/grok-free-poc/full-bridge/state/oauth-store.json
 * @param {{now?:()=>number, logger?:{warn:Function,info:Function}, lock?:boolean}} [opts]
 */
export async function openOAuthStore(file, opts = {}) {
  const now = opts.now ?? Date.now;
  const log = opts.logger ?? console;
  const bak = `${file}.bak`;
  const lockPath = `${file}.lock`;
  const dir = path.dirname(file);

  await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
  await fsp.chmod(dir, 0o700).catch(() => {});
  if (opts.lock !== false) await acquireLock(lockPath);

  let state;
  if (await exists(file)) {
    const st = await fsp.stat(file);
    if (st.mode & 0o077) {
      await fsp.chmod(file, 0o600);
      log.warn('[oauth-store] permissions were too open; reset to 0600');
    }
    try {
      state = await readState(file);
    } catch (err) {
      const quarantine = `${file}.corrupt-${now()}`;
      await fsp.rename(file, quarantine);
      log.warn(`[oauth-store] main file unreadable (${err.message}); quarantined to ${path.basename(quarantine)}`);
      try {
        state = await readState(bak);
        log.warn('[oauth-store] restored from .bak');
      } catch {
        throw new OAuthStoreError('OAuth store corrupt and no valid .bak; refusing to start with an empty registry');
      }
    }
  } else if (await exists(bak)) {
    state = await readState(bak); // crashed between backup and rename
    log.warn('[oauth-store] main file missing; restored from .bak');
  } else {
    state = emptyState();
    log.info('[oauth-store] new empty registry');
  }

  let queue = Promise.resolve();
  let closed = false;

  function prune() {
    const t = now();
    for (const section of ['refreshTokens', 'accessTokens']) {
      for (const [h, rec] of Object.entries(state[section])) {
        if (rec.expiresAt <= t) delete state[section][h];
      }
    }
  }

  async function writeNow() {
    prune();
    const data = JSON.stringify(state, null, 2);
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const fh = await fsp.open(tmp, 'w', 0o600);
    try {
      await fh.writeFile(data);
      await fh.sync();
    } finally {
      await fh.close();
    }
    if (await exists(file)) await fsp.copyFile(file, bak).then(() => fsp.chmod(bak, 0o600));
    await fsp.rename(tmp, file);
    const dh = await fsp.open(dir, 'r').catch(() => null); // persist the rename itself
    if (dh) { await dh.sync().catch(() => {}); await dh.close(); }
  }

  // Serialize every mutation; a failed write rejects its caller but keeps the queue alive.
  function persist() {
    if (closed) return Promise.reject(new OAuthStoreError('store closed'));
    const p = queue.then(writeNow);
    queue = p.catch(() => {});
    return p;
  }

  if (!(await exists(file))) await persist();

  const store = {
    /** DCR: register a new client. Returns the public registration response. */
    async registerClient(meta = {}) {
      const redirect_uris = meta.redirect_uris;
      if (!Array.isArray(redirect_uris) || redirect_uris.length === 0 || !redirect_uris.every(validateRedirectUri)) {
        throw new OAuthStoreError('invalid_redirect_uri');
      }
      const client_id = crypto.randomUUID();
      const authMethod = meta.token_endpoint_auth_method ?? 'none';
      if (!['none', 'client_secret_post', 'client_secret_basic'].includes(authMethod)) {
        throw new OAuthStoreError('invalid_client_metadata');
      }
      const client_secret = authMethod === 'none' ? undefined : crypto.randomBytes(32).toString('base64url');
      state.clients[client_id] = {
        client_id,
        client_name: typeof meta.client_name === 'string' ? meta.client_name.slice(0, 200) : undefined,
        redirect_uris: [...redirect_uris],
        grant_types: meta.grant_types ?? ['authorization_code', 'refresh_token'],
        response_types: meta.response_types ?? ['code'],
        token_endpoint_auth_method: authMethod,
        scope: typeof meta.scope === 'string' ? meta.scope : undefined,
        client_secret_hash: client_secret ? hashToken(client_secret) : undefined,
        client_id_issued_at: Math.floor(now() / 1000),
      };
      await persist();
      const { client_secret_hash, ...pub } = state.clients[client_id];
      return client_secret ? { ...pub, client_secret, client_secret_expires_at: 0 } : pub;
    },

    /**
     * Owner-only recovery: re-attach a client_id that ChatGPT still holds
     * (public clients only; a lost client_secret cannot be recovered).
     */
    async importPublicClient({ client_id, redirect_uris, client_name }) {
      if (!CLIENT_ID_RE.test(client_id ?? '')) throw new OAuthStoreError('invalid client_id');
      if (!Array.isArray(redirect_uris) || !redirect_uris.length || !redirect_uris.every(validateRedirectUri)) {
        throw new OAuthStoreError('invalid_redirect_uri');
      }
      if (state.clients[client_id]) return false;
      state.clients[client_id] = {
        client_id, client_name, redirect_uris: [...redirect_uris],
        grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'],
        token_endpoint_auth_method: 'none', client_id_issued_at: Math.floor(now() / 1000), imported: true,
      };
      await persist();
      return true;
    },

    getClient(client_id) {
      const c = state.clients[client_id];
      if (!c) return null;
      const { client_secret_hash, ...pub } = c;
      return pub;
    },

    /** Exact-match redirect_uri check (RFC 6749 §3.1.2 / OAuth 2.1). */
    isRedirectUriAllowed(client_id, uri) {
      return !!state.clients[client_id]?.redirect_uris.includes(uri);
    },

    /** Constant-time client authentication for confidential clients. */
    authenticateClient(client_id, client_secret) {
      const c = state.clients[client_id];
      if (!c) return false;
      if (c.token_endpoint_auth_method === 'none') return client_secret === undefined || client_secret === '';
      if (!client_secret) return false;
      const a = Buffer.from(c.client_secret_hash, 'hex');
      const b = Buffer.from(hashToken(client_secret), 'hex');
      return crypto.timingSafeEqual(a, b);
    },

    async saveAccessToken(token, { clientId, scope, resource, ttlMs }) {
      state.accessTokens[hashToken(token)] = { clientId, scope, resource, expiresAt: now() + ttlMs };
      await persist();
    },

    /** Returns {clientId, scope, resource, expiresAt} or null if unknown/expired/client gone. */
    verifyAccessToken(token) {
      const rec = state.accessTokens[hashToken(token)];
      if (!rec || rec.expiresAt <= now() || !state.clients[rec.clientId]) return null;
      return { ...rec };
    },

    async saveRefreshToken(token, { clientId, scope, resource, ttlMs, familyId }) {
      state.refreshTokens[hashToken(token)] = {
        clientId, scope, resource, expiresAt: now() + ttlMs, familyId: familyId ?? crypto.randomUUID(),
      };
      await persist();
    },

    /**
     * Rotation: a valid refresh token is single-use. Presenting an already-used
     * token is treated as replay and revokes the whole family.
     * Returns the record (with familyId to reuse for the new token) or null.
     */
    async consumeRefreshToken(token, clientId) {
      const h = hashToken(token);
      const rec = state.refreshTokens[h];
      if (!rec || rec.clientId !== clientId || rec.expiresAt <= now() || !state.clients[clientId]) return null;
      if (rec.usedAt) {
        for (const [k, r] of Object.entries(state.refreshTokens)) if (r.familyId === rec.familyId) delete state.refreshTokens[k];
        await persist();
        log.warn('[oauth-store] refresh token replay detected; token family revoked');
        return null;
      }
      rec.usedAt = now();
      await persist();
      const { usedAt, ...out } = rec;
      return out;
    },

    /** RFC 7009: revoke an access or refresh token (refresh revokes its family). */
    async revokeToken(token) {
      const h = hashToken(token);
      let changed = false;
      if (state.accessTokens[h]) { delete state.accessTokens[h]; changed = true; }
      const rec = state.refreshTokens[h];
      if (rec) {
        for (const [k, r] of Object.entries(state.refreshTokens)) if (r.familyId === rec.familyId) delete state.refreshTokens[k];
        changed = true;
      }
      if (changed) await persist();
      return changed;
    },

    stats() {
      return {
        clients: Object.keys(state.clients).length,
        refreshTokens: Object.keys(state.refreshTokens).length,
        accessTokens: Object.keys(state.accessTokens).length,
      };
    },

    async close() {
      if (closed) return;
      await queue;
      closed = true;
      if (opts.lock !== false) await fsp.rm(lockPath, { force: true });
    },
  };
  return store;
}
