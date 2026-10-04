# Dossier « vols » : Tunis, octobre 2026

**À ouvrir en premier : `Vols_Tunis_Octobre_2026.html`** (double-clic, fonctionne sans Internet) ou `Vols_Tunis_Octobre_2026.pdf`.

## Contenu

| Fichier | Rôle |
|---|---|
| `Vols_Tunis_Octobre_2026.html` | Résultat visuel : meilleur choix, n°2, n°3, comparaison, fiabilité |
| `Vols_Tunis_Octobre_2026.pdf` | Même résultat, paginé (page 1 : l'essentiel) |
| `RESULTAT.md` | Résultat le plus récent, en texte (les versions précédentes vont dans `historique/`) |
| `prix_observes.csv` | Toutes les offres observées, une ligne par offre et par recherche (séparateur `;`, s'ouvre dans Excel) |
| `sources.md` | Chaque source, ce qui en a été tiré, et les limites d'accès |
| `historique/` | Un instantané daté par recherche (`AAAA-MM-JJ_recherche.md`) |
| `captures/` | Preuves de prix (aucune pour le 04/10/2026 : accès bloqué, voir `captures/LISEZMOI.md`) |
| `tests_rendu/` | Captures des tests d'affichage et rapport `rapport.json` |
| `donnees/resultats.json` | **Source de vérité** : tous les livrables sont générés à partir de ce fichier |
| `donnees/aeroports.csv` | Aéroports à 150 km ou moins de Lille, distances et dessertes |
| `outils/` | Scripts de génération et de test |

## Mettre le dossier sur le Bureau Windows

La recherche a tourné dans un environnement cloud, sans accès au PC. Pour récupérer le dossier :
1. Sur GitHub, ouvrir le dépôt `amoradvisory/claude`, branche `claude/tunis-cheapest-flight-oct-2026-uxi6qb`.
2. **Code → Download ZIP**, puis extraire le dossier `vols` sur le Bureau.

## Relancer ou mettre à jour

1. Dans `donnees/resultats.json`, donner une **nouvelle** `recherche_id` (ex. `2026-10-07_recherche`) et une nouvelle
   `date_recherche`, puis mettre à jour les offres (prix, statut `VÉRIFIÉ` / `OBSERVÉ` / `ESTIMÉ`…).
2. `python3 outils/construire.py` : régénère le HTML, `RESULTAT.md` et l'instantané daté, et ajoute les lignes de la
   nouvelle recherche au CSV. Les recherches précédentes ne sont jamais modifiées : leurs lignes CSV sont conservées,
   l'ancien `RESULTAT.md` est archivé dans `historique/`, et chaque recherche garde son instantané.
   Le classement est **calculé** : prix final le plus bas parmi les offres avec bagage en soute d'au moins 20 kg garanti,
   au départ d'un aéroport à 150 km ou moins, au statut `VÉRIFIÉ` ou `OBSERVÉ` (jamais `ESTIMÉ`), aller et retour du 4 au 31/10.
3. `node outils/generer_pdf.cjs` : régénère le PDF.
4. `node outils/tester_rendu.cjs` : tests d'affichage (erreurs JS, TOP 3, liens, débordements, mobile, mode sombre).

Prérequis : Python 3 et Node.js avec Playwright (Chromium).
