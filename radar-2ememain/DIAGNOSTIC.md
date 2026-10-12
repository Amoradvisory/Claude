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
| Ta boîte Gmail (pour voir l'objet réel d'un e-mail de tâche ChatGPT) | **Refusé** (Forbidden). Rien n'a été lu. |
| Ton compte ChatGPT et ton téléphone Android | Aucun accès depuis cette session. |

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
| D9 | Coûts | Aucun sans accord | – | Tu as déjà une offre payante | Si l'horaire exige un abonnement que tu n'as pas, c'est ta décision |
| D10 | Sous-agents | Seulement si utiles | – | – | Aucun : un coordinateur, rôles séparés dans les documents |

## Sources

- Aide OpenAI, « Scheduled tasks in ChatGPT » : https://help.openai.com/en/articles/10291617-scheduled-tasks-in-chatgpt (non ouvrable ici ; contenu via résumés de recherche)
- Notes de version ChatGPT : https://help.openai.com/en/articles/6825453-chatgpt-release-notes
- Sources secondaires : https://www.usecarly.com/blog/chatgpt-scheduled-tasks/, https://www.ai-toolbox.co/chatgpt-management-and-productivity/how-to-use-chatgpt-tasks-schedule-2026, https://porteden.com/blog/chatgpt-scheduled-tasks-tools/
- Comportement des robots OpenAI (GPTBot / OAI-SearchBot / ChatGPT-User) : https://lenvanderhof.com/en/blog/gptbot-vs-oai-searchbot/
- Offres de scraping tierces (simple indice de protections anti-robots, sans valeur juridique) : https://apify.com/lowlanddata/tweedehands-scraper
- Field notes : https://github.com/unicodef1wn/grokbot-field-notes (commit 02780c0)
