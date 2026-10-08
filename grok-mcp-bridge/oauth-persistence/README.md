# Pont MCP Grok : persistance OAuth (correctif `invalid_client`)

## Cause du `invalid_client`

La passerelle OAuth (port 17779) conservait les clients de l'enregistrement dynamique (DCR) dans une `Map` en mémoire.
Au redémarrage (fait par Codex pour charger le correctif `list_directory`), le registre a été vidé.
ChatGPT a mis en cache le `client_id` obtenu à l'enregistrement et le renvoie tel quel. Le serveur ne le connaît plus, d'où
`{"error":"invalid_client","error_description":"Invalid client_id"}`.
Ce constat de Codex est cohérent avec ses journaux. Il reste à le confirmer dans le code réel, à l'étape 1.

## Contenu

| Fichier | Rôle |
|---|---|
| `oauth-store.mjs` | Registre persistant, sans dépendance : écriture atomique (fichier temporaire, fsync, rename), `.bak` de l'état précédent, droits 0600/0700 réparés au chargement, validation stricte, bascule sur `.bak` si le fichier est corrompu et refus de démarrer avec un registre vide, verrou pid contre deux propriétaires, jetons stockés **uniquement hachés** (SHA-256), rotation des refresh tokens avec détection de rejeu, révocation (RFC 7009), redirect_uri en correspondance exacte |
| `oauth-store.test.mjs` | 17 tests `node --test`, dont le test déterminant : le même `client_id` est reconnu après redémarrage |
| `import-client.mjs` | Restauration par le propriétaire du `client_id` public que ChatGPT présente encore (redirect_uri limité à chatgpt.com / openai.com) |
| `audit.sh` | Audit **en lecture seule**. Il ne lit jamais `.owner-pin`, `.env` ni les fichiers d'état, et masque toute suite de 8 chiffres ou plus ainsi que tout ce qui ressemble à un jeton |

Les tests passent (17/17, Node 22). Un test de mutation (persistance désactivée) en fait échouer 9, dont le test de régression.

## Procédure sur la VM Grok (`grok-bot-vm-446159542`, utilisateur `box`)

À exécuter par l'agent qui a accès à la VM (ChatGPT ou Codex via Remote Desktop Commander, ou le terminal Grok Bot).

**1. Audit, sans rien modifier.** Il sert à vérifier si Codex a déjà commencé la persistance.
```bash
cd /home/box/grok-free-poc/full-bridge
bash /chemin/vers/oauth-persistence/audit.sh > ~/audit-$(date +%F-%H%M).txt; less ~/audit-*.txt
```
Points à relever : la ligne `ps` exacte de la passerelle (commande et répertoire, à reproduire au redémarrage), le port ciblé par `tailscale funnel status` (doit être **17779**, jamais 17778), les fichiers modifiés récemment et les `.bak`. Dans la section `OAuth persistence in code`, regarder s'il reste `new Map` pour les clients ou si une écriture de fichier existe déjà.

**2. Sauvegarde, avant toute modification.**
```bash
mkdir -p ~/backups && chmod 700 ~/backups
tar --exclude=node_modules -czf ~/backups/full-bridge-$(date +%F-%H%M).tgz -C /home/box/grok-free-poc full-bridge
chmod 600 ~/backups/*.tgz
```

**3. Installation et tests sur place.**
```bash
cp -r oauth-persistence /home/box/grok-free-poc/full-bridge/
cd /home/box/grok-free-poc/full-bridge/oauth-persistence && node --test oauth-store.test.mjs
```

