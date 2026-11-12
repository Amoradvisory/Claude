# Speed Car 2.1.0 : déploiement depuis le PC et recette T1 à T12

Ce document s'adresse à l'agent qui travaille **sur le PC** (Claude Code local ou Codex), avec le Redmi à portée et Amor disponible. Tout se fait **à l'arrêt**. Source : branche `claude/new-session-9tnxsf` du dépôt `Amoradvisory/Claude`.

Règles : aucune autorisation Android accordée par ADB ; aucun secret lu, affiché ou recopié ; ne fermer ni ChatGPT, ni Brave, ni Opera, ni une session d'un autre agent ; pas de boucle de sondage sur le PC à 2 cœurs.

**Reprise depuis le PC le 12/11/2026 : relais déployé et relu en 2.1.0 à 13:14:09 UTC ; téléphone encore en 2.0.1 avant installation. Tests du relais 57/57 + 3/3 et TypeScript vérifiés sur Windows ; trois liaisons et cinq noms de secrets inchangés, migration `v2-phone-link` conservée. Le reçu 10 obtenu depuis ce chat Codex confirme `phone.phone_link=connected` ; il ne constitue pas T1 en nouvelle conversation ChatGPT. Actualisation des outils demandée à Amor, réponse attendue. Aucun T1 à T12 vocal validé à ce stade. Détails dans la section de reprise locale du rapport.**

**Arrêt à 13:28:52 UTC : APK 2.1.0/code 7 construit, 63 tests JVM réussis, lint 0 erreur et 20 avertissements. Certificat de l'APK `a067c5c90bdbd611714c2519a04a2529079490ddddbd26781b0a72e659a3dbc8`, différent de la référence exigée `0a11ba52371276d2a3d5cdef98b87971c2d609921c240e8040dca20f0c69fc94`. Installation bloquée avant toute tentative ; aucune désinstallation. Aucun essai vocal de la recette n'a eu lieu. Les statuts ci-dessous décrivent cet arrêt et ne remplacent pas des observations sur le téléphone.**

## 1. Avant de toucher à quoi que ce soit

| Étape | Commande | À noter |
|---|---|---|
| Version du relais en ligne | `curl https://speed-car-relay.speed-car-relay.workers.dev/health` | Relevé le 12/11/2026 à 11:48 UTC puis à 12:26 UTC : `2.0.1`. Le correctif du 04/11 n'a jamais été déployé. Relire avant de déployer, au cas où cela aurait changé |
| Version de l'application | `phone_status` depuis ChatGPT, ou écran Speed Car | champ `version` |
| État de l'application sur le téléphone | Regarder l'écran Speed Car | « Connecté au relais », « Connexion en cours », « Connexion arrêtée » ou autre : cela tranche H1 à H4 du rapport |
| Journal de `ph start` du 11/11 | journaux de `go.js` | cela tranche G1 à G4 |

## 2. Déploiement

1. **Relais d'abord.** Il est compatible avec l'application 2.0.1.
   `cd relay && npm ci && npm test && npx tsc --noEmit`, puis le déploiement habituel (`--keep-vars`, mêmes liaisons, aucune migration nouvelle). Relire `/health` : `2.1.0`.
   - **Travailler dans la copie de travail déjà présente sur le PC** (`git fetch` puis bascule sur la branche), pas dans un clone neuf. La configuration de production `relay/wrangler.production.jsonc` est ignorée par Git : elle n'existe que dans cette copie.
   - Commande : `npx wrangler deploy --config wrangler.production.jsonc --keep-vars --strict`, avec les mêmes options que le déploiement du 01/11 (`docs/speed-car/2.0/RAPPORT-20261101.md`, ligne « Le déploiement a réutilisé… »).
   - **Ne jamais déployer avec le `wrangler.jsonc` suivi par Git** : son espace KV est un texte à remplacer (`REPLACE_WITH_YOUR_KV_NAMESPACE_ID`). Si `wrangler.production.jsonc` est introuvable, s'arrêter et le dire.
   - Avant de déployer, noter la version Cloudflare active (`npx wrangler deployments list --config wrangler.production.jsonc`) : c'est la cible du retour arrière.
