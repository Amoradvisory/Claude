# Speed Car 2.0.1 — utilisation et reprise

Application personnelle Android, pas un jeu. Téléphone : Redmi 2510ERA8BG, Android 16 / HyperOS. Liaison d’exécution : ChatGPT → MCP Cloudflare → WebSocket sortante Speed Car Android. Aucun PC, ADB ou Tailscale requis sur ce trajet. Le PC reste un outil de développement et de maintenance.

## Mise en service

L’APK 2.0.1 est déjà installé avec la même signature, sans effacement des données ni nouvel appairage. Après une coupure, ouvrir **Speed Car**, vérifier Internet et le message **Connecté au relais** ; appuyer sur **Activer Speed Car** si nécessaire. Le bouton **Arrêter** dans l’application ou sa notification coupe la liaison.

Dans **Fonctions Speed Car 2.0 et autorisations**, accorder volontairement chaque capacité souhaitée :

| Fonction | Autorisation / réglage |
|---|---|
| GPS ponctuel | Interrupteur local « Autoriser les demandes de position ponctuelle » + permission Android de localisation pendant l’utilisation ; précision approximative acceptée et annoncée |
| Ouvrir des applications / activité GPS | « Autoriser l’ouverture des applications (superposition) » → autoriser Speed Car ; éventuel réglage HyperOS à examiner si Android refuse encore l’ouverture |
| Vérifier une application ouverte | Accès aux données d’utilisation, déjà lu autorisé lors du test ; cela ne vérifie pas le contenu d’une page |
| Sessions médias | « Accès Android aux sessions médias et notifications » → activer Speed Car. La lecture du contenu des notifications possède un interrupteur local séparé |
| Torche | Bouton « Autoriser la lampe torche » → permission Android Caméra ; aucune photo/vidéo prise |
| État Bluetooth | Bouton d’autorisation Bluetooth ; facultatif, refus conservé comme information inconnue |
| Notifications | Accès Android ci-dessus + interrupteur local de lecture ponctuelle |
| Contexte d’écran | Interrupteur local + service d’accessibilité activé volontairement + applications choisies dans la liste autorisée |
| Maison / Travail | Saisir les destinations localement dans Speed Car, puis enregistrer ; jamais déduites automatiquement |

Ne pas accorder de droits par ADB. Aucun accès permanent au GPS, microphone, contacts ou écran. Le bouton **Désactiver tous les accès sensibles** coupe les interrupteurs locaux GPS/notifications/écran ; les autorisations Android restent révocables dans les réglages Android. Pour couper aussi les médias ou la torche, révoquer leurs accès Android ou arrêter Speed Car.

Une mise à jour a été suivie d’un accès superposition désactivé sur ce Redmi. Relire ce réglage après une mise à jour ; sa restauration n’est pas automatique. Les réglages HyperOS non lus ne sont pas considérés vérifiés.

## Dans ChatGPT

Sélectionner **Speed Car** dans une nouvelle conversation. Si seuls les anciens outils apparaissent : Paramètres → Plugins → Speed Car → À propos / Gérer l’application → **Actualiser les outils**, puis ouvrir un nouveau chat. Identifiant canonique : `asdk_app_6ae5a96e8a488191a89c47d2d513495b` ; `dev-…` est une référence de plugin, pas l’identifiant de permissions.

Les connexions existantes limitées à `speedcar:test speedcar:phone` gardent leurs droits de base. Une demande GPS, notifications ou écran requiert en plus le droit OAuth privé correspondant, puis les permissions Android et les interrupteurs locaux. Le challenge HTTP 403 `insufficient_scope` reste actif ; aucun ancien jeton ne reçoit de droit supplémentaire.

**Correctif de consentement groupé : préparé et testé localement, déploiement en attente de l’authentification Cloudflare par le propriétaire.** Il prépare une nouvelle autorisation explicite pour les cinq droits `speedcar:test`, `speedcar:phone`, `speedcar:location`, `speedcar:notifications` et `speedcar:screen`. L’erreur ChatGPT « Cette application ne fournit actuellement pas d’URL de configuration du navigateur. » a été observée ; sa cause interne exacte reste non démontrée. Les métadonnées et le challenge initial en production n’annonçaient que les deux droits de base lors du relevé du 01/11 à 19:32 UTC.

### Reconnexion après vérification du déploiement