**4. Branchement dans la passerelle (le fichier qui écoute sur 17779).** Il faut remplacer la `Map` des clients et des jetons. Les codes d'autorisation restent en mémoire : ils durent 5 minutes et sont à usage unique.
```js
import { openOAuthStore } from './oauth-persistence/oauth-store.mjs';
const store = await openOAuthStore(process.env.OAUTH_STORE_FILE
  ?? '/home/box/grok-free-poc/full-bridge/state/oauth-store.json');
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { await store.close(); process.exit(0); });
```
| Endroit actuel | Remplacer par |
|---|---|
| `POST /register` : `clients.set(id, …)` | `const reg = await store.registerClient(body)` puis réponse 201 avec `reg` (`invalid_redirect_uri`/`invalid_client_metadata` en cas d'erreur 400) |
| `GET /authorize` : `clients.get(client_id)` | `store.getClient(client_id)` **et** `store.isRedirectUriAllowed(client_id, redirect_uri)`. Si l'un échoue, renvoyer une erreur **sans** rediriger |
| `POST /token` (authorization_code) | `store.authenticateClient(id, secret)`, contrôles code/PKCE S256/redirect_uri/resource inchangés, puis `store.saveAccessToken(at, {clientId, scope, resource, ttlMs})` et `store.saveRefreshToken(rt, {...})` |
| `POST /token` (refresh_token) | `const rec = await store.consumeRefreshToken(rt, clientId)`. Si `null`, renvoyer `invalid_grant`. Sinon émettre de nouveaux jetons en conservant `familyId: rec.familyId` |
| Vérification Bearer sur `/mcp` | `const t = store.verifyAccessToken(bearer)` : `null` donne 401. Vérifier aussi `t.scope` ⊇ `bridge` et `t.resource` |
| `/revoke` (s'il existe) | `await store.revokeToken(token)` |

Ensuite : `node --check <fichier>`. Ne jamais journaliser `body`, les en-têtes `Authorization`, ni le PIN.

**5. Client ChatGPT déjà en cache.** Ouvrir la page d'autorisation depuis le plugin et relever dans l'URL `client_id` et `redirect_uri` : ces valeurs ne sont pas secrètes. Passerelle **arrêtée** :
```bash
node oauth-persistence/import-client.mjs state/oauth-store.json '<client_id>' '<redirect_uri décodé>'
```
Cette restauration ne vaut que pour un client **public** (`token_endpoint_auth_method: none`). Si ChatGPT s'est enregistré avec un `client_secret`, celui-ci est perdu. Il faut alors recréer l'app « Grok Linux MCP - complet » dans ChatGPT (paramètres, Apps/Connecteurs, créer, même URL `/mcp`, OAuth, DCR) pour obtenir un nouvel enregistrement, qui sera cette fois persistant.

**6. Redémarrage et preuve de persistance**, avec la commande relevée à l'étape 1 et les mêmes variables d'environnement.
```bash
B=http://127.0.0.1:17779
ID=$(curl -s -X POST $B/register -H 'content-type: application/json' \
  -d '{"client_name":"persist-test","redirect_uris":["https://chatgpt.com/persist-test"]}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).client_id')
# arrêter puis relancer la passerelle (SIGTERM), puis :
curl -s -o /dev/null -w '%{http_code}\n' "$B/authorize?response_type=code&client_id=$ID&redirect_uri=https%3A%2F%2Fchatgpt.com%2Fpersist-test&code_challenge=E9Melhoa2OwvFrEMTJguCHaoeK1t8URWo9z1EKkUWYk&code_challenge_method=S256&scope=bridge&state=x"
# attendu : 200 (page PIN), et non 400/401 invalid_client
stat -c '%a %U' state/oauth-store.json   # attendu : 600 box
tailscale funnel status                    # attendu : 443 vers 127.0.0.1:17779
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://grok-mcp-test.tail859e54.ts.net/mcp   # attendu : 401
```

**7. Connexion ChatGPT.** Sur la page du plugin, cliquer sur « Connecter ». Le propriétaire saisit le PIN : `cat /home/box/grok-free-poc/full-bridge/.owner-pin` dans le terminal Grok, **avec un espace** après `cat`, puis « Approuver » dans le **même navigateur** que celui qui a lancé la connexion, sinon le retour échoue en 403.

**8. Tests de bout en bout dans une conversation ChatGPT**, avec le plugin activé. À coller tel quel :
> Avec l'outil Grok Linux MCP - complet, exécute dans l'ordre et montre chaque résultat brut : 1) `run_shell` `uname -a` ; 2) `list_directory` path="." ; 3) `write_file` `claude-mcp-validation.txt` = `created-by-claude-code` ; 4) `read_file` de ce fichier ; 5) `write_file` = `modified-by-claude-code` puis `read_file`.

Ensuite, redémarrer la passerelle **une fois** et relancer le test 1 dans la même conversation. Il doit réussir sans nouvelle demande de PIN : les jetons sont persistés, sous forme hachée.

## État / reprise (2026-10-08)

- **Fait (session Claude Code cloud) :** module de persistance, 17 tests verts, test de mutation, outil de restauration, audit sans fuite.
- **Non fait :** aucune action sur la VM, le PC ni ChatGPT. Ce conteneur cloud n'a accès à aucun des trois, et `*.ts.net` est bloqué par sa politique réseau. Le `server.mjs` réel n'a donc pas été lu : l'étape 4 indique où intervenir sans pouvoir citer de numéros de ligne.
- **Prochaine action concrète :** étape 1 (audit) sur la VM.
- **Risques :** la sauvegarde Windows `grok-mcp-full-v1.zip` peut différer du serveur actif, donc ne pas l'écraser dessus. Ne pas laisser de relais ouvert sur le port 8443 du Funnel (Codex l'avait coupé, à revérifier dans l'audit).
