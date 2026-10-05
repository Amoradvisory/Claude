// Audit : effets de bord de Playwright connectOverCDP sur un navigateur "personnel".
// Simule l'onglet de l'utilisateur avec une connexion CDP brute distincte (comme un humain qui
// utilise son navigateur pendant que browserd est branché), puis mesure :
//  A. où atterrit un téléchargement lancé depuis l'onglet de l'utilisateur ;
//  B. ce que devient un confirm() dans l'onglet de l'utilisateur ;
//  C. ce que devient un beforeunload ("Quitter la page ?") dans l'onglet de l'utilisateur ;
//  D. si un nouvel onglet de l'utilisateur reste bloqué quand le pilote ne répond plus ;
// puis refait A-B-C avec les parades (setDownloadBehavior default + gestionnaire de dialogues filtrant).
const { chromium } = require(process.env.GUARD_PW_CORE || 'playwright-core');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const PORT = 20000 + Math.floor(Math.random() * 20000);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// --- petit site de test ---
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/file.txt')) {
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Disposition': 'attachment; filename="rapport-utilisateur.txt"' });
    return res.end('contenu utilisateur ' + Date.now());
  }
  res.writeHead(200, { 'Content-Type': 'text/html' });
  res.end(`<!doctype html><title>Onglet utilisateur</title>
  <a id=dl href="/file.txt">télécharger</a>
  <textarea id=t></textarea>
  <script>window.addEventListener('beforeunload', e => { if (document.getElementById('t').value) { e.preventDefault(); e.returnValue=''; } });</script>`);
});

// --- client CDP brut (= l'utilisateur) ---
class RawCDP {
  constructor(url) { this.url = url; this.id = 0; this.pending = new Map(); this.events = []; this.listeners = []; }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((res, rej) => { this.ws.onopen = res; this.ws.onerror = rej; });
    this.ws.onmessage = m => {
      const msg = JSON.parse(m.data);
      if (msg.id && this.pending.has(msg.id)) { const { res, rej } = this.pending.get(msg.id); this.pending.delete(msg.id); msg.error ? rej(new Error(msg.error.message)) : res(msg.result); }
      else if (msg.method) { this.events.push({ t: Date.now(), ...msg }); this.listeners.forEach(l => l(msg)); }
    };
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id; const msg = { id, method, params }; if (sessionId) msg.sessionId = sessionId;
    this.ws.send(JSON.stringify(msg));
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); setTimeout(() => { if (this.pending.has(id)) { this.pending.delete(id); rej(new Error('timeout ' + method)); } }, 5000); });
  }
  waitEvent(pred, timeout = 3000) {
    return new Promise(res => {
      const found = this.events.find(pred); if (found) return res(found);
      const l = m => { if (pred(m)) { this.listeners = this.listeners.filter(x => x !== l); res(m); } };
      this.listeners.push(l); setTimeout(() => { this.listeners = this.listeners.filter(x => x !== l); res(null); }, timeout);
    });
  }
  close() { this.ws.close(); }
}

