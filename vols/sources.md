# Sources de la recherche du 04/10/2026

Fenêtre de recherche : 04/10/2026, 12:20–12:50 (heure de Paris).
Statut global : **PARTIELLE**. Aucun prix n'a pu être **VÉRIFIÉ**.

---

## 0. Conditions d'accès (à lire en premier)

| Moyen | Résultat |
|---|---|
| Navigateur / requêtes directes depuis l'environnement cloud (`curl`, Chromium) | **Bloqué** : le proxy réseau répond 403 (« EGRESS_BLOCKED ») pour google.com, skyscanner.fr, kayak.fr, momondo.fr, transavia.com, nouvelair.com, tunisair.com, ryanair.com, tuifly.be, brusselsairlines.com, airfrance.fr, lille.aeroport.fr, brusselsairport.be, charleroi-airport.com, liegeairport.com, ostend-airport.be, kiwi.com, edreams.fr, opodo.fr, lufthansa.com, etc. Tests faits à 12:23, 12:29 et 12:34. |
| Outil de lecture de pages web (WebFetch) | **Bloqué** pour les mêmes domaines (skyscanner.fr, partir.com, kupi.com testés). |
| Outil de recherche web (index de recherche) | **Disponible**. Il renvoie des titres, des URL et un **résumé** des pages indexées. Tous les prix de ce dossier proviennent de ces résumés : ce sont des prix **OBSERVÉS**, dont la date de collecte par le site source est généralement inconnue. |
| Contrôle du PC Windows (Bureau) | **Indisponible** dans cette session : aucun outil de contrôle à distance. Le dossier `vols` est livré via GitHub. |

Conséquence : pas de parcours de réservation, pas d'ajout de bagage réel, pas de capture de preuve et pas de seconde vérification.
Les extraits ci-dessous sont repris des résumés de l'outil de recherche, pas copiés depuis les pages elles-mêmes.
Les URL sont celles que la recherche a renvoyées avec chaque résumé. Un résumé pouvant combiner plusieurs pages,
l'attribution d'un extrait à une URL précise n'est pas toujours certaine : c'est signalé quand le doute est réel.

---

## 1. Cartographie (aéroports, compagnies, jours)

