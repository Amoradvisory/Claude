# Rapport des tests d'acceptation

Mise à jour : 12/10/2026. Version du prompt : v1.

Statuts possibles : **RÉUSSI** (preuve observable jointe) · **PARTIEL** · **ÉCHEC** · **NON TESTÉ**.
« Couvert par la conception » signifie que le prompt prévoit le cas. Ce n'est **pas** une preuve que ChatGPT s'y conforme.

| # | Test | Statut | Couvert par la conception | Preuve attendue (étape du test guidé) |
|---|---|---|---|---|
| 1 | Prix 2 000–4 000 €, bornes incluses | NON TESTÉ | Oui : bornes incluses, vérification annonce par annonce | E1/E3 : aucune annonce hors fourchette |
| 2 | Passage à 1 500–5 000 € sans code | NON TESTÉ | Oui : édition du bloc PROFILS | E4 : ligne « Méthode » mise à jour |
| 3 | Belgique entière puis province/ville | NON TESTÉ | Oui : champ `zone`, aucun reste de Mouscron | Modifier `zone`, puis contrôler les communes des résultats |
| 4 | Peugeot puis une autre marque | NON TESTÉ | Oui : `marques/modèles` | Deux exécutions, marques conformes |
| 5 | Multi-catégories | NON TESTÉ | Oui : P2 générique séparé de P1 | Activer P2 et vérifier qu'il produit des résultats hors voitures |
| 6 | Déduplication | NON TESTÉ | Partiel : ligne « IDS », limite déclarée | E3 : 3 exécutions, aucun doublon ou mention « incertaine » |
| 7 | Analyse avec comparables | NON TESTÉ | Oui : ≥3 comparables avec URL | E3 : ouvrir les URLs des comparables |
| 8 | Aucun comparable | NON TESTÉ | Oui : « estimation impossible » | Profil sur un bien rare, puis vérifier l'absence de prix fabriqué |
| 9 | Prix attractif mais risqué | NON TESTÉ | Oui : risques, questions, règle du verdict | Observation au fil de l'eau |
| 10 | Tâche horaire réelle | NON TESTÉ | – | E3 : présente dans la liste, 3 exécutions horodatées |
| 11 | Notification téléphone (apparition, son, clic) | NON TESTÉ | – | E2 : réception réelle, pas une capture des réglages |
| 12 | Notification e-mail (objet, aperçu) | NON TESTÉ | Objet non maîtrisé ; 1re ligne optimisée | E2 : objet exact relevé |
| 13 | Aucune offre | NON TESTÉ | Oui : « RAS » sur une ligne, sans annonce fictive | E3 : un « RAS » observé, notifié ou non |
| 14 | Site inaccessible / tâche en pause | NON TESTÉ | Oui : « ACCÈS IMPOSSIBLE », procédure de maintenance | Observation, ou tâche mise en pause volontairement |
| 15 | Édition d'un profil sans perte | NON TESTÉ | Oui : seul le bloc PROFILS change, les profils inactifs sont conservés | E4 |
| 16 | Respect de l'accès, aucun coût | PARTIEL | Oui : interdictions explicites ; aucun code de collecte n'existe ; aucun coût engagé | Reste à lire les conditions de 2ememain (non vérifiées) |
| 17 | Parcours novice | NON TESTÉ | Oui : [MANUEL.md](MANUEL.md) | Tu changes budget, marque et région seul, en suivant le manuel |

## Ce qui est établi aujourd'hui

- Aucun code de collecte, serveur ou robot n'a été créé. C'est vérifiable dans ce dépôt, qui ne contient que de la documentation.
- Aucune dépense ni aucun abonnement n'a été engagé.
- Les exemples (Peugeot 308 SW, Mons, 3 250 €) sont marqués **fictifs** partout.

## Verdict global

**PROTOTYPE**. Le parcours « filtres, recherche, analyse, résultat, notification, annonce ouverte » n'est pas encore démontré. Prochaine étape : [TEST-FAISABILITE.md](TEST-FAISABILITE.md).
