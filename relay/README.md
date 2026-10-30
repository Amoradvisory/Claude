# Relais Speed Car — porte 0

Ce premier composant permet de vérifier qu'une **écriture MCP personnelle** est utilisable depuis ChatGPT vocal Android. Il ne contient aucun pilote Android et ne nécessite ni PC ni ADB pour fonctionner une fois hébergé.

## Ce qui existe

- Worker Cloudflare TypeScript et protocole MCP officiel, compatible avec les clients 2025 et 2026 du SDK retenu.
- OAuth 2.1 : découverte, PKCE, jetons et renouvellement fournis par la bibliothèque Cloudflare officielle.
- Consentement initial avec secret propriétaire aléatoire, cookie sécurisé lié au navigateur, contrôle d'origine, refus du rejeu séquentiel et limitation des essais.
- `speedcar_test_action` : écrit puis relit un reçu dans un Durable Object. C'est une écriture déclarée comme telle. Chaque nouvel appel volontaire produit un reçu ; cet outil n'est pas idempotent et n'a aucun effet Android.
- `speedcar_status` : lit le compteur et le dernier reçu conservés. Seul le dernier reçu est stocké, sans historique croissant.
- `GET /health` : état de configuration uniquement ; jamais une preuve du mode vocal.
- Diagnostic public sans secret, qui contrôle aussi que MCP refuse les appels anonymes.

## Vérification locale

Node 24 ou supérieur. Depuis ce dossier :

```sh
npm ci
npm run check
npm test
npm run build
```

Les tests s'exécutent localement dans le runtime Worker avec son stockage réel et un véritable échange de code OAuth PKCE. Les valeurs de test présentes dans la configuration Vitest ne sont pas utilisables en production. Le build est un **déploiement à blanc** ; il ne publie rien.

Pour démarrer localement : copier `.dev.vars.example` en `.dev.vars`, remplacer le secret par une valeur aléatoire privée d'au moins 32 octets (par exemple 64 caractères hexadécimaux générés par un gestionnaire de mots de passe), puis :

```sh
npm run dev
npm run diagnostic -- http://localhost:8787
```

Le navigateur doit accepter les cookies `Secure` de localhost pour tester le consentement local ; les tests automatiques font l'échange dans le runtime. **Un serveur localhost seul n'est pas accessible à ChatGPT distant.** Ne l'exposez pas par redirection de port du téléphone ou du PC.

## Préparer l'hébergement Cloudflare

Cette étape exige un compte et une session Cloudflare autorisés. Aucun compte ni abonnement payant n'est créé par le projet. Vérifier les quotas du compte choisi avant publication. Utiliser un namespace KV **réservé à Speed Car**, jamais un stockage d'un autre projet.

1. S'authentifier avec Wrangler si nécessaire : `npx wrangler login` ; vérifier le compte avec `npx wrangler whoami`.
2. Créer le stockage OAuth : `npx wrangler kv namespace create OAUTH_KV`. Reporter son identifiant à la place de `REPLACE_WITH_YOUR_KV_NAMESPACE_ID` dans `wrangler.jsonc`.
3. Générer le secret propriétaire avec un gestionnaire de mots de passe, puis le saisir dans `npx wrangler secret put OWNER_SETUP_SECRET`. Le garder dans le gestionnaire, jamais dans Git, une URL, une conversation ou les journaux. Les exemples et valeurs trop courts bloquent le service.
4. Définir `PUBLIC_ORIGIN` avec `npx wrangler secret put PUBLIC_ORIGIN` : origine HTTPS exacte du Worker, sans `/mcp` ni barre finale, par exemple `https://speed-car-relay.VOTRE-SOUS-DOMAINE.workers.dev`.
5. Publier dans le compte choisi : `npm run deploy`. Si une première publication est nécessaire pour obtenir le sous-domaine avant de définir les variables, le service reste fermé avec un HTTP 503 tant qu'elles manquent.
6. Exécuter le diagnostic contre l'URL obtenue. Les migrations déclarées créent uniquement le Durable Object de ce projet.

