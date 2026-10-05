# Brave comme navigateur principal du pilotage : dossier technique

État au 05/10/2026. Ce dossier est préparé depuis une session Claude dans le cloud, **sans accès au PC**.
Tout ce qui suit a été vérifié sur un Chromium 141 de test avec Playwright 1.56. Rien n'a encore été validé sur le Brave ni sur l'Opera d'Amor.
La décision Brave/Opera reste **ouverte** tant que les mesures sur le PC (§5) n'ont pas été faites.

## 1. Ce qu'on sait déjà (mémoire de la session locale, 01–04/10)

- **browserd** tient une connexion Playwright/CDP persistante vers Opera (`--remote-debugging-port=9222`). Temps par commande : 0,4–0,6 s par browserd, 0,04 s par `bd`.
- **Ce qui ralentit ChatGPT** : 3 à 8 s **par appel d'outil** (chaîne Remote Desktop Commander), contre 0,04 à 0,9 s d'exécution réelle. Le levier est donc le **nombre d'appels**, pas la vitesse du navigateur. C'est ce qu'a donné `go.js` (une phrase = un appel).
- **Brave d'Amor** : CDP impossible par `--remote-debugging-port` sur le profil par défaut (règle Chromium ≥ 136). Une copie du profil perd les connexions, et copier les cookies est de toute façon exclu.
  Claude pilote déjà Brave par l'extension Claude in Chrome, mais ce chemin est réservé à Claude, pas à ChatGPT.

Conséquence pour la comparaison : une commande ne sera jamais nettement plus rapide dans Brave. Brave ne peut gagner que sur trois points :
- **moins d'interventions humaines** (comptes déjà connectés, sessions entretenues par l'usage quotidien d'Amor) ;
- **moins d'appels** (pas de détour par une connexion) ;
- **une reprise en main plus facile** (l'onglet de travail est dans le navigateur d'Amor).

## 2. Le seul chemin d'attache réaliste au profil réel de Brave

Brave ≥ 1.8x (Chromium ≥ 144) propose `brave://inspect/#remote-debugging`. Cet interrupteur active le débogage du navigateur **en cours d'exécution, sur le profil habituel**, et écrit `DevToolsActivePort` dans `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data`.
- **À chaque nouvelle connexion WebSocket**, Brave affiche « Autoriser le débogage à distance ? » : il faut un clic humain.
  Avec une connexion persistante, cela fait **un clic par démarrage** du pilote ou de Brave.
- Tant qu'un pilote est connecté, Brave affiche le bandeau « contrôlé par un logiciel de test automatisé ».
- Les points d'entrée HTTP `/json/*` ne sont pas garantis dans ce mode. Il faut lire `DevToolsActivePort` (port et chemin ws).
- **À vérifier sur le PC :** version de Brave, présence de l'interrupteur, persistance du réglage après redémarrage, comportement exact du dialogue.

Pistes écartées :
- relancer Brave avec `--remote-debugging-port` : refusé sur le profil par défaut ;
- copier le profil : déconnecte, et copie des secrets ;
- extension maison `chrome.debugger` : faisable, mais demande le mode développeur, un relais complet et la maintenance d'une extension. C'est le plan B, si l'interrupteur n'existe pas.
- valider le dialogue d'autorisation par deskd : ce serait contourner une protection d'authentification. Interdit sans accord explicite d'Amor.

## 3. Audit : brancher le browserd actuel (Playwright) sur le Brave d'Amor serait nocif

Reproductible avec `tests/audit-playwright-brut.js` (Chromium 141, Playwright 1.56.1, mode graphique sous Xvfb). Un client CDP brut joue Amor, Playwright joue browserd.

| Effet sur les onglets d'Amor | Playwright brut (`connectOverCDP`) | Avec parades |
|---|---|---|
| Téléchargement lancé par Amor | **détourné** vers `%TEMP%\playwright-artifacts-*\<guid>` (nom perdu, dossier temporaire) | arrive dans Téléchargements, sous son nom |
| `confirm()` dans un onglet d'Amor | **refusé automatiquement** (< 2 s) | laissé à Amor |
| « Quitter la page ? » (texte non enregistré) | **accepté automatiquement** : page quittée, texte perdu | laissé à Amor |
| Une alerte ouverte dans un onglet d'Amor au moment du branchement | **branchement impossible** (délai dépassé) | sans effet (garde) |
| Émulation du focus, `Network.enable`, scripts d'init | appliqués à **tous** les onglets d'Amor | onglets de travail seulement (garde) |