**Préalable :** attendre que les cinq droits soient effectivement relus dans les métadonnées `/.well-known/oauth-protected-resource/mcp` et dans le `scope` du challenge `401` initial de `/mcp`, puis que `phone_status` fonctionne toujours avec la connexion existante. La route racine `/.well-known/oauth-protected-resource` répondait `404` au relevé ; elle ne sert pas de preuve de déploiement. Une compilation ou un déploiement annoncé ne suffit pas à franchir ce préalable.

1. Dans ChatGPT, ouvrir **Settings / Paramètres → Plugins → Speed Car → … → Reconnect / Se reconnecter**. Le bouton de reconnexion proposé après l’échec d’un outil privé n’est pas le parcours retenu pour cet essai.
2. Sur la page de consentement, vérifier que **Localisation ponctuelle (`speedcar:location`)**, **Notifications (`speedcar:notifications`)** et **Contexte d’écran (`speedcar:screen`)** sont clairement affichés avec leur sens, en plus des droits de base. Si ces trois droits manquent, arrêter cette tentative : le consentement groupé n’est pas démontré.
3. Amor saisit lui-même son **code propriétaire**, puis choisit **Autoriser** s’il accepte les droits affichés. Ne pas transmettre ce code à l’assistant. Cette nouvelle autorisation ne transforme aucun ancien jeton et ne révoque pas les anciennes autorisations.
4. Pour le GPS, Amor active volontairement l’interrupteur local de position ponctuelle et la permission de localisation Android, puis garde l’appareil déverrouillé avec la localisation active. Les notifications et l’écran gardent leurs réglages indépendants ; le consentement OAuth n’active aucun de ces accès.
5. Dans une vraie conversation ChatGPT, demander le test privé voulu, puis relire `phone_command_status` avec le même UUID. Confirmer aussi `phone_status` et `speedcar_status`. Conserver une preuve expurgée des statuts, sans coordonnées ni contenu privé dans les journaux.

**Encore en attente :** déploiement effectif, cinq droits relus en production, consentement groupé dans ChatGPT et GPS réel après activation volontaire par Amor. Les interrupteurs Android, l’exigence d’une demande explicite, la révocation locale et les protections par commande restent inchangés.

Instruction courte à copier :

```text
Utilise Speed Car directement pour mon Redmi, sans PC ni ADB.
Demande précise : appelle immédiatement l’outil adapté, puis une phrase courte fondée sur le reçu.
Sans action demandée : phone_status seulement.
UUID distinct par nouvelle action ; même UUID sur reprise de transport.
Après indeterminate, lire phone_command_status avant tout nouvel effet.
phone_offline : le dire immédiatement, sans boucle de tentatives.
catalog_loading : aucun lancement différé ; attendre le délai indiqué puis refaire une lecture ou une nouvelle demande volontaire avec un nouvel UUID.
permission_required / challenge OAuth : autorisation volontaire nécessaire, aucun contournement.
Ne jamais inventer Maison, coordonnées, destinataire, session média ou application installée.
Un intent envoyé ne prouve ni page chargée, ni itinéraire calculé, ni message envoyé.
Notifications et écran : seulement sur ma demande explicite, selon les autorisations locales.
```

Exemples après autorisation et validation matérielle :

- « Où suis-je ? » → `phone_get_location` ; préciser âge, précision et origine, sans inventer d’adresse.
- « Ouvre Google Maps. » → `phone_open_maps` sans cible ; « Affiche ma position » nécessite GPS.
- « Ramène-moi à la maison. » → `phone_navigate(saved_place: home, mode: driving)` ; si Maison absente, la configurer localement.
- « Trouve une pharmacie près de moi. » → recherche Maps ; ne pas annoncer une pharmacie choisie ni un itinéraire calculé sans preuve.
- « Lance Spotify. » → `phone_open_app(app: Spotify)` ; paquet courant résolu directement, nom ambigu refusé.
- « Mets la musique en pause. » → `phone_media_pause` ; choisir une session explicite en cas d’ambiguïté.
- « Volume à 50 %. » → `phone_set_media_volume(percent: 50)` ; plafond local appliqué, index réellement relu.
- « Fais vibrer mon téléphone une seconde. » → `phone_find_device(mode: vibrate, seconds: 1)`.
- « Lis “je pars”. » → `phone_speak` ; aucun microphone, garde contre les appels.

Les actions composées utilisent plusieurs appels MCP avec leurs reçus séparés. Aucun moteur de macros supplémentaire.

## Limites des preuves

Les schémas complets des **34 outils** réellement découverts en production sont dans [OUTILS-MCP.json](OUTILS-MCP.json). Le rapport distingue outils exposés, essais locaux, essais sur téléphone et essais ChatGPT.

