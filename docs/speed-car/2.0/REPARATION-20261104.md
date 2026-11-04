# Speed Car 2.0.2 : réparation de la liaison (incident du 04/11/2026)

**Statut : corrigé dans le code et testé hors appareil. Pas encore déployé, pas encore vérifié sur le Redmi.**

Ce travail a été fait depuis une session cloud. Elle n'a accès ni au PC Windows, ni à `go.js`, ni à ADB, ni à Tailscale, ni au téléphone, ni au relais en ligne : son réseau refuse `*.workers.dev`. Rien n'a donc été déployé, installé ou testé sur le Redmi. Chaque affirmation ci-dessous est marquée **[CODE]** (lu dans le code), **[INCIDENT]** (déduit des sorties de l'incident), **[TESTÉ HORS APPAREIL]** ou **[À VÉRIFIER]**.

---

## 1. Causes

### 1.1 Speed Car répond `phone_offline` avec `duration_ms: 0`

- **[CODE] Refus instantané.** `PhoneLink.execute()` renvoyait `phone_offline` dès qu'aucune WebSocket prête n'existait au moment de l'appel, sans attente ni explication. Un téléphone en train de se reconnecter, après un changement d'antenne ou de réseau, était refusé alors qu'il revenait une ou deux secondes plus tard.
- **[CODE] Reconnexion trop lente côté Android.** Après chaque échec, l'attente doublait jusqu'à 60 s, plus 25 % d'aléa, soit environ 75 s. En voiture, une zone mal couverte laissait la liaison absente plus d'une minute après le retour du réseau.
- **[CODE] Connexions mortes non détectées.** Une WebSocket ouverte sur un réseau abandonné (passage Wi-Fi → 4G, tunnel) restait « connectée » jusqu'à l'échec d'un ping OkHttp, soit 30 à 60 s. Le rappel réseau ne réagissait que si la liaison était *déjà* marquée déconnectée. Il ignorait donc le cas « connecté sur l'ancien réseau ».
- **[CODE] Aucun redémarrage si HyperOS tue l'application.** Seuls deux chemins relançaient le service : le démarrage du téléphone et l'ouverture manuelle de Speed Car.
- **[CODE] Diagnostic impossible.** `last_disconnect` était écrit mais jamais exposé. Le résultat `phone_offline` ne disait ni depuis quand, ni pourquoi.
- **[À VÉRIFIER] Cause exacte du 04/11.** Laquelle de ces causes a joué, ou un arrêt manuel du mode, n'est pas prouvable sans les journaux du téléphone. La version 2.0.2 le dira désormais dans chaque refus (champ `diagnosis`, §2.1).

### 1.2 Voie PC + ADB

- **[INCIDENT] Commande ambiguë.** `adb shell am start …` sans `-s` ni `-t`, avec deux transports enregistrés → `more than one device/emulator`.
- **[INCIDENT] Transport affiché `device` mais mort.** `192.168.129.27:5555` est une adresse du réseau local. En voiture, le téléphone n'est plus sur ce Wi-Fi : ADB garde l'entrée « device » jusqu'à l'expiration TCP, d'où `device offline` au premier usage. Un appareil *listé* n'est pas un appareil *opérationnel*.
- **[INCIDENT] Entrée Tailscale `100.114.34.85:5555` offline.** Hors domicile, c'est la seule voie ADB possible. Elle exige à la fois :
  - Tailscale actif sur le téléphone **et** sur le PC ;
  - adbd à l'écoute sur le port 5555, ce qui est perdu à chaque redémarrage du téléphone (`adb tcpip`) ;
  - le PC allumé.

  **[À VÉRIFIER]** lequel de ces trois points manquait.
- **[CODE] Dans le relais et l'APK, aucune dépendance au PC.** La voie PC n'a pas été « réparée » en douce pour être présentée comme Speed Car.

---

## 2. Corrections (branche `ccr-421eb031-o100d2`)

### 2.1 Relais `relay/src/phone-link.ts` (2.0.2)

| Correction | Effet |
|---|---|
| **Délai de grâce de 4 s** (`RECONNECT_GRACE_MS`), seulement si la dernière coupure date de moins de 2 min (`RECENT_DROP_MS`) | Une commande arrivant pendant une reconnexion attend le téléphone au lieu d'échouer ; un téléphone absent depuis longtemps est refusé immédiatement |
| **Heartbeat applicatif** `{"type":"ping"}` → `{"type":"pong"}` traité par le runtime Cloudflare (`setWebSocketAutoResponse`), sans réveiller l'objet | Le relais connaît l'âge du dernier signe de vie, sans coût supplémentaire |
| **Socket muette fermée** : silence au-delà de 3 × l'intervalle + 2 s | Aucune commande envoyée dans une connexion à moitié ouverte |
| **Refus explicite** : `diagnosis` (`phone_never_connected`, `phone_link_closed`, `phone_heartbeat_lost`), `last_connected_at`, `offline_for_s`, `last_close`, `waited_ms`, `duration_ms` réel | On identifie le composant défaillant dès le premier refus |
| `webSocketClose` / `webSocketError` enregistrent code et raison ; une connexion *remplacée* n'est pas comptée comme une coupure | Journal exploitable |
| Consigne MCP : `phone_offline` → le dire en une phrase avec sa cause, pas de boucle, voie PC seulement **annoncée** | Pas de bascule silencieuse comme le 04/11 |

Compatibilité : un ancien APK (2.0.1) n'annonce pas de heartbeat. Il est donc traité comme avant, sans fermeture pour silence.

### 2.2 Android 2.0.2 (`LinkService.kt`, `LinkPolicy.kt`, `LinkWatchdog.kt`)

| Correction | Effet |
|---|---|
| Attente de reconnexion **1, 2, 4, 8 puis 15 s max** (au lieu de 60–75 s) | Retour en ≤ 15 s après une coupure |
| **Changement de réseau par défaut** → coupure et reconnexion immédiates ; **perte du réseau utilisé** → idem | Le passage Wi-Fi ↔ 4G ne laisse plus de socket fantôme |
| **Heartbeat toutes les 25 s, réponse attendue sous 10 s**, sinon reconnexion immédiate (seulement si le relais a déjà répondu au moins une fois : compatible avec un relais 2.0.1) | Détection d'une liaison muette en ≤ 35 s au lieu de 30–60 s, sans réveil radio supplémentaire (remplace l'ancien rythme d'environ 30 s) |
| Sans aucun réseau : pas de tentatives en boucle, on attend le rappel Android (sécurité à 60 s) | Batterie préservée |
| **Surveillance JobScheduler toutes les 15 min** (`LinkWatchdog`) : relance le service si le mode est activé et que le processus a été tué ; sinon **une** notification « Speed Car est arrêté — touchez pour le relancer » | Récupération après un arrêt par HyperOS, ou au minimum un échec visible |
| Le bouton **Arrêter** annule aussi la surveillance | Un arrêt volontaire reste un arrêt |

Limite Android **[À VÉRIFIER]** : la relance depuis la surveillance n'est autorisée que si Speed Car est exempté de l'optimisation de batterie. Avec le réglage HyperOS « Aucune restriction » c'est probablement le cas, mais ce n'est pas prouvé. `phone_status` renvoie déjà `battery_optimization_exempt`.

### 2.3 Voie de secours PC : `tools/windows/redmi-adb.mjs`

Node.js sans dépendance, conçu pour être appelé par `go.js`. Il remplace toute commande `adb` nue vers le Redmi.

- **Toujours ciblée** : `-t <transport_id>`, sinon `-s <serial>`. Ne s'adresse qu'aux transports du modèle `2510ERA8BG` ou des adresses configurées.
- **Preuve d'opérationnalité** avant usage : `shell echo speedcar-ok`. Une ligne `device` ne suffit pas.
- **Réparation ciblée à la demande** : `adb disconnect` puis `adb connect` sur **les seules** entrées TCP du Redmi qui sont offline ou muettes. **Jamais** de `kill-server`, aucun autre appareil touché.
- **Priorité** : USB > débogage sans fil > réseau local > Tailscale.
- **Identifiant de commande idempotent**, enregistré dans `%LOCALAPPDATA%\speedcar\adb-ledger.json` : un même `--id` ne relance jamais l'effet.
- **Vérification** : application au premier plan relue via `dumpsys activity activities` (sondage pendant 3 s), écran verrouillé signalé.
- **Navigation** : toujours rendue avec `navigation_started_verified: false`. L'ouverture de Maps est prouvée, le démarrage du guidage ne l'est pas.
- **Coût** : zéro processus résident, zéro boucle. Un appel = quelques `adb.exe` de courte durée, adapté à un PC à 2 cœurs.

Commandes : `status`, `heal`, `foreground`, `maps`, `navigate "<destination>"`, `open-url <url> [--package p]`, chacune avec `[--id UUID]`. Configuration : `tools/windows/redmi-adb.config.example.json`.

---

## 3. Tests réalisés (hors appareil)

| Test | Résultat |
|---|---|
| Relais `npm test` : 50 tests Workers + 3 tests Node, dont 6 nouveaux (grâce de reconnexion, refus expliqué, jamais connecté, heartbeat, socket muette fermée sans livraison, connexion remplacée) | **50/50 + 3/3** |
| Relais `tsc --noEmit` et `wrangler deploy --dry-run` | OK |
| Android : toutes les sources compilées contre l'API Android 15 (android-all de Robolectric), OkHttp 4.12.0 | OK. **Ce n'est pas une compilation APK** : le manifeste et les ressources ne sont pas vérifiés ici, faute de SDK Android |
| Android : 43 tests JVM (37 existants + 6 `LinkPolicyTest`) | **43/43** |
| Outil ADB : 9 tests avec un faux `adb` qui **rejoue l'incident du 04/11** (Tailscale offline + LAN « device » muet) : sélection non ambiguë, serveur ADB intact, autre appareil ignoré, Maps vérifié au premier plan, doublon non rejoué, téléphone injoignable signalé sans effet, écran verrouillé détecté | **9/9** |

## 4. Tests obligatoires A à H sur l'appareil réel : **non faits**

Ils exigent le PC et le Redmi. À faire par Codex sur le PC, téléphone à l'arrêt et propriétaire disponible, **jamais pendant la conduite** :

| Test | Commande / geste | Preuve attendue |
|---|---|---|
| A — Redmi joignable | `node tools\windows\redmi-adb.mjs status` | `reachable` + type de transport |
| B — ADB ciblé | idem, journal `steps` | aucune ligne sans `-t`/`-s` |
| C — Ouvrir Maps | `… maps --id <uuid>` | `executed: true` |
| D — Maps au premier plan | même résultat | `status: verified`, `foreground_package: com.google.android.apps.maps` |
| E — Navigation Action | `… navigate "Action Mouscron" --id <uuid>` | Maps au premier plan ; `navigation_started_verified: false` reste vrai tant que personne ne l'a vu à l'écran |
| F — Speed Car | ChatGPT : `phone_status`, puis `phone_navigate {destination:"Action Mouscron"}` | `verified`/`executed` avec `command_id` relu par `phone_command_status` |
| G — Récupération | Wi-Fi coupé puis remis (à l'arrêt), puis commande immédiate | commande servie après la grâce, ou `phone_offline` avec `diagnosis` exact ; reconnexion ≤ 15 s mesurée |
| H — Interruption ordinaire | mode avion 30 s puis retour ; et écran éteint 30 min | `phone_status` répond sans ouvrir Speed Car |

## 5. Déploiement (Codex, sur le PC)

1. **Relais** : `cd relay && npm ci && npm test && npx wrangler deploy`. Le relais 2.0.2 est compatible avec l'APK 2.0.1, donc à déployer en premier.
2. **APK** : `cd android && gradlew assembleDebug` (signature habituelle, pas d'effacement des données), installer `Speed-Car-2.0.2.apk`.
3. Sur le Redmi, une fois : ouvrir Speed Car, vérifier « Connecté au relais » ; Réglages → Applications → Speed Car → **Démarrage automatique ON**, **Batterie : Aucune restriction**.
4. Dans ChatGPT : Speed Car → **Actualiser les outils**, puis nouvelle conversation.
5. **go.js** : remplacer les appels `adb` nus vers le Redmi par `node <chemin>\tools\windows\redmi-adb.mjs …`, puis lire le JSON renvoyé. Ne pas ajouter de surveillance permanente : la réparation se fait à chaque commande.
6. Faire les tests A à H et consigner les preuves dans `docs/speed-car/2.0/`.
7. **Seulement après des tests A à H réussis**, ajouter dans `journal\RECETTES.md` la recette de `docs/speed-car/2.0/RECETTE-CANDIDATE-ADB-CIBLE.md` et la note `go.js`.

## 6. Problèmes encore ouverts

- **Bascule automatique Speed Car → PC** : impossible dans l'architecture actuelle. ChatGPT voit des connecteurs distincts et choisit lui-même ; aucun connecteur ne peut appeler l'autre. Ce qui est fait : la consigne demande d'annoncer la bascule. Option future, non implémentée : le PC se connecte lui aussi au relais comme exécuteur secondaire. Cela exposerait un shell ADB derrière Internet, donc à n'envisager qu'avec une liste blanche stricte d'actions.
- **« L'Action le plus proche »** : Speed Car et ADB envoient la destination à Maps, qui choisit le résultat. Le magasin le plus proche n'est pas garanti ; préciser la ville (« Action Mouscron ») reste le plus sûr.
- **« Lance une playlist de Mariah Carey »** : ouvrir la recherche est possible avec `phone_open_url` dans Brave, par exemple `https://m.youtube.com/results?search_query=mariah+carey+playlist`. **Choisir la première playlist et lancer la lecture n'est pas supporté**. Il faudrait des clics d'interface, volontairement exclus de `phone_ui_action`, et aucune lecture n'est à annoncer sans preuve.
- **Après un redémarrage du téléphone**, l'ADB TCP (port 5555) est perdu tant qu'il n'est pas réactivé par USB ou par le débogage sans fil. Speed Car, lui, redémarre via `BOOT_COMPLETED`, si HyperOS l'autorise.
- **HyperOS** peut toujours tuer le service. La surveillance réduit la panne à 15 min au pire, et seulement si l'exemption batterie est active.
- **Tailscale VPN sur le téléphone** : le réseau par défaut reste le VPN quand on passe du Wi-Fi à la 4G. Le changement n'est alors pas vu par le rappel réseau, et c'est le heartbeat qui détecte la coupure, en ≤ 35 s.

## 7. Fiabilité réellement démontrée

Aucune sur l'appareil à ce stade. Ce qui est démontré, hors appareil : la logique de grâce, de détection de liaison muette, de délais de reconnexion, d'idempotence et de ciblage ADB, sur les scénarios ci-dessus. Le taux de réussite réel et le délai de reconnexion réel restent à mesurer par les tests G et H.