2. **ChatGPT.** Paramètres → Plugins → Speed Car → Gérer l'application → **Actualiser les outils**. Nouvelle conversation : **36 outils**.
3. **Contrôle sans rien installer.** `speedcar_test_action` doit maintenant dire si le téléphone est relié. C'est le premier gain, avant même la nouvelle application.
4. **Application.** `cd android && gradlew testDebugUnitTest lintDebug assembleDebug`, avec la **même clé de signature** que 2.0.1. Installer par-dessus (`-r`), sans désinstaller : l'appairage et les réglages sont conservés. Une autre clé obligerait à désinstaller, donc à tout refaire : ne pas le faire.
   - La 2.0.1 est signée par la clé de développement locale du PC (`android/README.md`). L'empreinte publique de son certificat est dans `releases/Speed-Car-2.0.1.json`, champ `signer_sha256` : `0a11ba52371276d2a3d5cdef98b87971c2d609921c240e8040dca20f0c69fc94`.
   - **Contrôle avant installation** : `apksigner verify --print-certs app\build\outputs\apk\debug\app-debug.apk` doit afficher cette même empreinte SHA-256. Si elle diffère, ne pas installer, ne pas désinstaller, s'arrêter et le dire. Ce contrôle lit un certificat public, aucune clé privée.
5. **Ouvrir Speed Car** sur le téléphone : « Connecté au relais ».

Retour arrière : relais, version précédente relevée à l'étape 1 ; application, APK 2.0.1 conservé dans `releases/`.

## 3. Réglages à faire par Amor, une fois

Dans **Speed Car → Fonctions Speed Car 2.0 et autorisations** :

| Réglage | Sert à |
|---|---|
| Autoriser l'ouverture des applications (superposition) | Ouvrir une application. À revérifier après chaque mise à jour |
| Accès aux données d'utilisation | Prouver qu'une application est devant |
| « Autoriser le contexte d'écran à ma demande » + service d'accessibilité Speed Car | Lire l'écran |
| Applications cochées : **Salât Lille, Brave, Maps** | Seules ces applications sont lisibles |
| Accès aux sessions médias et notifications | Pause, reprise, état de lecture |
| « Autoriser la lecture ponctuelle de mes notifications » | Lire la notification de Salât Lille sans changer d'écran |
| « Autoriser l'appui sur un élément » (facultatif) | Lancer un titre dans Brave. Laisser décoché si ce besoin n'existe pas |
| Fiabilité HyperOS : démarrage automatique, batterie « Aucune restriction », fenêtres en arrière-plan, cadenas dans les récentes | Que Speed Car reste relié et puisse afficher une application |

Dans **ChatGPT → Paramètres → Voix** : « Conversations en arrière-plan ».

Si la lecture d'écran est refusée alors que tout est activé et que le PC est allumé : `ph.js status` doit afficher `u2 = coexistence` (recette R-0049).

## 4. Recette

Le 12/11/2026 à 12:26 UTC, une troisième session a été lancée pour cette recette. Elle tournait elle aussi dans le cloud, sans accès au PC ni au téléphone : aucun dossier du PC ne lui était partagé. Elle a seulement relu `/health` (`2.0.1`) et rejoué les tests hors appareil (relais 57/57 et 3/3, `tsc` sans erreur, outil ADB 10/10). Rien n'a été déployé, rien n'a été testé sur le Redmi.

État de chaque test au 12/11/2026 : **non testé sur l'appareil**. La colonne « Résultat observé » se remplit pendant la recette. Un test n'est « vérifié » qu'après observation ; sinon « échoué », « bloqué » (dire par quoi) ou « non testé ».

### T1. Liaison

- **Précondition** : relais 2.1.0, Speed Car ouvert.
- **Phrase** : « Teste Speed Car, puis donne-moi l'état du téléphone. »
- **Composants** : `speedcar_test_action`, `phone_status`.
- **Attendu** : `phone.phone_link = connected` ; `phone_status` `verified`, `version 2.1.0`.
- **Résultat observé** : **bloqué**, 12/11/2026, arrêt de préparation à 13:28:52 UTC : APK 2.1.0 non installé, certificat différent de la référence exigée. Aucune nouvelle conversation ChatGPT observée. Preuve du blocage : `10-android-build.json` dans le dossier local de preuves ; les reçus de ce chat Codex concernent l'ancienne application et ne valident pas T1.
- **Preuve à garder** : les deux réponses, sans donnée privée.
- **Si écart** : lire `diagnosis`, `offline_for_s`, `last_close` dans le refus, puis l'écran Speed Car.

### T2. Reprise