Les résultats privés restent au plus 30 secondes en mémoire bornée ; ensuite `phone_command_status` conserve le statut et les métadonnées expurgées. L’historique des reçus est borné à 200 commandes / 24 heures. Une ancienne réussite n’est pas une mesure de l’état actuel. `unknown` ne prouve jamais l’absence d’effet.

GPS : acquisition ponctuelle avec activité visible, appareil déverrouillé et localisation Android active ; délai d’acquisition borné. La dernière position connue reste identifiée comme telle. Pas de suivi permanent ni de localisation silencieuse derrière un verrouillage.

Médias : accès Android aux sessions requis ; plusieurs cibles possibles donnent un refus d’ambiguïté. La sortie acoustique et le comportement d’un autoradio Bluetooth nécessitent un essai réel.

Écran : contexte sémantique et, sur un instantané récent, défilement / Retour seulement. Pas de capture pixel, clic arbitraire, saisie, mot de passe, validation bancaire ou accord de permission. MediaProjection reste à développer avec son consentement Android propre à chaque session.

Partages et SMS : préparation uniquement ; confirmation explicite, destinataire fourni et envoi final par l’utilisateur. Composeur : aucun appel placé. Alarme : interface officielle préparée, enregistrement non prouvé. Aucun accès contacts ou microphone ajouté.

Après redémarrage : récepteur existant BOOT_COMPLETED / mise à jour, service foreground spécial et reprise espacée conservés. Cela ne prouve pas un démarrage automatique sur HyperOS. Après arrêt forcé ou refus système, ouvrir Speed Car reste la procédure minimale. Reconnexion en cas de perte réseau prévue avec temporisation exponentielle jusqu’à environ 60–75 s, sans boucle active ; changement de réseau, longue veille et redémarrage à tester séparément.

## Diagnostic et retour arrière

Diagnostic dans ChatGPT : **« Avec Speed Car, appelle phone_status. »** Puis demander batterie/connectivité si nécessaire. `speedcar_status` teste seulement le relais.

Diagnostic PC existant : `C:\ChatGPT-Agent\speed-car\Speed-Car-Diagnostic.cmd` (relais uniquement). Sources cloud : `/workspace/speed-car-project`. Sources / APK publiés : branche `codex/speed-car-2` du dépôt Amoradvisory/Claude.

APK installé : `C:\ChatGPT-Agent\speed-car\Speed-Car-2.0.1.apk`. Preuve d’installation et de SHA relu sur l’appareil : `installation-2.0.1.json` dans ce dossier. APK précédent 2.0.0 et 0.3.1 conservés. Copie cloud de sauvegarde : `/workspace/speed-car/backups/Speed-Car-0.3.1-before-2.0.apk`.

Retour arrière préparé, non exécuté : arrêter uniquement Speed Car, restaurer l’APK 2.0.0 de même signature avec une mise à jour autorisant la version inférieure (`adb -s <Redmi vérifié> install -r -d <APK>`), puis ouvrir Speed Car et relire modèle/version/liaison. Ne jamais désinstaller ni effacer les données pour ce retour. Le schéma SQLite est inchangé, mais un retour de version reste à vérifier sur appareil.

Dernier déploiement Worker rapporté avant ce correctif : `6ac2d557-9022-4957-afe5-a11c295ca4e5`. **Relire le déploiement actif et l’historique Cloudflare avant tout déploiement ou retour arrière** ; cet identifiant n’a pas été confirmé comme actif pendant la préparation locale. Si le correctif de consentement groupé est ensuite déployé et doit être annulé, choisir la version préalablement relue, puis exécuter `wrangler rollback <version vérifiée> --config wrangler.production.jsonc`, depuis `relay`, et contrôler les métadonnées OAuth et les anciens outils. `d2895179-2053-4054-bb9c-1358849222b9` est une référence historique antérieure, pas une cible à employer sans vérification. Ne supprimer ni KV, ni Durable Objects, ni secrets, ni appairage. Pour revenir au système d’avant 2.0, sélectionner la version exacte dans l’historique Cloudflare et vérifier la compatibilité, sans deviner un identifiant.

## Provenance de l’audit de suivi

Les quatre paragraphes de l’annexe suivante sont repris à l’identique depuis `C:\ChatGPT-Agent\speed-car\2.0\UTILISATION.md`, lu le 01/11/2026. Ils conservent les observations et les limites de preuve de cet audit, avant le correctif préparé ci-dessous. Leur état d’avancement est historique ; le complément qui suit décrit la préparation actuelle et les validations encore ouvertes.

