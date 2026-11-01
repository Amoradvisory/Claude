# Speed Car 2.0.1 — utilisation et reprise

Application personnelle Android, pas un jeu. Téléphone : Redmi 2510ERA8BG, Android 16 / HyperOS. Liaison d’exécution : ChatGPT → MCP Cloudflare → WebSocket sortante Speed Car Android. Aucun PC, ADB ou Tailscale requis sur ce trajet. Le PC reste un outil de développement et de maintenance.

## Mise en service

L’APK 2.0.1 est déjà installé avec la même signature, sans effacement des données ni nouvel appairage. Après une coupure, ouvrir **Speed Car**, vérifier Internet et le message **Connecté au relais** ; appuyer sur **Activer Speed Car** si nécessaire. Le bouton **Arrêter** dans l’application ou sa notification coupe la liaison.

Dans **Fonctions Speed Car 2.0 et autorisations**, accorder volontairement chaque capacité souhaitée :

| Fonction | Autorisation / réglage |
|---|---|
| GPS ponctuel | Interrupteur local « Autoriser les demandes de position ponctuelle » + permission Android de localisation pendant l’utilisation + **superposition** (ligne suivante), car la position passe par une activité visible ; sans superposition : `permission_required` (constaté le 01/11). Précision approximative acceptée et annoncée |
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

**OAuth privé réparé et GPS vérifié depuis ChatGPT le 01/11/2026 au soir.** Les deux correctifs OAuth sont déployés. Amor a validé la proposition groupée à 22 h 12 par le parcours Paramètres ci-dessous ; `phone_get_location` a ensuite rendu une position actuelle `verified` dans une vraie conversation ChatGPT. La fenêtre « Se reconnecter » proposée dans une conversation échoue toujours (« Cette application ne fournit actuellement pas d’URL de configuration du navigateur ») : ne pas l’utiliser.

### Reconnexion après vérification du déploiement

