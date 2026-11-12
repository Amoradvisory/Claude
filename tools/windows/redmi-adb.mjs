#!/usr/bin/env node
// Voie de secours PC → Redmi par ADB : toujours un transport explicite, réparation ciblée
// à la demande (aucune surveillance permanente), identifiant de commande idempotent,
// et vérification de l'application réellement au premier plan.
//
//   node redmi-adb.mjs status
//   node redmi-adb.mjs heal
//   node redmi-adb.mjs maps        [--id UUID]
//   node redmi-adb.mjs navigate "Action Mouscron" [--id UUID]
//   node redmi-adb.mjs open-url https://m.youtube.com/ [--package com.brave.browser] [--id UUID]
//   node redmi-adb.mjs foreground
//   node redmi-adb.mjs open-app com.amoradvisory.salatlille [--id UUID]
//       (identifiant de paquet, jamais un nom avec espace ou accent : il traverse PowerShell sans être déformé)
//
// Configuration (facultative) : redmi-adb.config.json à côté du script, ou variables
// REDMI_ADB (chemin d'adb.exe), REDMI_MODEL, REDMI_CANDIDATES (liste "ip:port" séparée par des virgules).

import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

export const MAPS = 'com.google.android.apps.maps';

export function loadConfig(env = process.env) {
  const file = env.REDMI_ADB_CONFIG ?? join(dirname(fileURLToPath(import.meta.url)), 'redmi-adb.config.json');
  const json = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : {};
  const base = env.LOCALAPPDATA ?? env.HOME ?? '.';
  return {
    adb: env.REDMI_ADB ?? json.adb ?? 'adb',
    model: env.REDMI_MODEL ?? json.model ?? '2510ERA8BG',
    candidates: (env.REDMI_CANDIDATES ? env.REDMI_CANDIDATES.split(',') : json.candidates ?? []).map(s => s.trim()).filter(Boolean),
    ledger: env.REDMI_ADB_LEDGER ?? json.ledger ?? join(base, 'speedcar', 'adb-ledger.json'),
    timeoutMs: Number(env.REDMI_ADB_TIMEOUT_MS ?? json.timeoutMs ?? 5000),
  };
}

export function adbRunner(config) {
  return (args, timeout = config.timeoutMs) => new Promise(resolve => {
    execFile(config.adb, args, { timeout, windowsHide: true, maxBuffer: 4 << 20 }, (error, stdout, stderr) =>
      resolve({ ok: !error, code: error?.code ?? 0, timedOut: Boolean(error?.killed), stdout: String(stdout), stderr: String(stderr) }));
  });
}

// "192.168.129.27:5555 device product:x model:2510ERA8BG device:y transport_id:3"
export function parseDevices(text) {
  return text.split(/\r?\n/).slice(1).map(line => line.trim()).filter(Boolean).map(line => {
    const [serial, state, ...rest] = line.split(/\s+/);
    const attrs = Object.fromEntries(rest.filter(p => p.includes(':')).map(p => [p.slice(0, p.indexOf(':')), p.slice(p.indexOf(':') + 1)]));
    return { serial, state, model: attrs.model ?? null, transportId: attrs.transport_id ?? null, kind: transportKind(serial) };
  });
}

export function transportKind(serial) {
  const host = serial.match(/^(\d+\.\d+\.\d+\.\d+):\d+$/)?.[1];
  if (!host) return serial.includes('._adb-tls-connect.') ? 'wireless_debugging' : serial.startsWith('emulator-') ? 'emulator' : 'usb';
  const [a, b] = host.split('.').map(Number);
  if (a === 100 && b >= 64 && b <= 127) return 'tailscale';
  if (a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31)) return 'lan';
  return 'tcp';
}

const PRIORITY = { usb: 0, wireless_debugging: 1, lan: 2, tailscale: 3, tcp: 4 };
const isTcp = t => t.kind !== 'usb' && t.kind !== 'emulator';
const target = t => t.transportId ? ['-t', t.transportId] : ['-s', t.serial];

