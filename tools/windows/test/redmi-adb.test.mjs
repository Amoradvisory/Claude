import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, chmodSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDevices, transportKind, parseForeground, navigationArgs, launcherArgs, resolveTransport, openAndVerify, adbRunner } from '../redmi-adb.mjs';

const here = dirname(fileURLToPath(import.meta.url));
function scenario(state) {
  const dir = mkdtempSync(join(tmpdir(), 'redmi-adb-'));
  const file = join(dir, 'state.json'); writeFileSync(file, JSON.stringify(state));
  const wrapper = join(dir, 'adb'); writeFileSync(wrapper, `#!/bin/sh\nFAKE_ADB_STATE='${file}' exec '${process.execPath}' '${join(here, 'fake-adb.mjs')}' "$@"\n`); chmodSync(wrapper, 0o755);
  const config = { adb: wrapper, model: '2510ERA8BG', candidates: [], ledger: join(dir, 'ledger.json'), timeoutMs: 5000 };
  return { config, adb: adbRunner(config), state: () => JSON.parse(readFileSync(file, 'utf8')), calls: () => existsSync(file + '.calls') ? readFileSync(file + '.calls', 'utf8').trim().split('\n').map(l => JSON.parse(l)) : [] };
}
// Incident réel du 04/11 : une entrée Tailscale offline et une entrée LAN « device » qui ne répond plus.
const incident = () => ({
  devices: [
    { serial: '100.114.34.85:5555', state: 'offline', model: '2510ERA8BG', transportId: 1 },
    { serial: '192.168.129.27:5555', state: 'device', model: '2510ERA8BG', transportId: 2, dead: true },
  ],
  reachable: { '192.168.129.27:5555': { model: '2510ERA8BG' } },
  foreground: 'com.miui.home',
});

test('parses adb devices -l and classifies transports', () => {
  const list = parseDevices('List of devices attached\n100.114.34.85:5555    offline\n192.168.129.27:5555  device product:a model:2510ERA8BG device:b transport_id:7\nAB12CD device model:2510ERA8BG transport_id:9\n');
  assert.deepEqual(list.map(d => [d.serial, d.state, d.kind, d.transportId]), [
    ['100.114.34.85:5555', 'offline', 'tailscale', null], ['192.168.129.27:5555', 'device', 'lan', '7'], ['AB12CD', 'device', 'usb', '9']]);
  assert.equal(transportKind('adb-XYZ._adb-tls-connect._tcp'), 'wireless_debugging');
});

test('reads the resumed package from dumpsys', () => {
  assert.equal(parseForeground('  topResumedActivity=ActivityRecord{9f u0 com.google.android.apps.maps/com.google.android.maps.MapsActivity t12}'), 'com.google.android.apps.maps');
});

test('builds an encoded Maps navigation intent bound to the Maps package', () => {
  const args = navigationArgs('Action Mouscron');
  assert.ok(args.includes('google.navigation:q=Action%20Mouscron&mode=d'));
  assert.equal(args[args.indexOf('-p') + 1], 'com.google.android.apps.maps');
  assert.throws(() => navigationArgs(''));
});

test('incident replay: never runs an ambiguous command, repairs only the phone transports', async () => {
  const s = scenario(incident());
  const t = await resolveTransport(s.adb, s.config);
  assert.equal(t.serial, '192.168.129.27:5555');
  const calls = s.calls();
  assert.ok(calls.every(c => c[0] !== 'kill-server' && c[0] !== 'start-server'), 'ADB server untouched');
  assert.ok(calls.filter(c => c.includes('shell')).every(c => c[0] === '-t' || c[0] === '-s'), 'every shell call is targeted');
  assert.ok(calls.some(c => c[0] === 'disconnect' && c[1] === '100.114.34.85:5555'), 'stale Tailscale entry removed');
});

test('opens Maps and proves it is in the foreground, once per command id', async () => {
  const s = scenario(incident()); const id = '4f6c2a10-1111-4222-8333-444455556666';
  const first = await openAndVerify(s.adb, s.config, id, ['shell', 'monkey', '-p', 'com.google.android.apps.maps', '-c', 'android.intent.category.LAUNCHER', '1'], 'com.google.android.apps.maps');
  assert.equal(first.status, 'verified'); assert.equal(first.foreground_package, 'com.google.android.apps.maps');
  const again = await openAndVerify(s.adb, s.config, id, ['shell', 'monkey', '-p', 'com.google.android.apps.maps', '-c', 'android.intent.category.LAUNCHER', '1'], 'com.google.android.apps.maps');
  assert.equal(again.duplicate, true); assert.equal(s.state().started, 1, 'effect not repeated');
});

test('navigation is reported as requested, never as started', async () => {
  const s = scenario(incident());
  const r = await openAndVerify(s.adb, s.config, crypto.randomUUID(), navigationArgs('Action Mouscron'), 'com.google.android.apps.maps', { navigation_started_verified: false });
  assert.equal(r.status, 'verified'); assert.equal(r.navigation_started_verified, false);
});

test('reports an unreachable phone honestly without executing anything', async () => {
  const s = scenario({ devices: [{ serial: '100.114.34.85:5555', state: 'offline', model: '2510ERA8BG', transportId: 1 }], reachable: {}, foreground: 'x' });
  const r = await openAndVerify(s.adb, s.config, crypto.randomUUID(), navigationArgs('Action Mouscron'), 'com.google.android.apps.maps');
  assert.equal(r.status, 'phone_unreachable'); assert.equal(r.executed, false); assert.equal(s.state().started, undefined);
});

test('ignores another Android device plugged into the same PC', async () => {
  const s = scenario({ devices: [{ serial: 'OTHER01', state: 'device', model: 'Pixel_8', transportId: 5 }, { serial: 'RED01', state: 'device', model: '2510ERA8BG', transportId: 6 }], reachable: {}, foreground: 'x' });
  assert.equal((await resolveTransport(s.adb, s.config)).serial, 'RED01');
  assert.ok(s.calls().every(c => !(c[0] === '-t' && c[1] === '5')), 'other device never addressed');
});

test('flags a launch hidden behind the lock screen', async () => {
  const s = scenario({ ...incident(), keyguard: true });
  const r = await openAndVerify(s.adb, s.config, crypto.randomUUID(), navigationArgs('Action Mouscron'), 'com.google.android.apps.maps');
  assert.equal(r.keyguard_showing, true);
});

test('opens an application by package id and proves it is in front, never by a display name', async () => {
  const s = scenario(incident()); const pkg = 'com.amoradvisory.salatlille';
  const result = await openAndVerify(s.adb, s.config, 'c0000000-0000-4000-8000-000000000001', launcherArgs(pkg), pkg, { screen_content_verified: false });
  assert.equal(result.status, 'verified'); assert.equal(result.foreground_package, pkg); assert.equal(result.screen_content_verified, false);
  assert.throws(() => launcherArgs('Salât Lille'), /package_id_required/);
  assert.throws(() => launcherArgs('salatlille; reboot'), /package_id_required/);
  assert.throws(() => launcherArgs(undefined), /package_id_required/);
});
