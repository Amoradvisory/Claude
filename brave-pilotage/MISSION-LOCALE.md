# Consigne à coller dans une session Claude locale sur le PC

> Colle ce bloc, puis le mandat d'Amor « Brave navigateur principal » du 05/10/2026, dans une session Claude Code qui tourne **sur le PC**.

---

Mission : déterminer si Brave doit devenir le navigateur principal de ChatGPT et des agents du système de pilotage (browserd, bd.js, go.js, deskd). Si oui, faire la bascule. Le mandat d'Amor suit ce bloc et prime sur tout le reste.

Une session cloud a déjà préparé et testé le code et l'audit. Récupère-les sans toucher au reste :
```
git clone --depth 1 -b claude/tender-ptolemy-bans17 https://github.com/Amoradvisory/Claude C:\ChatGPT-Agent\brave-eval\code
```
Lis `C:\ChatGPT-Agent\brave-eval\code\brave-pilotage\LISEZMOI.md`. Il contient :
- l'audit des effets de bord de Playwright sur un navigateur personnel ;
- le garde `cdpguard.js` ;
- l'outil `etat-comptes.js` ;
- le plan en 5 phases ;
- les règles de décision fixées d'avance ;
- la procédure de retour à Opera.

Règles fermes :
- Sauvegarde dans `C:\ChatGPT-Agent\backups\brave-eval-2026-10-05\`, avec SHA256, **avant** toute modification. Prépare le retour à Opera.
- Ne branche **jamais** browserd ni Playwright directement sur le Brave d'Amor : passe toujours par `cdpguard` (port 9224).
- Ne termine pas les processus Brave en bloc. Si une relance est indispensable, demande à Amor de fermer Brave lui-même, ou ferme par la fenêtre principale, puis vérifie la restauration des onglets.
- Aucune lecture, copie ni journalisation de cookies, mots de passe ou jetons.
- Aucun envoi réel, achat ni modification de documents personnels. Écritures seulement dans un espace d'essai : brouillon jamais envoyé, page Notion d'essai.
- Le dialogue « Autoriser le débogage à distance ? » de Brave se valide **à la main par Amor**. Ne l'automatise pas.

Déroulé :
1. **Faits** : MEMO-PC.md, sources, tâches planifiées, processus et ports, versions de Brave et d'Opera, profil Brave habituel (Local State), `tool-history.jsonl`. Rédige `C:\ChatGPT-Agent\brave-eval\01-faits.md`.
2. **Attache**. Si Brave est basé sur Chromium ≥ 144 :
   - fais activer `brave://inspect/#remote-debugging` (1 clic d'Amor) ;
   - lance `set GUARD_PW_CORE=<chemin browserd>\node_modules\playwright-core` puis `node cdpguard.js` ;
   - fais valider l'autorisation par Amor ;
   - adapte la recette `tests\test-cdpguard.js` au vrai Brave : site d'essai local, onglets d'Amor seulement observés.
   Si l'interrupteur n'existe pas, documente le blocage, puis passe au plan B (extension `chrome.debugger`) seulement si le reste du dossier montre un gain probable.
3. **Comptes** : lance `node etat-comptes.js http://127.0.0.1:9222`, puis `…:9224`, avec `--repet=3`.
4. **Banc équitable** : browserd vers Opera, contre une 2e instance de browserd vers le garde puis Brave. 10 répétitions par scénario. Ensuite, 3 scénarios rejoués par ChatGPT via Remote Desktop Commander, comptés dans `tool-history.jsonl`.
5. **Décision** selon les règles du §6 de `LISEZMOI.md` :
   - migration : documents opérationnels mis à jour et paragraphe prêt à remplacer dans les instructions de ChatGPT ;
   - routage ciblé ;
   - ou maintien d'Opera.
   Écris les preuves détaillées dans `C:\ChatGPT-Agent\brave-eval\PREUVES.md`, puis un compte rendu court pour Amor.
