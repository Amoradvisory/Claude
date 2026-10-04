// Tests réels du livrable HTML : erreurs JS, contenu du TOP 3, liens, débordements, tailles de texte,
// captures écran (bureau clair/sombre, fenêtre réduite, smartphone). Rapport : tests_rendu/rapport.json
// Usage : node outils/tester_rendu.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require('./pw.cjs');

const BASE = path.resolve(__dirname, '..');
const HTML = path.join(BASE, 'Vols_Tunis_Octobre_2026.html');
const OUT = path.join(BASE, 'tests_rendu');
// Le classement est calculé à la construction : on relit les données intégrées au HTML lui-même.
const PAGE = fs.readFileSync(HTML, 'utf8');
const DONNEES = JSON.parse(PAGE.split('<script type="application/json" id="donnees-source">')[1].split('</script>')[0]);
const TOP3 = DONNEES.offres.filter((o) => o.dans_top3).sort((a, b) => a.rang - b.rang);
fs.mkdirSync(OUT, { recursive: true });

const VUES = [
  { nom: 'bureau_clair', width: 1366, height: 900, colorScheme: 'light' },
  { nom: 'bureau_sombre', width: 1366, height: 900, colorScheme: 'dark' },
  { nom: 'fenetre_reduite', width: 820, height: 900, colorScheme: 'light' },
  { nom: 'smartphone', width: 390, height: 844, colorScheme: 'light', isMobile: true, hasTouch: true },
  { nom: 'petit_smartphone', width: 360, height: 740, colorScheme: 'dark', isMobile: true, hasTouch: true },
];

const nbsp = (s) => s.replace(/ /g, ' ');