- **Précondition** : T1 vérifié.
- **Gestes** : (a) écran éteint 10 min ; (b) mode avion 30 s ; (c) Wi-Fi coupé, donc données mobiles ; (d) redémarrage du téléphone, sans ouvrir Speed Car.
- **Phrase après chaque geste** : « Quel est l'état du téléphone ? »
- **Attendu** : `verified` dès le premier appel pour (a), (b), (c). Pour (d) : `verified` si le démarrage automatique HyperOS est accordé ; sinon `phone_offline` avec une durée, puis `verified` au plus tard 15 min après.
- **Résultat observé** : **non testé**, 12/11/2026 : (a) veille 10 min non testée ; (b) mode avion non testé ; (c) données mobiles non testées ; (d) redémarrage non testé. Recette arrêtée avant T1 par le blocage de signature relevé à 13:28:52 UTC. Aucune preuve de reprise 2.1.0.
- **Si écart sur (a)** : relever `phone.last_sign_of_life_s` et `link.last_drop`.

### T3. Salât Lille au premier plan

- **Précondition** : superposition, accès aux données d'utilisation.
- **Phrase** : « Ouvre Salât Lille. »
- **Composants** : `phone_open_app`.
- **Attendu** : `status verified`, `foreground_observed true`, `package com.amoradvisory.salatlille`. Amor voit l'application.
- **Résultat observé** : **bloqué**, 12/11/2026, arrêt de préparation à 13:28:52 UTC : APK 2.1.0 non installé à cause du certificat différent. Aucune commande d'ouverture de Salât Lille exécutée dans cette recette ; aucune preuve de premier plan. Preuve du blocage : `10-android-build.json`.
- **Si écart** : `executed` avec `likely_cause` → réglage HyperOS « fenêtres en arrière-plan ». `permission_required` → superposition.

### T4. Lire le compte à rebours

- **Précondition** : T3, lecture d'écran activée, Salât Lille cochée.
- **Phrase** : « Ouvre Salât Lille et dis-moi dans combien de temps est la prochaine prière. »
- **Composants** : `phone_open_app_and_read`.
- **Attendu** : `screen_read true`, `lines` contenant le nom de la prière et l'heure ou le compte à rebours ; la réponse parlée reprend ces valeurs.
- **Résultat observé** : **bloqué**, 12/11/2026, arrêt de préparation à 13:28:52 UTC : APK 2.1.0 non installé à cause du certificat différent, T3 non vérifié. Aucune lecture de Salât Lille ni réponse vocale comparée à l'écran. Preuve du blocage : `10-android-build.json`.
- **Contrôle** : comparer la phrase de ChatGPT à l'écran. Toute valeur absente de `lines` est un échec.
- **Si écart** : `lines` vide → l'application expose peut-être son contenu avec retard ; relancer une fois et noter `nodes_scanned`. Texte masqué (`[code masqué]`) → un nombre de 4 à 8 chiffres ou un mot réservé déclenche le filtre de confidentialité : le signaler, ne pas l'affaiblir sans accord.

### T5. Continuité de la voix

- **Précondition** : T4, « Conversations en arrière-plan » activé.
- **Phrase** : celle de T4, puis, Salât Lille toujours devant : « Et la suivante ? »
- **Attendu** : ChatGPT entend et répond sans qu'Amor revienne à ChatGPT.
- **Résultat observé** : **non testé**, 12/11/2026 : T4 bloqué avant installation Android (certificat différent, constat à 13:28:52 UTC). Aucune session vocale ni continuité du micro observée.
- **Si écart** : limite de ChatGPT ou d'Android, hors de portée de Speed Car. Alternative à tester alors : « Sans changer d'écran, que dit la notification de Salât Lille ? » (`phone_get_notifications`, `package_name com.amoradvisory.salatlille`). Noter si la notification porte l'information.

### T6. Brave et musique

- **Précondition** : Brave coché, sessions médias accordées, appui activé.
- **Phrases** : « Ouvre Brave et mets du lofi. » ; « Mets pause. » ; « Reprends. » ; « Reviens à ChatGPT. »
- **Composants** : `phone_open_url`, `phone_get_screen_context` (lignes), `phone_ui_action` (`click`), `phone_media_status`, `phone_media_pause`, `phone_media_play`, `phone_open_app`.
- **Attendu** : lecture annoncée seulement si `playing true` avec un titre ; pause et reprise `verified`.
- **Résultat observé** : **non testé**, 12/11/2026 : recette arrêtée au contrôle de signature à 13:28:52 UTC. Aucune ouverture de Brave, lecture, pause ou reprise exécutée.
- **À consigner** : la valeur `audio_mode` de `phone_status` pendant la conversation vocale ; si la musique baisse ou coupe la voix de ChatGPT (partage du son) ; si Brave publie bien une session média.
- **Si écart** : `call_in_progress` pendant la voix → relever `audio_mode`. Appui refusé `sensitive_target_refused` sur un titre → choisir un autre résultat.

