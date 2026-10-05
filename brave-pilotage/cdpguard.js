#!/usr/bin/env node
// cdpguard — garde CDP entre un pilote (browserd/Playwright) et le navigateur personnel d'Amor.
//
// Le pilote se connecte au garde comme à un navigateur (connectOverCDP http://127.0.0.1:9224).
// Le garde tient UNE connexion vers Brave et ne montre au pilote que les onglets de travail :
//   - onglets créés par le pilote, fenêtres surgissantes ouvertes par eux, onglets prêtés (/guard/adopt) ;
//   - les onglets d'Amor restent invisibles : ni dialogues auto-fermés, ni émulation de focus,
//     ni blocage du branchement par une alerte ouverte chez lui ;
//   - Browser.setDownloadBehavior du pilote n'est jamais appliqué au profil d'Amor
//     (ses téléchargements gardent leur dossier ; ceux du pilote sont signalés et copiés à part) ;
//   - commandes dangereuses refusées : fermer le navigateur, lire/écrire/effacer les cookies,
//     modifier les permissions du profil.
// Zéro dépendance hors playwright-core (déjà présent pour browserd), Node >= 18.
'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const PW_CORE = process.env.GUARD_PW_CORE || 'playwright-core';
const { ws: WebSocket, wsServer: WebSocketServer } = require(require.resolve(PW_CORE + '/lib/utilsBundle', { paths: [process.cwd(), __dirname] }));

const CFG = {
  port: +(process.env.GUARD_PORT || 9224),
  // ws://…, http://127.0.0.1:PORT, ou devtoolsactiveport:<dossier User Data>
  upstream: process.env.GUARD_UPSTREAM || 'devtoolsactiveport:' + path.join(process.env.LOCALAPPDATA || '', 'BraveSoftware', 'Brave-Browser', 'User Data'),
  idleMs: +(process.env.GUARD_IDLE_MS || 0),            // 0 = garder la connexion ; sinon la couper après inactivité (retire le bandeau)
  background: process.env.GUARD_BACKGROUND !== '0',     // nouveaux onglets du pilote en arrière-plan (ne volent pas l'onglet actif)
  newWindow: process.env.GUARD_NEW_WINDOW === '1',      // premier onglet du pilote dans une fenêtre à part
  dlDir: process.env.GUARD_DL_DIR || path.join(os.homedir(), 'Downloads', 'agent'),
  log: process.env.GUARD_LOG || '',
};

const log = (...a) => {
  const line = new Date().toISOString() + ' ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' ');
  if (CFG.log) fs.appendFile(CFG.log, line + '\n', () => {}); else console.error(line);
};

// ---------- état ----------
let up = null;                 // WebSocket vers le navigateur
let upState = 'down';          // down | connecting | connected
let upWaitSince = 0;
let upId = 0;
const upPending = new Map();   // id amont -> {resolve, reject} (requêtes internes) ou {client, id} (relais)
const targets = new Map();     // targetId -> targetInfo (onglets/pages connus)
const owner = new Map();       // targetId -> client propriétaire
const ownedContexts = new Map(); // browserContextId -> client
const sessions = new Map();    // sessionId amont -> {client, targetId}
const clients = new Set();
const downloads = new Map();   // guid -> {targetId, url, name, state, filePath, copiedTo}
const leases = new Map();      // targetId -> {agent, until} (coordination entre agents)
let lastActivity = Date.now();
let queued = [];               // messages clients en attente de la connexion amont

const BLOCKED = new Set([
  'Browser.close', 'Browser.crash', 'Browser.crashGpuProcess', 'Browser.setWindowBounds', 'Browser.setDockTile',
  'Network.clearBrowserCookies', 'Network.clearBrowserCache', 'Network.getAllCookies', 'Network.getCookies',
  'Network.setCookie', 'Network.setCookies', 'Network.deleteCookies',
  'Storage.clearDataForOrigin', 'Storage.clearDataForStorageKey',
]);
const CONTEXT_SCOPED = new Set([ // autorisés seulement pour un contexte isolé créé par le pilote
  'Storage.getCookies', 'Storage.setCookies', 'Storage.clearCookies',
  'Browser.grantPermissions', 'Browser.resetPermissions', 'Browser.setPermission',
]);

