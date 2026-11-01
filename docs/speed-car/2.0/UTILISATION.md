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

Les droits de base restent `speedcar:test speedcar:phone`. Une demande GPS, notifications ou écran peut exiger un nouveau consentement OAuth pour le droit privé correspondant. Le relais 2.0.1 renvoie le challenge HTTP MCP standard ; il ne modifie aucun ancien jeton. La prise en charge automatique de ce consentement supplémentaire par ChatGPT reste à vérifier dans le client réel. Un refus OAuth et un refus Android sont deux causes distinctes.

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

Worker actuel : version de déploiement `6ac2d557-9022-4957-afe5-a11c295ca4e5`. Pour annuler uniquement la dernière correction OAuth, version précédente `d2895179-2053-4054-bb9c-1358849222b9` ; `wrangler rollback <version> --config wrangler.production.jsonc`, depuis `relay`, puis diagnostic OAuth et anciens outils. Ne supprimer ni KV, ni Durable Objects, ni secrets, ni appairage. Pour revenir au système d’avant 2.0, sélectionner la version exacte dans l’historique Cloudflare et vérifier la compatibilité, sans deviner un identifiant.