### T7. Bascule de fenêtres

- **Phrases** : « Affiche Maps. » ; « Remets l'application de prière. » ; « Ouvre Brave. » ; « Reviens à ChatGPT. » ; entre chacune : « Qu'est-ce qui est affiché ? »
- **Composants** : `phone_open_app`, `phone_get_foreground_app`.
- **Attendu** : chaque ouverture `verified` ; `phone_get_foreground_app` nomme la bonne application.
- **Résultat observé** : **non testé**, 12/11/2026 : recette arrêtée au contrôle de signature à 13:28:52 UTC. Aucune bascule de fenêtres ni lecture du premier plan exécutée.

### T8. Deux voies, séparément

- **(a) PC éteint, données mobiles** : refaire T1, T3, T4. C'est le test fondamental « sans PC ».
- **(b) PC allumé** : `node tools\windows\redmi-adb.mjs status`, puis `… open-app com.amoradvisory.salatlille --id <uuid>` ; ensuite `go.js "ph start …"` pour comparer.
- **Attendu (b)** : `status verified`, `foreground_package com.amoradvisory.salatlille`.
- **Résultat observé** : **non testé**, 12/11/2026 : (a) PC éteint/données mobiles non testé ; (b) comparaison des ouvertures PC non testée, car T1/T3/T4 restent bloqués après le contrôle de signature à 13:28:52 UTC. Seul `redmi-adb.mjs status` a été exécuté avant changement : Redmi joignable, deux transports du même modèle, aucun lancement d'application. Aucune durée de lancement à comparer ; aucune correction de ph.js effectuée.

### T9. Coupure et reprise sans doublon

- **Geste** : mode avion pendant une commande de volume, retour après 10 s, puis relecture avec le **même** `command_id`.
- **Attendu** : un seul changement de volume ; `phone_command_status` rend le reçu ; échec annoncé comme tel pendant la coupure.
- **Résultat observé** : **non testé**, 12/11/2026 : recette arrêtée au contrôle de signature à 13:28:52 UTC. Aucune coupure ni commande de volume exécutée.

### T10. Simulation de conduite, à l'arrêt

- **Précondition** : téléphone sur son support, PC éteint, données mobiles.
- **Phrases** : navigation, volume, pause, « dans combien de temps la prochaine prière », « reviens à ChatGPT ».
- **Attendu** : aucune réponse ne demande de toucher ou de lire l'écran ; toute action qui l'exigerait est reportée à l'arrêt, et dite.
- **Résultat observé** : **non testé**, 12/11/2026 : recette arrêtée au contrôle de signature à 13:28:52 UTC. Aucune simulation de conduite, aucun test pendant la conduite.

### T11. Micro et session

- **Attendu** : après T4, T6 et T7, la conversation vocale est la même (pas de nouvelle session, pas de micro perdu).
- **Résultat observé** : **non testé**, 12/11/2026 : recette arrêtée au contrôle de signature à 13:28:52 UTC. Aucun essai de micro ou de persistance de session vocale.

### T12. Sécurité

- **Contrôles** : demander un SMS (préparé, non envoyé) ; demander un appui sur « Envoyer » ou « Payer » dans une application cochée (`sensitive_target_refused`) ; demander la lecture d'une application non cochée (`screen_access_not_allowed`) ; décocher « appui » et redemander (`permission_required`).
- **Vérifié hors appareil** : les règles de refus (63 tests JVM, dont les libellés à risque, les éléments sans libellé et l'appel téléphonique).
- **Résultat observé sur l'appareil** : **non testé**, 12/11/2026 : recette arrêtée au contrôle de signature à 13:28:52 UTC. Aucun SMS préparé, aucun appui sensible tenté, aucune application non cochée lue, aucun interrupteur ou droit Android modifié.

## 5. Après la recette

- Remplir « Résultat observé » ci-dessus et l'état « acquis / à faire / impossible » du rapport.
- Pour chaque réussite **observée** seulement : fiche Notion (clé `speedcar-telephone-depuis-chatgpt`), base « Tests et cas d'usage », `journal\RECETTES.md` et note `go.js`.
- Fusionner la branche dans `codex/speed-car-2` uniquement quand T1 à T4 sont vérifiés **et avec l'accord explicite d'Amor**. Aucune fusion lors de la reprise locale bloquée.
