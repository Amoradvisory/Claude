#!/usr/bin/env node
// relaunch.mjs — relance le pont avec exactement la même commande, le même
// répertoire et le même environnement que l'ancien process (lus dans /proc, copiés
// dans des fichiers temporaires 0600 supprimés par l'appelant). Aucun secret n'est
// affiché ni journalisé par ce script.
//   node relaunch.mjs <envfile> <cmdfile> <cwd> <logfile>
import { readFileSync, openSync } from 'node:fs';
import { spawn } from 'node:child_process';

const [envFile, cmdFile, cwd, logFile] = process.argv.slice(2);
if (!envFile || !cmdFile || !cwd || !logFile) { console.error('usage: relaunch.mjs <env> <cmd> <cwd> <log>'); process.exit(2); }

const env = {};
for (const kv of readFileSync(envFile, 'utf8').split('\0')) {
  const i = kv.indexOf('=');
  if (i > 0) env[kv.slice(0, i)] = kv.slice(i + 1);
}
const cmd = readFileSync(cmdFile, 'utf8').split('\0').filter((x, i, a) => x !== '' || i < a.length - 1);
if (cmd.at(-1) === '') cmd.pop();
if (!cmd.length) { console.error('commande vide'); process.exit(2); }

const out = openSync(logFile, 'a', 0o600);
const child = spawn(cmd[0], cmd.slice(1), { cwd, env, detached: true, stdio: ['ignore', out, out] });
child.unref();
console.log('relancé, pid=' + child.pid);
