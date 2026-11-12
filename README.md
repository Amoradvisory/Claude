# Speed Car

Commande rapide d'un Redmi Android depuis la voix de ChatGPT, avec un relais MCP cloud et, ensuite, une application Android native. L'exploitation doit fonctionner en données mobiles avec le PC éteint.

**État : première étape serveur construite et testée localement.** Aucun déploiement cloud, aucun appel depuis ChatGPT vocal et aucune action Android Speed Car n'ont encore été observés. Ne pas présenter le téléphone comme pilotable par cette application.

- [Conception initiale](docs/speed-car/CONCEPTION.md)
- [Instruction corrigée et exigences](docs/speed-car/INSTRUCTION-CODEX.md)
- [Plan de la première étape](docs/speed-car/PLAN-PORTE-0.md)
- [État et preuves](docs/speed-car/PROGRESSION.md)
- [Relais, installation et test vocal](relay/README.md)

L'étape suivante après la validation vocale réelle sera `phone_media_volume_up`, puis `phone_open_youtube_brave`. Le Quest est hors périmètre.

## Speed Car 2.1.0 (12/11/2026)

Pilotage vocal du Redmi : diagnostic de l'incident du 11/11, décision d'architecture, correctif de la liaison et outils pour la voix. **Écrit et testé hors appareil ; ni déployé ni vérifié sur le téléphone.**

- [Rapport : diagnostic, décision, correctif, bilan](docs/speed-car/2.1/RAPPORT-20261112.md)
- [Déploiement depuis le PC et recette T1 à T12](docs/speed-car/2.1/DEPLOIEMENT-ET-RECETTE.md)
- [Guide d'utilisation à la voix](docs/speed-car/2.1/GUIDE-VOCAL.md)
- Vérification hors SDK Android : `cd tools/android-compile-check && gradle test`
