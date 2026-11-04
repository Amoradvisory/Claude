#!/usr/bin/env node
// Faux adb piloté par un fichier d'état JSON (FAKE_ADB_STATE) : rejoue les transports
// device/offline, les reconnexions et l'activité au premier plan, et journalise chaque appel.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const file = process.env.FAKE_ADB_STATE;
const state = JSON.parse(readFileSync(file, 'utf8'));
const save = () => writeFileSync(file, JSON.stringify(state));
let args = process.argv.slice(2);
appendFileSync(file + '.calls', JSON.stringify(args) + '\n');

let chosen;
if (args[0] === '-s' || args[0] === '-t') {
  const key = args[0] === '-s' ? 'serial' : 'transportId';
  chosen = state.devices.find(d => String(d[key]) === args[1]);
  args = args.slice(2);
  if (!chosen) { console.error(`adb.exe: device '${args[1]}' not found`); process.exit(1); }
  if (chosen.state !== 'device' || chosen.dead) { console.error('adb.exe: device offline'); process.exit(1); }
}
const [cmd, ...rest] = args;
if (cmd === 'devices') {
  console.log('List of devices attached');
  for (const d of state.devices) console.log(`${d.serial}\t${d.state} product:x model:${d.model} device:y transport_id:${d.transportId}`);
} else if (cmd === 'disconnect') {
  state.devices = state.devices.filter(d => d.serial !== rest[0]); save(); console.log(`disconnected ${rest[0]}`);
} else if (cmd === 'connect') {
  const spec = (state.reachable ?? {})[rest[0]];
  if (!spec) { console.log(`failed to connect to ${rest[0]}`); process.exit(0); }
  state.nextId = (state.nextId ?? 10) + 1;
  state.devices.push({ serial: rest[0], state: 'device', model: spec.model, transportId: state.nextId }); save();
  console.log(`connected to ${rest[0]}`);
} else if (cmd === 'shell') {
  if (!chosen) { console.error('adb.exe: more than one device/emulator'); process.exit(1); }
  if (rest[0] === 'echo') console.log(rest.slice(1).join(' '));
  else if (rest[0] === 'am' || rest[0] === 'monkey') {
    const pkg = rest[rest.indexOf('-p') + 1]; state.foreground = pkg; state.started = (state.started ?? 0) + 1; save();
    console.log('Starting: Intent { act=android.intent.action.VIEW }');
  } else if (rest[0] === 'dumpsys') {
    console.log(`  topResumedActivity=ActivityRecord{1a2b u0 ${state.foreground}/.Main t42}`);
    console.log(`  KeyguardController:\n    mKeyguardShowing=${state.keyguard ? 'true' : 'false'}`);
  }
} else { console.error('unknown'); process.exit(1); }
