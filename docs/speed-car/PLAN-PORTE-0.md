# Speed Car : première preuve MCP — plan du 30 octobre 2026

Objectif : préparer et vérifier localement un relais Cloudflare authentifié qui expose une véritable écriture de test. La disponibilité en voix sur le compte réel est une validation externe encore nécessaire. L'application Android attend cette validation.

Conception : `CONCEPTION.md`, complétée par `INSTRUCTION-CODEX.md`. Exécution dans la copie isolée `/workspace/speed-car-project`, branche `codex/speed-car-gate0`. Aucun accès au téléphone pendant cette phase.

Architecture : un Worker, la bibliothèque OAuth officielle Cloudflare, un serveur MCP officiel et un Durable Object pour conserver un reçu borné. Autorisation initiale par un secret propriétaire aléatoire saisi une fois dans la page de consentement HTTPS. Aucun secret de propriétaire dans les URL. Les actions ultérieures passent par des jetons OAuth, pas par ce secret. La page affiche le client, la destination et les droits demandés ; validation anti-CSRF liée à un cookie sécurisé. Le rejeu séquentiel est refusé ; la limite du KV pour deux validations simultanées reste documentée.

Choix de portée : le secret propriétaire évite d'exiger un deuxième fournisseur OAuth avant le premier test. Il doit être généré localement, saisi à l'arrêt, conservé hors du dépôt et révocable. Seul ce propriétaire peut accorder une autorisation. Aucun compte Cloudflare ni abonnement n'est créé automatiquement.

## Contraintes communes

- Node 24, TypeScript, dépendances verrouillées ; un processus de test à la fois.
- Pas de commande sur téléphone, pas d'ADB/RDC/PC sur le parcours d'exploitation.
- `speedcar_test_action` est une écriture réelle, reçue et observée dans le stockage du relais ; elle ne prouve pas une action Android.
- Aucun accès MCP anonyme ; aucune détection « tout fonctionne » fondée sur HTTP 200.
- Aucune dépense ou publication externe sans configuration et compte appropriés.

## Risques à couvrir dans les tests

Accès sans jeton ; mauvaise origine ou mauvais secret de consentement ; réutilisation du consentement ; deux appels volontaires identiques ; reconnexion au serveur et lecture du reçu après stockage. Le contexte OAuth et le protocole MCP doivent être testés dans le runtime Worker réel.

## Tâche 1 : environnement et contrat OAuth/MCP

- [x] Installer les bibliothèques et le runtime de test ; créer la configuration locale isolée et l'exemple de variables sans secret.
- [x] Écrire un test qui exige un défi OAuth sans jeton, initialise MCP avec un jeton réellement émis et vérifie les annotations de l'outil.
- [x] Constater l'échec attendu, puis implémenter le minimum du serveur et l'émission d'un jeton via la bibliothèque officielle.

## Tâche 2 : consentement et reçus durables

- [x] Écrire et faire échouer les tests pour mauvais secret, mauvaise origine, consentement rejoué et écriture relue depuis le stockage.
- [x] Implémenter la page de consentement sécurisée, ses délais bornés et son invalidation après utilisation (limite de concurrence KV documentée).
- [x] Implémenter `speedcar_test_action` et `speedcar_status` avec compteur et dernier reçu bornés ; vérifier que deux appels volontaires distincts produisent deux reçus.

## Tâche 3 : diagnostic et livraison

- [x] Fournir `npm run diagnostic -- <URL>` : sonde publique sans secret, découverte OAuth et refus d'un appel non authentifié ; aucun succès vocal déduit.
- [x] Vérifier la compilation et le paquet Worker par un déploiement à blanc, puis exécuter toute la suite.
- [x] Relire le code, préparer la configuration Cloudflare et le protocole du test Android vocal en données mobiles, PC éteint.
- [x] Livrer les preuves locales et les blocages externes exacts ; conserver P0 réel « PRÉPARÉ À TESTER » tant qu'un reçu depuis ChatGPT vocal n'a pas été observé.
