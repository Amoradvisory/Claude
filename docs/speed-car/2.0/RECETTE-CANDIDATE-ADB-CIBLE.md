# Recette candidate : ADB ciblé et réparé à la demande (NON VALIDÉE)

> À copier dans `journal\RECETTES.md` **uniquement après** la réussite des tests A à H de `REPARATION-20261104.md` sur le vrai Redmi. D'ici là, cette recette n'est pas acquise.

## Recette — Piloter le Redmi par ADB sans ambiguïté

- **Problème** : `adb.exe: more than one device/emulator`, puis `device offline` sur un transport affiché `device` (incident du 04/11/2026).
- **Règle** : ne jamais lancer `adb shell …` nu vers le Redmi. Toujours passer par `node tools\windows\redmi-adb.mjs <commande> --id <uuid>`.
- **Ce que fait l'outil** :
  1. lit `adb devices -l` ;
  2. ne retient que le modèle `2510ERA8BG` ;
  3. retire puis reconnecte uniquement les entrées TCP du Redmi qui sont offline ou muettes ;
  4. prouve le transport avec `shell echo` ;
  5. exécute avec `-t <transport_id>` ;
  6. vérifie l'application au premier plan.
- **Ne jamais** : `adb kill-server`, ni une commande sur un autre appareil, ni présenter cette voie comme Speed Car.
- **Preuve** : le JSON renvoyé (`status`, `transport`, `foreground_package`, `command_id`). « Envoyé », « ouvert » et « navigation démarrée » sont distincts.

## Note go.js (à ajouter dans l'aide `ph`)

```
ph : la voie ADB passe par tools\windows\redmi-adb.mjs (transport explicite, réparation ciblée,
     idempotence par --id, vérification du premier plan). Ne pas appeler adb nu.
     Speed Car reste la voie principale ; annoncer toute bascule vers le PC.
```
