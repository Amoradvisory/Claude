# Speed Car Android — prototype local 0.2.0

Cette première application Kotlin permet de tester, à l’arrêt, les deux primitives Android. Le relais MCP existant reste séparé : **aucune commande vocale distante n'est encore raccordée**.

Installée le 31 octobre 2026 sur le Redmi 2510ERA8BG. Le gestionnaire de paquets confirme la version et l'écran a été lu en arrière-plan via go.js, puis cette session arrêtée. Les effets réels des deux boutons restent à tester ; voir `../docs/speed-car/PREUVE-ANDROID-20261031.json`.

- Un bouton augmente uniquement `STREAM_MUSIC`, lit l’index avant/après et conserve un résultat. Le plafond initial est 60 %, réglable et mémorisé. Un volume déjà supérieur n’est pas baissé.
- Un bouton transmet `https://m.youtube.com/` explicitement à `com.brave.browser`. Il ne lance pas de vidéo et ne déclare pas le chargement de l’URL vérifié.
- Le dernier résultat et le plafond sont persistés. Le diagnostic peut être copié par un bouton.
- Aucun service, tunnel, port réseau, accès à la localisation, microphone, superposition, permission d’accessibilité ou recherche web. Seule permission : `MODIFY_AUDIO_SETTINGS`.
- Le prototype s’utilise au premier plan. Il ne démontre pas le fonctionnement en arrière-plan, sur écran verrouillé ou depuis ChatGPT vocal.

## Construire

JDK 17 ou 21, SDK Android 35 et Build Tools 35.0.0. Le wrapper Gradle fixe la version 8.11.1 et sa somme SHA-256.

```sh
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
```

APK : `app/build/outputs/apk/debug/app-debug.apk`. C’est un paquet de développement signé avec la clé de debug locale, pas une version de production. Conserver la même clé pour une mise à jour sans désinstallation ; ne pas la publier dans Git.

## Vérification sur le Redmi

Installation et essais à l’arrêt uniquement. Vérifier le modèle et le numéro de série avant toute commande ADB. L’usage des boutons, une fois l’application installée, ne nécessite aucun PC ni ADB.

1. Ouvrir Speed Car. Vérifier que l’interface dit que la voix n’est pas connectée.
2. Noter le volume média, appuyer une fois, vérifier le résultat `before/after` et l’index Android. Si le plafond est déjà atteint, constater l’absence de hausse. Ne pas provoquer une hausse pendant un appel.
3. Appuyer sur YouTube dans Brave. Constater le paquet Brave et l’URL réellement affichée, sans lancer de contenu.
4. Refaire après fermeture/réouverture pour vérifier la conservation du plafond et du résultat.

Le contrôle vocal reste **PRÉPARÉ À TESTER**, pas acquis. La prochaine étape dépend du déploiement du relais dans le compte Cloudflare du propriétaire et d’un appel réel de son outil d’écriture depuis ChatGPT vocal. Ensuite seulement : appairage du téléphone, transport WSS, dédoublonnage persistant, expiration et service Android en arrière-plan.

## Retour arrière

Désinstaller uniquement `fr.speedcar.app` depuis les réglages Android. Les fonctions existantes phoned, Tailscale et Brave ne sont ni remplacées ni reconfigurées. Aucune recette Speed Car ne doit être déclarée validée avant ses preuves sur appareil.