(async () => {
  const browser = await chromium.launch();
  const rapport = { fichier: path.basename(HTML), date: new Date().toISOString(), vues: [], liens: null, contenu: null, ok: true, problemes: [] };

  for (const v of VUES) {
    const ctx = await browser.newContext({
      viewport: { width: v.width, height: v.height }, colorScheme: v.colorScheme,
      isMobile: !!v.isMobile, hasTouch: !!v.hasTouch, deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
    await page.goto('file://' + HTML, { waitUntil: 'load' });

    const mesure = await page.evaluate(() => {
      const de = document.documentElement;
      const larges = [];
      document.querySelectorAll('body *').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && (r.right > window.innerWidth + 1 || r.left < -1)) {
          if (!el.closest('.sr')) larges.push(el.tagName.toLowerCase() + (el.className ? '.' + String(el.className).split(' ')[0] : '') + ' ' + Math.round(r.right));
        }
      });
      let minPx = 99; let minEl = '';
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const n = walker.currentNode;
        if (!n.textContent.trim()) continue;
        const el = n.parentElement;
        if (!el || el.closest('.sr') || el.closest('script') || el.closest('details:not([open]) > :not(summary)')) continue;
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') continue;
        const px = parseFloat(cs.fontSize);
        if (px < minPx) { minPx = px; minEl = el.tagName.toLowerCase() + ' « ' + n.textContent.trim().slice(0, 30) + ' »'; }
      }
      const hero = document.querySelector('.prix-hero');
      const heroPx = hero ? parseFloat(getComputedStyle(hero).fontSize) : 0;
      const heroRect = hero ? hero.getBoundingClientRect() : null;
      return {
        scrollWidth: de.scrollWidth, innerWidth: window.innerWidth,
        debordement: de.scrollWidth > window.innerWidth + 1,
        elementsHorsCadre: larges.slice(0, 8),
        policeMinPx: minPx, policeMinElement: minEl,
        prixHeroPx: heroPx,
        prixHeroVisibleSansDefiler: heroRect ? heroRect.bottom <= window.innerHeight : false,
        hauteurPage: de.scrollHeight,
      };
    });
    const fichier = path.join(OUT, `${v.nom}.png`);
    await page.screenshot({ path: fichier, fullPage: true });
    await page.screenshot({ path: path.join(OUT, `${v.nom}_ecran1.png`), fullPage: false });
    const res = { vue: v.nom, viewport: `${v.width}x${v.height}`, theme: v.colorScheme, erreursJS: erreurs, ...mesure, capture: path.relative(BASE, fichier) };
    if (erreurs.length) rapport.problemes.push(`${v.nom} : erreurs JS`);
    if (mesure.debordement) rapport.problemes.push(`${v.nom} : défilement horizontal (${mesure.scrollWidth}px > ${mesure.innerWidth}px)`);
    if (mesure.policeMinPx < 12) rapport.problemes.push(`${v.nom} : texte trop petit (${mesure.policeMinPx}px) ${mesure.policeMinElement}`);
    if (!mesure.prixHeroVisibleSansDefiler) rapport.problemes.push(`${v.nom} : prix n°1 hors du premier écran`);
    rapport.vues.push(res);

    if (v.nom === 'bureau_clair') {
      // Contenu : TOP 3 identique à la source de vérité, dans le bon ordre.
      rapport.contenu = await page.evaluate(() => {
        const t = (sel) => (document.querySelector(sel) || {}).textContent || '';
        return {
          titre: document.title, h1: t('h1'),
          n1: t('#n1 .prix-hero'), n1dates: t('#n1 .dates'), n1trajet: t('#n1 .trajet'),
          n2: t('#n2 .prix-carte'), n2dates: t('#n2 .dates'),
          n3: t('#n3 .prix-carte'), n3dates: t('#n3 .dates'),
          lignesTableau: document.querySelectorAll('#comparaison tbody tr').length,
          badgesTop: [...document.querySelectorAll('#n1 .badge, #n2 .badge, #n3 .badge')].map((b) => b.textContent.trim()),
          fraicheur: t('.fraicheur'),
          mentionDynamique: document.body.textContent.includes('Les tarifs aériens sont dynamiques'),
        };
      });
      const c = rapport.contenu;
      const attendu = TOP3.map((o) => `${o.prix_final} €`);
      const vus = [c.n1, c.n2, c.n3].map(nbsp).map((s) => s.trim());
      c.top3Attendu = attendu; c.top3Affiche = vus;
      if (JSON.stringify(attendu) !== JSON.stringify(vus)) rapport.problemes.push('TOP 3 affiché différent des données');
      // Cohérence entre livrables : RESULTAT.md et prix_observes.csv portent le même TOP 3.
      const md = fs.readFileSync(path.join(BASE, 'RESULTAT.md'), 'utf8').replace(/\u00a0/g, ' ');
      const blocs = ['N°1 — MOINS CHER ABSOLU', 'N°2', 'N°3'].map((t, i) => {
        const j = md.indexOf(t + '\n'); return j >= 0 && md.slice(j, j + 200).includes(`${TOP3[i].prix_final} €`);
      });
      const csv = fs.readFileSync(path.join(BASE, 'prix_observes.csv'), 'utf8').split('\n');
      const rid = DONNEES.meta.recherche_id;
      const csvOk = TOP3.every((o) => csv.some((l) => l.includes(`;${rid};${o.id};`) && l.split(';')[23] === String(o.rang)));
      c.coherenceResultatMd = blocs; c.coherenceCsv = csvOk;
      if (!blocs.every(Boolean)) rapport.problemes.push('RESULTAT.md : TOP 3 différent du HTML');
      if (!csvOk) rapport.problemes.push('prix_observes.csv : rangs du TOP 3 différents du HTML');
      if (c.lignesTableau !== 3) rapport.problemes.push('Tableau comparatif : nombre de lignes ≠ 3');
      if (!c.mentionDynamique) rapport.problemes.push('Mention « tarifs dynamiques » absente');

      // Liens : relatifs => fichier existant ; externes => URL valide (réseau bloqué : non ouverts).
      const liens = await page.evaluate(() => [...document.querySelectorAll('a[href]')].map((a) => ({ href: a.getAttribute('href'), texte: a.textContent.trim().slice(0, 40) })));
      const internes = []; const externes = []; const casses = [];
      for (const l of liens) {
        if (/^https?:\/\//.test(l.href)) {
          try { new URL(l.href); externes.push(l.href); } catch (_) { casses.push(l); }
        } else if (l.href.startsWith('#')) {
          const existe = await page.$(l.href); (existe ? internes : casses).push(l.href);
        } else {
          const cible = path.join(BASE, decodeURIComponent(l.href.split('#')[0]));
          (fs.existsSync(cible) ? internes : casses).push(l.href);
        }
      }
      rapport.liens = { total: liens.length, internesOk: internes.length, externesSyntaxeOk: externes.length, casses, remarque: 'Liens externes non ouverts : accès réseau bloqué dans cet environnement.' };
      if (casses.length) rapport.problemes.push(`${casses.length} lien(s) cassé(s)`);

      // Divulgation progressive : un panneau de détails s'ouvre et affiche la ventilation.
      await page.click('#n1 details summary');
      rapport.detailsOuvrable = await page.evaluate(() => document.querySelector('#n1 details').open && !!document.querySelector('#n1 .liste-def .total'));
      if (!rapport.detailsOuvrable) rapport.problemes.push('Panneau de détails du n°1 non fonctionnel');
      await page.screenshot({ path: path.join(OUT, 'bureau_details_n1.png'), clip: await (await page.$('#n1')).boundingBox() });
    }
    await ctx.close();
  }
  await browser.close();
  rapport.ok = rapport.problemes.length === 0;
  fs.writeFileSync(path.join(OUT, 'rapport.json'), JSON.stringify(rapport, null, 2));
  console.log(JSON.stringify({ ok: rapport.ok, problemes: rapport.problemes, contenu: rapport.contenu, liens: rapport.liens, vues: rapport.vues.map((v) => ({ vue: v.vue, debordement: v.debordement, policeMinPx: v.policeMinPx, policeMinElement: v.policeMinElement, heroPx: v.prixHeroPx, heroVisible: v.prixHeroVisibleSansDefiler, hors: v.elementsHorsCadre, js: v.erreursJS })) }, null, 1));
})();
