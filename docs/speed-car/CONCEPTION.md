# SPEED CAR — Dossier de conception (v0.1, 30/10/2026)

> Statut : **analyse et conception uniquement**. Rien n'a été installé, déployé ou testé sur le téléphone.
> Destinataire : Codex (coordination / réalisation).
> Légende utilisée partout : **[LU]** = lu dans une source (voir §11), **[PROPOSÉ]** = ma conception, **[ESTIMÉ]** = ordre de grandeur non mesuré, **[À VÉRIFIER]** = hypothèse à confirmer sur l'appareil ou dans la doc. **[TESTÉ]** n'apparaît nulle part : je n'ai rien testé.

---

## 0. Résumé en 10 lignes

1. Chaîne retenue : **ChatGPT Voice (app Android) → serveur MCP distant (cloud) → WebSocket persistante → app Android native Speed Car (Kotlin) → API Android → résultat observé → ChatGPT confirme.**
2. **Choix décisif :** le téléphone garde **une connexion sortante persistante** (WebSocket, service au premier plan) vers un **relais cloud** qui est aussi le serveur MCP. Aucun port ouvert sur le téléphone, aucun PC, la commande arrive en ~1 aller réseau et le résultat revient sur la même connexion.
3. Relais recommandé : **Cloudflare Workers + Durable Object** (un objet par téléphone, WebSocket « hibernation »), OAuth mono-utilisateur. Alternative : petit VPS.
4. Deux outils MCP v1 seulement : `phone_media_volume_up` et `phone_open_youtube_brave`, chacun = **un appel, une exécution, une vérification, une phrase**.
5. Volume : `AudioManager` sur `STREAM_MUSIC` uniquement, lecture avant/après, sortie audio réelle (Bluetooth voiture) rapportée. On ne touche jamais aux flux appel/sonnerie/alarme.
6. Brave : intent explicite `ACTION_VIEW https://m.youtube.com/` + `setPackage("com.brave.browser")`, rendu possible en arrière-plan par l'exemption **« afficher par-dessus les autres apps »** + permission HyperOS **« pop-up en arrière-plan »** ; vérification par `UsageStatsManager` (Brave au premier plan, l'app YouTube non).
7. Statuts honnêtes et distincts : `delivered` → `executed` → `verified` (ou `failed` / `expired` / `unverified` / `phone_offline`).
8. Extensibilité : **primitives compilées dans l'APK** + **recettes déclaratives signées** envoyées par le serveur (ex. « ouvrir Waze » = une recette, pas une recompilation).
9. Alertes spontanées : **jamais via ChatGPT**. Moteur local dans Speed Car (position traitée sur le téléphone, synthèse vocale Android, anti-répétition, expiration).
10. **Risque n°1 à lever avant tout code Android :** confirmer qu'un MCP personnalisé (mode développeur) est réellement appelable **depuis la voix de l'app Android** avec ton abonnement, et combien de confirmations ChatGPT impose. → Porte 0 (§8), une demi-journée.

---

## 1. Recommandation principale et choix décisif

### 1.1 Recommandation

Construire **trois pièces, pas plus** :

| Pièce | Rôle | Techno proposée |
|---|---|---|
| **Relais MCP** (cloud) | Expose les outils à ChatGPT (MCP Streamable HTTP + OAuth), garde la connexion avec le téléphone, signe et chronomètre les commandes | Cloudflare Worker (TypeScript) + 1 Durable Object `PhoneHub` |
| **Speed Car Android** | Service au premier plan « mode conduite », WebSocket sortante, exécuteurs Android, vérification, journal de latence, écran de réglages/permissions | Kotlin, `minSdk 33`, `targetSdk 36` (Android 16), APK installé hors Play Store |
| **Catalogue de capacités** | Déclare chaque capacité : outil, schéma, risque, permissions, TTL, vérificateur | Fichier JSON versionné dans le dépôt, publié par le relais |

### 1.2 Pourquoi ce choix est décisif

Le temps perdu aujourd'hui vient de l'**IA qui découvre la procédure** (observer, capturer, chercher, enchaîner). La seule façon de supprimer ce coût est que **ChatGPT n'ait qu'une décision à prendre : appeler un outil nommé, sans paramètre ou presque**. Tout le reste (comment ouvrir Brave, quel flux de volume, comment vérifier) est **pré-compilé sur le téléphone**.

Le deuxième gain vient du **transport** : une WebSocket déjà ouverte évite, à chaque commande, la latence d'un réveil push, d'une poignée de main TLS et d'un démarrage d'app. [PROPOSÉ]

### 1.3 Ce que ce choix n'est pas

- Pas d'ADB, pas de Tailscale, pas de script Windows, pas de Remote Desktop Commander dans le chemin quotidien. Le PC sert à compiler l'APK et éventuellement à l'installer une fois.
- Pas de root.
- Pas de capture d'écran / OCR dans le parcours courant.
- Pas de remplacement de ChatGPT Voice par une app maison (seulement en plan B documenté, §3).

---

## 2. Schéma des composants et des échanges (sans PC)