## Incident OAuth droits privés — 01/11/2026 vers 20 h (audit de suivi)

**État : non résolu, aucun déploiement effectué.** Depuis une vraie conversation ChatGPT dans Brave, l'appel `phone_get_location` affiche « Se reconnecter à Speed Car », puis la reconnexion échoue : « Cette application ne fournit actuellement pas d'URL de configuration du navigateur. » Le même problème concerne les demandes de droits privés notifications/écran selon l'utilisateur. Le consentement propriétaire n'a pas été obtenu. Ce sont des observations de l'interface utilisateur, pas des journaux réseau capturés.

**Preuves consultées** : `PREUVE-OAUTH-20261101.json` atteste, *avec un client de diagnostic et non ChatGPT*, trois HTTP 403 `insufficient_scope` et un ancien appel HTTP 200 ; `relay/src/mcp.ts` de la branche `codex/speed-car-2` construit les challenges `WWW-Authenticate` avec `resource_metadata`. `relay/src/index.ts` expose OAuthProvider, `/authorize`, `/oauth/token` et `/oauth/register`. `relay/src/consent.ts` impose consentement explicite et secret propriétaire. Le ZIP local du plugin exporté contient `.app.json` avec l'identifiant canonique et `.codex-plugin/plugin.json` mais **pas** de paramètres administratifs OAuth ; il ne permet pas de conclure qu'un champ browser-setup URL précis est absent. Les requêtes ChatGPT suivant le 403 et la configuration OAuth de l'app dans ChatGPT n'ont pas été inspectées : **cause exacte non encore prouvée**.

**Non-régression** : `phone_status` invoqué à nouveau depuis la conversation réelle : `status=verified`, `outcome=verified`, `proof_scope=android_state`, `duration_ms=13`, version 2.0.1. Aucun jeton, secret, appairage ou ancien droit modifié ; aucun déploiement et aucune permission sensible accordée automatiquement.

**Correction restant à réaliser** : inspecter les paramètres de connexion du plugin dans ChatGPT avec un accès autorisé et les traces Cloudflare filtrées sur l'incident ; déterminer si ChatGPT suit le `403 WWW-Authenticate`, appelle les métadonnées OAuth, tente une URL de navigateur inexistante ou refuse le step-up dynamique. Corriger uniquement le maillon prouvé défaillant en conservant l'application et les jetons existants ; ne pas désactiver `insufficient_scope` ni injecter un droit privé dans un ancien jeton. Amor doit saisir lui-même le secret propriétaire sur la page de consentement réelle. Retester depuis un vrai chat `phone_get_location`, `phone_get_notifications`, `phone_get_screen_context`, avec interrupteurs locaux/permissions Android activés volontairement ; pour chaque commande privée, relire `phone_command_status` avec le même UUID et n'afficher ni coordonnées ni contenu. Confirmer également `phone_status` et `speedcar_status` après correction.

## Complément OAuth — correctif préparé le 01/11/2026

**État du suivi : préparation et validation locale terminées ; déploiement Cloudflare EN ATTENTE de l’authentification du propriétaire ; consentement réel ChatGPT et GPS EN ATTENTE.** L’absence d’anciens identifiants Cloudflare exploitables dans l’environnement local impose cette authentification. La tentative par appareil a expiré sans validation au bout de cinq minutes ; relancer le parcours officiel pour obtenir un nouveau code quand Amor sera prêt. Aucun code d’activation n’est conservé dans ce document. Aucune réussite de déploiement, de consentement ou de GPS n’est revendiquée ici.

### Constat établi et choix du correctif

Le relevé public du 01/11 à **19:32 UTC** a confirmé que le `401` initial de `/mcp` contient `scope="speedcar:test speedcar:phone"` et que la ressource annoncée sous `/.well-known/oauth-protected-resource/mcp` ne publie que ces deux droits. Le serveur d’autorisation publie déjà les trois droits privés et `offline_access`. La route racine `/.well-known/oauth-protected-resource` répond `404` : la découverte utile est ici celle du chemin `/mcp`.

Dans `@cloudflare/workers-oauth-provider` **1.2.4**, `requiredScopes` pilote l’annonce des droits de la ressource et le `scope` du challenge initial ; ce réglage n’impose pas ces cinq droits aux anciens jetons pour chaque appel. Le correctif préparé y annonce `speedcar:test speedcar:phone speedcar:location speedcar:notifications speedcar:screen`. L’ancienne liste `scopesSupported` du serveur OAuth contenait déjà ces droits ; la modifier seule n’aurait pas corrigé cette annonce initiale.

