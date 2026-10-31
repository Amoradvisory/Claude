import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';

const id = '11111111-1111-4111-8111-111111111111';
const token = 'test-phone-token-' + 'a'.repeat(48);
const link = () => (env as any).PHONE_LINK.getByName('speed-car-owner');
const headers = { upgrade: 'websocket', authorization: `Bearer ${token}`, 'x-speedcar-device': id };

beforeEach(async () => {
  await runInDurableObject(link(), async (_instance, state) => {
    for (const socket of state.getWebSockets()) socket.close(1000, 'Test reset');
    await state.storage.deleteAll();
  });
});
function next(socket: WebSocket, type: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error(`No ${type} message`)), 1500);
    const listener = (event: MessageEvent) => {
      const value = JSON.parse(event.data);
      if (value.type === type) { clearTimeout(timer); socket.removeEventListener('message', listener); resolve(value); }
    };
    socket.addEventListener('message', listener);
  });
}
async function connect() {
  const response = await SELF.fetch('https://speedcar.test/device', { headers });
  expect(response.status).toBe(101);
  const socket = response.webSocket!;
  socket.accept();
  const ready = next(socket, 'ready');
  socket.send(JSON.stringify({ type: 'hello', deviceId: id, model: '2510ERA8BG' }));
  await ready;
  return socket;
}

describe('Phone authentication and durable command delivery', () => {
  it('blocks unauthenticated WebSocket access', async () => {
    expect((await SELF.fetch('https://speedcar.test/device', { headers: { upgrade: 'websocket' } })).status).toBe(401);
  });
  it('rejects a different device even with the right token', async () => {
    expect((await SELF.fetch('https://speedcar.test/device', { headers: { ...headers, 'x-speedcar-device': 'another' } })).status).toBe(403);
  });
  it('requires a matching model before marking the link ready', async () => {
    const response = await SELF.fetch('https://speedcar.test/device', { headers });
    const socket = response.webSocket!; socket.accept();
    const closed = new Promise<CloseEvent>(resolve => socket.addEventListener('close', resolve, { once: true }));
    socket.send(JSON.stringify({ type: 'hello', deviceId: id, model: 'Quest 3' }));
    expect((await closed).code).toBe(1008);
    expect((await link().linkStatus()).connected).toBe(false);
  });
  it('reports a ready phone only after the identity handshake', async () => {
    const socket = await connect();
    expect((await link().linkStatus()).connected).toBe(true);
    socket.close();
  });
  it('persists the result, rejects ID conflicts, and does not deliver a duplicate twice', async () => {
    const socket = await connect(); let deliveries = 0;
    socket.addEventListener('message', event => {
      const value = JSON.parse(event.data);
      if (value.type === 'command') {
        deliveries++;
        socket.send(JSON.stringify({ type: 'result', id: value.id, result: { status: 'verified', before: 4, after: 5 } }));
      }
    });
    const command = { id: crypto.randomUUID(), kind: 'media_volume_up', args: { steps: 1 }, expiresAt: Date.now() + 2000 };
    const first = await link().execute(command);
    expect(first.status).toBe('verified');
    expect((await link().execute(command)).after).toBe(5);
    expect(deliveries).toBe(1);
    expect((await link().execute({ ...command, args: { steps: 2 } })).reason).toBe('command_id_conflict');
    expect((await link().commandStatus(command.id)).command_id).toBe(command.id);
    socket.close();
  });
  it('rejects an expired command before sending any effect', async () => {
    const socket = await connect(); let deliveries = 0;
    socket.addEventListener('message', event => { if (JSON.parse(event.data).type === 'command') deliveries++; });
    expect((await link().execute({ id: crypto.randomUUID(), kind: 'media_volume_up', args: { steps: 1 }, expiresAt: Date.now() - 1 })).status).toBe('expired');
    expect(deliveries).toBe(0); socket.close();
  });
  it('does not queue a command while offline', async () => {
    const command = { id: crypto.randomUUID(), kind: 'media_volume_up', args: { steps: 1 }, expiresAt: Date.now() + 1000 };
    const result = await link().execute(command);
    expect(result.status).toBe('phone_offline'); expect(result.executed).toBe(false);
    expect((await link().commandStatus(command.id)).status).toBe('unknown');
  });
});