**Vérifications préalables effectuées :** les cinq droits ont été relus à 19:58:32 UTC dans `/.well-known/oauth-protected-resource/mcp` et dans le `scope` du challenge `401` initial de `/mcp`. À 19:59:44 UTC, une vraie [conversation ChatGPT dans le navigateur](https://chatgpt.com/c/6ae78b6a-5500-83eb-a45a-bf185010caec) a appelé `phone_status` avec la connexion existante : `verified/verified`, preuve Android, 24 ms ; le même UUID a été relu indépendamment sans nouvelle commande. Cela valide la non-régression de base, pas le consentement privé. La route racine `/.well-known/oauth-protected-resource` reste à `404`.

1. Ouvrir une **nouvelle** page par **Settings / Paramètres → Plugins → Speed Car → … → Reconnect / Se reconnecter**, puis la valider dans les **10 minutes**. Une page déjà ouverte n’est jamais élargie ni prolongée.
2. Vérifier la distinction entre **demande initiale de ChatGPT : `speedcar:test`** et **droits proposés pour cette connexion** : Test du relais, Commandes du téléphone, **Localisation ponctuelle (`speedcar:location`)**, **Notifications (`speedcar:notifications`)**, **Contexte d’écran (`speedcar:screen`)**. Si ces cinq droits et leurs descriptions manquent, arrêter cette tentative.
3. Amor saisit lui-même son **code propriétaire**, puis choisit **Autoriser ces droits** s’il accepte la proposition groupée. Ne pas transmettre ce code à l’assistant. Cette nouvelle autorisation ne transforme aucun ancien jeton et ne révoque pas les anciennes autorisations. S’il ne le connaît pas, il le récupère lui-même sur son poste, sans l’afficher, avec l’aide de Claude Code.
4. Pour le GPS, Amor active volontairement la localisation Android, l’interrupteur local de position ponctuelle, la permission de localisation Android **et la superposition**, puis garde l’appareil déverrouillé. Les notifications et l’écran gardent leurs réglages indépendants ; le consentement OAuth n’active aucun de ces accès.
5. Dans une vraie conversation ChatGPT, demander le test privé voulu, puis relire `phone_command_status` avec le même UUID. Confirmer aussi `phone_status` et `speedcar_status`. Conserver une preuve expurgée des statuts, sans coordonnées ni contenu privé dans les journaux.

**Résultat du 01/11/2026 :** consentement groupé accordé à 22 h 12 (nouvelle autorisation ChatGPT à cinq droits relue dans le relais, ancienne conservée) ; GPS `verified` depuis ChatGPT après activation de la localisation, de la case locale, de la permission Android et de la superposition. **Pièges** : « Autorisation invalide, expirée ou déjà utilisée » signifie page trop ancienne (refaire Reconnecter puis valider aussitôt) ; « Autorisation refusée » signifie code incorrect. Notifications, écran, médias, torche et ouvertures restent à prouver. Les interrupteurs Android, l’exigence d’une demande explicite, la révocation locale et les protections par commande restent inchangés.

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

Référence Cloudflare relue avant ce correctif : déploiement `5a824990-eebe-40de-8827-230782ae2228` du `2026-11-01T13:05:30.962103Z`, version `6ac2d557-9022-4957-afe5-a11c295ca4e5` à **100 %**. Cette version est la cible de retour arrière préparée pour le correctif de consentement groupé. **Relire le déploiement actif et l’historique Cloudflare avant tout retour arrière**, puis exécuter `wrangler rollback <version vérifiée> --config wrangler.production.jsonc`, depuis `relay`, et contrôler les métadonnées OAuth et les anciens outils. `d2895179-2053-4054-bb9c-1358849222b9` est une référence historique antérieure, pas une cible à employer sans vérification. Ne supprimer ni KV, ni Durable Objects, ni secrets, ni appairage. Pour revenir au système d’avant 2.0, sélectionner la version exacte dans l’historique Cloudflare et vérifier la compatibilité, sans deviner un identifiant.

## Provenance de l’audit de suivi

Les quatre paragraphes de l’annexe suivante sont repris à l’identique depuis `C:\ChatGPT-Agent\speed-car\2.0\UTILISATION.md`, lu le 01/11/2026. Ils conservent les observations et les limites de preuve de cet audit, avant le correctif décrit ci-dessous. Leur état d’avancement est historique ; le complément qui suit décrit le suivi actuel et les validations encore ouvertes.

## Incident OAuth droits privés — 01/11/2026 vers 20 h (audit de suivi)

**État : non résolu, aucun déploiement effectué.** Depuis une vraie conversation ChatGPT dans Brave, l'appel `phone_get_location` affiche « Se reconnecter à Speed Car », puis la reconnexion échoue : « Cette application ne fournit actuellement pas d'URL de configuration du navigateur. » Le même problème concerne les demandes de droits privés notifications/écran selon l'utilisateur. Le consentement propriétaire n'a pas été obtenu. Ce sont des observations de l'interface utilisateur, pas des journaux réseau capturés.

**Preuves consultées** : `PREUVE-OAUTH-20261101.json` atteste, *avec un client de diagnostic et non ChatGPT*, trois HTTP 403 `insufficient_scope` et un ancien appel HTTP 200 ; `relay/src/mcp.ts` de la branche `codex/speed-car-2` construit les challenges `WWW-Authenticate` avec `resource_metadata`. `relay/src/index.ts` expose OAuthProvider, `/authorize`, `/oauth/token` et `/oauth/register`. `relay/src/consent.ts` impose consentement explicite et secret propriétaire. Le ZIP local du plugin exporté contient `.app.json` avec l'identifiant canonique et `.codex-plugin/plugin.json` mais **pas** de paramètres administratifs OAuth ; il ne permet pas de conclure qu'un champ browser-setup URL précis est absent. Les requêtes ChatGPT suivant le 403 et la configuration OAuth de l'app dans ChatGPT n'ont pas été inspectées : **cause exacte non encore prouvée**.

**Non-régression** : `phone_status` invoqué à nouveau depuis la conversation réelle : `status=verified`, `outcome=verified`, `proof_scope=android_state`, `duration_ms=13`, version 2.0.1. Aucun jeton, secret, appairage ou ancien droit modifié ; aucun déploiement et aucune permission sensible accordée automatiquement.

**Correction restant à réaliser** : inspecter les paramètres de connexion du plugin dans ChatGPT avec un accès autorisé et les traces Cloudflare filtrées sur l'incident ; déterminer si ChatGPT suit le `403 WWW-Authenticate`, appelle les métadonnées OAuth, tente une URL de navigateur inexistante ou refuse le step-up dynamique. Corriger uniquement le maillon prouvé défaillant en conservant l'application et les jetons existants ; ne pas désactiver `insufficient_scope` ni injecter un droit privé dans un ancien jeton. Amor doit saisir lui-même le secret propriétaire sur la page de consentement réelle. Retester depuis un vrai chat `phone_get_location`, `phone_get_notifications`, `phone_get_screen_context`, avec interrupteurs locaux/permissions Android activés volontairement ; pour chaque commande privée, relire `phone_command_status` avec le même UUID et n'afficher ni coordonnées ni contenu. Confirmer également `phone_status` et `speedcar_status` après correction.

## Complément OAuth — correctifs du 01/11/2026

La version finale `c585d37c-ea79-456a-8fc0-875a09c08468` est déployée à 100 %. À `20:16:02.922Z` (21 h 16 à Paris), les cinq droits restent présents dans les métadonnées et le `401`, et le relais répond au contrôle de santé. La connexion existante fonctionne encore via Codex après ce second déploiement ; la preuve ChatGPT navigateur de 24 ms après le premier reste décrite plus haut. Consentement privé accordé à 22 h 12 et GPS vérifié depuis ChatGPT : voir le résultat plus haut et le rapport.

Deux verrous distincts ont été établis : la découverte initiale limitée aux droits de base, puis la demande d’autorisation Settings maintenue sur `speedcar:test` malgré la découverte corrigée. La politique finale prépare les cinq droits seulement pour une nouvelle page officielle ChatGPT, avec la demande originale visible. Les anciennes pages, jetons et autorisations gardent leurs droits. Les 44 tests Worker, 3 tests Node, TypeScript et dry-run de production passent ; ils ne remplacent pas le consentement d’Amor ni un appel GPS réel.

Les détails, les sources du protocole, les références de déploiement et les preuves expurgées figurent dans [RAPPORT-20261101.md](RAPPORT-20261101.md), section « Résultat final ». En cas de nouvelle demande de connexion : parcours Paramètres sur une page fraîche, code saisi par Amor, validation immédiate.
