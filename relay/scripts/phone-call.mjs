import { readFileSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const [name, argumentFile, output, tokenFile] = process.argv.slice(2);
if (!['phone_status', 'phone_media_volume_up', 'phone_media_volume_down', 'phone_open_youtube_brave', 'phone_command_status'].includes(name) || !output || !tokenFile) {
  throw Error('Expected an allowed phone tool, argument JSON file, proof output and private OAuth token file');
}
const args = argumentFile === '-' ? {} : JSON.parse(readFileSync(argumentFile, 'utf8'));
if (['phone_media_volume_up', 'phone_media_volume_down', 'phone_open_youtube_brave'].includes(name) && !args.command_id) args.command_id = randomUUID();
const token = JSON.parse(readFileSync(tokenFile, 'utf8')).access_token;
const proof = { startedAt: new Date().toISOString(), method: name, arguments: args, status: 'requested_no_automatic_retry' };
const save = () => writeFileSync(output, `${JSON.stringify(proof, null, 2)}\n`);
save();
try {
  const response = await fetch('https://speed-car-relay.speed-car-relay.workers.dev/mcp', {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json',
      accept: 'application/json, text/event-stream', 'mcp-protocol-version': '2025-11-25' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }),
    signal: AbortSignal.timeout(10000), redirect: 'error',
  });
  if (response.status !== 200) throw Error(`MCP HTTP ${response.status}`);
  const body = await response.text();
  const value = response.headers.get('content-type')?.includes('text/event-stream')
    ? body.split('\n').filter(line => line.startsWith('data: ')).map(line => JSON.parse(line.slice(6))).find(item => item.id === 1)
    : JSON.parse(body);
  if (value?.error || value?.result?.isError) throw Error('MCP action rejected');
  proof.status = 'returned'; proof.result = value.result.structuredContent;
  proof.finishedAt = new Date().toISOString(); save(); console.log(JSON.stringify(proof, null, 2));
} catch (error) {
  proof.status = 'indeterminate'; proof.error = error.message; save(); console.error(JSON.stringify(proof, null, 2)); process.exitCode = 1;
}