// ---------- amont ----------
function readUpstreamUrl() {
  const u = CFG.upstream;
  if (u.startsWith('ws://')) return Promise.resolve(u);
  if (u.startsWith('http://')) return fetch(u.replace(/\/$/, '') + '/json/version').then(r => r.json()).then(j => j.webSocketDebuggerUrl);
  if (u.startsWith('devtoolsactiveport:')) {
    const file = path.join(u.slice('devtoolsactiveport:'.length), 'DevToolsActivePort');
    const [port, wsPath] = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    if (!port || !wsPath) throw new Error('DevToolsActivePort incomplet : activer brave://inspect/#remote-debugging');
    return Promise.resolve(`ws://127.0.0.1:${port.trim()}${wsPath.trim()}`);
  }
  throw new Error('GUARD_UPSTREAM invalide');
}

function upSend(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    if (!up || upState !== 'connected') return reject(new Error('navigateur non connecté'));
    const id = ++upId;
    upPending.set(id, { resolve, reject });
    const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    up.send(JSON.stringify(msg));
  });
}

let connecting = null;
function ensureUpstream() {
  if (upState === 'connected') return Promise.resolve();
  if (connecting) return connecting;
  upState = 'connecting'; upWaitSince = Date.now();
  connecting = (async () => {
    const url = await readUpstreamUrl();
    log('connexion au navigateur', url.replace(/\/devtools\/browser\/.*/, '/devtools/browser/…'), '(Brave peut demander « Autoriser le débogage à distance ? »)');
    const ws = new WebSocket(url, { perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
    await new Promise((res, rej) => { ws.once('open', res); ws.once('error', rej); ws.once('close', () => rej(new Error('connexion refusée ou fermée'))); });
    up = ws; upState = 'connected';
    ws.on('message', data => onUpstreamMessage(JSON.parse(String(data))));
    ws.on('close', () => onUpstreamClosed());
    ws.on('error', e => log('erreur amont', e.message));
    await upSend('Target.setDiscoverTargets', { discover: true });
    const { targetInfos } = await upSend('Target.getTargets');
    for (const t of targetInfos) targets.set(t.targetId, t);
    await upSend('Browser.setDownloadBehavior', { behavior: 'default', eventsEnabled: true }).catch(e => log('setDownloadBehavior', e.message));
    log('navigateur connecté :', targetInfos.filter(t => t.type === 'page').length, 'onglets (invisibles pour le pilote)');
    const q = queued; queued = [];
    for (const [c, m] of q) onClientMessage(c, m);
  })().catch(e => { upState = 'down'; up = null; log('échec connexion amont :', e.message); for (const [c, m] of queued.splice(0)) reply(c, m.id, null, 'navigateur indisponible : ' + e.message); throw e; })
    .finally(() => { connecting = null; });
  return connecting;
}

function onUpstreamClosed() {
  log('connexion navigateur fermée');
  up = null; upState = 'down';
  for (const [, p] of upPending) p.reject ? p.reject(new Error('navigateur déconnecté')) : null;
  upPending.clear(); sessions.clear(); targets.clear(); owner.clear(); ownedContexts.clear();
  for (const c of clients) c.ws.close(1011, 'navigateur déconnecté'); // le pilote se reconnectera
}

function isOwnedTarget(targetId, client) {
  const o = owner.get(targetId);
  return client ? o === client : !!o;
}

function onUpstreamMessage(msg) {
  if (msg.id !== undefined) {
    const p = upPending.get(msg.id); if (!p) return; upPending.delete(msg.id);
    if (p.client) return p.after ? p.after(msg) : sendTo(p.client, { id: p.id, result: msg.result, error: msg.error, sessionId: p.sessionId });
    return msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  }
  const { method, params, sessionId } = msg;
  if (sessionId) {
    const s = sessions.get(sessionId); if (!s) return;
    if (method === 'Target.attachedToTarget') sessions.set(params.sessionId, { client: s.client, targetId: params.targetInfo.targetId, child: true });
    if (method === 'Target.detachedFromTarget') sessions.delete(params.sessionId);
    return sendTo(s.client, msg);
  }
  switch (method) {
    case 'Target.targetCreated':
    case 'Target.targetInfoChanged': {
      const t = params.targetInfo; const known = targets.has(t.targetId); targets.set(t.targetId, t);
      if (!owner.has(t.targetId)) {
        const byOpener = t.openerId && owner.get(t.openerId);
        const byContext = t.browserContextId && ownedContexts.get(t.browserContextId);
        const o = byOpener || byContext;
        if (o && t.type === 'page') { owner.set(t.targetId, o); if (o.autoAttach) attachFor(o, t.targetId).catch(e => log('attache surgissante', e.message)); }
      }
      const o = owner.get(t.targetId);
      if (o && o.discover) sendTo(o, { method: known && method === 'Target.targetCreated' ? 'Target.targetInfoChanged' : method, params });
      return;
    }
    case 'Target.targetDestroyed':
    case 'Target.targetCrashed': {
      const o = owner.get(params.targetId);
      if (method === 'Target.targetDestroyed') { targets.delete(params.targetId); owner.delete(params.targetId); }
      if (o && o.discover) sendTo(o, msg);
      return;
    }
    case 'Target.attachedToTarget': return; // nos attaches explicites : on synthétise nous-mêmes l'événement
    case 'Target.detachedFromTarget': {
      const s = sessions.get(params.sessionId); sessions.delete(params.sessionId);
      if (s) sendTo(s.client, msg);
      return;
    }
    case 'Browser.downloadWillBegin': {
      const targetId = params.frameId; // téléchargement lancé par le cadre principal d'un onglet
      if (!isOwnedTarget(targetId)) return; // téléchargement d'Amor : on ne touche à rien
      downloads.set(params.guid, { targetId, url: params.url, name: params.suggestedFilename, state: 'inProgress' });
      return sendTo(owner.get(targetId), msg);
    }
    case 'Browser.downloadProgress': {
      const d = downloads.get(params.guid); if (!d) return;
      d.state = params.state; if (params.filePath) d.filePath = params.filePath;
      if (params.state === 'completed' && d.filePath) copyAgentDownload(d);
      const o = owner.get(d.targetId); if (o) sendTo(o, msg);
      return;
    }
  }
}

function copyAgentDownload(d) {
  try {
    fs.mkdirSync(CFG.dlDir, { recursive: true });
    const dest = path.join(CFG.dlDir, path.basename(d.filePath));
    fs.copyFileSync(d.filePath, dest); d.copiedTo = dest;
    log('téléchargement du pilote copié :', dest);
  } catch (e) { log('copie téléchargement', e.message); }
}

async function attachFor(client, targetId) {
  if ([...sessions.values()].some(s => s.client === client && s.targetId === targetId && !s.child)) return;
  const { sessionId } = await upSend('Target.attachToTarget', { targetId, flatten: true });
  sessions.set(sessionId, { client, targetId });
  const info = targets.get(targetId) || (await upSend('Target.getTargetInfo', { targetId })).targetInfo;
  sendTo(client, { method: 'Target.attachedToTarget', params: { sessionId, targetInfo: { ...info, attached: true }, waitingForDebugger: false } });
  return sessionId;
}

// ---------- aval (pilote) ----------
function sendTo(client, msg) {
  if (client.ws.readyState !== 1) return;
  if (msg.sessionId === undefined) delete msg.sessionId;
  if (msg.error === undefined) delete msg.error; else delete msg.result;
  client.ws.send(JSON.stringify(msg));
}
function reply(client, id, result, error, sessionId) {
  sendTo(client, error ? { id, error: { code: -32000, message: 'cdpguard : ' + error }, sessionId } : { id, result: result || {}, sessionId });
}
function relay(client, msg, params = msg.params, after) {
  const id = ++upId;
  upPending.set(id, { client, id: msg.id, sessionId: msg.vsid || msg.sessionId, after });
  const out = { id, method: msg.method, params: params || {} };
  if (msg.sessionId && !msg.vsid) out.sessionId = msg.sessionId;
  up.send(JSON.stringify(out));
}

let vsidSeq = 0;
function onClientMessage(client, msg) {
  lastActivity = Date.now();
  if (upState !== 'connected') { queued.push([client, msg]); ensureUpstream().catch(() => {}); return; }
  const { id, method, params = {}, sessionId } = msg;
  // session « navigateur » virtuelle (browser.newBrowserCDPSession) : mêmes filtres que la racine
  const vsid = sessionId && client.vsids && client.vsids.has(sessionId) ? sessionId : undefined;
  if (vsid) msg = { ...msg, vsid };
  const R = (res, err) => reply(client, id, res, err, sessionId);
  const S = m => sendTo(client, { ...m, sessionId: vsid });
  if (BLOCKED.has(method)) { log('refusé', method); return R(null, `${method} refusé (profil personnel protégé)`); }
  if (CONTEXT_SCOPED.has(method)) {
    if (params.browserContextId && ownedContexts.get(params.browserContextId) === client) return relay(client, msg);
    log('refusé', method, '(contexte par défaut)');
    return R(null, `${method} refusé sur le profil personnel`);
  }
  if (sessionId && !vsid) {
    const s = sessions.get(sessionId);
    if (!s || s.client !== client) return R(null, 'session inconnue');
    return relay(client, msg);
  }
  switch (method) {
    case 'Target.attachToBrowserTarget': {
      const sid = 'cdpguard-browser-' + (++vsidSeq);
      (client.vsids ||= new Set()).add(sid);
      return R({ sessionId: sid });
    }
    case 'Target.detachFromTarget':
      if (params.sessionId && client.vsids && client.vsids.delete(params.sessionId)) return R({});
      if (params.sessionId && sessions.get(params.sessionId)?.client === client) { sessions.delete(params.sessionId); return relay(client, msg); }
      return R(null, 'session inconnue');
    case 'Target.setDiscoverTargets':
      if (vsid) return R({});
      client.discover = !!params.discover; R({});
      if (client.discover) for (const [tid, o] of owner) if (o === client && targets.has(tid)) sendTo(client, { method: 'Target.targetCreated', params: { targetInfo: targets.get(tid) } });
      return;
    case 'Target.setAutoAttach':
      if (vsid) return R({});
      client.autoAttach = !!params.autoAttach;
      // comme Chrome : les onglets existants sont annoncés AVANT la réponse
      return Promise.all([...owner].filter(([tid, o]) => o === client && targets.get(tid)?.type === 'page')
        .map(([tid]) => attachFor(client, tid).catch(e => log('attache', e.message)))).then(() => R({}));
    case 'Target.getTargets':
      return R({ targetInfos: [...owner].filter(([tid, o]) => o === client && targets.has(tid)).map(([tid]) => targets.get(tid)) });
    case 'Target.getTargetInfo':
      if (params.targetId && !isOwnedTarget(params.targetId, client)) return R(null, 'onglet non attribué au pilote');
      return relay(client, msg);
    case 'Target.attachToTarget':
    case 'Target.activateTarget':
    case 'Target.closeTarget':
      if (!isOwnedTarget(params.targetId, client)) return R(null, 'onglet non attribué au pilote (utiliser /guard/adopt)');
      if (method === 'Target.attachToTarget') return attachFor(client, params.targetId).then(sid => R({ sessionId: sid }), e => R(null, e.message));
      return relay(client, msg);
    case 'Target.createBrowserContext':
      return relay(client, msg, params, r => { if (r.result) ownedContexts.set(r.result.browserContextId, client); S({ id, result: r.result, error: r.error }); });
    case 'Target.disposeBrowserContext':
      if (ownedContexts.get(params.browserContextId) !== client) return R(null, 'contexte non attribué');
      ownedContexts.delete(params.browserContextId); return relay(client, msg);
    case 'Target.getBrowserContexts':
      return R({ browserContextIds: [...ownedContexts].filter(([, o]) => o === client).map(([k]) => k) });
    case 'Target.createTarget': {
      const p = { ...params };
      if (CFG.background && p.background === undefined) p.background = true;
      if (CFG.newWindow && !p.browserContextId && ![...owner.values()].includes(client)) p.newWindow = true;
      return relay(client, msg, p, async r => {
        if (r.error) return S({ id, error: r.error });
        const targetId = r.result.targetId; owner.set(targetId, client);
        try { if (!targets.has(targetId)) targets.set(targetId, (await upSend('Target.getTargetInfo', { targetId })).targetInfo); } catch {}
        if (client.discover && targets.has(targetId)) sendTo(client, { method: 'Target.targetCreated', params: { targetInfo: targets.get(targetId) } });
        if (client.autoAttach) await attachFor(client, targetId).catch(e => log('attache nouvel onglet', e.message));
        S({ id, result: r.result }); // la réponse arrive après l'attache, comme avec Chrome
      });
    }
    case 'Browser.setDownloadBehavior':
      if (params.browserContextId && ownedContexts.get(params.browserContextId) === client) return relay(client, msg);
      log('setDownloadBehavior du pilote ignoré pour le profil personnel', params.behavior);
      return R({}); // jamais appliqué au profil d'Amor : téléchargements suivis par événements
    case 'Browser.getWindowForTarget':
      if (params.targetId && !isOwnedTarget(params.targetId, client)) return R(null, 'onglet non attribué au pilote');
      return relay(client, msg);
    default:
      // niveau navigateur : liste blanche stricte (tout le reste toucherait le profil entier)
      if (/^(Browser\.(getVersion|getWindowBounds)|SystemInfo\.|Schema\.)/.test(method)) return relay(client, msg);
      log('refusé (niveau navigateur)', method);
      return R(null, `${method} refusé au niveau navigateur`);
  }
}

function onClientClosed(client) {
  clients.delete(client);
  for (const [sid, s] of sessions) if (s.client === client) { sessions.delete(sid); if (!s.child) upSend('Target.detachFromTarget', { sessionId: sid }).catch(() => {}); }
  // les onglets de travail restent ouverts (Amor reprend la main) et restent attribués à un futur client du pilote
  for (const [tid, o] of owner) if (o === client) owner.set(tid, PARKED);
  for (const [cid, o] of ownedContexts) if (o === client) ownedContexts.set(cid, PARKED);
  log('pilote déconnecté ; onglets de travail conservés :', [...owner.values()].filter(o => o === PARKED).length);
}
const PARKED = { ws: { readyState: 3 }, parked: true };
function claimParked(client) {
  for (const [tid, o] of owner) if (o === PARKED) owner.set(tid, client);
  for (const [cid, o] of ownedContexts) if (o === PARKED) ownedContexts.set(cid, client);
}

// ---------- HTTP (découverte + commandes du garde) ----------
const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  u.pathname = u.pathname.replace(/\/+$/, '') || '/';
  const json = (o, code = 200) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(o, null, 1)); };
  try {
    if (u.pathname === '/json/version') {
      await ensureUpstream();
      const v = await upSend('Browser.getVersion');
      return json({ Browser: v.product, 'Protocol-Version': v.protocolVersion, 'User-Agent': v.userAgent, webSocketDebuggerUrl: `ws://127.0.0.1:${CFG.port}/devtools/browser/cdpguard` });
    }
    if (u.pathname === '/json/list' || u.pathname === '/json')
      return json([...owner].filter(([tid]) => targets.has(tid)).map(([tid]) => ({ id: tid, type: 'page', title: targets.get(tid).title, url: targets.get(tid).url })));
    if (u.pathname === '/guard/status')
      return json({ upstream: upState, waitingApprovalMs: upState === 'connecting' ? Date.now() - upWaitSince : 0, clients: clients.size,
        workTabs: [...owner].filter(([tid]) => targets.has(tid)).map(([tid, o]) => ({ targetId: tid, title: targets.get(tid).title, url: targets.get(tid).url, parked: o === PARKED })),
        userTabs: [...targets.values()].filter(t => t.type === 'page' && !owner.has(t.targetId)).length,
        downloads: [...downloads.values()] });
    if (u.pathname === '/guard/tabs') { // pour retrouver un onglet d'Amor (titre + domaine, sans contenu)
      await ensureUpstream();
      return json([...targets.values()].filter(t => t.type === 'page').map(t => ({ targetId: t.targetId, title: t.title, host: safeHost(t.url), work: owner.has(t.targetId) })));
    }
    if (u.pathname === '/guard/adopt' || u.pathname === '/guard/release') {
      await ensureUpstream();
      const tid = u.searchParams.get('targetId');
      if (!targets.has(tid)) return json({ error: 'onglet inconnu' }, 404);
      if (u.pathname === '/guard/release') {
        const o = owner.get(tid); owner.delete(tid);
        for (const [sid, s] of sessions) if (s.targetId === tid) { sessions.delete(sid); if (!s.child) upSend('Target.detachFromTarget', { sessionId: sid }).catch(() => {}); if (o && o.ws) sendTo(o, { method: 'Target.detachedFromTarget', params: { sessionId: sid, targetId: tid } }); }
        return json({ ok: true, released: tid });
      }
      const client = [...clients][0] || PARKED; // prêté au pilote connecté (browserd)
      if (owner.has(tid) && owner.get(tid) !== PARKED && owner.get(tid) !== client) return json({ error: 'onglet déjà attribué à un autre pilote' }, 409);
      owner.set(tid, client);
      if (client.discover) sendTo(client, { method: 'Target.targetCreated', params: { targetInfo: targets.get(tid) } });
      if (client.autoAttach) await attachFor(client, tid);
      return json({ ok: true, adopted: tid, title: targets.get(tid).title });
    }
    // baux d'onglet : deux agents (ChatGPT, Claude…) qui passent par le même pilote ne se marchent pas dessus
    if (u.pathname === '/guard/lease' || u.pathname === '/guard/unlease' || u.pathname === '/guard/leases') {
      const now = Date.now();
      for (const [k, l] of leases) if (l.until < now) leases.delete(k);
      if (u.pathname === '/guard/leases') return json([...leases].map(([targetId, l]) => ({ targetId, agent: l.agent, resteS: Math.round((l.until - now) / 1000) })));
      const tid = u.searchParams.get('targetId'), agent = u.searchParams.get('agent') || '?';
      const cur = leases.get(tid);
      if (u.pathname === '/guard/unlease') { if (cur && cur.agent === agent) leases.delete(tid); return json({ ok: true }); }
      if (cur && cur.agent !== agent && u.searchParams.get('force') !== '1')
        return json({ ok: false, error: `onglet tenu par ${cur.agent} encore ${Math.round((cur.until - now) / 1000)} s`, holder: cur.agent }, 409);
      leases.set(tid, { agent, until: now + 1000 * +(u.searchParams.get('ttl') || 120) });
      return json({ ok: true, targetId: tid, agent });
    }
    json({ error: 'inconnu' }, 404);
  } catch (e) { json({ error: e.message, upstream: upState }, 503); }
});
const safeHost = u => { try { return new URL(u).host; } catch { return ''; } };

const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false, maxPayload: 256 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (!req.url.startsWith('/devtools/browser')) return socket.destroy();
  wss.handleUpgrade(req, socket, head, ws => {
    const client = { ws, id: crypto.randomUUID().slice(0, 8), discover: false, autoAttach: false };
    clients.add(client); claimParked(client);
    log('pilote connecté', client.id);
    ws.on('message', data => { let m; try { m = JSON.parse(String(data)); } catch { return; } onClientMessage(client, m); });
    ws.on('close', () => onClientClosed(client));
    ensureUpstream().catch(() => ws.close(1011, 'navigateur indisponible'));
  });
});

if (CFG.idleMs > 0) setInterval(() => {
  if (upState === 'connected' && clients.size === 0 && Date.now() - lastActivity > CFG.idleMs) { log('inactif : déconnexion du navigateur (bandeau retiré)'); up.close(); }
}, 30_000).unref();

server.listen(CFG.port, '127.0.0.1', () => log(`cdpguard prêt sur http://127.0.0.1:${CFG.port} → ${CFG.upstream}`));
process.on('SIGINT', () => process.exit(0));
