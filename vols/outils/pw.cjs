// Charge Playwright (installation locale ou globale) et renvoie { chromium }.
const { execSync } = require('child_process');
const path = require('path');

function chargerPlaywright() {
  try {
    return require('playwright');
  } catch (_) {
    const racine = execSync('npm root -g').toString().trim();
    return require(path.join(racine, 'playwright'));
  }
}

module.exports = chargerPlaywright();
