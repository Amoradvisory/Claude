import { SELF, env, runInDurableObject } from 'cloudflare:test';
import { describe, it, expect, beforeEach } from 'vitest';
import {capabilities,oldKinds} from '../src/capabilities';

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
  socket.send(JSON.stringify({ type: 'hello', deviceId: id, model: '2510ERA8BG',capabilities:[...oldKinds,...capabilities.map(c=>c.kind)] }));
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

it('never persists a GPS payload or raw destination in durable storage', async () => {
  const socket = await connect();
  socket.addEventListener('message', event => {
    const value = JSON.parse(event.data);
    if (value.type === 'command') socket.send(JSON.stringify({type:'result',id:value.id,result:{status:'verified',latitude:12.34567,longitude:23.45678,proof_scope:'android_location'}}));
  });
  const command={id:crypto.randomUUID(),kind:'get_location',args:{label:'private-synthetic-destination'},expiresAt:Date.now()+1000};
  expect((await link().execute(command)).latitude).toBe(12.34567);
  await runInDurableObject(link(), async (_instance,state)=>{
    const rows=JSON.stringify([...await state.storage.list()]);
    expect(rows).not.toContain('12.34567');expect(rows).not.toContain('private-synthetic-destination');
  });
  socket.close();
});

it('does not reveal a private receipt through the generic status tool without its scope', async()=>{
 const socket=await connect();socket.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.type==='command')socket.send(JSON.stringify({type:'result',id:v.id,result:{status:'verified',latitude:12.34567}}))});
 const c={id:crypto.randomUUID(),kind:'get_location',args:{},expiresAt:Date.now()+1500};await link().execute(c);
 const denied=await link().commandStatus(c.id,['speedcar:test','speedcar:phone']);expect(denied.status).toBe('permission_required');expect(denied.latitude).toBeUndefined();
 expect((await link().commandStatus(c.id,['speedcar:location'])).latitude).toBe(12.34567);socket.close();
});
it('rejects concurrent conflicting arguments without dispatching a second effect',async()=>{
 const socket=await connect();let count=0;socket.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.type==='command'){count++;socket.send(JSON.stringify({type:'result',id:v.id,result:{status:'verified'}}))}});
 const a={id:crypto.randomUUID(),kind:'media_volume_up',args:{steps:1},expiresAt:Date.now()+1500};const outcomes=await Promise.all([link().execute(a),link().execute({...a,args:{steps:2}})]);expect(count).toBe(1);expect(outcomes.some(r=>r.reason==='command_id_conflict')).toBe(true);socket.close();
});

it('rejects a new capability on an old phone before sending its incompatible TTL',async()=>{
 const response=await SELF.fetch('https://speedcar.test/device',{headers});const socket=response.webSocket!;socket.accept();const ready=next(socket,'ready');socket.send(JSON.stringify({type:'hello',deviceId:id,model:'2510ERA8BG'}));await ready;
 let delivered=0;socket.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.type==='command'){delivered++;socket.send(JSON.stringify({type:'result',id:v.id,result:{status:'rejected',reason:'clock_skew'}}))}});
 const r=await link().execute({id:crypto.randomUUID(),kind:'get_location',args:{},expiresAt:Date.now()+18000});expect(r.status).toBe('unsupported_capability');expect(delivered).toBe(0);socket.close();
});

it('treats sockets retained across deployment without capability metadata as legacy phones',async()=>{
 const socket=await connect();await runInDurableObject(link(),async(_instance,state)=>{for(const ws of state.getWebSockets()){const a=ws.deserializeAttachment();delete a.kinds;ws.serializeAttachment(a)}});
 socket.addEventListener('message',e=>{const v=JSON.parse(e.data);if(v.type==='command')socket.send(JSON.stringify({type:'result',id:v.id,result:{status:'rejected',reason:'clock_skew'}}))});
 const r=await link().execute({id:crypto.randomUUID(),kind:'speak',args:{text:'test'},expiresAt:Date.now()+12000});expect(r.status).toBe('unsupported_capability');socket.close();
});

