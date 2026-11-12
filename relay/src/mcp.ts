import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { owner, scope, phoneScope, type Env } from './env';
import type { PhoneKind } from './phone-link';
import {capabilities, ttlFor} from './capabilities';
import {AppResolutionError,prepareAppTarget} from './app-resolution';

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
      const server = new McpServer({ name: 'speed-car', version: '2.1.1' }, {
        instructions: 'Speed Car pilote le téléphone appairé, sans pont automatique vers les autres connecteurs. GPS : phone_get_location ; Maps : phone_open_maps ; navigation : phone_navigate. Ne jamais inventer une adresse, un destinataire ou des coordonnées. Utiliser les outils réellement disponibles et les capacités annoncées par phone_status, pas le seul numéro du relais. « Ouvre X et lis » : deux appels distincts phone_open_app puis phone_get_screen_context include_text true max_nodes 80 fonctionnent avec Android 2.0.1. Le nom accepte accents et séparateurs ; une ambiguïté est refusée. phone_open_app_and_read exige la capacité native open_and_read ; ne pas le tenter sur 2.0.1. Pour une lecture courte, format lines si le schéma disponible le permet ; les lignes adaptées du téléphone 2.0.1 gardent la preuve semantic_tree et son ordre, sans promettre un ordre visuel. Répondre uniquement avec les valeurs présentes dans le reçu, sans calcul ni source externe pour un compte à rebours demandé à l’écran. screen_enabled prouve uniquement le réglage interne ; screen_access distingue autorisation Android et service connecté, null signifie inconnu. permission_required demande une activation volontaire dans les réglages officiels, jamais un contournement. Lecture écran/notifications à la demande explicite seulement ; données sensibles temporaires, aucun affaiblissement des filtres. Un UUID neuf par demande volontaire ; conserver le même pour une reprise. indeterminate ou effet incertain : phone_command_status avec ce même ID, sans rejouer ailleurs. safe_to_consider_other_channel true autorise seulement à envisager un repli après un échec sans effet : si le mandat et les outils Remote Desktop Commander sont disponibles dans ce chat, annoncer ce canal, consulter les recettes du PC puis utiliser phoned et vérifier l’effet. Ce relais ne lance jamais ces outils. Ne pas utiliser un autre canal pour contourner un refus de confidentialité ou une permission. Trois preuves distinctes : relais joignable, téléphone relié, application réellement devant (foreground_observed true). Un intent ne prouve ni itinéraire calculé, ni chargement d’une page, ni message envoyé. phone_ui_action click exige la capacité Android et le consentement local ; sur une ancienne version, ne pas improviser une saisie ou un geste absent. Revenir à ChatGPT seulement sur demande. En conduite : réponse brève ; aucun geste demandé avant l’arrêt. Média : vérifier playing avant d’annoncer la lecture ; volume : reçu avant/après, pas une mesure acoustique.',
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
        const requestArgs=args;
        try {
          const replay=await phone.replay({id,kind,args:requestArgs});
          if(replay)return wrap(normalize(replay,id));
          if((kind==='open_app'||kind==='open_and_read')&&typeof args.app==='string') {
            const target=await prepareAppTarget(args.app,query=>phone.execute({id:crypto.randomUUID(),kind:'list_apps',args:{query,limit:80},expiresAt:Date.now()+2000}));
            args={...args,app:target};
          }
          if(kind==='screen_context'&&args.format==='lines')args={...args,include_text:true,max_nodes:80};
          return wrap(normalize(await phone.execute({ id, kind, args, expiresAt: Date.now() + ttlFor(kind) },requestArgs),id));
        }
        catch(error) {
          if(error instanceof AppResolutionError) {
            try {return wrap(normalize(await phone.refuse({id,kind,args,expiresAt:Date.now()+ttlFor(kind)},error.result()),id));}
            catch {/* Receipt storage failed: do not manufacture a confirmed no-effect result. */}
          }
          return wrap({ status: 'indeterminate', command_id: id, note: 'La liaison a été interrompue ; lire le résultat avec le même identifiant avant toute nouvelle action.' });
        }
      };
      server.registerTool('phone_status', {
        title: 'Lire l’état actuel du Redmi',
        description: 'Lit modèle, batterie, réseau, volume et capacités natives. screen_enabled est le réglage interne ; screen_access indique séparément autorisation Android et connexion du service. null = donnée inconnue sur une ancienne application, jamais une preuve de disponibilité. phone_offline signifie que la liaison Speed Car est absente.',
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