/** Proves a transport works: a visible "device" line is not enough (incident du 04/11 : device → offline). */
export async function probe(adb, t) {
  const r = await adb([...target(t), 'shell', 'echo', 'speedcar-ok'], 4000);
  return r.ok && r.stdout.trim() === 'speedcar-ok';
}

/**
 * Chooses one working transport of the Redmi, repairing only that phone's TCP entries.
 * Never kills the ADB server and never touches another device.
 */
export async function resolveTransport(adb, config, log = []) {
  const list = async () => parseDevices((await adb(['devices', '-l'])).stdout);
  let transports = await list();
  log.push({ step: 'devices', transports: transports.map(({ serial, state, model, kind }) => ({ serial, state, model, kind })) });
  const ours = t => t.model === config.model || (t.model === null && config.candidates.includes(t.serial));
  // 1. Stale TCP entries of this phone: targeted disconnect, then reconnect.
  for (const t of transports.filter(t => ours(t) || config.candidates.includes(t.serial))) {
    if (isTcp(t) && t.state !== 'device') {
      await adb(['disconnect', t.serial]);
      const c = await adb(['connect', t.serial], 6000);
      log.push({ step: 'reconnect_stale', serial: t.serial, previous_state: t.state, connect: c.stdout.trim() || c.stderr.trim() });
    }
  }
  // 2. Configured candidates absent from the list.
  const known = new Set(transports.map(t => t.serial));
  for (const serial of config.candidates.filter(s => !known.has(s))) {
    const c = await adb(['connect', serial], 6000);
    log.push({ step: 'connect_candidate', serial, connect: c.stdout.trim() || c.stderr.trim() });
  }
  transports = (await list()).filter(t => t.state === 'device' && (ours(t) || config.candidates.includes(t.serial)))
    .sort((a, b) => PRIORITY[a.kind] - PRIORITY[b.kind]);
  // 3. First transport that really answers; a TCP one that lies gets one targeted reconnect.
  for (const t of transports) {
    if (await probe(adb, t)) { log.push({ step: 'selected', serial: t.serial, kind: t.kind }); return t; }
    if (isTcp(t)) {
      await adb(['disconnect', t.serial]); await adb(['connect', t.serial], 6000);
      const again = (await list()).find(x => x.serial === t.serial && x.state === 'device');
      if (again && await probe(adb, again)) { log.push({ step: 'selected_after_reconnect', serial: again.serial, kind: again.kind }); return again; }
    }
    log.push({ step: 'probe_failed', serial: t.serial, kind: t.kind });
  }
  return null;
}

export function parseForeground(text) {
  const line = text.split(/\r?\n/).find(l => /topResumedActivity=|mResumedActivity:|ResumedActivity:/.test(l)) ?? '';
  return line.match(/\s([a-zA-Z0-9_.]+)\/[a-zA-Z0-9_.$]+/)?.[1] ?? null;
}

export async function foreground(adb, t) {
  const r = await adb([...target(t), 'shell', 'dumpsys', 'activity', 'activities']);
  const keyguard = r.stdout.match(/mKeyguardShowing=(true|false)/)?.[1];
  return { package: r.ok ? parseForeground(r.stdout) : null, keyguard_showing: keyguard === undefined ? null : keyguard === 'true' };
}

/** Polls until the expected package is resumed; "commande envoyée" never counts as "ouverte". */
export async function waitForeground(adb, t, pkg, ms = 3000, step = 300) {
  const end = Date.now() + ms; let last = { package: null, keyguard_showing: null };
  do { last = await foreground(adb, t); if (last.package === pkg) return { verified: true, ...last }; await new Promise(r => setTimeout(r, step)); } while (Date.now() < end);
  return { verified: false, ...last };
}

export function navigationArgs(destination) {
  if (!destination || destination.length > 240) throw new Error('destination_required');
  return ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `google.navigation:q=${encodeURIComponent(destination)}&mode=d`, '-p', MAPS];
}

// Mise au premier plan par l'identifiant du paquet : pas de nom affiché, donc ni accent ni espace à transmettre.
export function launcherArgs(pkg) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z0-9_]+)+$/.test(pkg ?? '')) throw new Error('package_id_required');
  return ['shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'];
}

