import { DurableObject } from 'cloudflare:workers';
import type { Env } from './env';
import {kindAllowed,isSensitive,sensitiveReceipt,privateScopeFor,oldKinds} from './capabilities';
import {projectPhoneResult} from './operational-diagnostics';

export type PhoneKind = string;
export interface PhoneCommand {
  id: string; kind: PhoneKind; args: Record<string, unknown>; expiresAt: number;
}
interface Entry extends PhoneCommand {
  createdAt: number; status: string; argsHash?:string; result?: Record<string, unknown>;
  screenView?: {maxLines:number};
}
interface Attachment { deviceId: string; tokenHash: string; ready: boolean; model?: string; version?: string; kinds?:string[]; heartbeatMs?: number; readyAt?: number; lastResultAt?:number; probe?: boolean }
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Application heartbeat answered by the runtime without waking the object.
export const HEARTBEAT_PING = '{"type":"ping"}';
export const HEARTBEAT_PONG = '{"type":"pong"}';
// A phone that is reconnecting (network change, short coverage gap) gets this
// long to come back before a command is refused as phone_offline.
export const RECONNECT_GRACE_MS = 4000;
// Only a recent drop is worth waiting for; a phone gone for longer is refused at once.
export const RECENT_DROP_MS = 120_000;
// A sleeping phone stops its heartbeat although its connection is intact. Before a silent
// socket is declared dead, a phone that announced the `probe` feature is asked for one
// proof of life and gets this long to give it.
export const HEARTBEAT_PROBE = '{"type":"probe"}';
export const PROBE_WAIT_MS = 1500;
const clampHeartbeat = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? Math.min(60_000, Math.max(1000, Math.round(value))) : undefined;