Lecture du code Playwright 1.56 :
- `connectOverCDP` force `acceptDownloads: 'accept'`, puis `Browser.setDownloadBehavior({behavior:'allowAndName', downloadPath: artifactsDir})` sur le **contexte par défaut**, c'est-à-dire le profil entier.
- Le `DialogManager` ferme tout dialogue sans gestionnaire : `beforeunload` est accepté, les autres sont refusés.
- `Target.setAutoAttach` est appliqué à tout le navigateur.

Le browserd actuel ajoute son propre `Browser.setDownloadBehavior` et son auto-rejet des dialogues. **Sur Opera (navigateur réservé à l'agent), tout cela est sans conséquence. Sur Brave, c'est inacceptable sans garde.**

## 4. La réponse : `cdpguard.js`, un garde CDP entre browserd et Brave

browserd se connecte au garde comme à un navigateur, par `BROWSERD_CDP=http://127.0.0.1:9224`. Le garde tient **une seule** connexion vers Brave, donc un seul clic d'autorisation. Il ne montre au pilote que les **onglets de travail** :
- onglets créés par le pilote, ouverts **en arrière-plan** (l'onglet actif d'Amor ne change pas) ;
- fenêtres surgissantes ouvertes par ces onglets ;
- onglets **prêtés** par Amor (`/guard/adopt?targetId=…`), puis rendus (`/guard/release`).

Ce qu'il bloque ou neutralise :
- `Browser.setDownloadBehavior` du pilote n'est jamais appliqué au profil. Les téléchargements du pilote sont suivis par événements et copiés dans `GUARD_DL_DIR`.
- Refusés : fermeture du navigateur, lecture, écriture et effacement des cookies, modification des permissions, attache à un onglet non attribué, et tout appel niveau navigateur hors liste blanche.
- Accès aux onglets d'Amor :
  - `/guard/tabs` liste ses onglets (titre et domaine seulement), pour « prends l'onglet X » ;
  - `/guard/status` donne l'état : connexion, attente d'autorisation, onglets de travail, téléchargements.
- Coordination entre agents : `/guard/lease?targetId=…&agent=chatgpt&ttl=120`. Un second agent reçoit 409 tant que le bail court.
- Reconnexion : les onglets de travail survivent à une déconnexion du pilote et sont retrouvés au branchement suivant.

Recette (`tests/test-cdpguard.js`) : **22/22 en mode graphique (3 fois), 20/20 sans affichage**. Les vérifications :
- branchement malgré une alerte ouverte chez Amor ;
- onglets d'Amor invisibles ;
- saisie, clic et lecture vérifiés ;
- dialogues d'Amor intacts ;
- téléchargements séparés ;
- refus des cookies et de la fermeture ;
- fenêtres surgissantes ;
- prêt et restitution d'onglet ;
- baux ;
- reconnexion ;
- aucun secret dans le journal.

Surcoût mesuré : **≈ 0,5 ms par commande** (2,4 contre 1,9 ms), négligeable devant 3 à 8 s par appel ChatGPT.

## 5. Plan sur le PC (à exécuter par une session Claude **locale**)

| Phase | Contenu | Modifie le système ? |
|---|---|---|
| 1. Faits | MEMO-PC, sources browserd/bd/go/browserctl/superviseur, tâches, processus, ports, versions Brave et Opera, profil Brave habituel, `tool-history.jsonl` (appels, rafales, incidents de connexion), sauvegardes | non, sauvegardes seulement |
| 2. Attache | Brave ≥ 144 ? Activer `brave://inspect/#remote-debugging` ; lancer `cdpguard` (port 9224) ; un clic « Autoriser » d'Amor ; recette `test-cdpguard` adaptée **avec un site d'essai local**, sans toucher aux onglets d'Amor | réglage Brave réversible |
| 3. Comptes | `node etat-comptes.js http://127.0.0.1:9222` (Opera) contre `…:9224` (Brave), lecture seule, 3 répétitions | non |
| 4. Banc | Mêmes scénarios via browserd → Opera, puis browserd → garde → Brave, 10 répétitions chacun. Puis 3 scénarios rejoués **par ChatGPT via RDC**, comptés dans `tool-history.jsonl` | browserd en 2e instance (port distinct), Opera reste en service |
| 5. Décision | Selon les règles du §6. Migration, routage ciblé ou statu quo | selon décision |

Les scénarios du banc :
1. Lecture structurée, puis clic et saisie vérifiés, sur une page d'essai locale.
2. Navigation dynamique, nouvel onglet et téléchargement contrôlé.
3. Service connecté :
   - en lecture : retrouver un élément précis dans Gmail ou Drive ;
   - en écriture : uniquement un brouillon ou une page d'essai Notion, **jamais d'envoi**.
4. Panne : redémarrage de browserd, puis du garde, puis fermeture et réouverture de Brave. On compte les clics humains.
5. Coexistence : Amor tape dans un onglet pendant que l'agent travaille. On note le vol de focus, les dialogues et les téléchargements.

À relever pour chaque essai :
- temps total ;
- appels d'outils ;
- actions vérifiées ;
- échecs ;
- reprises ;
- **interventions humaines** ;
- perturbations.

## 6. Règles de décision, fixées **avant** les mesures

Brave devient principal seulement si **toutes** les conditions suivantes sont réunies :
1. L'attache au profil réel fonctionne sur le PC, avec en moyenne **au plus un clic d'autorisation par jour**.
   Quand personne ne peut cliquer, il existe un repli automatique vers Opera.
2. La recette de sécurité passe sur le vrai Brave : aucun téléchargement détourné, aucun dialogue d'Amor touché, cookies inaccessibles.
3. La fiabilité est au moins égale à Opera : taux de réussite par scénario ≥ Opera − 2 points sur au moins 10 répétitions, sans nouveau mode de panne bloquant.
4. Le gain est réel. Il faut les deux :
   - des services d'usage hebdomadaire connectés dans Brave et pas dans Opera, **et dont la connexion dans Opera ne tient pas** (une connexion unique dans Opera coûte moins qu'une migration) ;
   - sur le scénario « service connecté » rejoué par ChatGPT, **≥ 20 % de temps ou d'appels en moins**, ou au moins une intervention humaine évitée par tâche, sans régression ailleurs.

