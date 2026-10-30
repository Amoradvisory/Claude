import { McpServer, createMcpHandler } from '@modelcontextprotocol/server';
import { z } from 'zod';
import { owner, scope, type Env } from './env';

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
      const server = new McpServer({ name: 'speed-car', version: '0.1.0' }, {
        instructions: 'Prototype Speed Car : teste uniquement la liaison au relais. Pour « teste Speed Car », appelle speedcar_test_action. Pour lire le dernier reçu, appelle speedcar_status. Confirme en une phrase, sans prétendre contrôler le téléphone.',
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
        return { structuredContent: { ...stored, android_control: 'not_implemented', proof_scope: 'relay_storage_only' },
          content: [{ type: 'text', text: stored.last_receipt ? `Dernier test du relais : reçu ${stored.count}, ${stored.last_receipt.written_at}.` : 'Aucun test enregistré ; le téléphone n’est pas encore commandé.' }] };
      });
      return server;
    });
    return handler.fetch(request);
  },
} satisfies ExportedHandler<Env>;
