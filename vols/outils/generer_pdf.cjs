// Produit Vols_Tunis_Octobre_2026.pdf à partir du HTML (rendu « impression » de Chromium).
// Usage : node outils/generer_pdf.cjs
const path = require('path');
const { chromium } = require('./pw.cjs');

const BASE = path.resolve(__dirname, '..');
const HTML = path.join(BASE, 'Vols_Tunis_Octobre_2026.html');
const PDF = path.join(BASE, 'Vols_Tunis_Octobre_2026.pdf');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  await page.goto('file://' + HTML, { waitUntil: 'load' });
  await page.emulateMedia({ media: 'print', colorScheme: 'light' });
  // Les sections repliées (aéroports, méthode) doivent figurer dans le PDF.
  await page.evaluate(() => document.querySelectorAll('details.details-section').forEach((d) => { d.open = true; }));
  await page.pdf({
    path: PDF,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="font:8px system-ui,sans-serif;color:#6a6964;width:100%;padding:0 11mm;display:flex;justify-content:space-between">' +
      '<span>Vols vers Tunis — octobre 2026 · prix observés le 04/10/2026, non vérifiés</span>' +
      '<span>page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    margin: { top: '11mm', bottom: '14mm', left: '11mm', right: '11mm' },
  });
  await browser.close();
  if (erreurs.length) {
    console.error('Erreurs JavaScript :', erreurs);
    process.exit(1);
  }
  console.log('PDF écrit :', path.relative(BASE, PDF));
})();
