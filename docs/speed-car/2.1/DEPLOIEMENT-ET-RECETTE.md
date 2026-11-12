# Speed Car 2.1.0 : déploiement depuis le PC et recette T1 à T12

Ce document s'adresse à l'agent qui travaille **sur le PC** (Claude Code local ou Codex), avec le Redmi à portée et Amor disponible. Tout se fait **à l'arrêt**. Source : branche `claude/new-session-9tnxsf` du dépôt `Amoradvisory/Claude`.

Règles : aucune autorisation Android accordée par ADB ; aucun secret lu, affiché ou recopié ; ne fermer ni ChatGPT, ni Brave, ni Opera, ni une session d'un autre agent ; pas de boucle de sondage sur le PC à 2 cœurs.

## 1. Avant de toucher à quoi que ce soit

| Étape | Commande | À noter |
|---|---|---|
| Version du relais en ligne | `curl https://<relais>/health` | `2.0.1` : le correctif du 04/11 n'a jamais été déployé. `2.0.2` : il l'a été |
| Version de l'application | `phone_status` depuis ChatGPT, ou écran Speed Car | champ `version` |
| État de l'application sur le téléphone | Regarder l'écran Speed Car | « Connecté au relais », « Connexion en cours », « Connexion arrêtée » ou autre : cela tranche H1 à H4 du rapport |
| Journal de `ph start` du 11/11 | journaux de `go.js` | cela tranche G1 à G4 |

## 2. Déploiement

1. **Relais d'abord.** Il est compatible avec l'application 2.0.1.
   `cd relay && npm ci && npm test && npx tsc --noEmit`, puis le déploiement habituel (`--keep-vars`, mêmes liaisons, aucune migration nouvelle). Relire `/health` : `2.1.0`.
2. **ChatGPT.** Paramètres → Plugins → Speed Car → Gérer l'application → **Actualiser les outils**. Nouvelle conversation : **36 outils**.
3. **Contrôle sans rien installer.** `speedcar_test_action` doit maintenant dire si le téléphone est relié. C'est le premier gain, avant même la nouvelle application.
4. **Application.** `cd android && gradlew testDebugUnitTest lintDebug assembleDebug`, avec la **même clé de signature** que 2.0.1. Installer par-dessus (`-r`), sans désinstaller : l'appairage et les réglages sont conservés. Une autre clé obligerait à désinstaller, donc à tout refaire : ne pas le faire.
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

État de chaque test au 12/11/2026 : **non testé sur l'appareil**. La colonne « Résultat observé » se remplit pendant la recette. Un test n'est « vérifié » qu'après observation ; sinon « échoué », « bloqué » (dire par quoi) ou « non testé ».

### T1. Liaison

- **Précondition** : relais 2.1.0, Speed Car ouvert.
- **Phrase** : « Teste Speed Car, puis donne-moi l'état du téléphone. »
- **Composants** : `speedcar_test_action`, `phone_status`.
- **Attendu** : `phone.phone_link = connected` ; `phone_status` `verified`, `version 2.1.0`.
- **Résultat observé** : non testé.
- **Preuve à garder** : les deux réponses, sans donnée privée.
- **Si écart** : lire `diagnosis`, `offline_for_s`, `last_close` dans le refus, puis l'écran Speed Car.

### T2. Reprise

- **Précondition** : T1 vérifié.
- **Gestes** : (a) écran éteint 10 min ; (b) mode avion 30 s ; (c) Wi-Fi coupé, donc données mobiles ; (d) redémarrage du téléphone, sans ouvrir Speed Car.
- **Phrase après chaque geste** : « Quel est l'état du téléphone ? »
- **Attendu** : `verified` dès le premier appel pour (a), (b), (c). Pour (d) : `verified` si le démarrage automatique HyperOS est accordé ; sinon `phone_offline` avec une durée, puis `verified` au plus tard 15 min après.
- **Résultat observé** : non testé. Noter séparément a, b, c, d.
- **Si écart sur (a)** : relever `phone.last_sign_of_life_s` et `link.last_drop`.

### T3. Salât Lille au premier plan

- **Précondition** : superposition, accès aux données d'utilisation.
- **Phrase** : « Ouvre Salât Lille. »
- **Composants** : `phone_open_app`.
- **Attendu** : `status verified`, `foreground_observed true`, `package com.amoradvisory.salatlille`. Amor voit l'application.
- **Résultat observé** : non testé.
- **Si écart** : `executed` avec `likely_cause` → réglage HyperOS « fenêtres en arrière-plan ». `permission_required` → superposition.

### T4. Lire le compte à rebours

- **Précondition** : T3, lecture d'écran activée, Salât Lille cochée.
- **Phrase** : « Ouvre Salât Lille et dis-moi dans combien de temps est la prochaine prière. »
- **Composants** : `phone_open_app_and_read`.
- **Attendu** : `screen_read true`, `lines` contenant le nom de la prière et l'heure ou le compte à rebours ; la réponse parlée reprend ces valeurs.
- **Résultat observé** : non testé.
- **Contrôle** : comparer la phrase de ChatGPT à l'écran. Toute valeur absente de `lines` est un échec.
- **Si écart** : `lines` vide → l'application expose peut-être son contenu avec retard ; relancer une fois et noter `nodes_scanned`. Texte masqué (`[code masqué]`) → un nombre de 4 à 8 chiffres ou un mot réservé déclenche le filtre de confidentialité : le signaler, ne pas l'affaiblir sans accord.

