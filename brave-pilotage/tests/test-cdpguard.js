// Recette de cdpguard sur un Chromium jetable qui joue le rôle du « Brave d'Amor ».
// Un client CDP brut simule Amor (ses onglets, ses dialogues, ses téléchargements) ;
// Playwright, branché via le garde, simule browserd.
// Usage : node tests/test-cdpguard.js   (HEADFUL=1 sous xvfb-run pour les téléchargements réels)
'use strict';
const { chromium } = require(process.env.GUARD_PW_CORE || 'playwright-core');
const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXE = process.env.CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME_PORT = 20000 + Math.floor(Math.random() * 20000), GUARD_PORT = CHROME_PORT + 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'OK  ' : 'ÉCHEC'} ${name}${detail ? ' — ' + detail : ''}`); };

const site = http.createServer((req, res) => {
  if (req.url.startsWith('/file')) {
    const name = req.url.includes('agent') ? 'export-agent.csv' : 'facture-amor.pdf';
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="${name}"` });
    return res.end('x'.repeat(100));
  }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end(`<!doctype html><title>${req.url.includes('agent') ? 'Travail agent' : 'Onglet Amor'}</title>
<h1>Page</h1><input id=q><button id=b onclick="document.getElementById('o').textContent='clic:'+document.getElementById('q').value">Go</button>
<div id=o></div><a id=dl href="/file${req.url.includes('agent') ? '-agent' : ''}">dl</a>
<a id=pop href="/agent-popup" target=_blank>pop</a><textarea id=t></textarea>
<script>addEventListener('beforeunload', e => { if (document.getElementById('t').value) { e.preventDefault(); e.returnValue = ''; } });</script>`);
});

class Raw {
  constructor(url) { this.url = url; this.n = 0; this.p = new Map(); this.ev = []; }
  async open() { this.ws = new WebSocket(this.url); await new Promise((r, j) => { this.ws.onopen = r; this.ws.onerror = j; });
    this.ws.onmessage = m => { const d = JSON.parse(m.data); if (d.id && this.p.has(d.id)) { const x = this.p.get(d.id); this.p.delete(d.id); d.error ? x.j(new Error(d.error.message)) : x.r(d.result); } else if (d.method) this.ev.push(d); }; }
  send(method, params = {}, sessionId) { const id = ++this.n; this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((r, j) => { this.p.set(id, { r, j }); setTimeout(() => { if (this.p.delete(id)) j(new Error('timeout ' + method)); }, 6000); }); }
  async wait(pred, ms = 2500) { const t = Date.now(); while (Date.now() - t < ms) { const e = this.ev.find(pred); if (e) return e; await sleep(50); } return null; }
}

