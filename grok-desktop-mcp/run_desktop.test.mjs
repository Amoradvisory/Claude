// Tests autonomes des gardes (node --test). Ne requièrent pas de serveur X.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'rundesk-'));
process.env.DESKTOP_STOP_FILE = join(dir, 'STOP');
process.env.DESKTOP_LOG_FILE = join(dir, 'log');
process.env.DESKTOP_DISPLAY = ':3';

const { runDesktop } = await import('./run_desktop.mjs');

test('commande vide refusée', async () => {
  const r = await runDesktop('   ');
  assert.equal(r.ok, false);
});

test('exécution normale journalisée, DISPLAY posé', async () => {
  const r = await runDesktop('echo bureau=$DISPLAY');
  assert.equal(r.ok, true);
  assert.match(r.stdout, /bureau=:3/);
  const log = readFileSync(process.env.DESKTOP_LOG_FILE, 'utf8');
  assert.match(log, /\tRUN\techo bureau=\$DISPLAY/);
});

test('fichier STOP coupe tout', async () => {
  writeFileSync(process.env.DESKTOP_STOP_FILE, '');
  const r = await runDesktop('echo doit-etre-refuse');
  assert.equal(r.stopped, true);
  assert.equal(r.ok, false);
  const log = readFileSync(process.env.DESKTOP_LOG_FILE, 'utf8');
  assert.match(log, /\tSTOP\t/);
});

test('le journal masque les secrets', async () => {
  const { rmSync } = await import('node:fs');
  rmSync(process.env.DESKTOP_STOP_FILE);
  await runDesktop('curl -H "authorization: Bearer abcdef0123456789" http://x');
  await runDesktop('echo 1234567890123');
  const log = readFileSync(process.env.DESKTOP_LOG_FILE, 'utf8');
  assert.ok(!log.includes('abcdef0123456789'), 'le token ne doit pas apparaître');
  assert.ok(!log.includes('1234567890123'), 'la suite de chiffres doit être masquée');
  assert.match(log, /<MASKED>|<DIGITS>/);
});

test('STOP absent => existsSync faux au départ', () => {
  // garde-fou : le fichier STOP a bien été supprimé par le test précédent
  assert.equal(existsSync(process.env.DESKTOP_STOP_FILE), false);
});