### T5. Continuité de la voix

- **Précondition** : T4, « Conversations en arrière-plan » activé.
- **Phrase** : celle de T4, puis, Salât Lille toujours devant : « Et la suivante ? »
- **Attendu** : ChatGPT entend et répond sans qu'Amor revienne à ChatGPT.
- **Résultat observé** : non testé.
- **Si écart** : limite de ChatGPT ou d'Android, hors de portée de Speed Car. Alternative à tester alors : « Sans changer d'écran, que dit la notification de Salât Lille ? » (`phone_get_notifications`, `package_name com.amoradvisory.salatlille`). Noter si la notification porte l'information.

### T6. Brave et musique

- **Précondition** : Brave coché, sessions médias accordées, appui activé.
- **Phrases** : « Ouvre Brave et mets du lofi. » ; « Mets pause. » ; « Reprends. » ; « Reviens à ChatGPT. »
- **Composants** : `phone_open_url`, `phone_get_screen_context` (lignes), `phone_ui_action` (`click`), `phone_media_status`, `phone_media_pause`, `phone_media_play`, `phone_open_app`.
- **Attendu** : lecture annoncée seulement si `playing true` avec un titre ; pause et reprise `verified`.
- **Résultat observé** : non testé.
- **À consigner** : la valeur `audio_mode` de `phone_status` pendant la conversation vocale ; si la musique baisse ou coupe la voix de ChatGPT (partage du son) ; si Brave publie bien une session média.
- **Si écart** : `call_in_progress` pendant la voix → relever `audio_mode`. Appui refusé `sensitive_target_refused` sur un titre → choisir un autre résultat.

### T7. Bascule de fenêtres

- **Phrases** : « Affiche Maps. » ; « Remets l'application de prière. » ; « Ouvre Brave. » ; « Reviens à ChatGPT. » ; entre chacune : « Qu'est-ce qui est affiché ? »
- **Composants** : `phone_open_app`, `phone_get_foreground_app`.
- **Attendu** : chaque ouverture `verified` ; `phone_get_foreground_app` nomme la bonne application.
- **Résultat observé** : non testé.

### T8. Deux voies, séparément

- **(a) PC éteint, données mobiles** : refaire T1, T3, T4. C'est le test fondamental « sans PC ».
- **(b) PC allumé** : `node tools\windows\redmi-adb.mjs status`, puis `… open-app com.amoradvisory.salatlille --id <uuid>` ; ensuite `go.js "ph start …"` pour comparer.
- **Attendu (b)** : `status verified`, `foreground_package com.amoradvisory.salatlille`.
- **Résultat observé** : non testé. Tableau à remplir : voie, action, statut, durée.

### T9. Coupure et reprise sans doublon

- **Geste** : mode avion pendant une commande de volume, retour après 10 s, puis relecture avec le **même** `command_id`.
- **Attendu** : un seul changement de volume ; `phone_command_status` rend le reçu ; échec annoncé comme tel pendant la coupure.
- **Résultat observé** : non testé.

### T10. Simulation de conduite, à l'arrêt

- **Précondition** : téléphone sur son support, PC éteint, données mobiles.
- **Phrases** : navigation, volume, pause, « dans combien de temps la prochaine prière », « reviens à ChatGPT ».
- **Attendu** : aucune réponse ne demande de toucher ou de lire l'écran ; toute action qui l'exigerait est reportée à l'arrêt, et dite.
- **Résultat observé** : non testé.

### T11. Micro et session

- **Attendu** : après T4, T6 et T7, la conversation vocale est la même (pas de nouvelle session, pas de micro perdu).
- **Résultat observé** : non testé.

### T12. Sécurité

- **Contrôles** : demander un SMS (préparé, non envoyé) ; demander un appui sur « Envoyer » ou « Payer » dans une application cochée (`sensitive_target_refused`) ; demander la lecture d'une application non cochée (`screen_access_not_allowed`) ; décocher « appui » et redemander (`permission_required`).
- **Vérifié hors appareil** : les règles de refus (63 tests JVM, dont les libellés à risque, les éléments sans libellé et l'appel téléphonique).
- **Résultat observé sur l'appareil** : non testé.

## 5. Après la recette

- Remplir « Résultat observé » ci-dessus et l'état « acquis / à faire / impossible » du rapport.
- Pour chaque réussite **observée** seulement : fiche Notion (clé `speedcar-telephone-depuis-chatgpt`), base « Tests et cas d'usage », `journal\RECETTES.md` et note `go.js`.
- Fusionner la branche dans `codex/speed-car-2` quand T1 à T4 sont vérifiés.
