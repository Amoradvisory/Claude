# Manuel express

Ce manuel suppose que la tâche « Radar 2ememain Belgique » existe déjà (voir [TEST-FAISABILITE.md](TEST-FAISABILITE.md), étape E3).
Les noms exacts des menus ChatGPT peuvent changer. Si un intitulé diffère, cherche « Tâches » ou « Tasks » dans les paramètres.

## Changer un filtre (budget, marque, région)

1. Ouvre la tâche : liste des tâches, puis « Radar 2ememain Belgique », puis **Modifier**.
2. Dans le texte, va au bloc `===== PROFILS =====`. Ne touche pas au reste.
3. Change uniquement la ligne concernée, par exemple :
   - Budget : `prix: 2000–4000 €` devient `prix: 1500–5000 €` ; sans plafond, `prix: 2000 € minimum, pas de maximum`
   - Marque : `marques/modèles: toutes` devient `marques/modèles: Peugeot 308, Renault Clio`
   - Région : `zone: Belgique entière` devient `zone: province de Liège` ou `zone: 30 km autour de Namur`
4. Enregistre. Le changement vaut **à partir de l'exécution suivante**.
5. Contrôle : la ligne « Méthode » du résultat suivant doit refléter la nouvelle valeur.

Règles pour éviter les erreurs :
- Le minimum doit être inférieur ou égal au maximum.
- Dans une même ligne, une virgule veut dire **OU** (Peugeot 308 **ou** Clio). Des lignes différentes se combinent en **ET** (marque **et** prix **et** zone).
- Pour ajouter un usage, copie un bloc `[P…]` et donne-lui un nouveau numéro. N'en active pas trop : 2 ou 3 profils actifs au maximum.
- Pour mettre un profil en veille, écris `actif: non`. Ne le supprime pas, tu le retrouveras plus tard.
- **Conserve une copie** du bloc PROFILS dans une note (Keep, Notes…). Il n'existe aucune sauvegarde automatique ailleurs que dans ChatGPT.

## Mettre en pause ou relancer

- Pause : liste des tâches, la tâche, **Mettre en pause**. Relance : **Reprendre**.
- La tâche peut se mettre en pause **toute seule** après une période d'inactivité. Si tu ne reçois plus rien depuis longtemps, va d'abord vérifier son état.

## Lire une alerte

```
Ligne 1 : Objet | Commune (Province) | Prix | Verdict | confiance
```

| Verdict | Que faire |
|---|---|
| À EXAMINER VITE | Ouvre le lien, lis la réserve et pose les questions proposées au vendeur |
| À NÉGOCIER | Intéressant si le prix baisse ; l'écart estimé donne une base de discussion |
| PRIX COHÉRENT | Pas d'urgence ; au prix du marché |
| À ÉVITER SOUS RÉSERVE | Un risque sérieux est à lever avant tout déplacement |
| DONNÉES INSUFFISANTES | Pas assez de comparables : à toi de juger, l'outil ne sait pas |

Points d'attention :
- Les comparables sont des **prix demandés** par d'autres vendeurs, pas des prix de vente conclus.
- « confiance faible » veut dire qu'il faut se méfier de l'écart affiché.
- Pour aller plus loin, réponds dans la conversation de la tâche, par exemple « Analyse en détail l'annonce 2 et cherche 5 comparables de plus ».
- **RAS** : rien de nouveau. **ACCÈS IMPOSSIBLE** : le radar n'a pas pu regarder. Ce n'est **pas** « pas de bonne affaire ».

## Maintenance (5 cas)

| Symptôme | Cause probable | Action |
|---|---|---|
| Plus aucune notification | Tâche en pause, notifications Android coupées, session déconnectée | Vérifier l'état de la tâche, puis les notifications Android, puis la connexion à l'app |
| « ACCÈS IMPOSSIBLE » plusieurs heures de suite | 2ememain bloque ou a changé | Ne rien contourner. Mettre en pause et me prévenir avec le texte exact |
| Toujours « DONNÉES INSUFFISANTES » | Critères trop rares, ou comparables inaccessibles | Élargir la zone ou l'année ; accepter que certains biens ne soient pas estimables |
| Trop de notifications | « RAS » notifié, ou trop de profils actifs | Baisser « max par exécution », désactiver un profil, ou couper le son de la catégorie dans Android |
| Mêmes annonces répétées | Pas de mémoire entre exécutions | C'est la limite connue (« déduplication : incertaine ») ; me le signaler pour un ajustement du prompt |