Si seul le point 4 est acquis, pour certains services : **routage ciblé**. browserd reste sur Opera par défaut, et une seconde instance (`BROWSERD_CDP=http://127.0.0.1:9224`) sert les tâches liées aux comptes. On ne le fait que si le gain dépasse la complexité ajoutée.

Sinon : **Opera reste principal**. Le garde reste disponible pour un usage ponctuel.

## 7. Retour à Opera (avant toute modification)

- Sauvegardes horodatées dans `C:\ChatGPT-Agent\backups\brave-eval-2026-10-05\`, avec `SHA256SUMS.txt`.
- Retour : `BROWSERD_CDP=http://127.0.0.1:9222`, recopie des fichiers sauvegardés, redémarrage de la tâche `ChatGPT-Agent-Demarrage`, puis désactivation de `brave://inspect/#remote-debugging`.
- Le garde n'est jamais nécessaire au fonctionnement d'Opera : on l'arrête et on le supprime sans effet de bord.

## Fichiers

| Fichier | Rôle |
|---|---|
| `cdpguard.js` | le garde, sans autre dépendance que `playwright-core` (déjà présent pour browserd) |
| `etat-comptes.js` | services déjà connectés dans un navigateur donné, en lecture seule |
| `tests/test-cdpguard.js` | recette du garde |
| `tests/audit-playwright-brut.js` | démonstration des effets de bord de Playwright brut |
| `MISSION-LOCALE.md` | consigne prête à coller dans une session Claude locale sur le PC |