```sh
npm run diagnostic -- https://speed-car-relay.VOTRE-SOUS-DOMAINE.workers.dev
```

Le diagnostic retourne un code 0 si configuration, découverte OAuth et refus anonyme sont cohérents ; 1 en cas d'échec ; 2 si l'URL est invalide. `relay_ready: true` signifie **sondes de préparation réussies**, pas OAuth complet, disponibilité vocale ou téléphone commandé.

## Essai réel depuis ChatGPT Android

À réaliser à l'arrêt. L'accès aux MCP personnels et aux écritures dépend du compte et de l'espace ChatGPT ; ne pas déduire cette possibilité de l'accès à Drive.

1. Dans l'interface ChatGPT qui propose l'ajout d'un MCP personnel, connecter `https://VOTRE-RELAIS/mcp` avec OAuth. Le chemin des réglages peut dépendre du compte et de la version du produit.
2. Sur la page Speed Car, contrôler le client et la destination du retour, puis saisir le secret propriétaire et autoriser. Cette préparation initiale est distincte d'une éventuelle confirmation de chaque action par ChatGPT.
3. Dans le mode vocal réellement disponible sur l'app Android, demander « teste Speed Car ». Consigner le mode/version, le compte/espace et toute confirmation imposée. Le reçu doit être produit et sa séquence annoncée ; une réponse orale sans reçu ne suffit pas.
4. Demander le dernier reçu avec `speedcar_status` pour constater la même séquence. L'outil doit dire que seul le relais est testé.
5. Répéter en données mobiles, Wi-Fi du téléphone coupé et PC éteint. Noter le délai perçu, la nécessité ou non d'un appui à l'écran et l'identifiant/horodatage du reçu.

Si ChatGPT exige une validation à l'écran pour chaque écriture, cette étape ne satisfait pas le besoin mains libres. Ne pas changer les annotations pour éviter cette validation. Identifier la limite exacte avant de choisir une alternative.

## Limites et arrêt

- Secret propriétaire = moyen d'authentification personnel pour cette première étape ; pas de gestion de plusieurs utilisateurs ni MFA. Une évolution vers une identité existante pourra être décidée ensuite.
- Le consentement de la bibliothèque utilise KV : le rejeu séquentiel est refusé et testé ; deux soumissions simultanées du même navigateur ne sont pas une unicité atomique garantie. Ne pas confondre ce mécanisme avec le dédoublonnage durable d'une future commande physique.
- L'outil de test peut écrire deux reçus en cas de deux appels ; aucune garantie « exactement une fois ». Les garanties indispensables aux commandes physiques sont à construire avant le volume.
- Aucun test HyperOS, Bluetooth, écran verrouillé ou redémarrage Android ; aucun contrôle téléphone implémenté.
- Les jetons de renouvellement ont une durée maximale configurée de 30 jours ; réauthentification possible. Ne pas promettre une connexion éternelle.
- Changer le secret propriétaire bloque les nouvelles autorisations avec l'ancien secret, **sans révoquer les jetons OAuth déjà émis**. Pour une coupure immédiate, désactiver le Worker ou ses routes dans Cloudflare. La révocation ciblée des autorisations sera à préparer avant les commandes du téléphone.
- Retour arrière : arrêter le serveur local par Ctrl+C ; pour retirer la publication, désactiver le Worker de ce projet. Ne supprimer son namespace OAuth et son Durable Object qu'après avoir confirmé le besoin ; les autres projets sont indépendants.

Sources de mise en œuvre : bibliothèques installées et verrouillées `@cloudflare/workers-oauth-provider` 1.2.4, `@modelcontextprotocol/server` 2.4.0 ; documentation dans leurs paquets, [consentement Cloudflare](https://github.com/cloudflare/workers-oauth-provider/blob/main/docs/consent-page.md), [SDK MCP v2](https://ts.sdk.modelcontextprotocol.io/v2/). Les sources de plateforme et conditions de revalidation figurent dans l'instruction de conception.