| Constat | Source(s) |
|---|---|
| Distances depuis Lille (Grand-Place) calculées à vol d'oiseau (formule de haversine, coordonnées des aéroports) | calcul local (`outils/` ; voir `donnees/aeroports.csv`) |
| Lille–Tunis : seule Nouvelair dessert la ligne en direct ; 1 vol par semaine en octobre 2026 ; aucun vol de novembre 2026 à juin 2027 | https://www.partir.com/Tunisie/billet-avion-vol/lille-tunis/lil/tun/vol-direct.html · https://www.liligo.fr/vols/itineraires/lille/tunis/nouvelair |
| BJ739 Lille → Tunis arrivé à 23:30 le samedi 03/10/2026 ; BJ739 le samedi 17/10 : 21:45 → 23:30 | https://www.aeroport-de-tunis-carthage.com/tunisie-aeroport-de-tunis-carthage-vols-arrivee.php · https://aeroport-tunisie.com/fr/vol/depart/lille/arrivee/tunis-carthage-TUN/nouvelair/bj739 |
| BJ738 Tunis → Lille (départs 16:15 / 05:10 constatés) ; 1 vol direct hebdomadaire | https://www.flightstats.com/v2/flight-ontime-performance-rating/BJ/739/LIL · https://www.flight.info/BJ738 |
| Page de l'aéroport de Lille : vols directs Lille–Tunis chaque semaine, période jusqu'au 31/10/2026 | https://www.lille.aeroport.fr/fiche-destination/FR/154/tunis/ |
| BJ757 (Lille → Tunis, mardi) : arrivée 13:30 le 28/10/2025 ; statut « annulé » sur une occurrence récente : vol du mardi non confirmé pour 2026 | https://aeroport-tunisie.com/fr/vol/status/bj757 · https://us.trip.com/flights/status-bj757/ |
| Bruxelles–Tunis : Tunisair (7 vols/semaine, A320/A320neo) et Nouvelair (5 vols/semaine) ; ≈12 vols directs par semaine | https://www.directflights.com/BRU-TUN · https://www.flightsfrom.com/BRU-TUN · https://www.skyscanner.co.za/routes/brus/tun/brussels-to-tunis-carthage.html |
| Tunisair TU955 Bruxelles 12:25 → Tunis 14:00 ; TU954 Tunis 07:50 → Bruxelles 11:25 (2 h 35) | https://www.airpaz.com/en/flight/code/TU-955 · https://www.flight.info/TU955 · https://www.fr.momondo.be/vols/bruxelles/tunis-gouvernorat-de-tunis |
| Nouvelair BJ397 Bruxelles 11:35 → Tunis 13:10 ; BJ396 Tunis 06:50 → Bruxelles 10:35 ; autres horaires 11:15 à 21:15 | https://www.avionio.com/en/flight/bj-397 · https://www.avionio.com/en/flight/bj-396 |
| Charleroi–Tunis TUI fly : ligne lancée en 2017 (2 vols/semaine) ; TB2742 « annulé », TB2741 « non opéré récemment » ; la page Tunisie de TUI fly ne propose que Djerba et Enfidha ; Expedia : pas de vol sans escale CRL–TUN | https://routesonline.com/airports/8286/brussels-south-charleroi-airport/news/271727/flights-return-to-tunisia-tui-fly-starts-flying-to-tunis-from-brussels-south-charleroi-airport · https://www.trip.com/flights/status-tb2741/ · https://www.tuifly.be/fr/destinations/tunisie · https://www.expedia.com/lp/flights/crl/tun/charleroi-to-tunis |
| Ostende : TUI fly 2026 vers l'Espagne, la Grèce, la Turquie et l'Égypte, pas la Tunisie | https://www.parismatch.be/lifestyle/voyages/2026/04/03/cet-aeroport-proposera-de-nouveaux-vols-directs-pour-la-saison-estivale-YXJG3M55GZDL5CFO5TM4PW7UII/ |
| Liège : TUI a quitté l'aéroport (dernier vol le 04/01/2026) | https://www.rtbf.be/article/la-compagnie-tui-arrete-ses-vols-a-liege-airport-apres-31-ans-de-service-11650435 |
| Anvers : pas de direct vers Tunis | https://zbordirect.com/en/low-cost/from-belgium/to-tunisia/antwerp-tunis |
| Beauvais : pas de direct vers Tunis | https://www.momondo.fr/vols/aeroport-de-paris-beauvais-bva/tunis-gouvernorat-de-tunis |

## 2. Prix observés (classement)