async function userTab(user, url) {
  const { targetId } = await user.send('Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await user.send('Target.attachToTarget', { targetId, flatten: true });
  await user.send('Page.enable', {}, sessionId);
  await user.send('Runtime.enable', {}, sessionId);
  await user.send('Page.navigate', { url }, sessionId);
  await sleep(600);
  return { targetId, sessionId };
}

function listFiles(dir) { try { return fs.readdirSync(dir); } catch { return []; } }

async function scenario(label, mitigated, base, defaultDl) {
  const out = { label };
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const user = new RawCDP(ver.webSocketDebuggerUrl); await user.open();
  // l'utilisateur fixe son propre comportement de téléchargement (= dossier Téléchargements habituel)
  await user.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: defaultDl, eventsEnabled: true });
  const u = await userTab(user, base + '/');

  // --- le pilote se branche ---
  const t0 = Date.now();
  const browser = await chromium.connectOverCDP(ver.webSocketDebuggerUrl, { timeout: 8000 });
  const ctx = browser.contexts()[0];
  out.pagesSeenByDriver = ctx.pages().length;
  const agentPages = new Set();
  if (mitigated) {
    const bs = await browser.newBrowserCDPSession();
    await bs.send('Browser.setDownloadBehavior', { behavior: 'default' });
    ctx.on('dialog', d => { if (agentPages.has(d.page())) d.dismiss().catch(() => {}); /* sinon : laisser à l'utilisateur */ });
  }
  const agent = await ctx.newPage(); agentPages.add(agent);
  await agent.goto(base + '/', { timeout: 5000 }).catch(() => {});

  // A. téléchargement depuis l'onglet utilisateur
  const homeDl = path.join(os.homedir(), 'Downloads');
  const before = new Set(listFiles(defaultDl)), beforeHome = new Set(listFiles(homeDl));
  const tmpBefore = new Set(listFiles(os.tmpdir()).filter(n => n.startsWith('playwright-artifacts-')));
  await user.send('Runtime.evaluate', { expression: "document.getElementById('dl').click()" }, u.sessionId);
  await sleep(1500);
  const newInDefault = listFiles(defaultDl).filter(n => !before.has(n)).concat(listFiles(homeDl).filter(n => !beforeHome.has(n) && n.startsWith('rapport-utilisateur')).map(n => '~/Downloads/' + n));
  const artifactDirs = listFiles(os.tmpdir()).filter(n => n.startsWith('playwright-artifacts-'));
  const inArtifacts = artifactDirs.flatMap(d => listFiles(path.join(os.tmpdir(), d)).map(f => d + '/' + f));
  out.A_download = { newInUserDownloads: newInDefault, inPlaywrightTemp: inArtifacts };

  // B. confirm() dans l'onglet utilisateur
  user.events.length = 0;
  user.send('Runtime.evaluate', { expression: "window.__r = confirm('Supprimer le brouillon ?'); 'ok'" }, u.sessionId).catch(() => {});
  const opened = await user.waitEvent(m => m.method === 'Page.javascriptDialogOpening', 2000);
  const closed = await user.waitEvent(m => m.method === 'Page.javascriptDialogClosed', 2000);
  out.B_confirm = { opened: !!opened, closedWithin2s: !!closed, closedBy: closed ? (closed.params.result ? 'ACCEPTÉ' : 'REFUSÉ') : 'resté ouvert (utilisateur décide)' };
  if (!closed) { await user.send('Page.handleJavaScriptDialog', { accept: false }, u.sessionId).catch(() => {}); await user.waitEvent(m => m.method === 'Page.javascriptDialogClosed', 3000); await sleep(300); }

  // C. beforeunload dans l'onglet utilisateur (texte non enregistré)
  user.events.length = 0;
  // Amor tape du texte (geste utilisateur requis pour que « Quitter la page ? » apparaisse)
  await user.send('Runtime.evaluate', { expression: "document.getElementById('t').value='texte non enregistré'", userGesture: true }, u.sessionId).catch(() => {});
  user.send('Page.navigate', { url: base + '/?ailleurs' }, u.sessionId).catch(() => {});
  const bo = await user.waitEvent(m => m.method === 'Page.javascriptDialogOpening' && m.params.type === 'beforeunload', 2000);
  const bc = await user.waitEvent(m => m.method === 'Page.javascriptDialogClosed', 2000);
  out.C_beforeunload = { opened: !!bo, closedWithin2s: !!bc, closedBy: !bo ? 'non déclenché' : bc ? (bc.params.result ? 'ACCEPTÉ (page quittée, texte perdu)' : 'REFUSÉ') : 'resté ouvert (utilisateur décide)' };
  if (bo && !bc) await user.send('Page.handleJavaScriptDialog', { accept: false }, u.sessionId).catch(() => {});

  await Promise.race([browser.close().catch(() => {}), sleep(3000)]); // pour connectOverCDP : déconnexion seulement
  await sleep(300);
  out.afterDisconnect_playwrightTempDirsLeft = listFiles(os.tmpdir()).filter(n => n.startsWith('playwright-artifacts-')).length;
  user.close();
  return out;
}

