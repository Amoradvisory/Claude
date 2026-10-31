import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';

export type PhoneKind = 'status' | 'media_volume_up' | 'media_volume_down' | 'youtube_brave';
export interface PhoneCommand {
  id: string; kind: PhoneKind; args: { steps?: number }; expiresAt: number;
}
interface Entry extends PhoneCommand {
  createdAt: number; status: string; result?: Record<string, unknown>;
}
interface Attachment { deviceId: string; tokenHash: string; ready: boolean; model?: string }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export class PhoneLink extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const deviceId = request.headers.get('x-speedcar-device');
    if (!this.env.PHONE_DEVICE_ID || deviceId !== this.env.PHONE_DEVICE_ID) return new Response('Wrong device', { status: 403 });
    for (const old of this.ctx.getWebSockets()) old.close(1000, 'Connection replaced');
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ deviceId, tokenHash: this.env.PHONE_TOKEN_HASH, ready: false });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  private activeSocket(): WebSocket | undefined {
    return this.ctx.getWebSockets().find(socket => {
      const a = socket.deserializeAttachment() as Attachment | undefined;
      return socket.readyState === 1 && a?.ready && a.deviceId === this.env.PHONE_DEVICE_ID && a.tokenHash === this.env.PHONE_TOKEN_HASH;
    });
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 16384) { socket.close(1008, 'Invalid frame'); return; }
    const a = socket.deserializeAttachment() as Attachment;
    if (a.deviceId !== this.env.PHONE_DEVICE_ID || a.tokenHash !== this.env.PHONE_TOKEN_HASH) { socket.close(1008, 'Authorization changed'); return; }
    let data: Record<string, any>;
    try { data = JSON.parse(raw); } catch { socket.close(1008, 'Invalid JSON'); return; }
    if (data.type === 'hello') {
      if (data.deviceId !== a.deviceId || data.model !== (this.env.PHONE_MODEL ?? '2510ERA8BG')) {
        socket.close(1008, 'Device identity mismatch'); return;
      }
      a.ready = true; a.model = data.model; socket.serializeAttachment(a);
      await this.ctx.storage.put('last_link', { model: data.model, at: Date.now(), state: 'connected' });
      socket.send(JSON.stringify({ type: 'ready', deviceId: a.deviceId, serverTime: Date.now() }));
      return;
    }
    if (data.type !== 'result' || !a.ready || !uuid.test(data.id ?? '') || !data.result || typeof data.result !== 'object') return;
    const key = `command:${data.id}`;
    const entry = await this.ctx.storage.get<Entry>(key);
    if (entry && (!entry.result || (entry.result.status === 'indeterminate' && data.result.status !== 'indeterminate'))) {
      const result = { ...data.result, command_id: entry.id, device_id: a.deviceId, received_at: new Date().toISOString() };
      await this.ctx.storage.put(key, { ...entry, result, status: String(data.result.status ?? 'indeterminate') });
    }
    socket.send(JSON.stringify({ type: 'ack', id: data.id }));
  }

  async webSocketClose(): Promise<void> {
    await this.ctx.storage.put('last_disconnect', Date.now());
  }

  async linkStatus(): Promise<Record<string, unknown>> {
    return { connected: Boolean(this.activeSocket()), last_sample: await this.ctx.storage.get('last_link') ?? null };
  }

  async commandStatus(id: string): Promise<Record<string, unknown>> {
    if (!uuid.test(id)) return { status: 'rejected', reason: 'invalid_command_id' };
    const e = await this.ctx.storage.get<Entry>(`command:${id}`);
    if (!e) return { status: 'unknown', command_id: id, note: 'No retained receipt. Do not infer that no effect occurred.' };
    return e.result ?? { status: 'indeterminate', command_id: id, expires_at: e.expiresAt, note: 'No final receipt; do not repeat with a new ID.' };
  }

  async execute(command: PhoneCommand): Promise<Record<string, unknown>> {
    if (!uuid.test(command.id) || !['status', 'media_volume_up', 'media_volume_down', 'youtube_brave'].includes(command.kind)) {
      return { status: 'rejected', reason: 'invalid_command' };
    }
    const key = `command:${command.id}`;
    const known = await this.ctx.storage.get<Entry>(key);
    if (known) {
      if (known.kind !== command.kind || JSON.stringify(known.args) !== JSON.stringify(command.args)) return { status: 'rejected', reason: 'command_id_conflict', command_id: command.id };
      return this.commandStatus(command.id);
    }
    if (command.expiresAt <= Date.now()) return { status: 'expired', command_id: command.id };
    const socket = this.activeSocket();
    if (!socket) return { status: 'phone_offline', command_id: command.id, executed: false };
    const inserted = await this.ctx.storage.transaction(async storage => {
      if (await storage.get(key)) return false;
      const index = (await storage.get<{ id: string; at: number }[]>('command_index') ?? []);
      const stale = index.filter(e => Date.now() - e.at > 86_400_000);
      let keep = index.filter(e => Date.now() - e.at <= 86_400_000);
      stale.push(...keep.slice(0, Math.max(0, keep.length - 199)));
      keep = keep.slice(-199);
      for (const old of stale) await storage.delete(`command:${old.id}`);
      await storage.put(key, { ...command, createdAt: Date.now(), status: 'sent' } satisfies Entry);
      await storage.put('command_index', [...keep, { id: command.id, at: Date.now() }]);
      return true;
    });
    if (!inserted) return this.commandStatus(command.id);
    try { socket.send(JSON.stringify({ type: 'command', deviceId: this.env.PHONE_DEVICE_ID, ...command })); }
    catch { return this.commandStatus(command.id); }
    const end = command.expiresAt + 1300;
    while (Date.now() < end) {
      const current = await this.ctx.storage.get<Entry>(key);
      if (current?.result) return current.result;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return this.commandStatus(command.id);
  }
}
