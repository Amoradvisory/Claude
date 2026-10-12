# Porte de faisabilité : test guidé (v2)

À faire **avant toute autre construction**. Compte environ 15 minutes actives, puis 2 à 3 heures d'observation passive.

Pour chaque étape, le tableau indique qui fait l'action et qui vérifie. **« Claude »** = je contrôle moi-même dans Gmail enseignant.be@gmail.com, quand tu me dis « vérifie ».

| Étape | Action | Qui agit | Qui vérifie |
|---|---|---|---|
| E0 | Prérequis : offre ChatGPT, notifications, Gmail relié | Toi | Toi |
| E1 | Recherche sauvegardée 2ememain avec alerte e-mail | Toi (ou ChatGPT via ton téléphone) | **Claude**, dans Gmail |
| E1-bis | Accès web direct de ChatGPT (voie de secours) | Toi | Toi |
| E2 | Notification test d'une tâche ChatGPT | Toi | Toi (téléphone) + **Claude** (e-mail) |
| E3 | Tâche horaire réelle, 3 exécutions | Toi | Toi + **Claude** (e-mails) |
| E4 | Modification des critères | Toi | Toi |

---

## E0. Prérequis (3 min)

1. **Offre ChatGPT : Plus** (environ 20 €/mois), confirmée par toi le 12/10, et payée depuis un autre compte. Vérifie seulement que tu crées la tâche **dans le compte ChatGPT qui a Plus**. Les e-mails de notification ChatGPT partent vers l'adresse de **ce** compte. Si ce n'est pas enseignant.be@gmail.com, je ne pourrai pas les lire : dis-moi alors l'adresse, ou crée un transfert Gmail vers enseignant.be.
2. Android, Paramètres, Applications, ChatGPT, Notifications : autorise-les et active **le son**.
3. ChatGPT, Paramètres, Notifications : coche **Push** et **E-mail** pour les tâches.
4. ChatGPT, Paramètres, Applications (ou Connecteurs) : vérifie que **Gmail** est connecté sur **enseignant.be@gmail.com**. Une seule boîte Gmail est possible.

## E1. Les alertes officielles de 2ememain (5 min, puis attente)

1. Dans l'appli 2ememain : vérifie que **l'e-mail du compte est enseignant.be@gmail.com**. Sinon, deux solutions : changer cet e-mail dans le compte 2ememain, ou créer dans l'autre boîte Gmail un transfert des e-mails 2ememain vers enseignant.be.
2. Lance la recherche : catégorie **Autos**, prix **2 000 à 4 000 €**, toute la Belgique, tri **plus récentes**.
3. **Enregistre la recherche** (« Sauvegarder la recherche » ou icône cloche) et active les **alertes par e-mail**. Active aussi le push de l'appli 2ememain si tu veux être prévenu tout de suite.
4. Note le nom exact de l'option et les fréquences proposées (immédiate, quotidienne…). Ces intitulés sont **non vérifiés** de mon côté.
5. Attends 1 à 2 heures (les voitures à ce prix se publient en continu), puis dis-moi **« vérifie E1 »**.

Ce que je contrôlerai alors dans Gmail :
- l'expéditeur ;
- le délai entre la publication et l'e-mail, si l'heure de publication est visible ;
- la présence d'un **lien direct par annonce** ;
- prix, lieu, titre ;
- la fréquence : un e-mail par annonce ou un groupe.

| Observation | Verdict voie A |
|---|---|
| E-mails reçus avec liens directs, en moins de 1 h environ | **VERT** |
| E-mails seulement quotidiens, ou sans lien direct | **ORANGE** : utilisable, mais en retard ; on teste la voie de secours |
| Aucun e-mail possible (option absente) | **ROUGE pour A** : on teste la voie de secours (E1-bis) |

## E1-bis. Accès web direct de ChatGPT (voie de secours, 5 min)

Dans une **conversation normale**, colle :

```text
TEST D'ACCÈS — ne pas inventer.
Ouvre 2ememain.be et donne-moi les 5 annonces les plus récentes de la catégorie Autos dont le prix affiché est entre 2000 et 4000 € (bornes incluses), partout en Belgique.
Pour chacune : titre exact, prix, commune, URL directe, date/heure de publication SI elle est affichée.
Dis-moi précisément quelles pages tu as pu ouvrir, si tu as pu trier par date, si tu as été bloqué, et si tes résultats viennent d'une navigation directe ou d'un index de recherche.
```

Ouvre les 5 liens toi-même : sont-ils réels, au bon prix, publiés depuis moins de 24 h ?
- **VERT** : au moins 4 valides et au moins 3 de moins de 24 h.
- **ORANGE** : liens valides mais anciens.
- **ROUGE** : liens inventés ou morts, ou blocage.

## E2. Notification test (5 min + 10 min d'attente)

Dans l'app ChatGPT Android :

```text
Crée une tâche unique qui s'exécute dans 10 minutes, intitulée "TEST Radar notification", avec ces instructions :
"Réponds exactement par la ligne suivante puis une phrase : TEST | Peugeot 308 SW | Mons (Hainaut) | 3 250 € | EXEMPLE FICTIF | confiance moyenne
Ceci est un test de notification du Radar 2ememain, aucune annonce réelle."
```

Verrouille le téléphone et attends. Note :
- si la notification est **apparue**, et à quelle heure ;
- si elle a **sonné** ou vibré ;
- le **texte visible** dans l'aperçu ;
- si un clic t'amène sur le bon résultat.

Puis dis-moi **« vérifie E2 »** : je relève dans Gmail l'**objet exact** de l'e-mail ChatGPT, son expéditeur, son heure et ce que montre son aperçu.

## E3. La tâche horaire réelle (5 min + 2 à 3 h passives)

1. Crée une tâche **toutes les heures** intitulée « Radar 2ememain Belgique », avec le texte de [PROMPT-TACHE.md](PROMPT-TACHE.md).
2. Vérifie qu'elle apparaît dans la liste des tâches avec la cadence horaire.
3. Laisse passer **3 exécutions**, puis dis-moi **« vérifie E3 »**. Je comparerai, dans Gmail, les alertes 2ememain reçues et les e-mails de la tâche ChatGPT : chaque alerte a-t-elle été traitée une fois, et une seule ?
4. De ton côté, note :
   - si un « RAS » a quand même déclenché une notification ;
   - la source indiquée dans la ligne « Méthode » : A, ou B suite à une erreur Gmail ;
   - pour une annonce au moins, si les liens des comparables s'ouvrent.

## E4. Modification des critères (3 min)

- Dans 2ememain, modifie la recherche sauvegardée : prix **1 500 à 5 000 €**.
- Dans la tâche, mets à jour la ligne `prix:` du profil P1.
- Note comment tu as dû faire, et si l'exécution suivante en tient compte.

---

## Fiche à remplir et à me renvoyer

```text
Date :
Offre ChatGPT (compte enseignant.be) :
Gmail connecté dans ChatGPT : oui/non, adresse :

E1 : option d'alerte trouvée : "..." ; fréquences proposées : ... ; e-mail du compte 2ememain = enseignant.be oui/non
E1-bis : liens valides __/5 ; < 24 h __/5 ; blocage : ...
E2 push : apparue oui/non à __h__ ; son oui/non ; texte visible : "..." ; clic → bon résultat oui/non
E3 : notif sur RAS oui/non ; source utilisée : A/B ; erreur Gmail : oui/non ; comparables valides __/__
E4 : méthode : ... ; pris en compte oui/non
Remarques :
```