```
 ┌──────────────── Téléphone Redmi Note 15 Pro+ (données mobiles) ───────────────┐
 │                                                                                │
 │  [ChatGPT app Android]  ◄── voix ──  toi                                       │
 │        │  (audio vers OpenAI)                     [Brave com.brave.browser]    │
 │        │                                                   ▲ intent explicite  │
 │        │                                                   │                   │
 │        │                     ┌─────────────────────────────┴─────────────┐     │
 │        │                     │ Speed Car (app native, service 1er plan)  │     │
 │        │                     │  • WebSocket sortante persistante         │     │
 │        │                     │  • vérif signature / TTL / doublon        │     │
 │        │                     │  • exécuteurs : AudioManager, Intent      │     │
 │        │                     │  • vérificateurs : AudioManager,          │     │
 │        │                     │    UsageStatsManager                      │     │
 │        │                     │  • journal de latence local               │     │
 │        │                     │  • (plus tard) moteur d'alertes local+TTS │     │
 │        │                     └──────────────▲────────────┬───────────────┘     │
 └────────┼────────────────────────────────────┼────────────┼─────────────────────┘
          │ HTTPS (4G/5G)                        │ WSS        │ (secours) FCM haute priorité
          ▼                                      │            │   pour réveiller si WS coupée
 ┌──────────────────────┐   MCP Streamable HTTP  │            │
 │  Serveurs OpenAI     │ ─────────────────────► ┌┴────────────┴──────────────────────────┐
 │  (ChatGPT, modèle,   │   + OAuth bearer       │ Relais Speed Car (Cloudflare)          │
 │   reconnaissance,    │ ◄───────────────────── │  Worker : MCP + OAuth                  │
 │   synthèse vocale)   │   résultat structuré   │  Durable Object PhoneHub (1/appareil)  │
 └──────────────────────┘                        │   • tient la WS du téléphone           │
                                                 │   • id de commande, TTL, dédoublonnage │
                                                 │   • horodatages, signature Ed25519     │
                                                 └────────────────────────────────────────┘
```

### 2.1 Séquence « Augmente le volume » [PROPOSÉ]

```
toi        ChatGPT(OpenAI)          Relais (Worker+DO)            Speed Car (Android)
 │ "augmente le volume"                 │                               │
 │──────────►│ ASR + décision           │                               │
 │           │── tools/call phone_media_volume_up {steps:1} ──►│         │
 │           │                          │ t1 reçu ; id=uuid ; exp=+3s   │
 │           │                          │── cmd signée (WS) ───────────►│ t2 reçu, ack
 │           │                          │                               │ t3 lire vol (8/15)
 │           │                          │                               │ t4 adjustStreamVolume(MUSIC,+1)
 │           │                          │                               │ t5 relire vol (9/15), sortie=BT "Voiture"
 │           │                          │◄── result verified ───────────│ t6
 │           │◄── "Volume média 9/15 (60 %), Bluetooth Voiture. Vérifié." │
 │◄── "Volume à 60 %."                  │                               │
```

### 2.2 Séquence « Mets YouTube » [PROPOSÉ]

Identique, avec côté Android : `startActivity(ACTION_VIEW https://m.youtube.com/, package=com.brave.browser)` puis attente (≤ 1,5 s, sondage 100 ms) de l'événement `ACTIVITY_RESUMED` de `com.brave.browser` dans `UsageStatsManager`, et contrôle qu'aucun `ACTIVITY_RESUMED` de `com.google.android.youtube` n'est apparu.

---

## 3. Alternatives crédibles (comparaison courte)

| # | Option | Rapidité | Sans PC | Garde ChatGPT Voice | Fiabilité Android | Verdict |
|---|---|---|---|---|---|---|
| **A** | **MCP cloud + WebSocket + app native** | Meilleure possible côté Speed Car | Oui | Oui | Maîtrisée par nous | **Recommandée** |
| B | MCP cloud + **FCM seul** (pas de connexion persistante) | +0,1 à plusieurs s par réveil [ESTIMÉ] ; FCM peut rétrograder les messages haute priorité qui n'affichent pas de notification [LU] | Oui | Oui | Dépend de Google Play Services ; un message FCM n'exempte **pas** le lancement d'activité, seulement le démarrage de service [LU] | Gardée comme **secours de réveil** |
| C | MCP cloud → service tiers de push (ex. Join) → **Tasker/MacroDroid** | Correcte | Oui | Oui | Bonne, mais dépend de 2-3 apps tierces, vérification faible, secrets chez un tiers | Prototype jetable possible, pas cible |
| D | **App vocale maison** (API temps réel OpenAI) avec appels de fonctions locaux | Potentiellement la plus rapide (pas de relais, outil exécuté sur le téléphone) | Oui | **Non** (remplace ChatGPT, mémoire/historique séparés) | Bonne | **Plan B** uniquement si la Porte 0 échoue ; facturation à l'usage audio (tarif à vérifier sur la page officielle des prix avant décision) |
| E | Assistant Google/Gemini natif | Rapide pour volume / ouvrir une app | Oui | Non | Bonne, mais ne garantit pas « YouTube **dans Brave** » | Hors cible |
| F | Automatisation d'interface (Accessibilité, captures) | Lente, fragile | Oui | Oui | Fragile (mises à jour UI) | Seulement pour une future capacité sans API |
| G | ADB / pont PC / Tailscale | — | **Non** | — | — | **Exclue** (exigence non négociable) |

---

## 4. Les deux premiers outils MCP et leur exécution Android

### 4.1 Règles communes aux outils [PROPOSÉ]