async function scenarioPause(base) {
  // D. le pilote branché mais figé (boucle synchrone) : un nouvel onglet utilisateur se charge-t-il ?
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const child = spawn(process.execPath, ['-e', `
    const { chromium } = require(process.env.GUARD_PW_CORE || 'playwright-core');
    (async () => { const b = await chromium.connectOverCDP('${ver.webSocketDebuggerUrl}'); console.log('CONNECTED'); })();
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(res => child.stdout.on('data', d => { if (String(d).includes('CONNECTED')) res(); }));
  await sleep(500);
  process.kill(child.pid, 'SIGSTOP'); // pilote figé (simule un browserd bloqué)
  const user = new RawCDP(ver.webSocketDebuggerUrl); await user.open();
  await user.send('Target.setDiscoverTargets', { discover: true });
  const t0 = Date.now();
  const { targetId } = await user.send('Target.createTarget', { url: base + '/?nouvel-onglet' });
  // on observe l'URL/titre via la liste des cibles (pas d'attache supplémentaire)
  let loaded = false;
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    const t = list.find(x => x.id === targetId);
    if (t && t.title === 'Onglet utilisateur') { loaded = true; break; }
    await sleep(250);
  }
  const res = { D_newTabWhileDriverFrozen: loaded ? `chargé en ${Date.now() - t0} ms` : 'BLOQUÉ > 5 s (attend le pilote)' };
  process.kill(child.pid, 'SIGCONT');
  await sleep(1000);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const t = list.find(x => x.id === targetId);
  res.D_afterDriverResumed = t ? `titre="${t.title}"` : 'absent';
  child.kill('SIGKILL');
  user.close();
  return res;
}

async function scenarioOpenDialog(base) {
  const ver = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
  const user = new RawCDP(ver.webSocketDebuggerUrl); await user.open();
  const u = await userTab(user, base + '/');
  user.send('Runtime.evaluate', { expression: "alert('Votre session expire dans 5 minutes')" }, u.sessionId).catch(() => {});
  await user.waitEvent(m => m.method === 'Page.javascriptDialogOpening', 2000);
  const t0 = Date.now();
  let r;
  try { const b = await chromium.connectOverCDP(ver.webSocketDebuggerUrl, { timeout: 8000 }); r = `branché en ${Date.now() - t0} ms`; await b.close(); }
  catch (e) { r = `ÉCHEC du branchement après ${Date.now() - t0} ms : ${String(e).split('\n')[0]}`; }
  user.close();
  return { E_connectWhileUserDialogOpen: r };
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const defaultDl = fs.mkdtempSync(path.join(os.tmpdir(), 'Telechargements-'));
  async function fresh(fn) {
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'perso-'));
    const chrome = spawn(EXE, [`--remote-debugging-port=${PORT}`, `--user-data-dir=${udd}`, ...(process.env.HEADFUL ? [] : ['--headless=new']), '--no-sandbox', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
    for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${PORT}/json/version`); break; } catch { await sleep(200); } }
    try { return await fn(); } catch (e) { return { error: String(e).split('\n')[0] }; } finally { chrome.kill('SIGKILL'); await sleep(500); }
  }
  const results = [];
  results.push(await fresh(() => scenario('Playwright brut (comportement actuel type browserd)', false, base, defaultDl)));
  console.log(JSON.stringify(results[0], null, 2));
  results.push(await fresh(() => scenario('Playwright + parades (download=default, dialogues filtrés)', true, base, defaultDl)));
  console.log(JSON.stringify(results[1], null, 2));
  results.push(await fresh(() => scenarioPause(base)));
  console.log(JSON.stringify(results[2], null, 2));
  results.push(await fresh(() => scenarioOpenDialog(base)));
  console.log(JSON.stringify(results[3], null, 2));
  server.close();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
