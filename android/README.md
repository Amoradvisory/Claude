# Speed Car Android 0.3.1

Application Kotlin personnelle `fr.speedcar.app` installée sur le Redmi 2510ERA8BG, Android 16. Les commandes distantes passent par une connexion WSS sortante authentifiée vers le relais Cloudflare ; aucun PC, ADB, Tailscale, port entrant, microphone ou accès root dans ce trajet.

## Capacités

- Lire modèle, batterie, réseau, état de verrouillage, volume média et autorisations.
- Monter ou baisser uniquement le volume média, de 1 à 3 index ; lire avant/après. Plafond local réglable, 60 % initial. Ne pas déduire le volume acoustique ou l'absence d'effet sur ChatGPT Voice de la seule valeur STREAM_MUSIC.
- Demander `https://m.youtube.com/` explicitement à Brave. Aucun démarrage de vidéo. L'accès aux données d'utilisation observe la reprise de Brave ; le reçu ne prétend pas vérifier le contenu de l'URL.
- Notification permanente avec bouton Arrêter. Une seule connexion et un seul exécuteur de commandes, reconnexion espacée de 2 à 60 secondes avec aléa. Pas de commande différée au retour d'un téléphone hors ligne.

Appairage privé : jeton chiffré AES-GCM avec Android Keystore ; aucun jeton dans l'APK ou Git. Le fichier d'import temporaire est supprimé après import. Identité du téléphone et origine HTTPS épinglées. Journal SQLite : identifiant enregistré avant l'effet, résultat persistant et dédoublonnage, réémission des reçus non acquittés. Conservation bornée à 200 commandes / 24 h ; au-delà, pas de garantie de rejeu sans effet. Une commande interrompue après son début reste incertaine et n'est pas exécutée une seconde fois.

## Permissions et limites

Notifications, service actif de type specialUse, réseau et réglage audio. Pour l'ouverture de Brave : superposition ; pour observer sa reprise : accès aux données d'utilisation. Exemption d'optimisation de batterie vérifiée par l'API sur le Redmi. Pas de permission d'accessibilité ou de localisation.

Le récepteur de redémarrage et de mise à jour est préparé, mais le redémarrage Android et l'autodémarrage HyperOS n'ont pas été testés. Après une mise à jour 0.3.1, ouvrir Speed Car a été nécessaire pour la reprise observée et la permission de superposition a dû être réaccordée. Ne pas promettre une reprise sans geste après tout redémarrage. Ouvrir Speed Car et activer Connexion si nécessaire ; relire les permissions. Les restrictions HyperOS propres aux fenêtres en arrière-plan n'ont pas été lues.

## Construire et vérifier

JDK 17 complet, SDK Android 35, Build Tools 35.0.0 ; wrapper Gradle 8.11.1 avec somme SHA-256.

```sh
./gradlew --no-daemon testDebugUnitTest lintDebug assembleDebug
```

APK : `app/build/outputs/apk/debug/app-debug.apk`. Signature de développement locale, à conserver pour les mises à jour sans désinstallation. La clé reste privée. Ne pas distribuer comme version de production.

Le 31/10/2026 : 9 tests JVM réussis, analyse Android sans erreur, APK signé installé et version relue. Volume et état vérifiés par MCP sur Wi-Fi puis données mobiles ; hausse, baisse et absence de double effet sur reprise du même identifiant. Brave repris après la commande dédiée. Preuves : `../docs/speed-car/PREUVES-LIAISON-20261031.json`. Ces essais par client de diagnostic ne prouvent pas à eux seuls une invocation dans ChatGPT.

## Arrêt et retour arrière

Bouton Arrêter dans la notification ou l'application : désactive le mode distant. APK précédents conservés sur le PC dans `C:\ChatGPT-Agent\speed-car`. Ne désinstaller que `fr.speedcar.app` si un retrait est demandé. Les mécanismes existants phoned et Tailscale restent indépendants.
