import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { owner, scope, phoneScope, type Env } from './env';
import type { PhoneKind } from './phone-link';
import {capabilities, ttlFor} from './capabilities';

async function boundedRpc(request:Request):Promise<any> {
  const reader=request.clone().body?.getReader();if(!reader)return;
  let size=0;const chunks:Uint8Array[]=[];
  try {while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16384){void reader.cancel().catch(()=>{});throw new RangeError('MCP request too large');}chunks.push(value);
  }} finally {reader.releaseLock();}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{return;}
}

export const mcpApi = {
  async fetch(request, env, context) {
    const authenticated = context as ExecutionContext & { props?: { owner?: string }; auth?: { scope: string[] } };
    if (authenticated.props?.owner !== owner) return new Response('Propriétaire refusé', { status: 403 });
    if (!authenticated.auth?.scope.includes(scope)) return new Response('Droit insuffisant', {
      status: 403, headers: { 'www-authenticate': `Bearer error="insufficient_scope", scope="${scope}"` },
    });
    if (new URL(request.url).pathname !== '/mcp') return new Response('Introuvable', { status: 404 });
    // MCP 2025-11-25 step-up: a tool result alone cannot initiate new OAuth consent.
    // No rights are granted here; a fresh owner-authorized flow is still required.
    if(request.method==='POST'&&request.headers.get('content-type')?.includes('application/json')) {
      let rpc;try{rpc=await boundedRpc(request);}catch{return new Response('Requête MCP trop grande',{status:413});}
      if(rpc?.method==='tools/call') {
        const capability=capabilities.find(c=>c.name===rpc.params?.name);
        const required=capability?.scope??(capability?.kind==='open_maps'&&rpc.params?.arguments?.show_current_location===true?'speedcar:location':undefined);
        if(required&&!authenticated.auth?.scope.includes(required)) {
          const scopes=[...new Set([scope,phoneScope,...(authenticated.auth?.scope??[]),required])].join(' ');
          return new Response('Une nouvelle autorisation propriétaire est nécessaire. Aucune commande envoyée.',{
            status:403,headers:{'www-authenticate':`Bearer error="insufficient_scope", scope="${scopes}", resource_metadata="${env.PUBLIC_ORIGIN}/.well-known/oauth-protected-resource/mcp"`},
          });
        }
      }
    }
    const state = env.OWNER_STATE.getByName(owner);
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'speed-car', version: '2.1.0' }, {
        instructions: 'Speed Car pilote uniquement le téléphone appairé. Un appel spécialisé par demande. GPS : phone_get_location, Google Maps : phone_open_maps, navigation : phone_navigate. Nom d’application : phone_open_app. Ne jamais inventer maison, un destinataire ou des coordonnées. Les données sensibles sont temporaires ; permission_required exige une autorisation volontaire, jamais un contournement. Un intent de navigation ne prouve pas un itinéraire calculé. Actions composées : appels successifs avec reçus, aucun effet incertain rejoué. Lecture d’écran/notifications seulement sur demande explicite. Pour une hausse du volume, phone_media_volume_up ; pour YouTube dans Brave, phone_open_youtube_brave. Générer un nouvel UUID command_id pour chaque demande volontaire et conserver le même en cas de reprise de transport. Si le résultat est indeterminate, lire phone_command_status avec ce même ID, sans rejouer avec un nouvel ID. Confirmer seulement les faits du reçu : un index média ne prouve pas le niveau acoustique ; Brave repris ne prouve pas le chargement de YouTube. Le test du relais ne prouve pas une action du téléphone. phone_offline : le dire en une phrase avec sa cause (diagnosis, champ say), sans réessayer en boucle ; n’utiliser une autre voie (PC/ADB) qu’en l’annonçant, jamais en la présentant comme Speed Car. Trois faits distincts à ne jamais confondre : relais joignable (speedcar_test_action), téléphone relié (phone_link connected ou phone_status verified), application réellement au premier plan (foreground_observed true). Voix et conduite : une phrase courte par réponse, aucune demande de regarder ou de toucher l’écran ; si une action exige un geste ou une autorisation, dire qu’elle se fera à l’arrêt. « Ouvre X et dis-moi… » : phone_open_app_and_read, puis répondre d’après lines seulement. « Lis ce qui s’affiche » : phone_get_screen_context format lines. « Reviens à ChatGPT » : phone_open_app app ChatGPT. Musique : phone_open_url (recherche), phone_ui_action click sur le titre voulu, puis phone_media_status ; n’annoncer la lecture que si playing est true ; pause et reprise : phone_media_pause, phone_media_play.',
      });
      // The relay answering says nothing about the phone: every relay self-test states the phone link too.
      const linkLine = async (): Promise<{ fields: Record<string, unknown>; text: string }> => {
        if (!authenticated.auth?.scope.includes(phoneScope)) return { fields: {}, text: 'État de la liaison du téléphone non lu (droit speedcar:phone absent).' };
        try {
          const s = await env.PHONE_LINK.getByName(owner).linkSummary() as Record<string, any>;
          const text = s.phone_link === 'connected' ? 'Liaison du téléphone : présente.'
            : s.phone_link === 'connected_silent' ? `Liaison du téléphone : ouverte mais silencieuse depuis ${s.last_sign_of_life_s} s (téléphone probablement en veille) ; phone_status le vérifiera.`
            : s.phone_link === 'never_connected' ? 'Liaison du téléphone : ABSENTE, le téléphone ne s’est jamais relié. Aucune action sur le téléphone n’est possible tant que Speed Car n’y est pas ouvert et activé.'
            : `Liaison du téléphone : ABSENTE${typeof s.offline_for_s === 'number' ? ` depuis ${s.offline_for_s} s` : ''}. Aucune action sur le téléphone n’est possible tant que Speed Car n’y affiche pas « Connecté au relais ».`;
          return { fields: { phone: s }, text };
        } catch { return { fields: {}, text: 'État de la liaison du téléphone illisible.' }; }
      };
      server.registerTool('speedcar_test_action', {
        title: 'Tester une action Speed Car',
        description: 'Écrit un nouveau reçu de test dans le relais Speed Car et relit le résultat. Utiliser pour « teste Speed Car ». Ne modifie pas le téléphone. Indique aussi si le téléphone est relié (phone.phone_link) : un test du relais réussi avec une liaison absente signifie que rien ne peut être fait sur le téléphone.',
        inputSchema: z.strictObject({}),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      }, async () => {
        const receipt = await state.writeReceipt();
        const link = await linkLine();
        return { structuredContent: { status: 'verified', proof_scope: 'relay_storage_only', receipt, ...link.fields },
          content: [{ type: 'text', text: `Test du relais réussi, reçu ${receipt.sequence} enregistré. Ce test ne commande pas le téléphone. ${link.text}` }] };
      });
      server.registerTool('speedcar_status', {
        title: 'Lire le dernier test Speed Car',
        description: 'Lit le dernier reçu conservé par le relais et l’état de la liaison du téléphone (phone.phone_link), sans rien envoyer au téléphone. Ne teste pas la disponibilité du mode vocal.',
        inputSchema: z.strictObject({}),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async () => {
        const stored = await state.readStatus();
        const link = await linkLine();
        return { structuredContent: { ...stored, android_control: 'device_link_available', proof_scope: 'relay_storage_only', ...link.fields },
          content: [{ type: 'text', text: `${stored.last_receipt ? `Dernier test du relais : reçu ${stored.count}, ${stored.last_receipt.written_at}.` : 'Aucun test enregistré.'} ${link.text}` }] };
      });
      const phone = env.PHONE_LINK.getByName(owner);
      const permitted = () => authenticated.auth?.scope.includes(phoneScope);
      const denied = () => ({ isError: true, content: [{ type: 'text' as const, text: 'Reconnecter Speed Car en autorisant le droit speedcar:phone. Aucune commande du téléphone envoyée.' }] });
      const normalize=(r:Record<string,unknown>,id:string)=>({command_id:id,status:r.status??'indeterminate',outcome:r.outcome??r.status??'indeterminate',proof_scope:'relay_delivery',duration_ms:0,sampled_at:new Date().toISOString(),...r});
      const wrap = (result: Record<string, unknown>) => ({ structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result) }] });
      const invoke = async (id: string, kind: PhoneKind, args: Record<string, unknown>) => {
        if (!permitted()) return denied();
        try { return wrap(normalize(await phone.execute({ id, kind, args, expiresAt: Date.now() + ttlFor(kind) }),id)); }
        catch { return wrap({ status: 'indeterminate', command_id: id, note: 'La liaison a été interrompue ; lire le résultat avec le même identifiant avant toute nouvelle action.' }); }
      };
      server.registerTool('phone_status', {
        title: 'Lire l’état actuel du Redmi',
        description: 'Lit modèle, batterie, réseau, volume et permissions utiles depuis le téléphone appairé, sans le réveiller. phone_offline signifie que sa liaison Speed Car est absente.',
        inputSchema: z.strictObject({}),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async () => invoke(crypto.randomUUID(), 'status', {}));
      server.registerTool('phone_media_volume_up', {
        title: 'Augmenter le volume média du Redmi',
        description: 'Augmente le volume média de 1 à 3 index, avec plafond local et lecture avant/après. Un UUID distinct par demande volontaire ; réutiliser exactement le même UUID pour une reprise. Ne pas inférer le volume acoustique ni que la voix de ChatGPT restera inchangée.',
        inputSchema: z.strictObject({ command_id: z.string().uuid(), steps: z.number().int().min(1).max(3).default(1) }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      }, async ({ command_id, steps }) => invoke(command_id, 'media_volume_up', { steps }));
      server.registerTool('phone_open_youtube_brave', {
        title: 'Ouvrir YouTube dans Brave sur le Redmi',
        description: 'Envoie https://m.youtube.com/ explicitement à Brave sur le téléphone appairé, sans lancer de vidéo. Nouveau command_id UUID par demande volontaire. Le reçu distingue intention envoyée, reprise de Brave observée et URL non vérifiée ; ne jamais annoncer un chargement de page sans preuve.',
        inputSchema: z.strictObject({ command_id: z.string().uuid() }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
      }, async ({ command_id }) => invoke(command_id, 'youtube_brave', {}));
      server.registerTool('phone_media_volume_down', {
        title: 'Baisser le volume média du Redmi',
        description: 'Baisse le volume média de 1 à 3 index, sans franchir le minimum, puis lit la valeur obtenue. Nouveau command_id UUID par demande volontaire ; même UUID en cas de reprise de transport.',
        inputSchema: z.strictObject({ command_id: z.string().uuid(), steps: z.number().int().min(1).max(3).default(1) }),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      }, async ({ command_id, steps }) => invoke(command_id, 'media_volume_down', { steps }));
      server.registerTool('phone_command_status', {
        title: 'Relire le reçu d’une commande du Redmi',
        description: 'Relit le résultat durable de command_id, sans rejouer la commande. À utiliser après un résultat indeterminate. Historique borné à 200 commandes / 24 heures ; unknown ne prouve pas l’absence d’effet.',
        inputSchema: z.strictObject({ command_id: z.string().uuid() }),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async ({ command_id }) => permitted() ? wrap(await phone.commandStatus(command_id,authenticated.auth?.scope??[])) : denied());
      for (const capability of capabilities) {
        server.registerTool(capability.name, {
          title:capability.title, description:capability.description,
          inputSchema:z.strictObject(capability.read ? {command_id:z.string().uuid().optional(),...capability.shape} : {command_id:z.string().uuid(),...capability.shape}),
          annotations:{readOnlyHint:!!capability.read,destructiveHint:false,idempotentHint:!!capability.read,openWorldHint:!!capability.open},
        }, async (raw: any) => {
          const {command_id,...args}=raw; const id=command_id??crypto.randomUUID();
          const required=capability.scope??(capability.kind==='open_maps'&&args.show_current_location?'speedcar:location':undefined);
          if (required && !authenticated.auth?.scope.includes(required)) return wrap(normalize({status:'permission_required',outcome:'oauth_scope_required',required_scope:required,executed:false,proof_scope:'authorization_only'},id));
          return invoke(id,capability.kind,args);
        });
      }
      return server;
    });
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
