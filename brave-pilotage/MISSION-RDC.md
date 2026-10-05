# Mission pour une session Claude équipée du connecteur Remote Desktop Commander

Cette session agit sur le PC d'Amor par le même chemin que ChatGPT : le connecteur `https://mcp.desktopcommander.app/mcp`. Côté PC, ce connecteur aboutit à Desktop Commander 0.2.51 en mode `remote`, supervisé par `C:\ChatGPT-Agent\autostart\superviseur.js`.
Le mandat d'Amor du 05/10/2026 s'applique en entier. Il est recopié dans `MANDAT.md`, à côté de ce fichier.

## 0. Vérifier l'accès réel (rien n'est supposé)
1. Lister les outils Remote Desktop Commander effectivement présents dans la session (start_process, read_file, etc.).
2. Premier appel : `node C:\ChatGPT-Agent\go.js etat`. Puis lire en entier `C:\ChatGPT-Agent\MEMO-PC.md`.
3. Noter dans `C:\ChatGPT-Agent\brave-eval\01-faits.md` :
   - ce que la session peut lire, exécuter, ou seulement transmettre ;
   - le temps par appel côté session.

**Règles d'emploi de Desktop Commander, tirées des pièges déjà connus :**
- appeler `node` directement, jamais un `.cmd` ;
- ne jamais relancer Desktop Commander ni utiliser `npx` (risque de couper l'accès) ;
- ne jamais fixer `--max-old-space-size` ;
- un statut `indeterminate` ne se rejoue jamais : on réobserve d'abord.

## 1. Faits (lecture seule) et sauvegardes
Voir `LISEZMOI.md` §5, phase 1, et `MISSION-LOCALE.md`.
Sauvegarder dans `C:\ChatGPT-Agent\backups\brave-eval-2026-10-05\`, avec SHA256, **avant** toute modification.

## 2. Installer le code préparé
Via start_process :
```
git clone --depth 1 -b claude/tender-ptolemy-bans17 https://github.com/Amoradvisory/Claude C:\ChatGPT-Agent\brave-eval\code
```
Si git est absent, écrire les fichiers par l'outil d'écriture de Desktop Commander.
Lancer ensuite la recette du garde sur un Chrome jetable du PC (`CHROME=…chrome.exe`), jamais sur Brave.

## 3. Brave : attache au profil réel
1. Version de Brave et de Chromium. L'interrupteur `brave://inspect/#remote-debugging` existe-t-il ?
2. Activer l'interrupteur. Cette activation est autorisée par le mandat. Si Amor est absent, deskd peut cliquer l'interrupteur dans un onglet ouvert pour cela, puis fermer cet onglet.
3. Lancer `cdpguard.js` (port 9224) sous le superviseur. Brave demande « Autoriser le débogage à distance ? ».
   - **Ne pas faire valider ce dialogue par deskd.**
   - Grouper la demande pour Amor : un clic, une fois par démarrage du garde ou de Brave.
   - Ne proposer la validation automatique que si Amor l'accepte explicitement, en connaissant le risque : n'importe quel programme local pourrait alors obtenir le même accès.
4. Lancer la recette sur le vrai Brave, avec un site d'essai local. Contrôler : téléchargements d'Amor intacts, dialogues d'Amor intacts, cookies refusés, onglets d'Amor invisibles.

## 4. Mesurer le vrai gain
- `node etat-comptes.js http://127.0.0.1:9222`, puis `…:9224`, avec `--repet=3` : services connectés dans Opera et dans Brave.
- Banc : browserd vers Opera, contre une 2e instance de browserd vers le garde puis Brave. Mêmes scénarios, 10 répétitions (voir `LISEZMOI.md` §5).
- **Chaîne complète à distance** : cette session est elle-même un client distant de Desktop Commander. Rejouer au moins 3 scénarios **formulés en langage ordinaire** et chronométrer de bout en bout. Relever : appels, statuts `verified`, échecs, reprises, interventions humaines.
- Recouper avec `~\.claude-server-commander\tool-history.jsonl` pour comparer avec les appels de ChatGPT des derniers jours. Compter : appels par tâche, et tâches bloquées par une connexion ou une autorisation.

## 5. Améliorations indépendantes du navigateur, si elles sont prouvées utiles
- **Journal de tâches** pour l'usage à distance (`go.js tache …`) :
  - une demande reçoit un identifiant et une trace : étapes, statut `verified`, `failed` ou `inconnu`, preuve (titre, URL, extrait, capture) ;
  - après une coupure, `go.js tache etat <id>` dit ce qui est fait avant tout nouvel essai.
- **Intentions** : vérifier que les compétences de `go.js` couvrent les demandes ordinaires d'Amor sans sélecteur. Ajouter seulement celles qui reviennent dans l'historique.

## 6. Décider et terminer
Appliquer les règles de `LISEZMOI.md` §6, fixées avant les mesures.
- **En cas de migration ou de routage ciblé** : superviseur et redémarrage, reconnexion, retour à Opera testé, MEMO-PC.md et docs mis à jour, paragraphe prêt à remplacer dans les instructions personnalisées de ChatGPT.
- **Sinon** : Opera reste principal, et les améliorations prouvées sont conservées.

Livrables :
- `C:\ChatGPT-Agent\brave-eval\PREUVES.md` ;
- un compte rendu court pour Amor : accès réel, ce qui marche à distance, améliorations, preuves du gain, limites.