export class PhoneLink extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(HEARTBEAT_PING, HEARTBEAT_PONG));
  }
  private transient = new Map<string,{at:number;result:Record<string,unknown>}>();
  private async hashArgs(args:Record<string,unknown>):Promise<string> {
    const canonical=(v:any):any=>Array.isArray(v)?v.map(canonical):v&&typeof v==='object'?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(canonical(args)))))].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  private ephemeral(id:string):Record<string,unknown>|undefined {
    for(const [key,value] of this.transient)if(Date.now()-value.at>30000)this.transient.delete(key);
    return this.transient.get(id)?.result;
  }
  private rememberTransient(id:string,result:Record<string,unknown>):void {
    this.transient.set(id,{at:Date.now(),result});
    setTimeout(()=>this.transient.delete(id),30000);
    while(this.transient.size>50)this.transient.delete(this.transient.keys().next().value!);
  }
  private async reserve(command:PhoneCommand,argsHash:string,result?:Record<string,unknown>):Promise<boolean> {
    const key=`command:${command.id}`;
    return this.ctx.storage.transaction(async storage=>{
      if(await storage.get(key))return false;
      const index=(await storage.get<{id:string;at:number}[]>('command_index')??[]);
      const stale=index.filter(e=>Date.now()-e.at>86_400_000);
      let keep=index.filter(e=>Date.now()-e.at<=86_400_000);
      stale.push(...keep.slice(0,Math.max(0,keep.length-199)));keep=keep.slice(-199);
      for(const old of stale)await storage.delete(`command:${old.id}`);
      const requested=Number(command.args.max_lines??40);
      const screenView=command.kind==='screen_context'&&command.args.format==='lines'?{maxLines:Number.isFinite(requested)?Math.max(1,Math.min(60,Math.floor(requested))):40}:undefined;
      await storage.put(key,{...command,args:{},argsHash,createdAt:Date.now(),status:result?String(result.status):'sent',
        ...(screenView?{screenView}:{}),...(result?{result:isSensitive(command.kind)?sensitiveReceipt(command.id,result):result}:{})} satisfies Entry);
      await storage.put('command_index',[...keep,{id:command.id,at:Date.now()}]);
      return true;
    });
  }

  /** A failed read-only resolution is a durable refusal, never a pretend phone delivery. */
  async refuse(command:PhoneCommand,refusal:Record<string,unknown>):Promise<Record<string,unknown>> {
    if(!uuid.test(command.id)||!['open_app','open_and_read'].includes(command.kind)||refusal.executed!==false
      ||!['app_not_found','ambiguous_app','resolution_unavailable','catalog_loading','phone_offline','unsupported_capability','permission_required'].includes(String(refusal.status)))return {status:'rejected',reason:'invalid_refusal',command_id:command.id};
    const argsHash=await this.hashArgs(command.args);
    const prior=await this.ctx.storage.get<Entry>(`command:${command.id}`);
    if(prior) {
      if(prior.kind!==command.kind||(prior.argsHash??await this.hashArgs(prior.args))!==argsHash)return {status:'rejected',reason:'command_id_conflict',command_id:command.id};
      return this.commandStatus(command.id);
    }
    const result=projectPhoneResult(command.kind,{...refusal,command_id:command.id,sampled_at:new Date().toISOString()});
    if(!(await this.reserve(command,argsHash,result))) {
      const known=await this.ctx.storage.get<Entry>(`command:${command.id}`);
      if(known&&(known.kind!==command.kind||known.argsHash!==argsHash))return {status:'rejected',reason:'command_id_conflict',command_id:command.id};
      return this.commandStatus(command.id);
    }
    this.rememberTransient(command.id,result);
    return result;
  }
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
    const deviceId = request.headers.get('x-speedcar-device');
    if (!this.env.PHONE_DEVICE_ID || deviceId !== this.env.PHONE_DEVICE_ID) return new Response('Wrong device', { status: 403 });
    for (const old of this.ctx.getWebSockets()) {
      // A replaced socket is not a disconnection of the phone: keep it out of the diagnostics.
      const prior = old.deserializeAttachment() as Attachment | undefined;
      if (prior) old.serializeAttachment({ ...prior, ready: false });
      old.close(1000, 'Connection replaced');
    }
    const pair = new WebSocketPair();
    this.ctx.acceptWebSocket(pair[1]);
    pair[1].serializeAttachment({ deviceId, tokenHash: this.env.PHONE_TOKEN_HASH, ready: false });
    return new Response(null, { status: 101, webSocket: pair[0] });
  }

  // Last proof of life: the newest heartbeat answered by the runtime, else the handshake.
  private lastSeen(socket: WebSocket, a: Attachment): number {
    return Math.max(this.ctx.getWebSocketAutoResponseTimestamp(socket)?.getTime() ?? 0, a.readyAt ?? 0,a.lastResultAt??0);
  }
  private silent(socket: WebSocket, a: Attachment): boolean {
    return Boolean(a.heartbeatMs) && Date.now() - this.lastSeen(socket, a) > 3 * a.heartbeatMs! + 2000;
  }
  private drop(socket: WebSocket, a: Attachment): void {
    socket.serializeAttachment({ ...a, ready: false });
    try { socket.close(4000, 'Heartbeat timeout'); } catch { /* already closing */ }
    void this.ctx.storage.put('last_disconnect', { at: Date.now(), code: 4000, reason: 'heartbeat_timeout' });
  }
  private activeSocket(): WebSocket | undefined {
    return this.ctx.getWebSockets().find(socket => {
      const a = socket.deserializeAttachment() as Attachment | undefined;
      if (!(socket.readyState === 1 && a?.ready && a.deviceId === this.env.PHONE_DEVICE_ID && a.tokenHash === this.env.PHONE_TOKEN_HASH)) return false;
      // Phones that announce a heartbeat and then go silent may hold a half-open
      // socket (network switch, tunnel). One that can be probed is judged by
      // confirmAlive() just before use; the others are closed here.
      if (this.silent(socket, a) && !a.probe) { this.drop(socket, a); return false; }
      return true;
    });
  }
  // A silent socket is either half-open or a sleeping phone. Ask once: an awake
  // or woken phone answers with a heartbeat the runtime timestamps.
  private async confirmAlive(socket: WebSocket): Promise<boolean> {
    const a = socket.deserializeAttachment() as Attachment;
    if (!this.silent(socket, a)) return true;
    const before = this.lastSeen(socket, a);
    try { socket.send(HEARTBEAT_PROBE); } catch { this.drop(socket, a); return false; }
    const until = Date.now() + PROBE_WAIT_MS;
    while (Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 50));
      if (this.lastSeen(socket, a) > before) return true;
    }
    this.drop(socket, a);
    return false;
  }
  private async waitForSocket(until: number): Promise<WebSocket | undefined> {
    let socket = this.activeSocket();
    while (!socket && Date.now() < until) {
      await new Promise(resolve => setTimeout(resolve, 100));
      socket = this.activeSocket();
    }
    return socket;
  }
  private async offline(id: string, waited: number): Promise<Record<string, unknown>> {
    const link = await this.ctx.storage.get<{ at: number }>('last_link');
    const raw = await this.ctx.storage.get<number | { at: number; code?: number; reason?: string }>('last_disconnect');
    const gone = typeof raw === 'number' ? { at: raw } : raw;
    const diagnosis = !link ? 'phone_never_connected' : gone?.reason === 'heartbeat_timeout' ? 'phone_heartbeat_lost' : 'phone_link_closed';
    return { status: 'phone_offline', outcome: 'phone_offline', command_id: id, executed: false, duration_ms: waited, waited_ms: waited, diagnosis,
      last_connected_at: link ? new Date(link.at).toISOString() : null,
      offline_for_s: gone && (!link || gone.at >= link.at) ? Math.round((Date.now() - gone.at) / 1000) : null,
      last_close: gone ? { code: gone.code ?? null, reason: gone.reason ?? null } : null,
      note: 'La liaison Speed Car du téléphone est absente : application arrêtée par le système, réseau du téléphone coupé ou reconnexion en cours. Aucune commande envoyée.',
      say: diagnosis === 'phone_never_connected'
        ? 'Le téléphone ne s’est jamais relié à Speed Car depuis la remise à zéro du relais. Ouvre Speed Car sur le téléphone et active-le.'
        : 'Le téléphone n’est pas relié à Speed Car. Ouvre l’application Speed Car sur le téléphone : elle doit afficher « Connecté au relais ».' };
  }

  async webSocketMessage(socket: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string' || raw.length > 524288) { socket.close(1008, 'Invalid frame'); return; }
    const a = socket.deserializeAttachment() as Attachment;
    if (a.deviceId !== this.env.PHONE_DEVICE_ID || a.tokenHash !== this.env.PHONE_TOKEN_HASH) { socket.close(1008, 'Authorization changed'); return; }
    let data: Record<string, any>;
    try { data = JSON.parse(raw); } catch { socket.close(1008, 'Invalid JSON'); return; }
    if (data.type === 'hello') {
      if (data.deviceId !== a.deviceId || data.model !== (this.env.PHONE_MODEL ?? '2510ERA8BG')) {
        socket.close(1008, 'Device identity mismatch'); return;
      }
      a.ready = true; a.model = data.model; a.readyAt = Date.now(); a.heartbeatMs = clampHeartbeat(data.heartbeat_ms);
      a.version = typeof data.version === 'string' ? data.version.slice(0, 24) : undefined;
      a.probe = Array.isArray(data.features) && data.features.includes('probe');
      a.kinds=Array.isArray(data.capabilities)?data.capabilities.filter((k:unknown)=>typeof k==='string'&&kindAllowed(k)).slice(0,64):oldKinds; socket.serializeAttachment(a);
      await this.ctx.storage.put('last_link', { model: data.model, at: Date.now(), state: 'connected', version: a.version ?? null });
      socket.send(JSON.stringify({ type: 'ready', deviceId: a.deviceId, serverTime: Date.now(), features: ['probe'] }));
      return;
    }
    if (data.type !== 'result' || !a.ready || !uuid.test(data.id ?? '') || !data.result || typeof data.result !== 'object') return;
    const key = `command:${data.id}`;
    const entry = await this.ctx.storage.get<Entry>(key);
    if(entry){a.lastResultAt=Date.now();socket.serializeAttachment(a);}
    if (entry && (!entry.result || (entry.result.status === 'indeterminate' && data.result.status !== 'indeterminate'))) {
      const result = projectPhoneResult(entry.kind,{ ...data.result, command_id: entry.id, device_id: a.deviceId, received_at: new Date().toISOString() },entry.screenView);
      if (isSensitive(entry.kind)) {
        this.rememberTransient(entry.id,result);
      }
      await this.ctx.storage.put(key, { ...entry, result:isSensitive(entry.kind)?sensitiveReceipt(entry.id,result):result, status: String(data.result.status ?? 'indeterminate') });
    }
    socket.send(JSON.stringify({ type: 'ack', id: data.id }));
  }

  async webSocketClose(socket: WebSocket, code: number, reason: string): Promise<void> {
    const a = socket.deserializeAttachment() as Attachment | undefined;
    if (a?.ready) await this.ctx.storage.put('last_disconnect', { at: Date.now(), code, reason: String(reason ?? '').slice(0, 80) });
  }
  async webSocketError(socket: WebSocket): Promise<void> {
    const a = socket.deserializeAttachment() as Attachment | undefined;
    if (a?.ready) await this.ctx.storage.put('last_disconnect', { at: Date.now(), code: 1006, reason: 'socket_error' });
  }

  async linkStatus(): Promise<Record<string, unknown>> {
    const socket = this.activeSocket();
    const a = socket?.deserializeAttachment() as Attachment | undefined;
    return { connected: Boolean(socket), last_sample: await this.ctx.storage.get('last_link') ?? null,
      last_disconnect: await this.ctx.storage.get('last_disconnect') ?? null,
      heartbeat_ms: a?.heartbeatMs ?? null, heartbeat_age_ms: socket && a && this.lastSeen(socket,a)>0 ? Date.now() - this.lastSeen(socket, a) : null };
  }

  // Read-only view for the relay self-tests, so that "relay reachable" is never
  // reported without saying whether the phone itself is linked. Sends nothing to the phone.
  async linkSummary(): Promise<Record<string, unknown>> {
    const socket = this.activeSocket();
    const a = socket?.deserializeAttachment() as Attachment | undefined;
    const link = await this.ctx.storage.get<{ at: number; version?: string | null }>('last_link');
    const raw = await this.ctx.storage.get<number | { at: number; code?: number; reason?: string }>('last_disconnect');
    const gone = typeof raw === 'number' ? { at: raw } : raw;
    const quiet = socket && a ? this.silent(socket, a) : false;
    return {
      phone_link: !socket ? (link ? 'absent' : 'never_connected') : quiet ? 'connected_silent' : 'connected',
      phone_app_version: a?.version ?? link?.version ?? null,
      last_connected_at: link ? new Date(link.at).toISOString() : null,
      last_sign_of_life_s: socket && a && this.lastSeen(socket,a)>0 ? Math.round((Date.now() - this.lastSeen(socket, a)) / 1000) : null,
      offline_for_s: !socket && gone && (!link || gone.at >= link.at) ? Math.round((Date.now() - gone.at) / 1000) : null,
      last_close: !socket && gone ? { code: gone.code ?? null, reason: gone.reason ?? null } : null,
      proof_scope: 'relay_link_state_only',
    };
  }

  async commandStatus(id: string, allowedScopes?:string[]): Promise<Record<string, unknown>> {
    if (!uuid.test(id)) return { status: 'rejected', reason: 'invalid_command_id' };
    const e = await this.ctx.storage.get<Entry>(`command:${id}`);
    if (!e) return { status: 'unknown', command_id: id, note: 'No retained receipt. Do not infer that no effect occurred.' };
    const needed=privateScopeFor(e.kind);
    if(allowedScopes!==undefined&&needed&&!allowedScopes.includes(needed))return {status:'permission_required',required_scope:needed,command_id:id,executed:false};
    const current=this.ephemeral(id);if(current)return current;
    return e.result ?? { status: 'indeterminate', command_id: id, expires_at: e.expiresAt, note: 'No final receipt; do not repeat with a new ID.' };
  }

  /** Compare the caller's original arguments before an inventory lookup or any delivery. */
  async replay(command:Pick<PhoneCommand,'id'|'kind'|'args'>):Promise<Record<string,unknown>|null> {
    const known=await this.ctx.storage.get<Entry>(`command:${command.id}`);
    if(!known)return null;
    if(known.kind!==command.kind||(known.argsHash??await this.hashArgs(known.args))!==await this.hashArgs(command.args))return {status:'rejected',reason:'command_id_conflict',command_id:command.id};
    return this.commandStatus(command.id);
  }

  async execute(command: PhoneCommand,requestArgs:Record<string,unknown>=command.args): Promise<Record<string, unknown>> {
    if (!uuid.test(command.id) || !kindAllowed(command.kind)) {
      return { status: 'rejected', reason: 'invalid_command' };
    }
    const key = `command:${command.id}`;
    const argsHash=await this.hashArgs(requestArgs);
    const known = await this.ctx.storage.get<Entry>(key);
    if (known) {
      if (known.kind !== command.kind || (known.argsHash??await this.hashArgs(known.args)) !== argsHash) return { status: 'rejected', reason: 'command_id_conflict', command_id: command.id };
      return this.commandStatus(command.id);
    }
    if (command.expiresAt <= Date.now()) return { status: 'expired', command_id: command.id };
    const waitStart = Date.now();
    const gone = this.activeSocket() ? undefined : await this.ctx.storage.get<number | { at: number }>('last_disconnect');
    const droppedAt = typeof gone === 'number' ? gone : gone?.at;
    const grace = droppedAt !== undefined && waitStart - droppedAt < RECENT_DROP_MS ? RECONNECT_GRACE_MS : 0;
    let socket = await this.waitForSocket(Math.min(waitStart + grace, command.expiresAt - 1000));
    if (socket && !(await this.confirmAlive(socket))) {
      // The silent socket was just closed; the phone, if it is there, reconnects within the grace period.
      socket = await this.waitForSocket(Math.min(Date.now() + RECONNECT_GRACE_MS, command.expiresAt - 1000));
      if (socket && !(await this.confirmAlive(socket))) socket = undefined;
    }
    if (!socket) return this.offline(command.id, Date.now() - waitStart);
    const advertised=socket.deserializeAttachment() as Attachment;
    if(!(advertised.kinds??oldKinds).includes(command.kind))return {status:'unsupported_capability',command_id:command.id,executed:false,proof_scope:'device_capability_advertisement'};
    const inserted = await this.reserve(command,argsHash);
    if (!inserted) {const prior=await this.ctx.storage.get<Entry>(key);if(prior&&(prior.kind!==command.kind||prior.argsHash!==argsHash))return {status:'rejected',reason:'command_id_conflict',command_id:command.id};return this.commandStatus(command.id);}
    try { socket.send(JSON.stringify({ type: 'command', deviceId: this.env.PHONE_DEVICE_ID, ...command })); }
    catch { return this.commandStatus(command.id); }
    const end = command.expiresAt + 1300;
    while (Date.now() < end) {
      const current = await this.ctx.storage.get<Entry>(key);
      if (current?.result) return this.ephemeral(command.id)??current.result;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    return this.commandStatus(command.id);
  }
}