async function main() {
  await new Promise(r => site.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${site.address().port}`;
  const udd = fs.mkdtempSync(path.join(os.tmpdir(), 'brave-amor-'));
  const chrome = spawn(EXE, [`--remote-debugging-port=${CHROME_PORT}`, `--user-data-dir=${udd}`, ...(process.env.HEADFUL ? [] : ['--headless=new']), '--no-sandbox', '--no-first-run', 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`); break; } catch { await sleep(200); } }
  const ver = await (await fetch(`http://127.0.0.1:${CHROME_PORT}/json/version`)).json();

  // --- Amor utilise son navigateur : 2 onglets, dont un avec une alerte restée ouverte ---
  const amor = new Raw(ver.webSocketDebuggerUrl); await amor.open();
  const tab = async url => { const { targetId } = await amor.send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await amor.send('Target.attachToTarget', { targetId, flatten: true });
    await amor.send('Page.enable', {}, sessionId); await amor.send('Runtime.enable', {}, sessionId);
    await amor.send('Page.navigate', { url }, sessionId); await sleep(500); return { targetId, sessionId }; };
  const mail = await tab(base + '/amor-mail');
  const banque = await tab(base + '/amor-banque');
  amor.send('Runtime.evaluate', { expression: "alert('Session bancaire : 5 minutes restantes')" }, banque.sessionId).catch(() => {});
  await amor.wait(e => e.method === 'Page.javascriptDialogOpening');

  // --- le garde ---
  const guardLog = path.join(os.tmpdir(), 'cdpguard-test.log'); try { fs.unlinkSync(guardLog); } catch {}
  const dlDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-dl-'));
  const guard = spawn(process.execPath, [path.join(__dirname, '..', 'cdpguard.js')], { env: { ...process.env, GUARD_PORT: String(GUARD_PORT), GUARD_UPSTREAM: `http://127.0.0.1:${CHROME_PORT}`, GUARD_LOG: guardLog, GUARD_DL_DIR: dlDir }, stdio: 'inherit' });
  for (let i = 0; i < 50; i++) { try { await fetch(`http://127.0.0.1:${GUARD_PORT}/guard/status`); break; } catch { await sleep(100); } }

  // T1 branchement malgré l'alerte ouverte chez Amor, sans voir ses onglets
  let t0 = Date.now();
  let browser;
  try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${GUARD_PORT}`, { timeout: 10000 }); check('T1 branchement du pilote malgré une alerte ouverte chez Amor', true, `${Date.now() - t0} ms`); }
  catch (e) { check('T1 branchement du pilote malgré une alerte ouverte chez Amor', false, String(e).split('\n')[0]); throw e; }
  const ctx = browser.contexts()[0];
  check('T1b onglets d\'Amor invisibles pour le pilote', ctx.pages().length === 0, `${ctx.pages().length} page(s) vue(s)`);
  const alertStill = !(amor.ev.find(e => e.method === 'Page.javascriptDialogClosed'));
  check('T1c alerte d\'Amor laissée intacte', alertStill);
  await amor.send('Page.handleJavaScriptDialog', { accept: true }, banque.sessionId).catch(() => {}); // Amor ferme son alerte

  // T2 travail : nouvel onglet, saisie, clic, lecture vérifiée
  ctx.on('dialog', d => d.dismiss()); // comportement actuel de browserd sur SES onglets
  t0 = Date.now();
  const page = await ctx.newPage();
  await page.goto(base + '/agent-travail');
  await page.fill('#q', 'bonjour');
  await page.click('#b');
  const out = await page.textContent('#o');
  check('T2 onglet de travail : saisie + clic + lecture vérifiée', out === 'clic:bonjour', `${out} en ${Date.now() - t0} ms`);
  const tl = await amor.send('Target.getTargets');
  check('T2b l\'onglet de travail existe bien dans le navigateur d\'Amor', tl.targetInfos.some(t => t.url.endsWith('/agent-travail')));

  // T3 dialogues : confirm et beforeunload chez Amor non touchés pendant que le pilote est branché
  amor.ev.length = 0;
  amor.send('Runtime.evaluate', { expression: "confirm('Supprimer le brouillon ?')" }, mail.sessionId).catch(() => {});
  await amor.wait(e => e.method === 'Page.javascriptDialogOpening');
  const closedAuto = await amor.wait(e => e.method === 'Page.javascriptDialogClosed', 2000);
  check('T3 confirm() d\'Amor laissé à Amor', !closedAuto, closedAuto ? 'fermé automatiquement !' : 'resté ouvert');
  await amor.send('Page.handleJavaScriptDialog', { accept: false }, mail.sessionId).catch(() => {});
  // un dialogue dans l'onglet de travail reste géré par le pilote
  const r = await page.evaluate(() => confirm('ok ?'));
  check('T3b dialogue de l\'onglet de travail géré par le pilote', r === false);

  // T4 téléchargements : celui d'Amor reste chez Amor ; celui du pilote est suivi et copié à part
  const homeDl = path.join(os.homedir(), 'Downloads');
  const listDl = () => { try { return fs.readdirSync(homeDl); } catch { return []; } };
  const before = new Set(listDl());
  await amor.send('Runtime.evaluate', { expression: "document.getElementById('dl').click()" }, mail.sessionId);
  await sleep(1500);
  const amorNew = listDl().filter(f => !before.has(f));
  const pwTemp = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith('playwright-artifacts-')).flatMap(d => { try { return fs.readdirSync(path.join(os.tmpdir(), d)); } catch { return []; } });
  if (process.env.HEADFUL) check('T4 téléchargement d\'Amor dans son dossier habituel', amorNew.some(f => f.startsWith('facture-amor')), amorNew.join(', ') || 'rien');
  check('T4b aucun téléchargement d\'Amor détourné vers le dossier temporaire du pilote', !pwTemp.some(f => f.includes('facture')) && !amorNew.some(f => /^[0-9a-f-]{36}$/.test(f)));
  if (process.env.HEADFUL) {
    await page.click('#dl'); await sleep(1500);
    const st = await (await fetch(`http://127.0.0.1:${GUARD_PORT}/guard/status`)).json();
    const d = st.downloads.find(x => x.name === 'export-agent.csv');
    check('T4c téléchargement du pilote suivi et copié dans son dossier', !!(d && d.state === 'completed' && d.copiedTo && fs.existsSync(d.copiedTo)), d ? `${d.state} → ${d.copiedTo}` : 'non suivi');
  }

  // T5 commandes dangereuses refusées
  const refused = async (name, fn) => { try { await fn(); check(name, false, 'accepté !'); } catch (e) { check(name, /cdpguard/.test(String(e)), String(e).split('\n')[0].slice(0, 120)); } };
  await refused('T5 lecture des cookies du profil refusée', () => ctx.cookies());
  await refused('T5b effacement des cookies du profil refusé', () => ctx.clearCookies());
  await refused('T5c modification des permissions du profil refusée', () => ctx.grantPermissions(['geolocation']));
  const cdp = await browser.newBrowserCDPSession();
  await refused('T5d fermeture du navigateur refusée', () => cdp.send('Browser.close'));
  // comme browserd aujourd'hui : il impose son dossier de téléchargement à la connexion
  await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: os.tmpdir() + '/browserd-dl', eventsEnabled: true });
  if (process.env.HEADFUL) {
    const b2 = new Set(listDl());
    await amor.send('Runtime.evaluate', { expression: "document.getElementById('dl').click()" }, mail.sessionId);
    await sleep(1500);
    check('T5f setDownloadBehavior de browserd sans effet sur les téléchargements d\'Amor', listDl().some(f => !b2.has(f) && f.startsWith('facture-amor')));
  }
  await refused('T5e attache à un onglet d\'Amor refusée', () => cdp.send('Target.attachToTarget', { targetId: mail.targetId, flatten: true }));

  // T6 fenêtre surgissante ouverte par l'onglet de travail : visible et pilotable
  const [popup] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), page.click('#pop')]);
  await popup.waitForLoadState();
  check('T6 surgissante de l\'onglet de travail pilotable', (await popup.title()) === 'Travail agent');

  // T7 prêt d'un onglet d'Amor (« prends cet onglet ») puis restitution
  const tabs = await (await fetch(`http://127.0.0.1:${GUARD_PORT}/guard/tabs`)).json();
  const mailTab = tabs.find(t => t.title === 'Onglet Amor' && t.targetId === mail.targetId);
  const [adopted] = await Promise.all([ctx.waitForEvent('page', { timeout: 5000 }), fetch(`http://127.0.0.1:${GUARD_PORT}/guard/adopt?targetId=${mailTab.targetId}`)]);
  check('T7 onglet prêté par Amor visible et lisible', (await adopted.title()) === 'Onglet Amor');
  await fetch(`http://127.0.0.1:${GUARD_PORT}/guard/release?targetId=${mailTab.targetId}`);
  await sleep(300);
  const st7 = await (await fetch(`http://127.0.0.1:${GUARD_PORT}/guard/status`)).json();
  const stillOwned = st7.workTabs.some(t => t.targetId === mailTab.targetId);
  const refusedAgain = await cdp.send('Target.attachToTarget', { targetId: mailTab.targetId, flatten: true }).then(() => false, () => true);
  check('T7b onglet rendu à Amor (plus attribué ni attachable)', !stillOwned && refusedAgain, `attribué=${stillOwned}`);

  // T7c baux : ChatGPT tient l'onglet, Claude est refusé, puis passe après libération
  const tid = (await (await fetch(`http://127.0.0.1:${GUARD_PORT}/guard/status`)).json()).workTabs[0].targetId;
  const L = q => fetch(`http://127.0.0.1:${GUARD_PORT}/guard/${q}`).then(r => r.status);
  const a = await L(`lease?targetId=${tid}&agent=chatgpt&ttl=60`), b = await L(`lease?targetId=${tid}&agent=claude`);
  await L(`unlease?targetId=${tid}&agent=chatgpt`); const c = await L(`lease?targetId=${tid}&agent=claude&ttl=5`);
  check('T7c bail d\'onglet : second agent refusé puis admis après libération', a === 200 && b === 409 && c === 200, `${a}/${b}/${c}`);

  // T8 surcoût du garde : 200 évaluations triviales, direct vs garde
  const direct = await chromium.connectOverCDP(`http://127.0.0.1:${CHROME_PORT}`).catch(() => null);
  const timeIt = async p => { const t = process.hrtime.bigint(); for (let i = 0; i < 200; i++) await p.evaluate(() => 1 + 1); return Number(process.hrtime.bigint() - t) / 1e6 / 200; };
  const viaGuard = await timeIt(page);
  let viaDirect = NaN;
  if (direct) { const dp = direct.contexts()[0].pages().find(p => p.url().endsWith('/agent-travail')); if (dp) viaDirect = await timeIt(dp); await direct.close().catch(() => {}); }
  check('T8 surcoût du garde par commande < 1 ms', !(viaGuard - viaDirect > 1), `garde ${viaGuard.toFixed(2)} ms, direct ${viaDirect.toFixed(2)} ms`);

  // T9 déconnexion / reconnexion du pilote : les onglets de travail restent et sont retrouvés
  await browser.close();
  await sleep(300);
  const b2 = await chromium.connectOverCDP(`http://127.0.0.1:${GUARD_PORT}`, { timeout: 10000 });
  const urls = b2.contexts()[0].pages().map(p => p.url());
  check('T9 reconnexion : onglets de travail retrouvés, onglets d\'Amor toujours invisibles', urls.some(u => u.endsWith('/agent-travail')) && urls.some(u => u.endsWith('/agent-popup')) && !urls.some(u => u.includes('/amor-')), urls.join(' | '));
  await b2.close();

  const log = fs.existsSync(guardLog) ? fs.readFileSync(guardLog, 'utf8') : '';
  check('T10 aucun cookie ni secret dans le journal du garde', !/cookie\s*[:=]|"value":/i.test(log), `${log.split('\n').length} lignes`);

  guard.kill(); chrome.kill('SIGKILL'); site.close();
  const failed = results.filter(r => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} vérifications réussies`);
  process.exit(failed.length ? 1 : 0);
}
main().catch(e => { console.error('ARRÊT', e); process.exit(2); });
