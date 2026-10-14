// Tests de patch-server.mjs sur plusieurs formes de server.mjs (node --test).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));

function fixture(src) {
  const dir = mkdtempSync(join(tmpdir(), 'pfx-'));
  mkdirSync(join(dir, 'desktop'));
  copyFileSync(join(here, 'run_desktop.mjs'), join(dir, 'desktop', 'run_desktop.mjs'));
  writeFileSync(join(dir, 'server.mjs'), src);
  return dir;
}
const patch = (dir) => spawnSync(process.execPath, [join(here, 'patch-server.mjs'), join(dir, 'server.mjs')], { encoding: 'utf8' });

test('style A (case) : liste + dispatch câblés, exécutable', async () => {
  const dir = fixture(`import fs from 'node:fs';
export const tools = [
  { name: 'run_shell', description: 'x', inputSchema: {} },
];
export async function call(name, args) {
  switch (name) {
    case 'run_shell':
      return { content: [{ type: 'text', text: 'sh:' + args.command }] };
    default: throw new Error('inconnu');
  }
}
`);
  const r = patch(dir);
  assert.equal(r.status, 0, r.stderr);
  const m = await import(join(dir, 'server.mjs'));
  assert.deepEqual(m.tools.map((t) => t.name), ['run_desktop', 'run_shell']);
  const out = await m.call('run_desktop', { command: 'echo ok=$DISPLAY' });
  assert.match(out.content[0].text, /ok=:3/);
  assert.match((await m.call('run_shell', { command: 'ls' })).content[0].text, /sh:ls/);
});

test('style A (if) avec params.arguments', async () => {
  const dir = fixture(`export const tools = [{ name: 'run_shell', inputSchema: {} }];
export async function call(req) {
  const name = req.params.name;
  if (name === 'run_shell') {
    return { content: [{ type: 'text', text: 'sh:' + req.params.arguments.command }] };
  }
  return null;
}
`);
  const r = patch(dir);
  assert.equal(r.status, 0, r.stderr);
  const m = await import(join(dir, 'server.mjs'));
  const out = await m.call({ params: { name: 'run_desktop', arguments: { command: 'echo v=$DISPLAY' } } });
  assert.match(out.content[0].text, /v=:3/);
});

test('style B (McpServer.tool) : bloc inséré avant run_shell, zod importé', () => {
  const dir = fixture(`import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
const server = new McpServer({ name: 'x', version: '1' });
server.tool('run_shell', 'desc', {}, async () => ({ content: [] }));
`);
  const r = patch(dir);
  assert.equal(r.status, 0, r.stderr);
  const s = readFileSync(join(dir, 'server.mjs'), 'utf8');
  assert.match(s, /server\.tool\('run_desktop'/);
  assert.match(s, /import \{ z \} from 'zod'/);
  assert.match(s, /import \{ handleRunDesktop \}/);
  assert.ok(s.indexOf("'run_desktop'") < s.indexOf("'run_shell'"));
});

test('idempotent : second passage = rien à faire', () => {
  const dir = fixture(`export const tools=[{ name: 'run_shell' }];
export const f = (n, a) => { switch (n) { case 'run_shell': return a.command; } };
`);
  assert.equal(patch(dir).status, 0);
  const once = readFileSync(join(dir, 'server.mjs'), 'utf8');
  const r2 = patch(dir);
  assert.equal(r2.status, 0);
  assert.match(r2.stdout, /déjà patché/);
  assert.equal(readFileSync(join(dir, 'server.mjs'), 'utf8'), once);
});

test('motif inconnu : code 3 et fichier INTACT', () => {
  const src = `console.log('serveur sans run_shell reconnaissable');\n`;
  const dir = fixture(src);
  const r = patch(dir);
  assert.equal(r.status, 3);
  assert.equal(readFileSync(join(dir, 'server.mjs'), 'utf8'), src);
});

test('arguments de run_shell introuvables : code 3 et fichier INTACT', () => {
  const src = `export const tools=[{ name: 'run_shell' }];
export const f = (n) => { switch (n) { case 'run_shell': return 42; } };
`;
  const dir = fixture(src);
  assert.equal(patch(dir).status, 3);
  assert.equal(readFileSync(join(dir, 'server.mjs'), 'utf8'), src);
});
