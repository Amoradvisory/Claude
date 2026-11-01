# Speed Car — Consigne pour Codex : premier test vocal réel

## Objectif

Prouver ce qui n'a jamais été testé : une phrase dite à **ChatGPT en mode vocal sur le Redmi** produit la bonne action sur le téléphone. Conditions : données mobiles, PC hors du trajet. Mesurer le temps réel.

## Limite à respecter

Codex ne peut pas parler dans le téléphone. **Les phrases sont dites par l'utilisateur**, voiture à l'arrêt. Codex prépare le test, lit les journaux du relais et écrit le rapport. Le PC ne doit jamais être dans le trajet de la commande : pas d'ADB, pas de Tailscale, aucun droit accordé par ADB.

## 1. Préparation (Codex, avant le test)

1. Vérifier que le relais répond (`/health`) et noter l'heure exacte du serveur.
2. Avec le client de diagnostic MCP, appeler `phone_status`. Il faut obtenir : téléphone connecté, superposition autorisée, accès aux données d'utilisation autorisé. Si le téléphone est hors ligne ou qu'une autorisation manque, donner à l'utilisateur la liste exacte de ce qu'il doit activer, puis s'arrêter là.
3. Envoyer à l'utilisateur cette liste à vérifier sur le téléphone :
   - Wi-Fi coupé, données mobiles actives, VPN/Tailscale coupé sur le téléphone ;
   - Speed Car affiche « Connecté au relais » ;
   - autorisation Xiaomi « pop-up en arrière-plan » activée pour Speed Car ;
   - ChatGPT → Voix → « Conversations en arrière-plan » activé ;
   - nouvelle conversation ChatGPT, avec l'application Speed Car disponible ;
   - enregistreur d'écran HyperOS lancé **avec le micro** (il sert de chronomètre).
4. Relever le volume média de départ, puis demander à l'utilisateur de **fermer Brave**.

## 2. Déroulé (l'utilisateur parle, Codex ne touche à rien)

Le PC peut rester allumé, mais Codex n'envoie aucune commande pendant toute la série.

| N° | Phrase dite en mode vocal | Résultat attendu |
|---|---|---|
| 1 à 5 | « Augmente le volume » (attendre la réponse entre deux essais) | +1 cran sur le volume média, valeur relue, phrase courte |
| 6 à 10 | « Mets YouTube » (fermer Brave avant les essais 6 et 8) | YouTube s'ouvre dans Brave, **jamais l'application YouTube** |
| 11 | L'utilisateur appuie sur **Arrêter** dans Speed Car, puis dit « Augmente le volume » | ChatGPT annonce tout de suite que le téléphone est hors ligne, sans réessayer en boucle |

Après l'essai 11, l'utilisateur appuie sur **Activer Speed Car** et Codex restaure le volume de départ.

## 3. Ce que Codex relève pour chaque essai

- ChatGPT a-t-il appelé un outil Speed Car ? Lequel ? (journal du relais)
- ChatGPT a-t-il demandé une **confirmation** avant d'agir ? Peut-elle être mémorisée ?
- Le statut du reçu (`verified`, `executed_unverified`, `phone_offline`…), avec l'identifiant de commande.
- La valeur réelle obtenue : volume avant/après ; application au premier plan (Brave ou YouTube).
- La phrase exacte dite par ChatGPT, et si elle correspond au reçu.
- Les temps, à partir de la vidéo et des journaux :
  - `T0` : fin de la phrase de l'utilisateur ;
  - `t1` : réception par le relais ;
  - `t7` : résultat renvoyé à ChatGPT ;
  - `Tconf` : début de la réponse parlée.
  - Calculer : délai ChatGPT avant l'appel (`t1 − T0`), délai Speed Car (`t7 − t1`), délai de réponse (`Tconf − t7`) et délai total ressenti (`Tconf − T0`).

## 4. Rapport attendu

Fichier `docs/speed-car/2.0/TEST-VOCAL-<date>.md` :

- un tableau des 11 essais, avec la médiane et le pire temps pour chaque action ;
- un verdict séparé pour chaque action : **VÉRIFIÉ EN VOIX**, **PARTIEL** ou **ÉCHEC** ;
- en cas d'échec, une cause choisie parmi : ChatGPT n'appelle pas l'outil / consentement OAuth / confirmation imposée / téléphone hors ligne / Android refuse le lancement / mauvaise application ouverte / autre ;
- aucune action déclarée validée si elle n'a pas été observée dans ce test.

## 5. Ensuite, seulement si le test réussit

1. Mesurer si une version « conduite », avec moins d'outils, fait répondre ChatGPT plus vite en voix : volume, médias, YouTube/Brave, ouvrir une app, Maps.
2. Plafonner l'attente entre deux tentatives de reconnexion à environ 5 s en mode conduite (aujourd'hui elle peut monter jusqu'à 60 s).
3. Quand la superposition est coupée, afficher une alerte bien visible dans Speed Car (elle peut sauter après une mise à jour).
