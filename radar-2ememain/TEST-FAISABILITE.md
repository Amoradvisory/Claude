# Porte de faisabilité : test guidé à faire par toi

À faire **avant toute autre construction**. Compte environ 20 minutes actives, puis 2 à 3 heures d'observation passive.
Je ne peux pas le faire à ta place : il se passe dans ton ChatGPT et sur ton téléphone.

Pour chaque étape, note le résultat dans la fiche en bas de page. Des captures d'écran sont bienvenues, une fois masqués ton e-mail et toute donnée de vendeur.

---

## E0. Prérequis (3 min)

1. Dans ChatGPT, va dans Paramètres puis Compte, et note **ton offre** (Free, Go, Plus, Pro…). Sans offre payante, la cadence horaire n'est probablement pas disponible : **arrête-toi là et dis-le moi**. Je ne prends aucun abonnement à ta place.
2. Mets à jour l'app ChatGPT sur Android.
3. Dans les paramètres Android, va dans Applications, ChatGPT, Notifications : autorise-les et active **le son** pour la catégorie liée aux tâches, si elle existe.
4. Dans ChatGPT, va dans Paramètres puis Notifications et coche **Push** et **E-mail** pour les tâches.

## E1. ChatGPT peut-il voir des annonces fraîches ? (5 min, test décisif)

Dans une **conversation normale** (pas encore une tâche), colle ceci :

```text
TEST D'ACCÈS — ne pas inventer.
Ouvre 2ememain.be et donne-moi les 5 annonces les plus récentes de la catégorie Autos dont le prix affiché est entre 2000 et 4000 € (bornes incluses), partout en Belgique.
Pour chacune : titre exact, prix, commune, URL directe de l'annonce, date/heure de publication SI elle est affichée.
Ensuite dis-moi précisément : quelles pages tu as réussi à ouvrir, si tu as pu trier par date, si tu as été bloqué (et comment), et si tes résultats viennent d'une navigation directe ou d'un index de recherche.
```

**Vérifie toi-même**, dans l'app ou sur le site 2ememain :
- Ouvre les 5 liens. Pointent-ils vers une vraie annonce, au bon prix et toujours en ligne ?
- Ouvre 2ememain toi-même : Autos, prix 2 000 à 4 000 €, tri « plus récentes ». Les annonces de ChatGPT figurent-elles parmi les ~30 premières ? Ont-elles moins de 24 h ?

| Observation | Verdict |
|---|---|
| ≥ 4 liens valides, au bon prix, et ≥ 3 annonces de moins de 24 h | **VERT** sur l'accès |
| Liens valides mais annonces vieilles de plusieurs jours (résultats d'index, pas de navigation) | **ORANGE** : le radar ne détectera pas « vite » |
| Liens inventés ou morts, blocage, ou « je ne peux pas accéder » | **ROUGE** : on s'arrête et on décide ensemble |

## E2. Notification et e-mail réels (5 min + 10 min d'attente)

Seulement si E1 n'est pas ROUGE. Dans l'app Android, écris :

```text
Crée une tâche unique qui s'exécute dans 10 minutes, intitulée "TEST Radar notification", avec ces instructions :
"Réponds exactement par la ligne suivante puis une phrase : TEST | Peugeot 308 SW | Mons (Hainaut) | 3 250 € | EXEMPLE FICTIF | confiance moyenne
Ceci est un test de notification du Radar 2ememain, aucune annonce réelle."
```

Puis verrouille le téléphone et attends. Note ensuite :
- La notification push est-elle **apparue** ? À quelle heure ?
- A-t-elle **sonné** ou vibré ?
- **Texte exact visible** dans l'aperçu : le titre de la tâche ? la 1re ligne ? tronqué où ?
- En tapant dessus, arrives-tu sur le bon résultat ?
- E-mail : est-il arrivé ? **Objet exact** ? Expéditeur ? La 1re ligne est-elle visible dans l'aperçu Gmail ?

## E3. La tâche horaire réelle (5 min + 2 à 3 h passives)

1. Crée une tâche **toutes les heures** intitulée « Radar 2ememain Belgique », avec le texte complet de [PROMPT-TACHE.md](PROMPT-TACHE.md).
2. Vérifie dans la liste des tâches (Paramètres, Tâches, ou l'icône dédiée) qu'elle apparaît avec la cadence horaire. Note l'heure de la prochaine exécution.
3. Laisse tourner **3 exécutions**. Pour chacune, note :
   - l'heure réelle d'exécution ;
   - le résultat : annonces, « RAS » ou « ACCÈS IMPOSSIBLE » ;
   - si un « RAS » a quand même déclenché une notification (c'est le test du bruit) ;
   - si une annonce déjà signalée revient (test de déduplication), et ce que dit la ligne « Méthode » ;
   - pour 1 annonce au moins : lien valide ? comparables avec URLs qui s'ouvrent ? confiance cohérente ?

## E4. Modification des critères (3 min)

Modifie la tâche : change `prix: 2000–4000` en `prix: 1500–5000` dans le bloc PROFILS. Note **comment** tu as dû faire (bouton Modifier de la tâche, ou message dans la conversation de la tâche) et si l'exécution suivante affiche bien la nouvelle fourchette dans la ligne « Méthode ».

---

## Fiche à remplir et à me renvoyer

```text
Date du test :
Offre ChatGPT :
Modèle Android / version de l'app ChatGPT :

E1 accès : liens valides __/5 ; annonces < 24 h __/5 ; tri par date possible : oui/non ; blocage observé :
E1 verdict : VERT / ORANGE / ROUGE

E2 push : apparue oui/non à __h__ ; son oui/non ; texte visible : "..." ; clic → bon résultat oui/non
E2 e-mail : reçu oui/non ; objet exact : "..." ; 1re ligne visible dans l'aperçu oui/non

E3 exécution 1 : heure __ ; résultat __ ; notif sur RAS oui/non
E3 exécution 2 : heure __ ; résultat __ ; doublon oui/non ; déduplication déclarée sûre/incertaine
E3 exécution 3 : heure __ ; résultat __
E3 qualité d'une analyse : liens comparables valides __/__ ; verdict justifié oui/non

E4 modification : méthode utilisée : ... ; prise en compte oui/non

Remarques :
```

Une fois la fiche reçue, je mets à jour le [rapport de tests](RAPPORT-TESTS.md), j'ajuste le prompt (v2) et je te donne le verdict VERT / ORANGE / ROUGE avec la suite.