La [stratégie MCP de sélection des scopes](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization#scope-selection-strategy) donne priorité au `scope` du premier `401` ; l’ensemble `scopes_supported` de la ressource ne sert de repli qu’en son absence. Le correctif couvre donc les deux annonces. Cette cause de découverte limitée est confirmée ; le mécanisme interne qui produit l’erreur ChatGPT d’URL navigateur reste non prouvé. Le comportement réel de **Reconnect** après ce changement reste à tester.

Le consentement groupé correspond au choix explicite de ce profil personnel. Les [recommandations MCP de minimisation](https://modelcontextprotocol.io/docs/2026-07-28/tutorials/security/security_best_practices#scope-minimization) restent applicables : annoncer toutes les permissions possibles n’est pas une règle générale. `offline_access` reste une capacité du serveur OAuth pour le renouvellement ; il n’est pas ajouté aux cinq droits de la ressource ni à son challenge initial.

### Consentement et protections conservées

La page décrit séparément chaque droit réellement demandé, notamment **Localisation ponctuelle**, **Notifications** et **Contexte d’écran**. Amor saisit lui-même le **code propriétaire** sur cette page ; aucun agent ne doit le lire, le demander dans le chat ou le saisir à sa place. Seuls les scopes de la requête OAuth validée et conservée côté serveur sont accordés après ce consentement explicite.

`revokeExistingGrants: false` conserve les anciennes autorisations, y compris pour le même client. Aucun ancien jeton d’accès ou de renouvellement n’est élargi ; les droits privés ne sont pas injectés dans une connexion de base. Les contrôles par outil et les refus `403 insufficient_scope` sont conservés. Les interrupteurs locaux Android, les permissions révocables, la demande explicite pour les accès privés, les filtres de notifications, la liste d’applications autorisées pour l’écran et les protections des commandes restent inchangés.

### Preuves locales et validations restantes

Le code du correctif a été commité et poussé sur `codex/speed-car-2` : `cdcf33148ef988cc6181138909b5fa239f6e3782`. Sur cette copie de travail du relais, les **33 tests Worker et 3 tests Node**, la vérification TypeScript et le **dry-run Wrangler** passent. Les contrôles couvrent l’annonce des cinq droits, les explications de consentement, l’ancienne autorisation et son renouvellement qui restent utilisables et limités, ainsi que le passage des trois outils privés vers le dispatch avec la nouvelle autorisation. Un `phone_offline` dans cet environnement de test ne constitue aucune preuve de téléphone réel ni de GPS.

**Relecture avant déploiement, 19:34:14 UTC :** `phone_status`, UUID `513c7bf2-c31a-401e-9528-e09523e805dd`, a renvoyé `status=verified`, `outcome=verified`, `proof_scope=android_state`, `duration_ms=92`, version `2.0.1`, `location_enabled=false` et `location_permission_granted=false`. Cette preuve provient de l’outil connecté **Codex**, pas d’une conversation ChatGPT dans le navigateur. Elle confirme la connexion existante à cet instant et le besoin d’activation volontaire du GPS ; elle ne valide pas le futur déploiement ni le consentement privé.

Avant de proposer la reconnexion à Amor, il reste à :

1. Terminer l’authentification Cloudflare du propriétaire, relire le déploiement actif et enregistrer la cible de retour arrière vérifiée ; `6ac2d557-9022-4957-afe5-a11c295ca4e5` est seulement le dernier déploiement antérieurement rapporté.
2. Déployer le correctif, puis relire en production les cinq droits dans `/.well-known/oauth-protected-resource/mcp` **et** le challenge `401` initial de `/mcp`. Conserver la réponse racine `404` comme observation, sans inventer un alias fonctionnel.
3. Confirmer que `phone_status` fonctionne toujours avec la connexion existante. Ensuite seulement, utiliser **Settings / Paramètres → Plugins → Speed Car → … → Reconnect / Se reconnecter** et vérifier les trois droits privés sur la vraie page avant la saisie du code par Amor.
4. Après activation volontaire du GPS par Amor, tester `phone_get_location` depuis une vraie conversation ChatGPT. Pour les notifications et l’écran, attendre également les autorisations locales correspondantes et une demande explicite. Relire chaque commande privée avec `phone_command_status` et le même UUID, puis contrôler `phone_status` et `speedcar_status`, sans publier de données privées.

Ces étapes restent ouvertes. Un succès local ou une nouvelle métadonnée ne remplace pas le consentement du propriétaire ni une preuve Android issue de ChatGPT.