// Idempotence : un même identifiant ne relance jamais l'effet.
export function withLedger(file, id, run) {
  mkdirSync(dirname(file), { recursive: true });
  const lock = file + '.lock'; let fd;
  for (let i = 0; i < 50 && fd === undefined; i++) { try { fd = openSync(lock, 'wx'); } catch { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100); } }
  if (fd === undefined) return Promise.resolve({ status: 'busy', command_id: id, executed: false });
  const read = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch { return {}; } };
  const release = () => { try { closeSync(fd); unlinkSync(lock); } catch { /* lock already gone */ } };
  const prior = read()[id];
  if (prior) { release(); return Promise.resolve({ ...prior, duplicate: true }); }
  return run().then(result => {
    const all = read(); all[id] = { ...result, at: new Date().toISOString() };
    const entries = Object.entries(all).sort((a, b) => String(b[1].at).localeCompare(String(a[1].at))).slice(0, 200);
    writeFileSync(file, JSON.stringify(Object.fromEntries(entries), null, 1));
    return all[id];
  }).finally(release);
}

export async function openAndVerify(adb, config, id, startArgs, pkg, extra = {}) {
  return withLedger(config.ledger, id, async () => {
    const started = Date.now(); const log = [];
    const t = await resolveTransport(adb, config, log);
    if (!t) return { status: 'phone_unreachable', command_id: id, executed: false, path: 'pc_adb', diagnosis: log, duration_ms: Date.now() - started };
    const r = await adb([...target(t), ...startArgs], 8000);
    if (!r.ok || /Error:|Exception/.test(r.stdout + r.stderr))
      return { status: 'failed', command_id: id, executed: false, path: 'pc_adb', transport: t.kind, error: (r.stderr || r.stdout).trim().slice(0, 300), duration_ms: Date.now() - started };
    const fg = await waitForeground(adb, t, pkg);
    return { status: fg.verified ? 'verified' : 'executed_unverified', outcome: fg.verified ? 'foreground_verified' : 'intent_sent', command_id: id, executed: true,
      path: 'pc_adb', transport: t.kind, foreground_package: fg.package, keyguard_showing: fg.keyguard_showing, ...extra, duration_ms: Date.now() - started };
  });
}

async function main(argv) {
  const config = loadConfig(); const adb = adbRunner(config);
  const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
  const id = flag('--id') ?? randomUUID();
  const [command, value] = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--')));
  switch (command) {
    case 'status': case 'heal': {
      const log = []; const t = await resolveTransport(adb, config, log);
      return { status: t ? 'reachable' : 'phone_unreachable', transport: t ? { serial: t.serial, kind: t.kind } : null, steps: log };
    }
    case 'foreground': {
      const t = await resolveTransport(adb, config);
      return t ? { status: 'verified', ...(await foreground(adb, t)) } : { status: 'phone_unreachable' };
    }
    case 'maps':
      return openAndVerify(adb, config, id, launcherArgs(MAPS), MAPS);
    case 'open-app':
      return openAndVerify(adb, config, id, launcherArgs(value), value, { screen_content_verified: false });
    case 'navigate':
      return openAndVerify(adb, config, id, navigationArgs(value), MAPS, { destination: value, route_calculated_verified: false, navigation_started_verified: false });
    case 'open-url': {
      if (!/^https?:\/\/[^\s@]+$/.test(value ?? '')) throw new Error('https_url_required');
      const pkg = flag('--package') ?? 'com.brave.browser';
      return openAndVerify(adb, config, id, ['shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', value, '-p', pkg], pkg, { url_loaded_verified: false });
    }
    default:
      throw new Error('Usage : status | heal | foreground | maps | navigate "<destination>" | open-url <url> [--package p] | open-app <paquet> [--id UUID]');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main(process.argv.slice(2)).then(r => { console.log(JSON.stringify(r, null, 1)); process.exitCode = ['verified', 'reachable'].includes(r.status) || r.duplicate ? 0 : 2; },
    e => { console.log(JSON.stringify({ status: 'rejected', reason: e.message })); process.exitCode = 1; });
}
