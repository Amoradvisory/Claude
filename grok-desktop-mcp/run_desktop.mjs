// run_desktop.mjs — outil MCP « bureau » pour le pont Grok.
//
// But : permettre à ChatGPT (via le même /mcp authentifié) d'agir sur le bureau
// Linux :3 de Grok (xfconf-query, xdotool, import, plank/xfce4-panel, ouverture
// d'apps…) EXACTEMENT comme s'il était devant l'écran — donc HORS du sandbox
// d'affichage (bwrap) de run_shell, qui n'a pas de DISPLAY.
//
// Ce module n'ajoute AUCUN port public : il s'enregistre comme un outil de plus
// derrière le /mcp existant (OAuth, jetons, Funnel 443 inchangés). run_shell et
// son sandbox restent intacts : c'est un chemin SÉPARÉ.
//
// Gardes obligatoires (voir DESKTOP-CHATGPT.md) :
//   • interrupteur OFF   : si le fichier STOP existe, l'outil refuse tout.
//   • journal sans secret : chaque commande est horodatée dans le log, masquée.
//   • jamais de cookie / token / clé exposé ; jamais de suppression de données.
//
// Dépendances : aucune (Node >= 18, modules intégrés seulement).

import {
  readFileSync, readdirSync, existsSync, appendFileSync, mkdirSync,
} from 'node:fs';
import { dirname } from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// ── Configuration (surchargée par variables d'environnement si besoin) ─────────
export const DESKTOP_DISPLAY = process.env.DESKTOP_DISPLAY ?? ':3';
// /workspace côté ChatGPT = /home/box/grok-mcp-workspace sur la box.
const WORKSPACE = process.env.DESKTOP_WORKSPACE ?? '/home/box/grok-mcp-workspace';
const STOP_FILE = process.env.DESKTOP_STOP_FILE ?? `${WORKSPACE}/desktop-chatGPT.STOP`;
const LOG_FILE  = process.env.DESKTOP_LOG_FILE  ?? `${WORKSPACE}/desktop-chatGPT.log`;
const XAUTHORITY = process.env.DESKTOP_XAUTHORITY ?? '/home/box/.Xauthority';
const TIMEOUT_MS = Number(process.env.DESKTOP_TIMEOUT_MS ?? 60_000);
const MAX_OUT = 1_000_000; // plafond stdout/stderr par flux

// ── Résolution de la session :3 (DBUS lu dans le process réel, pas codé en dur) ─
// On cherche un process appartenant au bureau dont /proc/<pid>/environ contient
// DISPLAY=:3, en préférant xfce4-session / xfwm4, et on en hérite l'adresse DBUS.
export function resolveDesktopEnv() {
  const wantedDisplay = `DISPLAY=${DESKTOP_DISPLAY}`;
  const preferred = new Set(['xfce4-session', 'xfwm4', 'xfdesktop', 'xfsettingsd']);
  let fallback = null;
  for (const pid of readdirSync('/proc')) {
    if (!/^\d+$/.test(pid)) continue;
    let buf;
    try { buf = readFileSync(`/proc/${pid}/environ`); } catch { continue; }
    const vars = buf.toString('utf8').split('\0');
    if (!vars.includes(wantedDisplay)) continue;
    const dbus = vars.find((v) => v.startsWith('DBUS_SESSION_BUS_ADDRESS='));
    if (!dbus) continue;
    const address = dbus.slice('DBUS_SESSION_BUS_ADDRESS='.length);
    let comm = '';
    try { comm = readFileSync(`/proc/${pid}/comm`, 'utf8').trim(); } catch { /* ignore */ }
    if (preferred.has(comm)) return { dbus: address, pid, comm };
    if (!fallback) fallback = { dbus: address, pid, comm };
  }
  return fallback; // peut être null : on exécute alors sans DBUS (X11 suffit souvent)
}

// ── Journal (sans secret) ──────────────────────────────────────────────────────
function mask(s) {
  return String(s)
    // toute suite de 8 chiffres ou plus
    .replace(/[0-9]{8,}/g, '<DIGITS>')
    // valeurs qui suivent un mot sensible
    .replace(
      /((?:token|secret|pin|bearer|authorization|cookie|passwd|password|key|apikey)[^A-Za-z0-9]{1,4})[A-Za-z0-9._~+/=-]{8,}/ig,
      '$1<MASKED>',
    );
}

