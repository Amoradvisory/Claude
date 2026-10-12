# Diagnostic préalable et registre des décisions

Enquête menée les 11 et 12/10/2026 depuis un environnement Claude Code dans le cloud.

Légende : **CONFIRMÉ** = vu dans une source qui fait foi · **SECONDAIRE** = rapporté par des sources tierces ou un résumé de recherche, sans lecture directe de la page officielle · **INCONNU** = à établir par le test.

## 1. Ce que j'ai pu et pas pu consulter

| Source | Résultat |
|---|---|
| Cahier des charges (Google Doc) | Lu en entier. La décision « une seule tâche ChatGPT toutes les heures » est prise en compte et prime sur le reste. |
| Dépôt `unicodef1wn/grokbot-field-notes` (commit `02780c0`, 20/09/2026) | Lu : `AGENTS.md`, `agents/VERIFICATION.md`, `ANTIPATTERNS.md`, `roster/internal-radar.md`. C'est une synthèse communautaire. Principes repris : la vérification est le travail ; on se tait quand il n'y a rien à signaler ; on n'invente pas de contenu ; on évite la multiplication de bots. Aucun code n'a été repris. |
| `help.openai.com` (aide officielle des tâches) | **Bloqué** par la politique réseau de l'environnement. Contenu connu seulement par des résumés de recherche web : statut SECONDAIRE. |
| `www.2ememain.be` / `www.2dehands.be` (pages, `robots.txt`, conditions d'utilisation) | **Bloqués** par la politique réseau de l'environnement (connexion refusée). Je n'ai donc vu ni les conditions, ni la structure des pages, ni la présence d'horodatages. |
| Gmail **enseignant.be@gmail.com** (reconnecté le 12/10) | **Accessible en lecture.** On y trouve 5 e-mails OpenAI : promotions, « Bienvenue sur ChatGPT » du 06/09/2026, une alerte de connexion. Il n'y a **aucun e-mail de tâche ChatGPT**, **aucun reçu d'abonnement OpenAI** (normal : tu as souscrit Plus via un autre compte) et **aucun e-mail de 2ememain** dans les 12 derniers mois. |
| Mémoire Multi-Agents (Drive) | Lu : `ETAT_COURANT.md` de la mission `url-2emain` (révision 2, 02/10/2026), l'événement fondateur, l'instruction de démarrage V8. Rien n'a été écrit. |
| Ton compte ChatGPT et ton téléphone Android | Aucun accès depuis cette session. Ces outils sont pilotables par ChatGPT via Remote Desktop Commander, pas par moi. |

Pour que je puisse lire 2ememain moi-même dans une session future, il faut autoriser `www.2ememain.be` dans l'accès réseau de l'environnement cloud (menu de l'environnement, puis Edit, puis Allowed domains). Ce n'est **pas** nécessaire au produit : c'est ChatGPT qui consulte 2ememain, pas moi.

## 2. Capacités des tâches ChatGPT (classique)

| Capacité | Statut | Ce qu'on en sait |
|---|---|---|
| Récurrence horaire | SECONDAIRE | « Au plus une fois par heure ». Horaire et heure exacte réservés aux offres payantes ; l'offre gratuite est limitée à environ une fois par jour. |
| Nombre de tâches actives | SECONDAIRE | Free/Go 3, Plus 5, Business/Edu 10, Pro/Enterprise 15. On utilise donc **une seule tâche** qui regroupe tous les profils. |
| Recherche web pendant une exécution | SECONDAIRE | Les tâches peuvent chercher sur le web. Reste à savoir si elles atteignent des **annonces 2ememain fraîches** : INCONNU, c'est l'inconnue n°1. |
| Notification seulement si condition remplie | SECONDAIRE | L'aide présente des tâches de « surveillance » qui préviennent quand une condition est remplie. On ne sait pas si un résultat « RAS » déclenche quand même une notification : INCONNU (test E3). |
| Canaux de notification | SECONDAIRE | Réglages ChatGPT, rubrique Notifications : push, e-mail, ou les deux. Le push mobile suppose l'app installée et l'autorisation Android accordée. |
| Objet de l'e-mail / texte de l'aperçu push | INCONNU | Rien n'indique qu'on puisse personnaliser l'objet. On place donc l'essentiel en 1re ligne du résultat, puis on observe (test E2). |
| Mémoire entre exécutions (déduplication) | INCONNU | Le prompt prévoit les deux cas : historique lisible, ou « déduplication incertaine » affichée. |
| Pause automatique | SECONDAIRE | Une tâche peut se mettre en pause après une période d'inactivité. Voir la maintenance dans le manuel. |
| API publique pour créer, modifier ou lire les tâches | Aucune trouvée | Les modifications se font **via l'interface ChatGPT**. Aucun outil externe ne peut synchroniser les profils. |
| Tâches déclenchées par événement (webhooks) | SECONDAIRE | Elles existent, mais tournent dans **ChatGPT Work** : exclues par ta décision 1.5. |

## 2 bis. Ce que la mission `url-2emain` apprend (prototype Mouscron du 02/10)

- ChatGPT **n'a pas** utilisé sa navigation web pour collecter les annonces. Il est passé par ton PC (Remote Desktop Commander) en deux temps :
  1. il a validé les filtres dans **l'appli Android 2ememain** (`be.tweedehands.m`) via ADB : code postal, rayon, prix, langues, tri « Date - La plus récente » ;
  2. il a lancé un script Python qui interroge l'interface interne `https://www.2dehands.be/lrp/api/search`.
- La mission elle-même classe « stabilité et **conditions d'utilisation** du endpoint LRP » parmi les points **à vérifier**.
- Les dates fournies par cette source étaient du type « Aujourd'hui / Hier », sans heure précise.
- La « prochaine action » enregistrée dans la mission (GitHub Actions ou Vercel Cron, collecte automatique) est **remplacée** par ta décision du 11/10 : pas d'infrastructure autonome.

## 2 ter. Les trois voies possibles pour obtenir des annonces fraîches

| | Voie A : alertes 2ememain → Gmail → tâche ChatGPT | Voie B : navigation web de la tâche ChatGPT | Voie C : script PC (LRP) appelé par ChatGPT |
|---|---|---|---|
| Qui détecte les nouveautés | 2ememain lui-même (recherche sauvegardée) | ChatGPT, à chaque heure | Un script sur ton PC |
| Légitimité de l'accès | **Fonction officielle du site** | Navigation de ChatGPT à ta demande, pages publiques | Interface interne non documentée, conditions inconnues |
| Fraîcheur | Bonne (dépend de l'envoi 2ememain), puis lecture à la prochaine heure | Incertaine : risque de résultats d'index vieux de plusieurs jours | Bonne |
| Filtres | Exacts, ceux de l'appli | Réappliqués par ChatGPT, approximatifs | Exacts |
| Déduplication | Naturelle (un e-mail = une nouveauté) | Incertaine | Possible avec un fichier d'état |
| Dépendances | Compte 2ememain, connecteur Gmail dans ChatGPT | Aucune | PC allumé, connecteur personnalisé utilisable par une tâche planifiée (inconnu), script à maintenir |
| Points à prouver | E-mails 2ememain bien envoyés ; Gmail lisible pendant une tâche | Accès réel aux annonces fraîches | Conditions d'utilisation ; risque de blocage |
| Ma recommandation | **Voie principale** | **Secours automatique** | **Non retenue** sans décision explicite de ta part |

Faits sur la voie A :
- Une **seule boîte Gmail** peut être reliée au connecteur Gmail de ChatGPT (sources communautaires). Il faut que la boîte reliée à ChatGPT soit **celle qui reçoit les alertes 2ememain**. Si ton compte 2ememain utilise une autre adresse, change l'e-mail du compte 2ememain ou mets en place un transfert Gmail.
- Un utilisateur rapporte une tâche Gmail horaire de type « Email Monitor » qui fonctionne. Un autre rapporte l'erreur « connecteur Gmail indisponible en exécution automatique ». C'est donc **à tester chez toi** (test E3).
- L'existence et le format exact des alertes e-mail de recherche sauvegardée de 2ememain sont **NON VÉRIFIÉS**. Je n'ai trouvé aucune documentation en ligne, et ta boîte ne contient aucun e-mail de 2ememain. Le test E1 tranche ce point, et je peux en contrôler le résultat moi-même dans Gmail.

## 3. Accès à 2ememain : règles et risques

- **Conditions d'utilisation et `robots.txt` : NON VÉRIFIÉS.** Je n'ai pas pu les ouvrir. Tu peux les lire en 2 minutes sur ton téléphone (pied de page du site, « Conditions d'utilisation »), en cherchant toute clause sur la consultation automatisée.
- Le modèle choisi a une faible empreinte : environ 24 consultations par jour, faites par ChatGPT à ta demande, sur des pages publiques, sans compte, sans contournement. C'est très différent d'un scraping massif. Ce n'est pas pour autant une garantie de conformité.
- Des services de scraping commerciaux annoncent des techniques « furtives » pour 2dehands/2ememain, ce qui suggère que le site a des protections anti-robots. **Le prompt interdit tout contournement** : si ChatGPT est bloqué, il doit écrire « ACCÈS IMPOSSIBLE ».
- Les filtres du site semblent passer en partie par la partie de l'URL après `#`, non transmise au serveur (fréquent sur ce type de plateforme, **non vérifié ici**). Un navigateur automatisé pourrait alors recevoir une page non filtrée. Le prompt demande donc à ChatGPT de **réappliquer lui-même** les filtres de prix et de zone.

## 4. Contradictions héritées et arbitrages

| Ancienne exigence (cahier des charges) | Décision appliquée |
|---|---|
| Surveillance toutes les 5 à 15 min, e-mails autonomes, serveur | **Annulée** par la décision du 11/10 : tâche horaire ChatGPT uniquement. |
| Objet d'e-mail « 2ememain \| Peugeot 308 SW \| Mons \| 3 250 € » | **Non garanti.** Le format est appliqué à la 1re ligne du résultat. Ce qui s'affiche réellement est à observer (E2). |
| Application Web/PWA de suivi | **Non construite** (niveau A). On la réévalue seulement après une porte verte et avec ton accord. |
| Fiche vendeur avec « contact public » | Le résultat donne note, avis et ancienneté si affichés, **jamais** nom, téléphone ni adresse (minimisation des données). |
| Ancien radar Mouscron (gratuit, rayon local) | Non repris. Belgique entière, 2 000 à 4 000 € par défaut. |

## 5. Registre des décisions

| # | Sujet | Demandé | Confirmé (preuve) | Hypothèse | Arbitrage |
|---|---|---|---|---|---|
| D1 | Territoire | Belgique entière | Décision utilisateur | – | Zone par profil, sans restriction héritée |
| D2 | Plateforme | 2ememain seul | Décision utilisateur | – | D'autres sites servent seulement de sources de **comparables**, cités et étiquetés comme prix demandés |
| D3 | Budget | 2 000 à 4 000 € inclus, modifiable | Décision utilisateur | – | Bornes dans le bloc PROFILS ; « sans borne » possible |
| D4 | Cadence | 1 fois par heure, ChatGPT classique | Décision utilisateur | Horaire disponible sur ton offre | Une seule tâche |
| D5 | Alertes | Notifications natives (push/e-mail) | – | Silence quand RAS ; contenu de l'aperçu | 1re ligne optimisée ; mesurée en E2/E3 |
| D6 | Analyse | Dans ChatGPT classique | – | Assez de comparables accessibles dans une exécution | « Données insuffisantes » plutôt qu'une estimation inventée |
| D7 | Déduplication | Pas d'alerte répétée | – | Historique lisible entre exécutions | Ligne « IDS » ; limite affichée sinon |
| D8 | Interface | La plus petite qui marche | – | – | Niveau A ; pas de panneau |
| D9 | Coûts | Aucun sans accord | **Abonnement ChatGPT Plus existant** (environ 20 €/mois, déclaré par toi le 12/10, souscrit via un autre compte) | Plus permet l'horaire et 5 tâches actives (sources secondaires) | Aucun coût supplémentaire ; une seule tâche utilisée sur 5 |
| D10 | Sous-agents | Seulement si utiles | – | – | Aucun : un coordinateur, rôles séparés dans les documents |
| D11 | Source des annonces | Annonces fraîches, accès conforme | – | Les alertes e-mail 2ememain existent ; Gmail est lisible pendant une tâche | **Voie A** principale, B en secours, C exclue sans décision. La recherche sauvegardée est une fonction du site, pas un mécanisme indépendant ; elle reste **à approuver par toi** |
| D12 | Boîte mail | enseignant.be@gmail.com | Accès en lecture (12/10) | ChatGPT notifie cette adresse | La même boîte doit recevoir les alertes 2ememain et être reliée à ChatGPT |
| D13 | Mission `url-2emain` | Relais seulement si mission disponible | Révision 2 lue | – | Pas d'écriture directe ; texte de relais fourni ci-dessous |

## 6. Texte de relais pour la Mémoire Multi-Agents (à faire enregistrer par ChatGPT)

À donner à ChatGPT avec « Mémoire Multi-Agents V8 ». Il l'enregistre comme nouveau checkpoint de la mission `url-2emain`, ou d'une nouvelle mission « radar-2ememain-belgique » si tu préfères séparer :

```text
12/10/2026 — Claude Code (session cloud). Nouvelle orientation décidée par Amor le 11/10 : « Radar 2ememain Belgique », une seule tâche ChatGPT classique horaire, sans serveur, cron ni collecte autonome. Elle remplace la prochaine action « GitHub Actions/Vercel Cron » de la révision 2.
Livré (documentation, pas de code) : dépôt Amoradvisory/Claude, branche claude/exciting-maxwell-se6bp1, dossier radar-2ememain/ (diagnostic, prompt de tâche v2, test de faisabilité, manuel, rapport de tests).
Architecture recommandée : recherche sauvegardée 2ememain avec alerte e-mail → Gmail enseignant.be → tâche ChatGPT horaire qui lit les alertes, analyse (comparables cités, verdict, confiance) et notifie. Secours : navigation web de la tâche. Endpoint LRP : non réutilisé sans décision.
Statut : PROTOTYPE, porte de faisabilité NON TESTÉE (E0–E4 à faire). Aucun abonnement ni dépense engagés.
```


## Sources

- Aide OpenAI, « Scheduled tasks in ChatGPT » : https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt (non ouvrable ici ; contenu via résumés de recherche)
- Notes de version ChatGPT : https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Sources secondaires : https://www.usecarly.com/blog/chatgpt-scheduled-tasks/, https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-use-chatgpt-tasks-schedule-2026, https://porteden.com/blog/chatgpt-scheduled-tasks-tools/
- Comportement des robots OpenAI (GPTBot / OAI-SearchBot / ChatGPT-User) : https://lenvanderhof.com/en/blog/gptbot-vs-oai-searchbot/
- Offres de scraping tierces (simple indice de protections anti-robots, sans valeur juridique) : https://apify.com/lowlanddata/tweedehands-scraper
- Field notes : https://github.com/unicodef1wn/grokbot-field-notes (commit 02780c0)
