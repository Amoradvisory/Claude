#!/usr/bin/env node
// patch-server.mjs — branche l'outil run_desktop dans server.mjs, de façon
// conservatrice et idempotente. N'écrit RIEN si le motif n'est pas reconnu.
//
//   node patch-server.mjs <server.mjs> [--import ./desktop/run_desktop.mjs]
//
// Deux styles reconnus (celui de run_shell est repéré, run_desktop est ajouté à côté) :
//   A) liste d'outils + dispatch   : { name: 'run_shell', ... } + case/if 'run_shell'
//   B) SDK McpServer               : server.tool('run_shell', ...) / registerTool(...)
// Codes de sortie : 0 ok / déjà patché, 3 motif non reconnu (rien modifié),
//                   4 syntaxe invalide après patch (fichier restauré).
import { readFileSync, writeFileSync, mkdtempSync, copyFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, extname } from 'node:path';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const impIdx = args.indexOf('--import');
const IMPORT_PATH = impIdx >= 0 ? args[impIdx + 1] : './desktop/run_desktop.mjs';
if (!file) { console.error('usage: node patch-server.mjs <server.mjs> [--import <chemin>]'); process.exit(2); }

const original = readFileSync(file, 'utf8');
if (original.includes('run_desktop')) { console.log('déjà patché (run_desktop présent) : rien à faire'); process.exit(0); }

const DESC = "Exécute une commande sur le bureau Linux :3 (DISPLAY=:3, hors sandbox d'affichage). Désactivable via le fichier STOP.";
let src = original;
const notes = [];

// ── style B : McpServer.tool / registerTool ────────────────────────────────────
const mcp = /^([ \t]*)(\w+)\.(tool|registerTool)\(\s*(['"])run_shell\4/m.exec(src);
// ── style A : tableau d'outils + dispatch ──────────────────────────────────────
const listAt = src.search(/name\s*:\s*['"]run_shell['"]/);

function insertImport(text, line) {
  const re = /^import[^;]*?;[ \t]*$/gm;
  let m, last = null;
  while ((m = re.exec(text))) last = m;
  if (last) { const at = last.index + last[0].length; return text.slice(0, at) + '\n' + line + text.slice(at); }
  const shebang = text.startsWith('#!') ? text.indexOf('\n') + 1 : 0;
  return text.slice(0, shebang) + line + '\n' + text.slice(shebang);
}

if (mcp && listAt < 0) {
  const [, indent, srv, kind] = mcp;
  const block = kind === 'tool'
    ? `${indent}// run_desktop (début) — bureau :3, voir desktop/DESKTOP-CHATGPT.md\n`
      + `${indent}${srv}.tool('run_desktop', ${JSON.stringify(DESC)}, { command: z.string() }, async (a) => handleRunDesktop(a));\n`
      + `${indent}// run_desktop (fin)\n`
    : `${indent}// run_desktop (début) — bureau :3, voir desktop/DESKTOP-CHATGPT.md\n`
      + `${indent}${srv}.registerTool('run_desktop', { description: ${JSON.stringify(DESC)}, inputSchema: { command: z.string() } }, async (a) => handleRunDesktop(a));\n`
      + `${indent}// run_desktop (fin)\n`;
  src = src.slice(0, mcp.index) + block + src.slice(mcp.index);
  if (!/from\s+['"]zod['"]/.test(src)) src = insertImport(src, "import { z } from 'zod';");
  src = insertImport(src, `import { handleRunDesktop } from '${IMPORT_PATH}';`);
  notes.push(`style B (${srv}.${kind})`);
} else if (listAt >= 0) {
  // 1) déclaration dans la liste : on remonte jusqu'à l'accolade ouvrante de l'objet run_shell
  const open = src.lastIndexOf('{', listAt);
  if (open < 0) { console.error('objet run_shell non délimité : rien modifié'); process.exit(3); }
  // 2) dispatch
  const dispatch = /(case\s*['"]run_shell['"]\s*:)|(if\s*\(\s*([\w$.?]+)\s*===\s*['"]run_shell['"]\s*\))/.exec(src);
  if (!dispatch) { console.error("dispatch 'run_shell' non reconnu (ni case ni if) : rien modifié"); process.exit(3); }
  const tail = src.slice(dispatch.index + dispatch[0].length, dispatch.index + dispatch[0].length + 800);
  const argv = /([A-Za-z_$][\w$]*(?:\??\.[A-Za-z_$][\w$]*)*)\??\.command\b/.exec(tail);
  if (!argv) { console.error("variable d'arguments de run_shell introuvable (X.command) : rien modifié"); process.exit(3); }
  const A = argv[1];
  const call = dispatch[1]
    ? `case 'run_desktop': return handleRunDesktop(${A}); `
    : `if (${dispatch[3]} === 'run_desktop') return handleRunDesktop(${A}); else `;
  const lineStart = dispatch.index; // insertion juste avant le jeton (marche aussi sur une seule ligne et après "else")
  // on applique de la fin vers le début pour ne pas décaler les index
  const edits = [
    { at: lineStart, text: call },
    { at: open, text: 'runDesktopTool, ' },
  ].sort((x, y) => y.at - x.at);
  for (const e of edits) src = src.slice(0, e.at) + e.text + src.slice(e.at);
  src = insertImport(src, `import { runDesktopTool, handleRunDesktop } from '${IMPORT_PATH}';`);
  notes.push(`style A (dispatch ${dispatch[1] ? 'case' : 'if'}, args=${A})`);
} else {
  console.error("aucun enregistrement de 'run_shell' reconnu dans " + file + ' : rien modifié');
  process.exit(3);
}

// Vérification de syntaxe sur une copie avant d'écrire quoi que ce soit.
const tmp = join(mkdtempSync(join(tmpdir(), 'patch-')), 'check' + (extname(file) || '.mjs'));
writeFileSync(tmp, src);
const chk = spawnSync(process.execPath, ['--check', tmp], { encoding: 'utf8' });
if (chk.status !== 0) { console.error('syntaxe invalide après patch, fichier intact :\n' + chk.stderr); process.exit(4); }

writeFileSync(file, src);
console.log('patché : ' + notes.join(', '));
