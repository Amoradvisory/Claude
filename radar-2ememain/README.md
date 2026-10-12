# Radar 2ememain Belgique

Un outil personnel pour repérer les bonnes occasions sur 2ememain. Il fonctionne avec **une seule tâche ChatGPT planifiée toutes les heures**. Il n'y a ni serveur, ni robot de collecte, ni application à héberger.

## État au 12/10/2026 : PROTOTYPE v2, porte de faisabilité NON TESTÉE

Rien n'a encore tourné en conditions réelles. Nouveauté : j'ai maintenant accès en lecture à la boîte **enseignant.be@gmail.com**. Je peux donc **vérifier moi-même** deux maillons de la chaîne : les e-mails d'alerte de 2ememain et les e-mails envoyés par la tâche ChatGPT.

## La solution en 10 lignes (v2)

1. **Source recommandée : les alertes officielles de 2ememain.** Tu enregistres une recherche dans l'appli 2ememain (Belgique, 2 000 à 4 000 €, etc.) avec alerte par e-mail. C'est 2ememain lui-même qui filtre, détecte les nouveautés et fournit les liens directs. Aucune collecte de notre part.
2. **Analyse : une tâche ChatGPT classique, toutes les heures.** Elle lit dans Gmail les alertes 2ememain reçues depuis l'exécution précédente, ouvre chaque annonce, cherche des comparables, rend un verdict et te notifie.
3. Si la tâche n'arrive pas à lire Gmail, elle bascule sur sa recherche web (voie v1). Elle le signale alors dans sa ligne « Méthode ».
4. Tes critères vivent à deux endroits, chacun avec un rôle clair : le **filtre** dans la recherche sauvegardée 2ememain, l'**évaluation** dans le bloc PROFILS de la tâche.
5. La **1re ligne** du résultat est rédigée pour l'aperçu de notification : « Objet | Commune (Province) | Prix | Verdict | Confiance ».
6. Le « déjà vu » est naturel : un e-mail d'alerte n'est traité qu'une fois, sur sa fenêtre horaire. La ligne « IDS » reste un filet de sécurité.
7. **Points à prouver** :
   - 2ememain envoie-t-il bien ces e-mails, avec quel contenu ?
   - La tâche ChatGPT peut-elle lire Gmail sans toi devant l'écran ? Un utilisateur signale une panne du connecteur dans ce cas.
   - Une réponse « RAS » reste-t-elle silencieuse ?
   - Que montre réellement la notification ?
8. **Fréquence réelle** : une annonce publiée peut attendre jusqu'à environ 1 h (cadence de la tâche) plus le délai d'envoi de l'e-mail par 2ememain. Si tu veux être prévenu plus vite, active aussi la notification push de l'appli 2ememain : c'est une fonction du site, pas un mécanisme que nous construisons.
9. **Pas de panneau Web, pas de script sur ton PC.** L'interface interne de 2dehands utilisée par le prototype Mouscron (le « LRP » mentionné dans ta Mémoire) n'est pas documentée : je ne la réutilise pas sans ta décision explicite.
10. **Ta prochaine action** : les étapes E0, E1 et E2 de [TEST-FAISABILITE.md](TEST-FAISABILITE.md) (environ 15 min). Dis-moi ensuite « vérifie », et je contrôle les e-mails dans Gmail moi-même.

## Fichiers

| Fichier | Contenu | Livrable |
|---|---|---|
| [DIAGNOSTIC.md](DIAGNOSTIC.md) | Ce qui est vérifié ou non, les trois voies comparées, le registre des décisions | A, G |
| [TEST-FAISABILITE.md](TEST-FAISABILITE.md) | Protocole guidé, critères VERT/ORANGE/ROUGE, fiche à remplir | B |
| [PROMPT-TACHE.md](PROMPT-TACHE.md) | Le texte de la tâche, à copier-coller, avec un profil auto et un profil générique | C |
| [MANUEL.md](MANUEL.md) | Changer les filtres, mettre en pause, lire une alerte, maintenance | E, H |
| [RAPPORT-TESTS.md](RAPPORT-TESTS.md) | Les 17 tests d'acceptation et leur statut réel | F |
| [INSTRUCTION-CODEX.md](INSTRUCTION-CODEX.md) | Instruction autonome pour que Codex fasse la mise en service depuis ton PC (Opera), sans identifiants ni automatisation Codex | B |

- **Livrable D (panneau)** : volontairement pas construit.
- **Livrable I (Mémoire Multi-Agents)** : j'ai lu la mission `url-2emain` (révision 2), mais je n'y écris pas. Je n'ai pas accès à sa passerelle, et ses fichiers ne doivent jamais être modifiés directement. Un texte de relais est prêt à la fin de [DIAGNOSTIC.md](DIAGNOSTIC.md), pour que ChatGPT l'enregistre avec sa compétence « memoire-multi-agents ».