describe('Reconnection grace and heartbeat liveness', () => {
  it('waits briefly for a reconnecting phone instead of refusing at once', async () => {
    (await connect()).close(1001, 'network switch');
    await new Promise(resolve => setTimeout(resolve, 100));
    const command = { id: crypto.randomUUID(), kind: 'media_volume_up', args: { steps: 1 }, expiresAt: Date.now() + 3000 };
    const pending = link().execute(command);
    await new Promise(resolve => setTimeout(resolve, 600));
    const socket = await connect();
    socket.addEventListener('message', event => {
      const value = JSON.parse(event.data);
      if (value.type === 'command') socket.send(JSON.stringify({ type: 'result', id: value.id, result: { status: 'verified', before: 3, after: 4 } }));
    });
    const result = await pending;
    expect(result.status).toBe('verified'); expect(result.after).toBe(4);
    socket.close();
  });
  it('explains an offline refusal and never sends the command', async () => {
    const socket = await connect(); socket.close(1001, 'network lost');
    await new Promise(resolve => setTimeout(resolve, 100));
    const command = { id: crypto.randomUUID(), kind: 'media_volume_up', args: { steps: 1 }, expiresAt: Date.now() + 2000 };
    const result = await link().execute(command);
    expect(result.status).toBe('phone_offline'); expect(result.executed).toBe(false);
    expect(result.diagnosis).toBe('phone_link_closed');
    expect(result.waited_ms).toBeGreaterThanOrEqual(900);
    expect(result.last_connected_at).toBeTypeOf('string');
    expect((await link().commandStatus(command.id)).status).toBe('unknown');
  });
  it('reports a phone that never connected', async () => {
    const result = await link().execute({ id: crypto.randomUUID(), kind: 'status', args: {}, expiresAt: Date.now() + 1200 });
    expect(result.diagnosis).toBe('phone_never_connected'); expect(result.waited_ms).toBeLessThan(300);
  });
  it('answers the application heartbeat without involving the command path', async () => {
    const response = await SELF.fetch('https://speedcar.test/device', { headers });
    const socket = response.webSocket!; socket.accept();
    const ready = next(socket, 'ready');
    socket.send(JSON.stringify({ type: 'hello', deviceId: id, model: '2510ERA8BG', heartbeat_ms: 1000, capabilities: oldKinds }));
    await ready;
    const pong = next(socket, 'pong'); socket.send('{"type":"ping"}');
    await pong;
    const status = await link().linkStatus();
    expect(status.connected).toBe(true); expect(status.heartbeat_ms).toBe(1000);
    socket.close();
  });
  it('closes a silent half-open socket and refuses as heartbeat lost', async () => {
    const response = await SELF.fetch('https://speedcar.test/device', { headers });
    const socket = response.webSocket!; socket.accept();
    const ready = next(socket, 'ready');
    socket.send(JSON.stringify({ type: 'hello', deviceId: id, model: '2510ERA8BG', heartbeat_ms: 1000, capabilities: oldKinds }));
    await ready;
    let delivered = 0; socket.addEventListener('message', event => { if (JSON.parse(event.data).type === 'command') delivered++; });
    await new Promise(resolve => setTimeout(resolve, 5200));
    const result = await link().execute({ id: crypto.randomUUID(), kind: 'media_volume_up', args: { steps: 1 }, expiresAt: Date.now() + 1200 });
    expect(result.status).toBe('phone_offline'); expect(result.diagnosis).toBe('phone_heartbeat_lost');
    expect(delivered).toBe(0);
  }, 12_000);
  it('does not count a replaced connection as a phone disconnection', async () => {
    await connect(); await connect();
    await new Promise(resolve => setTimeout(resolve, 100));
    const status = await link().linkStatus();
    expect(status.connected).toBe(true); expect(status.last_disconnect).toBeNull();
  });
});
