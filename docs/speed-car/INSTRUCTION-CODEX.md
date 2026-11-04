# Speed Car — instruction de réalisation pour Codex

Version du 30 octobre 2026. Ce document est une passation de conception : aucune application Speed Car, aucun relais et aucun appel de son MCP depuis ChatGPT Voice n'ont été testés ici.

## 1. Mission et contexte de l'utilisateur

Construis progressivement **Speed Car**, mon application personnelle de commande rapide de mon téléphone par la voix avec ChatGPT. Je veux pouvoir dire « augmente le volume » ou « mets YouTube » et obtenir rapidement l'action demandée, puis une confirmation courte et exacte. L'usage doit fonctionner en données mobiles, PC éteint, avec un minimum d'attention et de manipulations.

Mon téléphone est un **Redmi Note 15 Pro+ 5G, modèle 2510ERA8BG, Android 16 / HyperOS**. Brave Android est installé sous `com.brave.browser`. Le PC Windows 10 de développement ne possède que deux cœurs : limite les compilations et les tâches parallèles.

Le pilotage existant du téléphone passe par un PC, go.js, phoned, ADB et Tailscale. Il a déjà permis un contrôle en données mobiles. Préserve-le ; il reste une solution indépendante. **Speed Car doit fonctionner sans PC, Remote Desktop Commander, ADB, fichier BAT ni relais Tailscale vers Windows dans son parcours quotidien.** Le PC peut servir à développer et installer l'application. Le Quest 3 est hors périmètre.

Je conserve ChatGPT et sa conversation vocale comme interface souhaitée. Ne remplace pas cette expérience par une application utilisant une API payante sans me présenter le blocage démontré, le changement d'usage et les coûts.

## 2. Reprendre la conception existante sans repartir de zéro

Lis les instructions du dépôt et recherche l'existant avant toute modification. Le dossier de Claude se trouve dans :

