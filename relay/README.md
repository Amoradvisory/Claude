# Relais Speed Car 0.3.1

Worker Cloudflare TypeScript + OAuth 2.1/PKCE + MCP + Durable Objects. Le relais commande uniquement le Redmi appairé par sa connexion WSS sortante. Speed Car est un outil personnel de commande Android, pas un jeu, et n'expose aucun véhicule, score, avatar ou pilote autonome.

## Outils MCP

| Outil | Effet |
|---|---|
| `phone_status` | Lecture native actuelle du téléphone, sans réveil |
| `phone_media_volume_up` | Hausse média de 1 à 3 index, plafond local, lecture avant/après |
| `phone_media_volume_down` | Baisse média de 1 à 3 index, lecture avant/après |
| `phone_open_youtube_brave` | Ouverture ciblée de YouTube dans Brave, sans lecture vidéo |
| `phone_command_status` | Relecture d'un reçu sans rejouer l'effet |
| `speedcar_test_action` | Écriture d'un reçu de test du relais seulement |
| `speedcar_status` | Relecture du dernier reçu de test du relais |

Les commandes physiques exigent un `command_id` UUID : nouveau pour chaque demande volontaire, identique sur reprise du transport. Après `indeterminate`, lire le reçu et ne pas recréer un identifiant pour rejouer aveuglément. Expiration : 3 s pour état/volume, 5 s pour Brave. Téléphone hors ligne : refus immédiat sans file d'attente. Reçus conservés au plus 200 commandes / 24 h. `unknown` ne prouve pas l'absence d'effet ancien.

## Authentification et configuration

MCP : `https://speed-car-relay.speed-car-relay.workers.dev/mcp`.
OAuth requiert les droits `speedcar:test speedcar:phone` ; demander aussi `offline_access` pour le renouvellement. Le consentement personnel est protégé par secret propriétaire, cookie lié au navigateur, contrôle strict d'origine, formulaire borné et limitation des essais. Aucun secret dans les URL ou Git.

Variables privées du Worker : `OWNER_SETUP_SECRET`, `PUBLIC_ORIGIN`, `PHONE_DEVICE_ID`, `PHONE_TOKEN_HASH`, `PHONE_MODEL`. Le relais ne reçoit que le SHA-256 du jeton appareil. Namespace KV OAuth, Durable Objects `OwnerState` et `PhoneLink`. Créer les ressources uniquement dans le compte personnel autorisé.

La configuration de production, avec identifiants de compte et de namespace, est dans `wrangler.production.jsonc`, ignorée par Git. Le modèle suivi `wrangler.jsonc` exige de remplacer le namespace avant un premier déploiement. Utiliser Wrangler OAuth officiel ; ne jamais recopier ses jetons dans les sources.

```sh
npm ci
npm run check
npm test
npm run build
npx wrangler whoami
npx wrangler deploy --config wrangler.production.jsonc
npm run diagnostic -- https://speed-car-relay.speed-car-relay.workers.dev
```

`build` effectue un déploiement à blanc. Le diagnostic public n'appelle aucune action physique et vérifie aussi le refus des GET et POST MCP anonymes. `relay_ready` ne prouve ni liaison Android ni ChatGPT.

## Régression navigateur corrigée

Une page OAuth peut réussir en test HTTP et échouer réellement dans Chromium. `Referrer-Policy: no-referrer` faisait envoyer `Origin: null` au formulaire POST, refusé par le contrôle CSRF. Politique corrigée en `same-origin`, conservant l'absence de référent sur le retour externe. Ensuite, `form-action 'self'` bloquait la redirection OAuth ; la politique autorise désormais uniquement l'origine du retour déjà validé par le fournisseur OAuth. Aucun joker ni suppression du contrôle d'origine. Test de régression et observation dans Brave Android.

## Validation

`npm test` : 22 tests Worker et 3 tests Node. OAuth réel PKCE, droits, refus anonyme, contrôle d'origine, cookie, rejeu séquentiel, entrées invalides, stockage durable, connexion WSS et identité appareil, expiration et dédoublonnage.

`scripts/live-proof.mjs` : véritable OAuth et reçu du relais, avec fichier propriétaire privé ; ne teste pas ChatGPT. Export facultatif du jeton dans un fichier privé via `SPEEDCAR_TOKEN_OUT`. `scripts/phone-call.mjs` : essai MCP authentifié sur une commande autorisée, reçu sauvegardé avant émission, aucune reprise automatique. Garder tous les fichiers de jetons hors dépôt.

Les jetons d'accès expirent après 1 h ; renouvellement jusqu'à 30 jours, réauthentification possible. Une rotation du secret propriétaire ne révoque pas les autorisations existantes. Pour interrompre les effets du téléphone immédiatement, arrêter Speed Car sur l'appareil ou retirer/faire tourner son appairage ; pour couper l'accès au serveur, désactiver uniquement ce Worker dans Cloudflare. Ne pas supprimer les stockages sans besoin explicite.

## ChatGPT

Installer l'intégration privée avec son URL MCP et OAuth, autoriser les deux droits, puis tester dans une nouvelle conversation. La présence du nom dans le catalogue et une recherche publique vide ne démontrent pas la disponibilité des outils d'une application privée. Un essai depuis le vrai ChatGPT, avec résultat natif, reste la preuve indispensable. Le mode vocal n'est plus une condition bloquante à la demande de l'utilisateur ; il n'est pas déclaré vérifié.