- **Un outil = une intention.** Pas d'outil générique `run_command` en v1 : il obligerait le modèle à composer, donc à réfléchir.
- **Annotations honnêtes** (spécification MCP) : `readOnlyHint: false` (ce sont des écritures), `destructiveHint: false` (rien n'est supprimé), `idempotentHint` selon l'outil, `openWorldHint: false`. Les valeurs par défaut MCP supposent le pire (`destructiveHint` vrai par défaut) [LU] ; ChatGPT demande une confirmation par défaut pour les actions d'écriture [LU]. On ne maquille **jamais** un outil d'écriture en lecture.
- **Description courte, en français, avec phrases déclencheuses** et l'instruction de répondre en une phrase.
- **Réponse** : `content` = une phrase prête à être dite ; `structuredContent` = détails (statut, valeurs, minutages).
- **Instructions du serveur MCP** (champ `instructions` de l'initialisation) : « Pour toute action sur le téléphone de l'utilisateur, utilise directement l'outil Speed Car correspondant, sans recherche web, sans diagnostic préalable, puis confirme en une phrase courte. »
- Côté ChatGPT, ajouter la même phrase aux **instructions personnalisées / mémoire** de ton compte. [PROPOSÉ]

### 4.2 Outil A — `phone_open_youtube_brave`

**Définition MCP**

```json
{
  "name": "phone_open_youtube_brave",
  "title": "Ouvrir YouTube dans Brave (téléphone)",
  "description": "Ouvre la page d'accueil du site YouTube dans le navigateur Brave sur le téléphone Android de l'utilisateur (jamais l'application YouTube). Ne lance aucune vidéo. À utiliser pour « Mets YouTube », « Ouvre YouTube », « YouTube dans Brave ». Appelle cet outil directement, puis confirme en une phrase courte selon le statut renvoyé.",
  "inputSchema": { "type": "object", "properties": {}, "additionalProperties": false },
  "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": true, "openWorldHint": false }
}
```

**Exécution Android** [PROPOSÉ]

```kotlin
val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://m.youtube.com/"))
    .setPackage("com.brave.browser")                 // empêche l'app YouTube d'intercepter le lien
    .addCategory(Intent.CATEGORY_BROWSABLE)
    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    .putExtra(Browser.EXTRA_APPLICATION_ID, packageName) // les navigateurs Chromium réutilisent l'onglet de cette app [À VÉRIFIER sur Brave]
context.startActivity(intent)
```

**Pré-requis pour lancer depuis l'arrière-plan**

- Android limite le lancement d'activités depuis l'arrière-plan depuis Android 10 [LU]. Exemptions officielles pertinentes : app avec fenêtre visible ; **permission `SYSTEM_ALERT_WINDOW` accordée par l'utilisateur** ; `PendingIntent` envoyé par le système (tap sur notification) [LU].
- **Chemin retenu :** `SYSTEM_ALERT_WINDOW` (« Afficher par-dessus les autres applications ») **+** permission propriétaire Xiaomi **« Afficher des fenêtres pop-up lors de l'exécution en arrière-plan »** (Autres autorisations), que les éditeurs d'apps documentent comme indispensable sur Xiaomi pour lancer une activité en arrière-plan [LU, sources tierces].
- **Écran verrouillé :** Brave démarre derrière l'écran de verrouillage ; Speed Car ne peut pas déverrouiller pour une autre app. Statut renvoyé : `launched_behind_lock` (détecté via `KeyguardManager.isKeyguardLocked`). [PROPOSÉ]
- **Mode dégradé** si le lancement est bloqué : notification haute priorité « Ouvrir YouTube dans Brave » (un tap) et statut `needs_user_tap`. Jamais présenté comme réussi.

**Vérification** [PROPOSÉ]

- Permission spéciale « Accès aux données d'utilisation » (`PACKAGE_USAGE_STATS`, accordée une fois dans les réglages).
- Sonder `UsageStatsManager.queryEvents(t_exec-200ms, now)` toutes les 100 ms pendant ≤ 1 500 ms :
  - `ACTIVITY_RESUMED` de `com.brave.browser` → `verified` (niveau « Brave au premier plan ») ;
  - `ACTIVITY_RESUMED` de `com.google.android.youtube` → `failed: wrong_app` ;
  - rien → `executed_unverified`.
- **Limite honnête :** cette vérification prouve que **Brave** est au premier plan, pas que l'URL YouTube est chargée. Vérifier l'URL exige un service d'Accessibilité restreint à `com.brave.browser` (option v1.1, permission sensible, « paramètres restreints » à débloquer pour une app installée hors Play Store [À VÉRIFIER]). La réponse dit exactement ce qui est vérifié.

**Phrase de confirmation type :** « YouTube est ouvert dans Brave. » / « Brave est ouvert mais le téléphone est verrouillé. » / « Je n'ai pas pu ouvrir Brave : autorisation pop-up manquante. »

**Pièges connus** [À VÉRIFIER sur l'appareil]

1. Brave pourrait renvoyer le lien vers l'app YouTube (gestion des liens d'application). Parade de réglage à l'arrêt : Réglages → Applications → YouTube → *Ouvrir par défaut* → désactiver les liens pris en charge. La vérification détecte ce cas.
2. Lecture en arrière-plan / écran éteint : dépend d'un réglage de Brave (lecture vidéo en arrière-plan). Pas promis.
3. Sécurité routière : ouvrir un site vidéo pendant la conduite ; Speed Car ne lance aucune vidéo, l'usage visé est l'audio. Le choix et la légalité de l'usage restent les tiens.

### 4.3 Outil B — `phone_media_volume_up`

**Définition MCP**

```json
{
  "name": "phone_media_volume_up",
  "title": "Augmenter le volume média (téléphone)",
  "description": "Augmente le volume MÉDIA (musique, vidéo, YouTube) du téléphone Android de l'utilisateur, d'un cran par défaut, sur la sortie audio active (haut-parleur, Bluetooth voiture...). Ne modifie jamais le volume d'appel, de sonnerie ou d'alarme. À utiliser pour « Augmente le volume », « Monte le son », « Plus fort ». Renvoie le volume réellement obtenu ; confirme en une phrase courte.",
  "inputSchema": {
    "type": "object",
    "properties": { "steps": { "type": "integer", "minimum": 1, "maximum": 3, "default": 1 } },
    "additionalProperties": false
  },
  "annotations": { "readOnlyHint": false, "destructiveHint": false, "idempotentHint": false, "openWorldHint": false }
}
```

**Exécution Android** [PROPOSÉ]

```kotlin
val am = getSystemService(AudioManager::class.java)
if (am.isVolumeFixed) return Result.failed("volume_fixed")
val before = am.getStreamVolume(AudioManager.STREAM_MUSIC)
val max    = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
val cap    = settings.maxMediaVolumeIndex ?: max          // plafond de sécurité réglable (ex. 85 %)
repeat(steps) {
    if (am.getStreamVolume(AudioManager.STREAM_MUSIC) < cap)
        am.adjustStreamVolume(AudioManager.STREAM_MUSIC, AudioManager.ADJUST_RAISE, AudioManager.FLAG_SHOW_UI)
}
val after  = am.getStreamVolume(AudioManager.STREAM_MUSIC)
val media  = AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).build()
val out    = am.getAudioDevicesForAttributes(media).firstOrNull()   // API 33 : sortie réelle des médias
val mode   = am.mode                                                 // MODE_IN_COMMUNICATION si une conversation vocale tient l'audio
```

**Pourquoi `STREAM_MUSIC` explicite** : les appels « volume par défaut » ajustent le flux « le plus pertinent » ; pendant une communication active c'est le flux d'appel qui est prioritaire [LU]. Or **ChatGPT Voice utilise probablement un mode de communication** [À VÉRIFIER : lire `am.mode` pendant une conversation]. Viser explicitement `STREAM_MUSIC` garantit qu'on ne change ni la voix de ChatGPT, ni la sonnerie, ni l'alarme.

**Vérification** : relecture immédiate de l'index. Statuts :
- `after > before` → `verified` ;
- `after == before == cap` → `verified_at_limit` (« déjà au maximum autorisé ») ;
- `after == before < cap` → `failed: no_effect` (politique constructeur, volume fixe, etc.).

**Bluetooth voiture** [À VÉRIFIER]
- Avec le « volume absolu » AVRCP, l'index du téléphone pilote le volume de l'autoradio ; sans lui, l'index du téléphone et le volume de l'autoradio sont séparés (le téléphone mémorise alors un niveau par appareil) [LU, AOSP]. Speed Car rapporte le **nom et le type de la sortie** (`TYPE_BLUETOOTH_A2DP`, `TYPE_BLUETOOTH_SCO`, `TYPE_BUILTIN_SPEAKER`, `TYPE_BLE_HEADSET`…) pour que la confirmation soit vraie (« sur le Bluetooth de la voiture »).
- Si la sortie média est en SCO/appel parce que ChatGPT Voice tient l'audio, la musique peut être coupée ou atténuée pendant la conversation : le changement s'appliquera, mais ne s'entendra qu'après. La réponse le dit (`audio_mode = in_communication`).
- Le nombre de crans de `STREAM_MUSIC` sur HyperOS est à relever (affiché en index/max et en %).

**Phrase type** : « Volume média à 9 sur 15, sur le Bluetooth de la voiture. »

---

## 5. Budget de latence et protocole de mesure

### 5.1 Décomposition (toutes les valeurs sont des **estimations** à remplacer par des mesures)

| Segment | Qui le contrôle | Estimation [ESTIMÉ] | Objectif Speed Car [PROPOSÉ] |
|---|---|---|---|
| S1 Fin de parole → fin de détection du tour (ASR) | OpenAI | 0,3 – 1 s | — (hors contrôle) |
| S2 Décision du modèle d'appeler l'outil | OpenAI, influencé par nos descriptions | 0,5 – 2 s | Réduire par outils peu nombreux, nommés, sans paramètres |
| S3 Éventuelle confirmation d'action d'écriture | OpenAI + tes réglages d'autorisation | 0 à plusieurs s (un tour vocal de plus) | Obtenir « toujours autoriser » si ChatGPT le permet [À VÉRIFIER] |
| S4 ChatGPT → relais (HTTP MCP) | Réseau OpenAI→Cloudflare | 50 – 250 ms | Serveur sans état, réponse `tools/list` statique |
| S5 Relais → téléphone (WS) | Nous + réseau mobile | 30 – 150 ms ; 0,1 – 0,5 s si la radio est en veille | WS déjà ouverte ; ping 25 s |
| S6 Exécution Android | Nous + Android | Volume < 50 ms ; Brave chaud 0,2 – 0,6 s, froid 0,6 – 1,5 s | Exécuteurs pré-chargés, aucun diagnostic |
| S7 Vérification | Nous | Volume < 10 ms ; Brave ≤ 1,5 s (s'arrête dès l'observation) | Sondage 100 ms |
| S8 Retour téléphone → relais → ChatGPT | Nous + réseau | 80 – 300 ms | Même WS |
| S9 Génération + synthèse de la confirmation | OpenAI | 0,5 – 1,5 s avant le premier son | Résultat = phrase courte prête |

**Lecture honnête :** Speed Car maîtrise S4–S8, soit **≈ 0,2 – 0,6 s pour le volume et ≈ 0,5 – 2 s pour Brave** [ESTIMÉ]. ChatGPT impose S1–S3 et S9, probablement **2 à 4 s** au total [ESTIMÉ]. Une confirmation obligatoire (S3) est le seul facteur qui peut doubler le temps perçu. Je ne promets pas « instantané ».

### 5.2 Instrumentation [PROPOSÉ]

Chaque commande transporte un `id` et accumule des horodatages :

```
t1 relais reçoit tools/call      t2 téléphone reçoit (horloge téléphone)
t3 début exécution               t4 fin exécution (executed)
t5 vérification obtenue          t6 téléphone envoie le résultat
t7 relais renvoie à ChatGPT
```

- Décalage d'horloge téléphone↔relais estimé à chaque ping WS (méthode NTP : offset = ((r1−s1)+(r2−s2))/2), stocké avec la mesure.
- Le relais journalise S4 (approximé par la durée HTTP côté serveur), S5, S6, S7, S8 par commande ; consultables dans l'app (« Journal ») et via un point d'API privé.

### 5.3 Protocole pour mesurer aussi la partie ChatGPT

1. Mode « mesure » de Speed Car : petite superposition affichant une horloge en millisecondes **synchronisée sur le relais** (la permission de superposition est déjà nécessaire pour Brave).
2. Enregistreur d'écran HyperOS **avec le micro** (ta voix et la voix de ChatGPT) pendant la série.
3. Pour chaque essai, lire sur la vidéo : `T0` fin de ta phrase (forme d'onde), `Tact` changement visible (barre de volume / Brave au premier plan), `Tconf` début de la voix de confirmation. Croiser avec `t1…t7` du journal (même horloge).
4. On obtient : **S1+S2(+S3) = t1 − T0**, **Speed Car = t7 − t1**, **S9 = Tconf − t7**, **perçu = Tconf − T0**.
5. Séries de 20 essais par action et par condition : Wi-Fi / 4G / 5G, écran allumé / éteint, Brave déjà ouvert / fermé, Bluetooth voiture / haut-parleur. Rapporter médiane et 90ᵉ centile ; séparer clairement mesures et estimations.
6. Mesurer à l'arrêt (moteur coupé ou passager) — jamais en manipulant le téléphone en conduisant.

---

## 6. Ajout progressif de capacités et de fournisseurs

### 6.1 Deux niveaux [PROPOSÉ]

1. **Primitives** (code Kotlin compilé, rares, revues) : `open_url_in_package`, `launch_package`, `adjust_stream`, `media_key` (`AudioManager.dispatchMediaKeyEvent` : lecture/pause/suivant), `speak_local`, etc. Ajouter une primitive = nouvelle version d'APK.
2. **Recettes** (données, fréquentes) : une recette instancie une primitive avec des paramètres figés. Exemple : « Ouvre Waze » = `launch_package { package: "com.waze" }`. Ajouter une recette = **modifier le catalogue côté relais, aucune recompilation**. Le téléphone ne les exécute que si elles sont **signées** par la clé du relais et que la primitive est activée localement.

### 6.2 Fiche de capacité (catalogue `capabilities/*.json`)

```json
{
  "id": "media.volume.up",
  "version": 1,
  "tool": {
    "name": "phone_media_volume_up",
    "title": "Augmenter le volume média (téléphone)",
    "description": "…",
    "triggers_fr": ["augmente le volume", "monte le son", "plus fort"],
    "input_schema": { "steps": { "type": "integer", "min": 1, "max": 3, "default": 1 } },
    "annotations": { "readOnly": false, "destructive": false, "idempotent": false }
  },
  "risk": "write_reversible",
  "android": {
    "primitive": "adjust_stream",
    "params": { "stream": "music", "direction": "raise" },
    "permissions": [],
    "verifier": "stream_index_changed",
    "timeout_ms": 1500
  },
  "ttl_ms": 3000,
  "dedupe_window_ms": 2000,
  "enabled": true
}
```

Classes de risque : `read`, `write_reversible` (volume, ouvrir une app), `write_sensitive` (envoyer un message, appeler, payer — **désactivées par défaut**, confirmation vocale explicite côté ChatGPT, jamais contournée).

### 6.3 Règles pour que l'ajout ne ralentisse pas le reste

- Chaque capacité a **son propre délai d'expiration** et son exécuteur isolé ; aucune vérification globale avant une commande.
- Le relais ne charge que les capacités `enabled`. **Peu d'outils exposés** (objectif < 15) : chaque outil ajouté allonge la liste que le modèle lit à chaque décision [ESTIMÉ]. Au-delà, regrouper par famille (`phone_media_control {action: play|pause|next}`) plutôt que multiplier.
- Changer la liste d'outils peut demander une **actualisation du connecteur dans ChatGPT** [À VÉRIFIER].

### 6.4 Fournisseurs et MCP externes

- Un **fournisseur** (API routière, météo, agenda…) est déclaré avec : documentation officielle, licence/conditions d'usage, type d'authentification, secret stocké **côté relais** (variables secrètes Cloudflare), quotas, et la liste des capacités qu'il alimente.
- **Aucun accès implicite au téléphone** : un fournisseur ou un MCP tiers ne parle **qu'au relais**, avec un *scope* limité à ses capacités ; le téléphone vérifie à son tour que la capacité est autorisée localement (double liste blanche).
- Les autres MCP (ex. Drive) restent connectés à ChatGPT directement ; Speed Car n'est pas un proxy universel.
- Je n'ai identifié **aucun fournisseur routier précis** à ce stade : le choix se fera sur pièces (API publique documentée, couverture du pays, licence).

---

## 7. Commandes demandées vs alertes spontanées

| | Commande demandée | Alerte spontanée |
|---|---|---|
| Déclencheur | Ta phrase à ChatGPT | Un événement (position, danger, horaire) |
| Qui décide | Le modèle ChatGPT choisit l'outil | **Speed Car sur le téléphone**, par règles locales |
| Qui parle | ChatGPT Voice | **Synthèse vocale Android** (`TextToSpeech`) lancée par Speed Car |
| Données de position | Non utilisées | Traitées **localement** ; jamais envoyées en flux à un modèle |

### 7.1 Pourquoi ChatGPT ne peut pas être la source des alertes

Rien dans ce que j'ai lu n'indique qu'un serveur MCP connecté puisse **faire parler ChatGPT de lui-même** en arrière-plan : le modèle appelle des outils quand il répond à un tour. Je ne le suppose donc pas. Et envoyer chaque position GPS à un modèle distant serait coûteux, lent et intrusif.

### 7.2 Conception du moteur d'alertes [PROPOSÉ, phase ultérieure]

1. **Surveillance** : service au premier plan de Speed Car (type `location` en plus), actif seulement en mode conduite. La position (Fused Location) est comparée **localement** à des données d'événements.
2. **Données** : le relais télécharge auprès du fournisseur les événements par **tuiles géographiques** autour de la position (précharge, rafraîchissement toutes les N minutes, ou poussée quand le fournisseur le permet). Le téléphone n'envoie au relais que la **tuile** demandée, pas une trace continue.
3. **Déclenchement** : règle = distance + direction de déplacement compatible + validité temporelle de l'événement.
4. **Anti-répétition** : clé `(event_id, version)` déjà annoncée → silence ; temps de recharge par type ; regroupement (« 2 dangers dans 3 km »).
5. **Péremption** : chaque événement porte `valid_until` ; un événement périmé ou dépassé (déjà derrière toi) est retiré.
6. **Diffusion audio** : focus audio transitoire avec atténuation, usage `USAGE_ASSISTANCE_NAVIGATION_GUIDANCE`, phrase < 6 mots ; file d'attente si ChatGPT parle.
7. **Contraintes Android** : un service au premier plan utilisant la localisation **ne peut pas être créé depuis l'arrière-plan même avec une exemption** [LU] → le démarrer quand l'app est visible (tuile Réglages rapides, widget) ou étudier la permission de localisation en arrière-plan [À VÉRIFIER].
8. **Légal** : l'annonce de radars est réglementée différemment selon les pays (en France, par exemple, seuls des avertissements de « zones » sont admis). Le fournisseur choisi doit être conforme au pays de circulation.

---

## 8. La plus petite preuve de bout en bout

### Porte 0 — « ChatGPT Voice appelle-t-il NOTRE MCP sur Android ? » (½ journée, aucun code Android)

- Relais minimal + OAuth + un seul outil inoffensif `speedcar_ping` (écriture d'un horodatage côté serveur, annoté honnêtement).
- Connexion du serveur dans ChatGPT (création sur le **web** en mode développeur), puis test **dans la voix de l'app Android**, PC éteint, en 4G.
- On note : l'outil est-il visible en voix ? appelé sans mention explicite ? y a-t-il une confirmation, et peut-elle être mémorisée ? délai `T0 → t1` ?
- **Go** : appel vocal réussi. **No-go** : basculer vers le plan B (§3 option D) en expliquant le blocage exact avant tout autre travail.

### Porte 1 — **preuve E2E minimale réelle** : « Augmente le volume »

- App Android : service au premier plan + WebSocket + **une seule capacité `media.volume.up`** + journal.
- Critère de réussite : en 4G, PC éteint, téléphone verrouillé dans le support, la phrase « augmente le volume » produit **+1 cran réel sur `STREAM_MUSIC`**, la valeur vérifiée est dite par ChatGPT, et le journal montre `t1…t7`. 20 essais, ≥ 19 réussis.
- Pourquoi le volume en premier : il ne dépend d'aucune exemption de lancement d'activité ; il isole la chaîne ChatGPT → relais → téléphone.

### Porte 2 — « Mets YouTube »

- Ajout de `open_url_in_package` + vérification `UsageStats` + écran de permissions. Même critère (20 essais, statut exact rapporté, aucun lancement de l'app YouTube).

---

## 9. Plan de réalisation pour Codex

### 9.1 Arborescence proposée

```
speed-car/
  relay/                 # Cloudflare Worker (TypeScript)
    src/mcp.ts           # serveur MCP Streamable HTTP, tools/list depuis le catalogue
    src/oauth.ts         # OAuth 2.1 mono-utilisateur (enregistrement dynamique de client si requis par ChatGPT)
    src/phone-hub.ts     # Durable Object : WS téléphone, commandes, TTL, dédoublonnage, horodatages
    src/sign.ts          # signature Ed25519 des commandes
    wrangler.toml
  android/               # Kotlin, Gradle
    app/src/main/.../DriveService.kt       # service 1er plan (type specialUse), WS, reconnexion
    app/src/main/.../CommandRouter.kt      # vérif signature/TTL/doublon -> exécuteur
    app/src/main/.../exec/VolumeExecutor.kt
    app/src/main/.../exec/OpenUrlExecutor.kt
    app/src/main/.../verify/ForegroundVerifier.kt  # UsageStatsManager
    app/src/main/.../ui/SetupScreen.kt     # liste des autorisations avec état vert/rouge + bouton vers le bon écran
    app/src/main/.../LatencyLog.kt
  capabilities/
    media.volume.up.json
    browser.youtube.brave.json
  docs/
    latency-protocol.md
```

### 9.2 Protocole relais ↔ téléphone (JSON sur WSS) [PROPOSÉ]

```json
// relais -> téléphone
{ "v":1, "type":"cmd", "id":"7f3c…", "cap":"media.volume.up", "args":{"steps":1},
  "issued_at":1761834000123, "expires_at":1761834003123, "sig":"base64-ed25519" }
// téléphone -> relais (immédiat)
{ "v":1, "type":"ack", "id":"7f3c…", "t2":1761834000201 }
// téléphone -> relais (final)
{ "v":1, "type":"result", "id":"7f3c…", "status":"verified",
  "observed":{"before":8,"after":9,"max":15,"output":"BT_A2DP:Voiture","audio_mode":"normal"},
  "say":"Volume média à 9 sur 15, sur le Bluetooth de la voiture.",
  "timings":{"t2":…,"t3":…,"t4":…,"t5":…,"t6":…} }
```

Statuts finaux possibles : `verified`, `verified_at_limit`, `executed_unverified`, `launched_behind_lock`, `needs_user_tap`, `failed:<code>`, `expired`, `rejected:<code>` (signature, capacité désactivée, schéma), `duplicate`, `phone_offline`.

### 9.3 Fiabilité — règles à implémenter

- **Identifiants** : `id` UUID généré par le relais ; le téléphone garde les 200 derniers `id` → un renvoi est ignoré (`duplicate`).
- **Doublons côté ChatGPT** : un même appel d'outil réessayé ne doit pas monter le volume deux fois → le relais dédoublonne `(outil, arguments)` dans une fenêtre de 2 s et renvoie le résultat déjà obtenu.
- **Expiration** : `expires_at` (3 s volume, 5 s Brave) ; le téléphone refuse une commande périmée (`expired`) avec correction du décalage d'horloge. Une commande arrivée en retard ne s'exécute jamais « plus tard par surprise ».
- **Téléphone hors ligne** : le relais répond `phone_offline` en ≤ 2 s (ou ≤ 4 s si un réveil FCM est tenté) — jamais d'attente muette.
- **Reconnexion** : `ConnectivityManager.NetworkCallback.onAvailable` → reconnexion immédiate ; sinon réessai exponentiel plafonné à 5 s en mode conduite ; ping WS toutes les 25 s (réponse automatique sans réveil du Durable Object).
- **Service au premier plan** : type `specialUse` (app personnelle installée hors Play ; la justification n'est examinée que lors d'une publication Play [LU]) — **pas** `dataSync`, limité à 6 h / 24 h en arrière-plan sur Android 15+ [LU].
- **Démarrage du mode conduite** (par ordre de préférence) :
  1. **Association de la voiture via `CompanionDeviceManager`** (appareil Bluetooth de l'autoradio) + observation de présence : à l'apparition de la voiture, Speed Car est réveillé et peut démarrer son service au premier plan — le Companion Device Manager fait partie des exemptions officielles de démarrage de service depuis l'arrière-plan [LU] ; comportement exact sur HyperOS [À VÉRIFIER].
  2. Tuile Réglages rapides « Speed Car » (un tap à l'arrêt).
  3. Toujours actif (coût batterie à mesurer).
- **Redémarrage** : relance après `BOOT_COMPLETED` / déverrouillage (sur Android 15+, certains types de services ne peuvent pas démarrer depuis `BOOT_COMPLETED`, dont `dataSync` [LU]) ; nécessite le **démarrage automatique HyperOS**.
- **Mise en veille** : verrou de réveil partiel **uniquement** pendant l'exécution d'une commande.
- **Sécurité** : OAuth (aucun accès non authentifié) ; jeton d'appareil issu d'une paire de clés Android Keystore enregistrée une fois ; commandes signées ; liste blanche locale ; interrupteur « Couper Speed Car » dans la notification ; limite de débit (ex. 30 commandes/min) ; aucun secret dans une page web ; journal des commandes consultable.

### 9.4 Réglages à préparer une fois, à l'arrêt (écran « Préparation » de l'app)

Pour **Speed Car** :
- Notifications autorisées (service au premier plan visible).
- Afficher par-dessus les autres applications.
- Autres autorisations Xiaomi : **pop-up en arrière-plan**, **affichage sur l'écran de verrouillage**.
- **Démarrage automatique** activé.
- Batterie : **Aucune restriction** + ignorer l'optimisation de batterie.
- Accès aux données d'utilisation.
- (Option) verrouiller l'app dans les applications récentes.
- Association de la voiture (Companion Device).

Pour **ChatGPT** :
- Voix → **Conversations en arrière-plan** activées (désactivées par défaut d'après la presse ; nécessaires pour que la voix continue quand Brave passe au premier plan) [LU, sources secondaires].
- Batterie : aucune restriction.
- Connecteur Speed Car ajouté et autorisé ; réglage des autorisations d'action si disponible.

Pour **YouTube / Brave** :
- App YouTube : désactiver « Ouvrir les liens pris en charge » (si Brave renvoie vers l'app).
- Brave : connecté/ouvert une fois, lecture en arrière-plan si souhaitée.

L'écran « Préparation » affiche l'état réel de chaque autorisation lisible par API (vert/rouge) et un bouton vers l'écran système correspondant ; les autorisations propriétaires Xiaomi non lisibles par API sont marquées « à confirmer manuellement » puis **testées** par un bouton « Essai de lancement Brave ».

### 9.5 Étapes et critères d'acceptation

| Phase | Contenu | Critère de sortie |
|---|---|---|
| **P0** | Relais minimal, OAuth, `speedcar_ping`, connexion ChatGPT | Appel vocal depuis l'app Android en 4G, confirmation(s) documentée(s), délai `T0→t1` noté |
| **P1** | App : service, WS, `media.volume.up`, journal ; relais : PhoneHub, TTL, dédoublonnage | Porte 1 : 19/20 réussites, statuts exacts, minutages `t1…t7` |
| **P2** | `browser.youtube.brave`, vérification UsageStats, écran Préparation | Porte 2 : 19/20, jamais l'app YouTube, verrouillage correctement signalé |
| **P3** | Robustesse : changement Wi-Fi↔4G, écran éteint 30 min, redémarrage, app tuée depuis les récents, téléphone hors ligne, doublons, commande expirée ; Companion Device ; secours FCM (optionnel) | Chaque cas a un test et un statut correct ; reconnexion < 5 s après retour du réseau |
| **P4** | Catalogue + recettes signées ; 2–3 capacités nouvelles (lecture/pause, ouvrir une app) | Ajout d'une recette sans recompiler ; temps des outils existants inchangé (mesuré) |
| **P5** | Moteur d'alertes local, après choix d'un fournisseur documenté | Pas de répétition, pas d'alerte périmée, aucune trace GPS continue envoyée |

Tests automatisés minimaux : tests unitaires du routeur (signature, TTL, doublon, schéma), tests du Durable Object (délais, hors ligne), test instrumenté Android du volume (émulateur) ; les tests HyperOS restent manuels et scriptés (liste de contrôle).

---

## 10. Limites de cette proposition et causes d'échec possibles

1. **Disponibilité de notre MCP en voix sur Android — incertitude majeure.** La documentation officielle d'OpenAI indique que la voix peut utiliser les « plugins et applications connectées » du compte (mise à jour de septembre 2026) [LU]. Mais les sources divergent sur deux points pour un MCP **personnalisé** : les forfaits éligibles au mode développeur (Plus/Pro selon certaines sources, Business/Enterprise/Edu selon la page d'aide plus ancienne), et son usage depuis le mobile (création sur le web ; usage mobile contesté). Je n'ai pas pu ouvrir directement les pages OpenAI depuis mon environnement (accès réseau refusé) : ces points reposent sur des résultats de recherche. **D'où la Porte 0 avant tout.**
2. **Confirmations d'écriture.** ChatGPT confirme par défaut les actions d'écriture [LU] ; si la voix exige « oui » à chaque commande sans possibilité de mémoriser, on perd un tour vocal (~2–4 s) [ESTIMÉ]. Nous ne contournerons pas cela en mentant sur les annotations.
3. **Choix d'outil par le modèle.** Même bien décrit, le modèle peut parfois parler au lieu d'appeler l'outil, ou ajouter une phrase. On réduit le risque (instructions serveur + instructions personnalisées + noms explicites), on ne le supprime pas.
4. **HyperOS.** Le système peut tuer le service, bloquer les lancements en arrière-plan malgré les permissions, ou réinitialiser des autorisations après une mise à jour. Les permissions Xiaomi ne sont pas documentées officiellement par Google ; ma source est la documentation d'éditeurs tiers.
5. **Brave peut renvoyer vers l'app YouTube** ou ne pas réutiliser l'onglet ; la vérification ne prouve que « Brave au premier plan », pas l'URL.
6. **Concurrence audio.** ChatGPT Voice tient probablement le focus audio : YouTube peut être mis en pause ou atténué tant que la conversation dure ; Speed Car n'y peut rien.
7. **Autoradio Bluetooth** sans volume absolu : l'index du téléphone peut monter sans que le son monte vraiment dans la voiture ; on le signale mais on ne peut pas le mesurer acoustiquement.
8. **Écran verrouillé** : Brave s'ouvre derrière le verrouillage.
9. **Dépendances cloud** : OpenAI et Cloudflare (ou le VPS choisi). Pas de mode hors ligne pour la voix ChatGPT.
10. **Latence** : la majorité du temps perçu est côté ChatGPT ; même un Speed Car parfait ne descendra pas sous la somme S1+S2+S9.
11. **Sécurité routière et légalité** : Speed Car vise des commandes mains libres ; regarder une vidéo en conduisant reste interdit dans la plupart des pays, et les alertes radar sont réglementées.
12. **Ce que je n'ai pas fait** : aucun test sur le Redmi, aucun test de ChatGPT Voice avec un MCP, aucune mesure. Toutes les durées du §5 sont des estimations.

---

## 11. Sources et niveau de preuve

**Testé :** rien.

**Lu (documentation officielle Android, consultée le 30/10/2026) :**
- Restrictions de lancement d'activité en arrière-plan et exemptions (dont `SYSTEM_ALERT_WINDOW`, `PendingIntent` système, changements Android 14/15/16) : https://developer.android.com/guide/components/activities/background-starts
- Restrictions de démarrage de service au premier plan depuis l'arrière-plan (FCM haute priorité, Companion Device Manager, optimisation batterie, superposition visible pour Android 15+, permissions « pendant l'utilisation ») : https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start
- Types de services au premier plan (`specialUse`, `connectedDevice`, `dataSync`) : https://developer.android.com/develop/background-work/services/fgs/service-types
- Délai de 6 h/24 h pour `dataSync` (Android 15) : https://developer.android.com/develop/background-work/services/fgs/timeout
- Changements de comportement Android 16 : https://developer.android.com/about/versions/16/behavior-changes-all et https://developer.android.com/about/versions/16/behavior-changes-16
- Priorité des messages FCM et rétrogradation (via résultats de recherche ; la page n'a pas pu être ouverte directement) : https://firebase.google.com/docs/cloud-messaging/android/message-priority et https://developer.android.com/training/monitoring-device-state/doze-standby

**Lu (OpenAI — via résultats de recherche, pages non ouvrables depuis mon environnement) :**
- Mode développeur et applications MCP : https://help.openai.com/en/articles/12584461-developer-mode-and-mcp-apps-in-chatgpt et https://developers.openai.com/api/docs/guides/developer-mode
- ChatGPT Voice (applications connectées pendant la voix) : https://help.openai.com/en/articles/20001274-chatgpt-voice
- Notes de version ChatGPT / Business : https://help.openai.com/en/articles/6825453-chatgpt-release-notes et https://help.openai.com/en/articles/11391654-chatgpt-business-release-notes
- Conversations vocales en arrière-plan : https://help.openai.com/articles/8400625 (et presse : https://www.androidauthority.com/chatgpt-voice-background-listening-3449372)

**Lu (sources secondaires, à prendre avec prudence) :**
- Permission Xiaomi « pop-up en arrière-plan » : https://community.f-secure.com/internet-security-en/kb/articles/8599-setting-up-your-xiaomi-device-to-work-properly-with-the-security-app et https://cdn-download.drweb.com/pub/drweb/android/pro/HTML/en/dw_xiaomi.htm
- Annotations d'outils MCP et leurs valeurs par défaut : https://www.mcpbundles.com/guides/tool-annotations
- Comportement d'`adjustStreamVolume` / volume fixe : https://learn.microsoft.com/en-us/dotnet/api/android.media.audiomanager.adjuststreamvolume
- Volume absolu Bluetooth (AOSP) : https://android.googlesource.com/platform/packages/modules/Bluetooth/+/8a4ff9811b%5E%21/
- Éligibilité des forfaits au MCP personnalisé (sources contradictoires) : https://coworker.ai/blog/chatgpt-mcp , https://peliqan.io/blog/chatgpt-mcp/

**Proposé (non sourcé, à valider) :** relais Cloudflare + Durable Object, protocole WS, `EXTRA_APPLICATION_ID` pour réutiliser l'onglet Brave, vérification par `UsageStatsManager`, catalogue de capacités et recettes signées, moteur d'alertes local, protocole de mesure par enregistrement d'écran.
