# Radar 2ememain Belgique

Un outil personnel pour repérer les bonnes occasions sur 2ememain. Il fonctionne avec **une seule tâche ChatGPT planifiée toutes les heures**. Il n'y a ni serveur, ni robot de collecte, ni application à héberger.

## État au 12/10/2026 : PROTOTYPE, porte de faisabilité NON TESTÉE

Rien n'a encore tourné en conditions réelles. Le test de bout en bout doit se faire dans **ton** ChatGPT et sur **ton** téléphone. Depuis mon environnement, je n'ai accès ni à l'un ni à l'autre, et 2ememain y est bloqué par la politique réseau (détails dans [DIAGNOSTIC.md](DIAGNOSTIC.md)).

## La solution en 10 lignes

1. **Niveau A uniquement** : une tâche ChatGPT classique, horaire, titrée « Radar 2ememain Belgique ».
2. Ses consignes contiennent un bloc **PROFILS** lisible. Tu changes un prix, une marque ou une région en modifiant ce texte, sans code.
3. À chaque exécution, ChatGPT cherche sur 2ememain, garde les nouveautés, les analyse avec des comparables cités par URL et classe chaque annonce par un verdict.
4. La **1re ligne** du résultat est rédigée pour l'aperçu de notification : « Objet | Commune (Province) | Prix | Verdict | Confiance ».
5. Quand il n'y a rien, ChatGPT répond « RAS » en une ligne. Le silence total reste à prouver, voir le test E3.
6. La déduplication s'appuie sur une ligne « IDS: … » en fin de résultat. Elle n'est fiable que si la tâche relit ses exécutions précédentes, ce qui n'est pas prouvé.
7. Les capacités annoncées par OpenAI (sources secondaires) : cadence horaire sur offre payante, notifications push et/ou e-mail, recherche web dans les tâches, 5 tâches actives sur Plus.
8. **Inconnue décisive** : ChatGPT parvient-il à ouvrir des annonces 2ememain **fraîches** avec des liens directs valides ? Si non, on est en ROUGE et le reste ne sert à rien.
9. **Pas de panneau Web (niveau B)** tant que la porte n'est pas verte. Il ne piloterait pas la tâche de toute façon, faute d'API officielle.
10. **Ta prochaine action unique** : faire le [TEST-FAISABILITE.md](TEST-FAISABILITE.md) (environ 20 min, puis 2 h d'observation passive) et me renvoyer la fiche remplie.

## Fichiers

| Fichier | Contenu | Livrable |
|---|---|---|
| [DIAGNOSTIC.md](DIAGNOSTIC.md) | Capacités vérifiées ou non, accès 2ememain, blocages, registre des décisions | A, G |
| [TEST-FAISABILITE.md](TEST-FAISABILITE.md) | Protocole guidé, critères VERT/ORANGE/ROUGE, fiche à remplir | B |
| [PROMPT-TACHE.md](PROMPT-TACHE.md) | Le texte de la tâche, à copier-coller, avec un profil auto et un profil générique | C |
| [MANUEL.md](MANUEL.md) | Changer les filtres, mettre en pause, lire une alerte, maintenance | E, H |
| [RAPPORT-TESTS.md](RAPPORT-TESTS.md) | Les 17 tests d'acceptation et leur statut réel | F |

Le livrable D (panneau) n'est volontairement pas construit. Le livrable I (Mémoire Multi-Agents) n'est pas traité : aucune mission correspondante n'était lisible depuis cette session.
