# Speed Car 2.1.0 : guide d'utilisation à la voix

> Ce guide décrit le comportement **prévu** de la version 2.1.0. Reprise locale du 12/11/2026 : le relais est déployé et relu en 2.1.0 ; l'APK Android 2.1.0 est construit mais son installation est **bloquée par un certificat différent de la référence exigée**. Le Redmi reste en 2.0.1 ; aucun essai vocal de cette recette n'est vérifié. Tant que la recette (`DEPLOIEMENT-ET-RECETTE.md`) n'est pas passée, considère chaque ligne comme « à confirmer ».

## Avant de parler

1. Speed Car affiche **Connecté au relais** (notification permanente dans le volet).
2. Dans ChatGPT : nouvelle conversation, plugin **Speed Car** choisi, mode vocal.
3. Dans ChatGPT → Paramètres → Voix : **Conversations en arrière-plan** activé. Sans ce réglage, la voix peut se couper dès qu'une autre application passe devant.
4. Téléphone déverrouillé. Derrière l'écran de verrouillage, une application s'ouvre sans être visible ni lisible.

En voiture : téléphone sur son support, tout se dit, rien ne se touche. Tout ce qui demande un geste ou un regard se fait à l'arrêt.

## Ce que tu dis, ce que tu entends

| Tu dis | Ce que fait Speed Car | Réponse attendue |
|---|---|---|
| « Ouvre Salât Lille et dis-moi dans combien de temps est la prochaine prière. » | Met Salât Lille devant, attend son affichage, lit les textes visibles | « Asr dans 1 heure 23. » d'après l'écran. Si l'information n'est pas à l'écran : « Salât Lille est ouverte, mais je ne vois pas le compte à rebours. » |
| « Sans changer d'écran, que dit la notification de Salât Lille ? » | Lit la notification de l'application | Le texte de la notification, ou « aucune notification de Salât Lille » |
| « Affiche Maps. » | Met Maps devant et le vérifie | « Maps est affiché. » |
| « Emmène-moi à Action Mouscron. » | Envoie la destination à Maps | « Maps est ouvert sur Action Mouscron. Je ne peux pas confirmer que le guidage a démarré. » |
| « Remets l'application de prière. » | Remet Salât Lille devant | « Salât Lille est affichée. » |
| « Reviens à ChatGPT. » | Remet ChatGPT devant | « Je suis de retour au premier plan. » |
| « Qu'est-ce qui est affiché ? » | Dit quelle application est devant | « C'est Brave qui est au premier plan. » |
| « Lis ce qui s'affiche. » | Lit les lignes visibles de l'application devant, si elle est autorisée | Les lignes utiles, en une ou deux phrases |
| « Ouvre Brave et mets du lofi. » | Ouvre une recherche dans Brave, appuie sur le titre, vérifie la lecture | « Lofi hip hop radio est en lecture. » **seulement** si Android confirme la lecture. Sinon : « La recherche est ouverte, la lecture n'a pas démarré. » |
| « Mets pause. » / « Reprends la musique. » / « Suivant. » | Commande la session média | « C'est en pause. » |
| « Monte le son. » / « Mets le volume à 40 %. » | Règle le volume média, sous le plafond choisi | « Volume à 6 sur 15. » |
| « Où est mon téléphone ? » / « Quel est son état ? » | Lit batterie, réseau, autorisations | « Batterie 62 %, en 4G, relié. » |
| « Teste Speed Car. » | Teste le relais **et** dit si le téléphone est relié | « Le relais répond et le téléphone est relié. » ou « Le relais répond, mais le téléphone n'est pas relié. » |

Trois faits que ChatGPT ne doit jamais confondre, et que les réponses séparent :

- **le relais répond** : rien n'a encore touché le téléphone ;
- **le téléphone est relié** : il peut recevoir une commande ;
- **l'application est devant** : Android l'a observé (`foreground_observed`).

## Ce que Speed Car ne fera pas

- Envoyer un SMS, passer un appel, partager : il prépare, tu valides à l'arrêt.
- Payer, saisir un mot de passe, accorder une autorisation, taper du texte.
- Appuyer sur un bouton d'envoi, de suppression, de connexion ou d'achat, ou sur un élément sans libellé.
- Lire une application que tu n'as pas cochée dans la liste d'écran.
- Parler par-dessus ChatGPT : pendant la conversation vocale, c'est ChatGPT qui répond.

## Dépannage rapide

| Ce que tu entends | Ce que cela veut dire | Ce que tu fais, à l'arrêt |
|---|---|---|
| « Le téléphone n'est pas relié à Speed Car. » | Le service du téléphone est absent | Ouvre Speed Car. S'il n'affiche pas « Connecté au relais », appuie sur **Activer Speed Car** |
| « …depuis plusieurs heures » ou plusieurs jours | HyperOS a fermé l'application | Speed Car → Fonctions et autorisations → **Fiabilité de la liaison sur HyperOS** : démarrage automatique, batterie « Aucune restriction », cadenas dans les applications récentes |
| « Appairage refusé par le relais » (dans Speed Car) | Le relais ne reconnaît plus ce téléphone | À traiter depuis le PC ; ne pas réinstaller à l'aveugle |
| « Il manque une autorisation : … » | Un accès n'est pas accordé | Speed Car → Fonctions et autorisations, puis le réglage nommé |
| « L'application est demandée, mais je ne la vois pas devant. » | Android n'a pas montré la fenêtre | Réglages → Applications → Speed Car → Autres autorisations → **Afficher des fenêtres en arrière-plan** |
| « Ouverte, mais écran non lu : application non autorisée. » | L'application n'est pas dans la liste d'écran | Speed Car → Choisir les applications pour le contexte d'écran |
| « Ouverte, mais écran non lu : service d'accessibilité absent. » | Le service n'est pas relié | PC allumé : `ph.js status` doit afficher `u2 = coexistence`. Sinon : Réglages → Accessibilité → Speed Car |
| « Le téléphone est verrouillé. » | L'application est derrière le verrou | Déverrouille |
| « Je dois me reconnecter à Speed Car. » | L'autorisation ChatGPT a expiré | Paramètres → Plugins → Speed Car → ⋯ → Reconnecter. Jamais la fenêtre proposée dans la conversation |
| « Résultat incertain. » | La commande est peut-être partie | ChatGPT relit le reçu avec le même identifiant ; ne pas redemander l'action |

Si la voix se coupe quand une application passe devant : vérifie « Conversations en arrière-plan » dans ChatGPT. Si cela persiste, demande l'information **sans changer d'écran** (notification), ou dis « Reviens à ChatGPT » depuis une nouvelle phrase une fois la conversation reprise.
