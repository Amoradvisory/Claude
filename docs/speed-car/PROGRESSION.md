# Progression Speed Car — plan : PLAN-PORTE-0.md

- Source : branche ccr-421eb031-o100d2, contenant uniquement CONCEPTION.md ; aucune implémentation préexistante.
- Travail : copie isolée, branche codex/speed-car-gate0 publiée dans le dépôt ; branche de conception d’origine conservée.
- Décision : commencer par P0 ; Android attend l'appel vocal réel. Question du compte ChatGPT et du compte Cloudflare posée pendant les préparatifs.
- Décision : OAuthProvider officiel dans un seul Worker, consentement par secret propriétaire hors dépôt ; éviter un fournisseur d'identité additionnel pour P0.
- Préparation : Node 24.19.0 ; aucune suite initiale dans ce dépôt documentaire.

## Réalisation du 30 octobre 2026

- Tâche 1 terminée localement : bibliothèque OAuth Cloudflare officielle 1.2.4, SDK serveur MCP officiel 2.4.0, TypeScript et dépendances verrouillées. Remplacement de l'ancien paquet de test Cloudflare déprécié par `@cloudflare/vitest-plugin` 1.4.11.
- Preuve initiale RED : 11 tests échouaient contre le serveur 503 de départ ; authentification et reçus ensuite implémentés et observés.
- Tâche 2 terminée localement : page de consentement propriétaire, origine/cookie, PKCE réel, scopes, compteur et dernier reçu stockés dans un Durable Object. Deux demandes identiques volontaires produisent deux reçus distincts.
- Tâche 3 terminée localement : diagnostic CLI, documentation d'installation et protocole d'essai vocal. `npm run check` : exit 0. `npm test` : 15 tests Worker + 3 tests Node, tous réussis. `npm run build` : exit 0, déploiement à blanc uniquement ; paquet compressé environ 265 Kio.
- Diagnostic contre un véritable serveur Wrangler local : `/health` 200, GET et POST `/mcp` 401, découverte ressource et OAuth 200 ; `relay_ready: true`, `voice_test: not_observed`, `android_control: not_implemented`. Serveur de test arrêté ensuite ; aucune persistance de service ajoutée.
- Revue indépendante : aucun défaut critique identifié ; faux positif du diagnostic GET-protégé/POST-ouvert corrigé par ajout d'une sonde POST de lecture. Test de régression constaté RED puis GREEN. Lecture du formulaire bornée à 4096 octets pendant le streaming, avec test RED puis GREEN.
- Limite explicitée : le consentement de la bibliothèque est consommé via KV ; le rejeu séquentiel est vérifié, l'unicité de deux soumissions simultanées du même navigateur n'est pas garantie. Acceptable pour ce test de relais sans commande physique ; à distinguer du futur dédoublonnage Android.

## État des scénarios

| Scénario | Classement | Preuve ou cause |
|---|---|---|
| Serveur OAuth + MCP + reçu durable, runtime local | VÉRIFIÉ | 15 tests Worker, dont véritable échange PKCE et relecture depuis stockage |
| Diagnostic et rejet d'un faux serveur protégé | VÉRIFIÉ | 3 tests Node et essai réel sur serveur local |
| Construction du paquet Cloudflare | VÉRIFIÉ | TypeScript et déploiement à blanc, exit 0 |
| Déploiement dans le compte Cloudflare du propriétaire | BLOQUÉ | `wrangler whoami` : « You are not authenticated » ; aucune identité Cloudflare injectée dans cet environnement |
| MCP personnel depuis le vrai ChatGPT vocal Android | PRÉPARÉ À TESTER | Compte Plus confirmé ; des MCP personnels existent déjà chez cet utilisateur. Appel vocal de Speed Car encore non observé |
| Données mobiles, PC éteint | PRÉPARÉ À TESTER | Protocole fourni ; dépend du déploiement et de l'accès MCP du compte |
| Volume et YouTube dans Brave | PRÉPARÉ À TESTER | Conception définie ; code Android volontairement non commencé avant P0 |

## Reprise utile

- Déclencheur : besoin de commandes vocales rapides et extensibles, indépendantes du PC.
- Décision décisive : valider une véritable écriture MCP en voix avant de développer Android ; garder un appel spécialisé par action connue.
- Preuve actuelle : uniquement les tests et le serveur locaux ci-dessus.
- Limite : aucune preuve ChatGPT vocal ou téléphone ; ne pas capitaliser cette chaîne comme méthode active déjà testée dans Acquis.
- Revalidation : compte/mode vocal ou permissions ChatGPT modifiés, mise à jour des bibliothèques OAuth/MCP, URL/droits du relais modifiés. Puis, pour Android, version HyperOS, permissions, profil Bluetooth, veille et redémarrage.
- Sauvegarde : conception initiale intacte dans le commit parent et sa branche d'origine ; nouvelle implémentation isolée. `.dev.vars` local privé ignoré par Git, jamais publié ; aucun secret de production créé.


## Correction de décision : réutiliser l’intégration MCP déjà présente

- L’utilisateur confirme ChatGPT Plus et l’existence de MCP personnels créés/configurés depuis le PC, notamment Grok Linux MCP et Mémoire multi-agent. L’absence de bouton de création dans l’app mobile ne démontre pas une impossibilité d’utiliser une intégration configurée depuis le web.
- Le catalogue d’outils de cette session contient effectivement « Grok Linux MCP - complet », avec authentification OAuth et des outils d’exécution de commandes et d’écriture de fichiers. Cette présence est une observation de disponibilité dans la session, pas une preuve d’exécution réussie ni une preuve vocale.
- Deux sondes de lecture système sur les liaisons existantes ont échoué : l’une exige une réauthentification, l’autre retourne une erreur interne. Aucune écriture ni changement de configuration de Grok n’a été effectué. Ces erreurs ponctuelles ne prouvent pas une restriction de ChatGPT Plus et ne sont pas un prérequis à réparer pour Speed Car.
- Décision corrigée : ne pas déclarer le projet bloqué par le seul nom de l’abonnement en extrapolant une documentation générale. Reprendre le mode d’ajout MCP que l’utilisateur emploie déjà sur PC, puis tester spécifiquement les écritures Speed Car dans la voix Android.
- La configuration initiale depuis un PC est compatible avec l’objectif : après hébergement, l’usage doit fonctionner en données mobiles avec le PC éteint, sans Remote Desktop Commander sur le trajet.
- Prochaine dépendance réelle : compte Cloudflare du propriétaire créé/connecté, déploiement du relais existant, connexion MCP depuis le web, puis reçu observé depuis la vraie conversation vocale. Ne pas recommander un changement d’abonnement sans échec concret établi et diagnostic de sa cause.
- Condition de revalidation : changement effectif d’accès, de compte/espace ou de permissions, ou erreur lors de l’ajout/l’appel de Speed Car ; distinguer configuration, OAuth, autorisation d’action et mode vocal.