| Offre | Prix | Extrait (résumé de l'outil de recherche) | Source |
|---|---|---|---|
| **N°1** BRU → TUN Tunisair, 08/10 → 11/10 | 122 € | « Une offre Tunisair propose un vol du jeudi 8 octobre au dimanche 11 octobre à 122 € » ; horaires 12:25-14:00 / 07:50-11:25 | https://www.fr.momondo.be/vols/bruxelles/tunis-gouvernorat-de-tunis |
| **N°2** BRU → TUN Tunisair, 23/10 → 26/10 | 125 € | « Un vol du vendredi 23 octobre au lundi 26 octobre est proposé à 125 € » (offres Tunisair) | même page momondo.be |
| **N°3** BRU → TUN Tunisair, 23/10 → 27/10 | 126 € | « un vol aller-retour à partir de 126 € par passager au départ du vendredi 23 octobre avec retour le mardi 27 octobre via Tunisair » ; skyscanner.net : meilleur aller-retour 109 £ (≈128 €) | https://www.skyscanner.fr/itineraires/bru/tun/bruxelles-international-a-tunis-carthage.html · https://www.skyscanner.com/routes/brus/tun/brussels-to-tunis-carthage.html · https://www.skyscanner.net/routes/brus/tun/brussels-to-tunis-carthage.html |
| Datation momondo | — | la même page indique « 129 € » pour un aller-retour Tunisair du 24/09 au 27/09 : la collecte date vraisemblablement d'environ fin septembre | https://www.fr.momondo.be/vols/bruxelles/tunis-gouvernorat-de-tunis |
| BRU Tunisair 12/10 → 21/10 | 143 € | « 143 € pour un vol Tunisair du lundi 12 octobre au mercredi 21 octobre » (attribution exacte à une page incertaine) | https://www.monde-du-voyage.com/tunisie/vol-tunis/depart-bruxelles/tunisair/ · https://www.liligo.fr/vols/itineraires/bruxelles/tunis |
| BRU Tunisair 07/10 → 11/10 | 143 € | « Tunisair … 143 € pour les dates du 7 au 11 octobre 2026 » ; « dernière collecte : 17/09/2026 » | https://www.monde-du-voyage.com/tunisie/vol-tunis/depart-bruxelles/tunisair/ |
| BRU Nouvelair 05/10 → 08/10 | 153 € (sans soute probable) | « Pour le 5-8 octobre 2026, les tarifs affichaient 153 € pour un vol direct » | https://www.liligo.fr/vols/itineraires/bruxelles/tunis/nouvelair |
| BRU Nouvelair 16/10 → 18/10 (avec escale) | 239 € | « Vendredi 16 octobre au dimanche 18 octobre (avec escale) à 239 € » | https://www.monde-du-voyage.com/tunisie/vol-tunis/depart-bruxelles/nouvelair/ |
| BRU Tunisair aller simple 30/10 | 88 $ (≈76 €) | « A one-way Tunisair flight … on Friday, October 30, 2026 costs $88 » | https://www.skyscanner.com/routes/brus/tun/brussels-to-tunis-carthage.html |
| TUN → BRU Tunisair 31/10 | 170–177 € | « return flights from Tunis to Brussels on October 31 are priced at €177 (prime price €170) » | résumé de recherche (Skyscanner / Expedia / Trip.com) |
| BRU Tunisair aller simple 22/10 | 66 £ (≈77 €) | « A one-way flight with Tunisair departing Thursday, 22 October costs from £66 » | https://www.skyscanner.net/routes/brus/tun/brussels-to-tunis-carthage.html |
| LIL Nouvelair 13/10 → 20/10 | 297 € | « 297 € par passager au départ du mardi 13 octobre et retour le mardi 20 octobre avec vols directs » | https://www.skyscanner.fr/itineraires/lil/tun/lille-a-tunis-carthage.html |
| LIL Nouvelair 17/10 → 24/10 | 711 $ (≈615 €) | « a direct flight for October 17-24, 2026 was priced at $711 » | résumé de recherche (pages Nouvelair Lille → Tunis) |
| LIL 17/10 → 30/10, 1 escale | 268 € | « Un vol au départ du 17 octobre et retour le 30 octobre est disponible à 268 € avec une escale » | https://www.kayak.fr/vols/Lille-Lesquin-LIL/Tunis-Aeroport-Intl-de-Tunis-Carthage-TUN |
| LIL, TGV + Air France | 272 € | « The cheapest round-trip flight from Lille to Tunis currently costs 272 € … AccesRail and Air France » | https://www.google.com/travel/flights/flights-from-lille-to-tunis.html?gl=FR&hl=fr |
| ORY Transavia 09/10 → 12/10 et 05/10 → 09/10 | 135 € et 130 € (sans soute) | « à partir de 135 € du 9 au 12 octobre … 130 € pour un vol du 5 au 9 octobre » | https://www.momondo.fr/vols/aeroport-de-paris-orly-ory/tunis-gouvernorat-de-tunis · https://www.kayak.fr/vols/Transavia-France-Paris-PAR/Tunis-Aeroport-Intl-de-Tunis-Carthage-TUN.b.TO.ksp |
| BRU, correspondances | 144 € à 399 € | Lufthansa dès 144 € (cabine seule) ; ITA dès 207 € ; Swiss / Brussels Airlines dès 191 € ; Turkish dès 399 € | https://www.lufthansa.com/lhg/be/fr/o-d/cy-cy/bruxelles-tunis · https://www.ita-airways.com/lhg/be/fr/o-d/cy-cy/bruxelles-tunis · https://www.brusselsairlines.com/lhg/be/fr/o-d/cy-cy/bruxelles-tunis |
| Google Flights BRU → TUN | dès 138 € (Nouvelair), 148 € (Tunisair direct) | prix de référence sans dates | https://www.google.com/travel/flights/flights-from-brussels-to-tunis.html?gl=BE&hl=fr |

## 3. Bagages

| Règle | Source |
|---|---|
| Tunisair, classe Économie Europe ⇄ Tunisie : **1 bagage en soute de 23 kg inclus** | https://www.tunisair.com/en/guide-utilisateur/prepare-your-luggage · https://www.flyingsmart.info/tunisair-fidelys-franchise-bagages-soute/ |
| Tunisair « Light » (cabine 8 kg seule, soute payante) lancé le 14/04/2026 **uniquement sur le Maroc** | https://www.lapresse.tn/2026/04/14/tunisair-lance-une-offre-light-avec-bagage-cabine-gratuit-vers-ce-pays/ · https://businessnews.com.tn/2026/04/14/tunisair-lance-son-offre-light-sur-le-marche-marocain-voyager-leger-payer-moins/1396536/ |
| Tunisair « Early Purchase » été 2026 (17/06–06/09) : 32 kg en soute au lieu de 23 kg (ne concerne pas octobre) | https://businessnews.com.tn/2026/02/26/tunisair-prolonge-son-offre-early-purchase-ete-2026-jusqua-30-et-franchise-bagages-renforcee/1389970/ |
| Nouvelair : Light (cabine 10 kg seule), Easy (25 kg en soute, siège gratuit), Flex (30 kg + 10 kg cabine) ; vers la France et la Belgique avec Easy : 25 kg | https://www.webdo.tn/fr/actualite/national/nouvelair-lance-une-nouvelle-grille-tarifaire-pour-ses-vols-vers-la-turquie/388894/ · résumé de recherche (pages bagages Nouvelair) |
| Transavia : 40 € pour 20 kg et 46 € pour 25 kg par trajet, depuis le 01/04/2026 (variable selon la ligne) | https://www.liligo.fr/magazine-voyage/?p=24775 · https://airadvisor.com/fr/franchise-bagages/transavia-airlines |

## 4. Taux de change (conversions ESTIMÉES)

1 EUR = 3,3802 TND ; 1 USD = 2,9239 TND ; 1 GBP = 3,9595 TND (taux du 18/08/2026), soit 1 USD ≈ 0,865 € et 1 GBP ≈ 1,171 €.
Source : https://www.tunisienumerique.com/taux-de-change-tunisie-2026-08-18/ · https://www.lapresse.tn/2026/08/12/dinar-tunisien-combien-vaut-il-face-a-leuro-et-au-dollar-aujourdhui/

## 5. Conception du livrable

Page Notion « html creator » (Instructions IA) : https://app.notion.com/p/3dce4fa3b04f8025b512ecd40f6a5621
La page a été lue par extraits via la recherche Notion, car aucun outil ne permettait de la lire en entier. Principes appliqués :
données structurées → fonction de rendu → interface ; source de vérité et statuts (observé, à vérifier, vérifié) ;
tester réellement ; accessibilité par défaut ; test anti-décoration ; impression d'immédiateté ; HTML natif avant ARIA.
