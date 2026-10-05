#!/usr/bin/env node
// etat-comptes — pour un navigateur donné, quels services d'Amor sont déjà connectés ?
// Lecture seule : ouvre chaque page d'accueil dans un onglet de travail, lit l'URL finale et la présence
// d'indices de connexion, puis referme l'onglet. Aucun clic, aucune saisie, aucun cookie lu.
// Usage : node etat-comptes.js <cdp> [services.json] [--repet N]
//   <cdp> : http://127.0.0.1:9222 (Opera direct) ou http://127.0.0.1:9224 (Brave via cdpguard)
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require(process.env.GUARD_PW_CORE || 'playwright-core');

// Services volontairement exclus : WhatsApp Web / Messenger (ouvrir un 2e onglet déconnecte celui d'Amor),
// banques et administrations à double authentification (aucun pilotage automatique souhaité).
const DEFAULT = [
  { id: 'gmail', url: 'https://mail.google.com/mail/u/0/', out: /accounts\.google\.com|workspace\.google\.com/, in: /mail\.google\.com\/mail\/u\/0/ },
  { id: 'drive', url: 'https://drive.google.com/drive/my-drive', out: /accounts\.google\.com|workspace\.google\.com/, in: /drive\.google\.com\/drive/ },
  { id: 'agenda', url: 'https://calendar.google.com/calendar/u/0/r', out: /accounts\.google\.com|workspace\.google\.com/, in: /calendar\.google\.com\/calendar/ },
  { id: 'youtube', url: 'https://www.youtube.com/', inSel: '#avatar-btn', outSel: 'a[href*="ServiceLogin"]' },
  { id: 'chatgpt', url: 'https://chatgpt.com/', inSel: '[data-testid="accounts-profile-button"], [data-testid="profile-button"]', outSel: '[data-testid="login-button"]' },
  { id: 'notion', url: 'https://www.notion.so/', out: /notion\.(so|com)\/(login|signup|product)|www\.notion\.com\/?$/, inSel: '.notion-sidebar' },
  { id: 'linkedin', url: 'https://www.linkedin.com/feed/', out: /linkedin\.com\/(login|authwall|uas\/login|signup)|linkedin\.com\/?$/, in: /linkedin\.com\/feed/ },
  { id: 'github', url: 'https://github.com/', inSel: 'meta[name="user-login"]:not([content=""])', outSel: 'a[href^="/login"]' },
  { id: 'claude', url: 'https://claude.ai/new', out: /claude\.ai\/login|claude\.com\/?$/, in: /claude\.ai\/new/ },
  { id: 'facebook', url: 'https://www.facebook.com/', outSel: 'input[name="email"]', inSel: '[aria-label="Facebook"][role="navigation"], [role="banner"] [aria-label*="profil" i]' },
  { id: '2ememain', url: 'https://www.2ememain.be/', outSel: 'a[href*="login"], button:has-text("Se connecter"), a:has-text("Inloggen")', inSel: '[data-testid="user-menu"], a[href*="/my-account"]' },
];

async function probe(ctx, s) {
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    await page.goto(s.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2500); // redirections de connexion tardives
    const url = page.url();
    const has = async sel => sel ? (await page.locator(sel).first().count().catch(() => 0)) > 0 : false;
    let etat = 'indéterminé';
    if (s.out && s.out.test(url)) etat = 'NON connecté';
    else if (await has(s.outSel) && !(await has(s.inSel))) etat = 'NON connecté';
    else if ((s.in && s.in.test(url)) || await has(s.inSel)) etat = 'connecté';
    return { service: s.id, etat, ms: Date.now() - t0, hote: new URL(url).host };
  } catch (e) {
    return { service: s.id, etat: 'erreur', ms: Date.now() - t0, detail: String(e).split('\n')[0].slice(0, 100) };
  } finally { await page.close().catch(() => {}); }
}

(async () => {
  const [cdp, file] = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const repet = +(process.argv.find(a => a.startsWith('--repet='))?.split('=')[1] || 1);
  if (!cdp) { console.error('usage : node etat-comptes.js <cdp> [services.json] [--repet=N]'); process.exit(2); }
  const services = file ? JSON.parse(fs.readFileSync(file, 'utf8')).map(s => ({ ...s, out: s.out && new RegExp(s.out), in: s.in && new RegExp(s.in) })) : DEFAULT;
  const browser = await chromium.connectOverCDP(cdp, { timeout: 60000 });
  const ctx = browser.contexts()[0];
  ctx.on('dialog', d => d.dismiss().catch(() => {}));
  const rows = [];
  for (let r = 0; r < repet; r++) for (const s of services) rows.push({ ...(await probe(ctx, s)), essai: r + 1 });
  await browser.close();
  const out = { cdp, quand: new Date().toISOString(), navigateur: browser.version(), resultats: rows };
  console.log(JSON.stringify(out, null, 1));
  const ok = rows.filter(r => r.essai === 1);
  console.error(`\n${cdp} : ${ok.filter(r => r.etat === 'connecté').length}/${ok.length} services connectés — ` + ok.map(r => `${r.service}:${r.etat}`).join(', '));
})().catch(e => { console.error(e); process.exit(1); });