- dépôt : `Amoradvisory/Claude` ;
- branche : `ccr-421eb031-o100d2` ;
- fichier : `docs/speed-car/CONCEPTION.md` ;
- SHA du fichier consulté pour cette revue : `10f45463d6ee6e1544ce98e77118ccf7ac4a6deb` ;
- [ouvrir la conception](https://github.com/Amoradvisory/Claude/blob/ccr-421eb031-o100d2/docs/speed-car/CONCEPTION.md).

Ce dossier contient des propositions et estimations, **aucune preuve de fonctionnement de Speed Car**. Conserve son historique ; ajoute les corrections ci-dessous. Si la branche a évolué, examine la différence. Utilise une branche de travail isolée et préserve les travaux des autres conversations.

## 3. Architecture retenue et priorité de rapidité

Architecture de départ :

`ChatGPT vocal → MCP authentifié dans le cloud → liaison WSS sortante déjà établie → application Kotlin Android → API Android → observation du résultat → confirmation vocale courte`.

Cloudflare Worker + Durable Object est le choix proposé pour le relais. La connexion sortante évite un port entrant sur le téléphone. Le relais autorise un propriétaire et un téléphone appairé explicitement ; ne choisis jamais une cible seulement parce qu'elle est connectée.

Pour les actions connues, ChatGPT choisit **un outil spécialisé**. L'application connaît déjà la procédure et son vérificateur. Évite les recherches web, captures, OCR, exploration d'interface et diagnostics globaux à chaque commande. Une interface web peut compléter les réglages ; elle ne remplace pas le composant natif chargé du volume et de l'arrière-plan.

Les délais annoncés par Claude restent des estimations. Cherche la rapidité réelle, mesure-la, puis optimise la partie qui ralentit effectivement. Ne présente pas 0,2 seconde ou une reconnexion en 5 secondes comme des garanties.

## 4. Première étape obligatoire : preuve vocale d'une écriture MCP

Prépare d'abord le plus petit relais sécurisé permettant de tester le compte réel et le mode vocal réel de l'application ChatGPT Android. Ne construis pas tout le moteur Android avant ce résultat.

Le `speedcar_ping` du dossier complet **écrit déjà un horodatage côté serveur** : conserve ce caractère d'écriture, ou nomme-le plus clairement `speedcar_test_action`. Il crée uniquement un reçu de test borné et ne commande pas le téléphone. Déclare honnêtement `readOnlyHint: false`. Un ping de lecture seul ne valide pas les futures commandes d'action.

Vérifie et consigne :

1. le compte/espace autorise-t-il ce MCP personnel et ses écritures ?
2. l'outil est-il disponible et réellement appelé dans le mode vocal de ChatGPT sur Android ?
3. l'appel peut-il se faire sans toucher l'écran après la préparation initiale ?
4. quelles confirmations sont imposées, à quelle fréquence, et quels réglages officiels permettent éventuellement de les préparer à l'arrêt ?
5. le test réussit-il en données mobiles avec le PC éteint ?

La documentation officielle décrit l'utilisation d'apps en mode Live, mais cela ne prouve pas l'accès à notre MCP personnel sur ce compte. Elle précise aussi qu'une approbation demandée en voix passe par **l'écran**, sans approbation orale. Une obligation de toucher l'écran à chaque action bloque donc l'objectif mains libres ; ce n'est pas simplement un tour vocal supplémentaire. Ne contourne pas les confirmations en maquillant une écriture en lecture. [Sources : voix et connexion MCP, §10.]

Un reçu écrit par le relais prouve seulement cette première chaîne, pas une action Android. En cas d'échec, distingue compte, mode vocal, autorisation, configuration, authentification et transport avant de conclure à une limite de plateforme. Prépare les éléments vérifiables et demande uniquement l'information ou le geste qui manque. Un éventuel plan B vocal via API reste une décision distincte.

## 5. Première capacité Android : augmenter le volume média

Expose `phone_media_volume_up`, un cran par défaut, paramètres bornés, un appel d'outil. Implémente l'action native sur `STREAM_MUSIC` avec les permissions nécessaires, notamment `MODIFY_AUDIO_SETTINGS`, sans cibler appel, sonnerie ou alarme.

- Lis l'index avant/après, minimum, maximum et plafond choisi. Si le niveau est déjà au-dessus du plafond, ne l'augmente pas ; ne change pas silencieusement un autre flux.
- Distingue augmentation obtenue, plafond déjà atteint, volume fixe, absence d'effet et résultat indéterminé.
- La preuve porte sur l'index média effectivement observé. Un index changé ne prouve pas une augmentation acoustique dans l'autoradio.
- `STREAM_MUSIC` n'établit pas que la voix de ChatGPT restera au même niveau : son flux, le focus audio et les profils Bluetooth doivent être observés. N'interromps pas un appel pour tester.
- `getAudioDevicesForAttributes()` décrit les sorties **prévues** pour des attributs audio ; ne les nomme pas systématiquement « sortie réelle de YouTube ». Distingue prévision de routage, appareil de communication sélectionné et lecture active effectivement observable. Gère une liste vide ou plusieurs sorties. [Référence AudioManager, §10.]
- N'affiche pas d'interface ni ne produis de son supplémentaire pour la commande courante sauf nécessité ; les instruments visuels de mesure restent un mode de test.

Commence par quelques essais à l'arrêt, puis une série reproductible en données mobiles, PC éteint, dans la vraie conversation vocale. Objectif proposé : au moins 19 réussites sur 20 avec preuve de l'effet, et aucun faux succès ni double effet pour une même commande rejouée. Tester séparément le Bluetooth de la voiture ; ne pas considérer le haut-parleur du téléphone comme une preuve sur l'autoradio.

## 6. Deuxième capacité : ouvrir YouTube dans Brave Android

Expose `phone_open_youtube_brave`. Utilise l'intention Android vers `https://m.youtube.com/`, explicitement ciblée sur `com.brave.browser`. Ne lance pas de vidéo, ne choisis pas de contenu, ne pilote pas Brave sur le PC. Le blocage publicitaire dépend de Brave et de ses réglages ; ne promets pas une absence universelle de publicité.

Sépare les niveaux de preuve :

| Observation | Résultat autorisé |
|---|---|
| Intent soumis sans exception | demande de lancement envoyée |
| Événement récent de reprise de Brave corrélé à la commande | reprise de Brave observée |
| Page/URL réellement constatée | ouverture de YouTube vérifiée |
| Téléphone verrouillé, résultat non visible | verrouillage signalé ; lancement éventuel qualifié selon la preuve |
| Pas d'événement ou autorisation insuffisante | non vérifié / intervention nécessaire |

**Ne dis pas « YouTube est ouvert dans Brave » si seule la présence de Brave est établie.** UsageStats ne prouve pas l'URL chargée ; l'absence d'événement YouTube ne prouve pas à elle seule qu'aucune application YouTube n'est apparue. Teste aussi Brave déjà au premier plan, une autre page ouverte, un démarrage à froid et le verrouillage. `startActivity()` sans exception ne suffit pas à prouver un lancement en arrière-plan.

Demande les permissions au moment de la capacité qui en a besoin. Le volume ne nécessite pas les autorisations de superposition ou d'utilisation. Pour Brave, justifie séparément :

- l'exemption Android de lancement d'activité, dont `SYSTEM_ALERT_WINDOW` est une possibilité documentée ;
- le démarrage du service en arrière-plan, soumis à d'autres règles : pour l'exemption fondée sur cette permission, Android 15+ demande aussi une superposition visible ;
- les réglages HyperOS, à lire ou à confirmer précisément, puis à tester sur ce téléphone.

Ne crée pas de superposition transparente pour simuler une interaction. Une notification à toucher peut être un secours honnête, mais elle ne valide pas une commande mains libres. Pas de déverrouillage automatique promis. Une preuve visuelle manuelle à l'arrêt peut valider un essai ; elle ne transforme pas UsageStats en vérification automatique de l'URL. [Sources Android, §10.]

Vérifie les annotations outil par outil : écritures réelles, volume relatif non idempotent ; ouverture d'un site public à déclarer avec `openWorldHint: true`. Ne déclare pas l'ouverture Brave idempotente avant de vérifier les effets des appels répétés sur les onglets et la navigation. Ces annotations n'accordent aucune permission.

## 7. Transport, arrière-plan et résultats fiables

Le dossier prévoit déjà un service `specialUse`, plutôt que `dataSync` limité dans le temps. Conserve cette piste avec type, permission et justification du manifeste appropriés. Elle ne garantit ni la survie du processus ni le réseau permanent en veille. Démarre d'abord le mode conduite depuis une activité visible, avec notification et arrêt accessibles. Teste l'automatisation Bluetooth/Companion Device ensuite, pas comme prérequis du premier essai.

Implémente une seule connexion supervisée et une seule stratégie de reconnexion. Quelques tentatives rapides, puis délais croissants avec aléa et plafond raisonnable ; pas de tentative toutes les cinq secondes indéfiniment hors réseau. Réagis au retour d'un réseau utilisable et mesure la reconnexion effective. Mesure batterie et données ; règle les heartbeats selon ces observations.

Garanties à spécifier et tester :

- identifiant stable par commande logique, appareil et session authentifiés ;
- reçus et dédoublonnage persistants, bornés, avec restitution du résultat connu ;
- **pas de dédoublonnage sur `(outil, arguments)` pendant deux secondes** comme règle unique : deux demandes volontaires de hausse rapide doivent produire deux crans ;
- date limite d'admission : une commande périmée avant exécution ne part pas plus tard ; une action déjà exécutée est rapportée comme telle, même si sa vérification arrive après cette limite ;
- pas de file de commandes de volume exécutée au retour du réseau ;
- accusé de réception distinct du succès, et résultat **indéterminé** si un effet a pu se produire sans reçu final ; pas de répétition aveugle avec un nouvel identifiant ;
- crash entre effet Android et écriture du reçu : expliquer la limite, ne pas promettre une exécution « exactement une fois » sans démonstration ;
- état durable nécessaire après hibernation/redémarrage du Durable Object ; une table de promesses en mémoire ne suffit pas ;
- OAuth pour ChatGPT, appairage et identifiants du téléphone distincts, révocables ; autorisation locale des capacités et paramètres ; aucun secret dans les journaux ou le dépôt.

Le secours FCM est ultérieur et conditionnel : pas de priorité haute présentée comme un réveil garanti. N'ajoute pas plusieurs services de secours avant d'avoir caractérisé une panne réelle.

## 8. Ajouter beaucoup de fonctions progressivement

Prépare dès le départ une fiche par capacité : intention, schéma, primitive, permissions, risque, expiration, vérificateur, limite et test. Implémente seulement les deux premières capacités, puis étends.

Les primitives natives sont compilées ; les recettes déclaratives instancient des primitives et paramètres autorisés. Une nouvelle recette compatible peut être ajoutée sans recompiler ; une nouvelle permission ou primitive exige une évolution de l'application. Une signature du serveur ne remplace pas la liste locale de permissions. N'accepte ni code distant arbitraire ni shell universel.

L'ajout d'un outil MCP peut nécessiter une actualisation et une approbation dans ChatGPT : « sans recompiler » ne signifie pas « immédiatement disponible en voix ». Expose les capacités utiles et activées, sans imposer une découverte coûteuse à chaque action connue. Mesure la latence des deux outils initiaux après extension du catalogue.

Les futurs fournisseurs et MCP routiers doivent avoir une documentation, une authentification, une couverture et des conditions d'usage vérifiées. Ne suppose pas qu'un fournisseur précis possède un MCP. Leur accès reste limité aux capacités nécessaires ; un fournisseur ne reçoit pas un contrôle général du téléphone.

Pour les futures alertes spontanées : règles locales, position traitée sur le téléphone, données mises en cache, expiration, anti-répétition et synthèse vocale Android. Ne suppose pas qu'un MCP peut déclencher à lui seul une prise de parole spontanée de ChatGPT. La coexistence TTS/ChatGPT/YouTube et l'accès à la localisation sont à tester séparément. Aucune surveillance GPS permanente ni intégration routière à développer dans le premier prototype.

## 9. Livraison et preuves attendues

Travaille par étapes : **écriture MCP en voix → volume natif → Brave → robustesse → extensions**. Corrige les blocages précis ; n'enchaîne pas toutes les phases sur la seule réussite d'un test local du serveur.

Prépare le code, les vérifications locales, la configuration sans secrets, puis l'installation/test nécessaire. Si un compte, un droit, un coût ou un geste physique manque, demande seulement cet élément après avoir terminé les préparatifs indépendants. Ne change pas d'abonnement et n'engage pas de dépense sans instruction. Préserve les autres applications et sessions du PC.

À chaque livraison, fournis :

1. code et documentation reproductibles, versions utilisées, commande simple de diagnostic ;
2. preuve par commande : identifiant, cible, état avant/après, niveau de vérification et résultat exact ;
3. mesures avec temps monotones par composant, corrélation des horloges et incertitude ; la durée HTTP mesurée sur le relais n'est pas le trajet réseau OpenAI→relais ;
4. médiane et p90 mesurés, séparés du temps de décision et de parole ChatGPT ; un enregistrement avec micro n'est utilisable que s'il ne perturbe pas le microphone de la conversation ;
5. scénarios classés **VÉRIFIÉ**, **PRÉPARÉ À TESTER** ou **BLOQUÉ** : Wi-Fi, données mobiles, transition, écran éteint, coupure, autoradio, redémarrage, arrêt forcé ;
6. procédure minimale de reprise si Android exige une ouverture/déverrouillage ; arrêt forcé, retrait des récents et destruction système sont des cas différents ;
7. sauvegardes, désinstallation/retour arrière et limite restante.

Les tests automatiques doivent couvrir les vraies ambiguïtés : doublon de transport, deux demandes légitimes identiques, expiration, perte du reçu, reprise du serveur et rejet d'une cible/permission invalide. Un émulateur n'est pas une preuve HyperOS.

Dans les notes de reprise, conserve le **signe déclencheur**, la **décision décisive**, la **preuve**, les **limites** et la **condition de revalidation**. Cherche une capacité équivalente dans Acquis avant une éventuelle capitalisation autorisée ; n'y publie pas une méthode Speed Car active comme « testée » tant que sa chaîne réelle n'a pas réussi.

## 10. Sources primaires vérifiées pour cette revue

Consultées le 30 octobre 2026 ; relire les passages concernés si le produit ou Android évolue. Elles documentent les règles de plateforme, pas une réussite sur ce compte ou ce Redmi.

- [OpenAI — ChatGPT Voice : apps disponibles au compte et approbations à l'écran](https://help.openai.com/en/articles/20001274-chatgpt-voice).
- [OpenAI — connexion de MCP personnels : accès, écriture, configuration web et mise à jour des outils](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt). La page consultée réserve le support MCP complet à Business/Enterprise/Edu sur le web et mentionne des possibilités de lecture pour Pro : vérifier le compte et distinguer configuration web et utilisation mobile, sans extrapoler.
- [OpenAI — serveur MCP, outils et annotations](https://developers.openai.com/plugins/build/mcp-server).
- [MCP — définition des annotations](https://modelcontextprotocol.io/specification/2025-06-18/schema#toolannotations).
- [Android — restrictions de lancement d'activité](https://developer.android.com/guide/components/activities/secure-bal).
- [Android — démarrage des services depuis l'arrière-plan](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start).
- [Android — types de services, dont specialUse](https://developer.android.com/develop/background-work/services/fgs/service-types).
- [Android — limites de durée des services](https://developer.android.com/develop/background-work/services/fgs/timeout).
- [Android — AudioManager et nature des observations de routage](https://developer.android.com/reference/android/media/AudioManager).
- [Android — focus audio](https://developer.android.com/media/optimize/audio-focus).
- [Cloudflare — WebSockets et hibernation des Durable Objects](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Les chemins de réglages propres à HyperOS restent à constater sur l'appareil. Ne transforme pas une documentation tierce en réglage déjà vérifié.
