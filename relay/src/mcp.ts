import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { owner, scope, phoneScope, type Env } from './env';
import type { PhoneKind } from './phone-link';

export const mcpApi = {
  async fetch(request, env, context) {
    const authenticated = context as ExecutionContext & { props?: { owner?: string }; auth?: { scope: string[] } };
    if (authenticated.props?.owner !== owner) return new Response('Propriétaire refusé', { status: 403 });
    if (!authenticated.auth?.scope.includes(scope)) return new Response('Droit insuffisant', {
      status: 403, headers: { 'www-authenticate': `Bearer error="insufficient_scope", scope="${scope}"` },
    });
    if (new URL(request.url).pathname !== '/mcp') return new Response('Introuvable', { status: 404 });
    const state = env.OWNER_STATE.getByName(owner);
    const handler = createMcpHandler(() => {
      const server = new McpServer({ name: 'speed-car', version: '0.3.1' }, {
        instructions: 'Speed Car pilote uniquement le téléphone appairé. Un appel spécialisé par demande. Pour une hausse du volume, phone_media_volume_up ; pour YouTube dans Brave, phone_open_youtube_brave. Générer un nouvel UUID command_id pour chaque demande volontaire et conserver le même en cas de reprise de transport. Si le résultat est indeterminate, lire phone_command_status avec ce même ID, sans rejouer avec un nouvel ID. Confirmer seulement les faits du reçu : un index média ne prouve pas le niveau acoustique ; Brave repris ne prouve pas le chargement de YouTube. Le test du relais ne prouve pas une action du téléphone.',
      });
      server.registerTool('speedcar_test_action', {
        title: 'Tester une action Speed Car',
        description: 'Écrit un nouveau reçu de test dans le relais Speed Car et relit le résultat. Utiliser pour « teste Speed Car ». Ne modifie pas le téléphone. Confirmer uniquement le test du relais.',
        inputSchema: z.strictObject({}),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      }, async () => {
        const receipt = await state.writeReceipt();
        return { structuredContent: { status: 'verified', proof_scope: 'relay_storage_only', receipt },
          content: [{ type: 'text', text: `Test du relais réussi, reçu ${receipt.sequence} enregistré ; le téléphone n'est pas encore commandé.` }] };
      });
      server.registerTool('speedcar_status', {
        title: 'Lire le dernier test Speed Car',
        description: 'Lit le dernier reçu conservé par le relais. Ne teste pas le téléphone ni la disponibilité du mode vocal.',
        inputSchema: z.strictObject({}),
        annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
      }, async () => {
        const stored = await state.readStatus();
        return { structuredContent: { ...stored, android_control: 'device_link_available', proof_scope: 'relay_storage_only' },
          content: [{ type: 'text', text: stored.last_receipt ? `Dernier test du relais : reçu ${stored.count}, ${stored.last_receipt.written_at}.` : 'Aucun test enregistré ; le téléphone n’est pas encore commandé.' }] };
      });
      const phone = env.PHONE_LINK.getByName(owner);
      const permitted = () => authenticated.auth?.scope.includes(phoneScope);
      const denied = () => ({ isError: true, content: [{ type: 'text' as const, text: 'Reconnecter Speed Car en autorisant le droit speedcar:phone. Aucune commande du téléphone envoyée.' }] });
      const wrap = (result: Record<string, unknown>) => ({ structuredContent: result,
        content: [{ type: 'text' as const, text: JSON.stringify(result) }] });
      const invoke = async (id: string, kind: PhoneKind, args: { steps?: number }) => {
        if (!permitted()) return denied();
        try { return wrap(await phone.execute({ id, kind, args, expiresAt: Date.now() + (kind === 'youtube_brave' ? 5000 : 3000) })); }
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
      }, async ({ command_id }) => permitted() ? wrap(await phone.commandStatus(command_id)) : denied());
      return server;
    });
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