function logDesktop(command, note = '') {
  try {
    mkdirSync(dirname(LOG_FILE), { recursive: true });
    const line = `${new Date().toISOString()}\t${note}\t${mask(command).slice(0, 500)}\n`;
    appendFileSync(LOG_FILE, line, { mode: 0o600 });
  } catch { /* le journal ne doit jamais faire échouer l'outil */ }
}

// ── Exécution ───────────────────────────────────────────────────────────────────
export async function runDesktop(command, { timeoutMs = TIMEOUT_MS } = {}) {
  if (typeof command !== 'string' || !command.trim()) {
    return { ok: false, error: 'commande vide' };
  }
  if (existsSync(STOP_FILE)) {
    logDesktop(command, 'STOP');
    return {
      ok: false,
      stopped: true,
      error: `chemin bureau désactivé (fichier STOP présent : ${STOP_FILE})`,
    };
  }

  const resolved = resolveDesktopEnv();
  logDesktop(command, 'RUN');

  const env = { ...process.env, DISPLAY: DESKTOP_DISPLAY, XAUTHORITY };
  if (resolved?.dbus) env.DBUS_SESSION_BUS_ADDRESS = resolved.dbus;

  return new Promise((resolve) => {
    const child = spawn('/bin/bash', ['-lc', command], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let out = '';
    let err = '';
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, timeoutMs);
    child.stdout.on('data', (d) => { if (out.length < MAX_OUT) out += d; });
    child.stderr.on('data', (d) => { if (err.length < MAX_OUT) err += d; });
    child.on('error', (e) => {
      clearTimeout(timer);
      resolve({ ok: false, error: String((e && e.message) || e), display: DESKTOP_DISPLAY });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        code,
        timedOut,
        display: DESKTOP_DISPLAY,
        dbus: resolved?.dbus ? '(resolved)' : '(none)',
        stdout: out,
        stderr: err,
      });
    });
  });
}

// ── Définition d'outil MCP (forme générique, à adapter au SDK de server.mjs) ────
export const runDesktopTool = {
  name: 'run_desktop',
  description:
    "Exécute une commande sur le bureau Linux :3 de Grok (DISPLAY=:3, hors sandbox "
    + "d'affichage) : xfconf-query, xdotool, import, plank/xfce4-panel, ouverture "
    + "d'applications, fond d'écran, fenêtres, souris, clavier. Désactivable "
    + 'instantanément via le fichier STOP. Journalisé sans secret.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Commande shell exécutée avec DISPLAY=:3 et le DBUS de la session :3.',
      },
    },
    required: ['command'],
    additionalProperties: false,
  },
};

// Adaptateur de réponse au format MCP content[].
export async function handleRunDesktop(args) {
  const r = await runDesktop(args?.command);
  if (r.stopped) {
    return { content: [{ type: 'text', text: r.error }], isError: true };
  }
  if (r.error && r.code === undefined) {
    return { content: [{ type: 'text', text: `erreur: ${r.error}` }], isError: true };
  }
  const header = `exit=${r.code} display=${r.display} dbus=${r.dbus}${r.timedOut ? ' (timeout)' : ''}`;
  const text = [
    header,
    r.stdout && `--- stdout ---\n${r.stdout}`,
    r.stderr && `--- stderr ---\n${r.stderr}`,
  ].filter(Boolean).join('\n');
  return { content: [{ type: 'text', text }], isError: !r.ok };
}

// ── Mode ligne de commande (test local sur la box) ──────────────────────────────
//   node run_desktop.mjs 'xdotool getdisplaygeometry'
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const cmd = process.argv.slice(2).join(' ');
  if (!cmd) {
    console.error("usage: node run_desktop.mjs '<commande bureau>'");
    process.exit(2);
  }
  runDesktop(cmd).then((r) => {
    if (r.stopped) { console.error(r.error); process.exit(3); }
    if (r.stdout) process.stdout.write(r.stdout);
    if (r.stderr) process.stderr.write(r.stderr);
    process.exit(r.ok ? 0 : (r.code ?? 1));
  });
}
