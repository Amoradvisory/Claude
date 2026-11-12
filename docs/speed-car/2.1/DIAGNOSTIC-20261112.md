# Speed Car 2.1.1 — résolution des noms et lecture sur Android existant

Le relais 2.1.1 corrige la résolution des applications et améliore les diagnostics, sans imposer une mise à jour immédiate de l’APK Android. Une recette réelle dans ChatGPT a ouvert l’application cible au premier plan, puis lu son écran dans un second appel ; les deux reçus ont été relus indépendamment et le premier plan contrôlé sur Android. Les identifiants de conversation, reçus et valeurs personnelles du test sont conservés dans le compte rendu local remis au propriétaire.

## Corrections déployées dans le relais

- Normalisation Unicode des accents, espaces et séparateurs des noms. Alias courants vérifiés par leur package exact ; les clones de préfixe et les noms ambigus ne sont pas choisis arbitrairement.
- Recherche native bornée. Un inventaire tronqué ou réduit par la priorité native aux noms courts est refusé. Une lecture de catalogue froid sans effet est attendue au plus une fois, sans rejouer l’ouverture.
- Même UUID : contrôle des arguments d’origine et relecture du reçu avant une nouvelle résolution. La livraison de l’effet reste unique.
- Distinction entre consentement local, activation Android et service connecté. Une donnée absente sur un ancien APK reste inconnue. Les consignes de récupération distinguent désactivation, service autorisé mais déconnecté, et état inconnu.
- Adaptation explicite du format court depuis les nœuds déjà expurgés d’un ancien téléphone. La portée reste `android_accessibility_semantic_tree` ; l’adaptation ne promet ni pixels ni ordre visuel.
- Contenu privé temporaire : 30 secondes, 50 entrées maximum. Reçus durables expurgés : index limité à 200, purge des entrées de plus de 24 heures lors d’une nouvelle réservation. Les métadonnées techniques utiles des refus sont préservées.
- Ancienneté de liaison inconnue si un ancien attachement n’a pas d’horodatage ; un résultat corrélé constitue une preuve de vie. Les valeurs proches de l’âge Unix ne sont plus présentées comme une durée réelle.
- Instructions MCP compatibles avec les capacités effectivement annoncées par le téléphone et avec un repli PC annoncé, sans pont automatique entre connecteurs.

## Distinguer les canaux

| Canal | Fonction | Limite |
|---|---|---|
| Speed Car direct | MCP → relais → actions Android et contexte d’écran autorisé | Dépend des capacités et permissions du téléphone ; aucune saisie libre générale |
| Remote Desktop Commander | Accès aux outils Windows existants, dont phoned/ADB ciblé, gestes, saisie ou capture selon le mandat | PC accessible requis ; canal annoncé et effet vérifié |
| Tailscale | Transport réseau chiffré vers les services existants | Ne réalise pas lui-même de geste Android |
| Codex | Exécution locale et développement du code | Les tests hors appareil ne prouvent pas une action du téléphone |
| ChatGPT avec Remote Desktop | Accès aux mêmes outils PC existants lorsque le connecteur est disponible | La sélection du canal est faite par l’assistant, sans rejouer un effet incertain |

La voie directe Speed Car ne dépend pas du PC ni de Tailscale. Le repli PC doit respecter le mandat, les permissions et les filtres ; il ne contourne pas un refus de confidentialité. Source primaire pour le rôle réseau : [documentation Tailscale](https://tailscale.com/docs/concepts/what-is-tailscale).

## Recette compatible avec Android 2.0.1

1. Activer volontairement le service d’accessibilité dans Android, en plus du partage local de Speed Car.
2. Vérifier l’état d’écran et de verrouillage. Un écran en veille peut ne fournir aucune fenêtre lisible. Un réveil préparatoire peut passer par le canal PC annoncé, sans réglage permanent.
3. Pour tester une véritable ouverture, préparer l’accueil Android. Appeler `phone_open_app` avec le nom souhaité et un UUID neuf. Un succès certifié exige `verified / android_activity_foreground / foreground_observed=true`.
4. Dans un appel distinct, demander `phone_get_screen_context include_text=true max_nodes=80`. Vérifier le package retourné et lire uniquement les valeurs réellement présentes, sans calcul extérieur.
5. Laisser l’application affichée ; conserver les reçus et leur provenance. Après un effet incertain, relire le même UUID au lieu de relancer.

Sur l’ancien APK, une application déjà affichée ne produit pas nécessairement un nouvel événement `ACTIVITY_RESUMED`. Le reçu peut alors rester `executed / intent_submitted_only`. Le code Android 2.1 corrige déjà cette limite, mais ce comportement ne doit pas être attribué à une installation ancienne. Les capacités `open_and_read` et `foreground_app` ne doivent pas être présumées disponibles sur 2.0.1.

## Code Android et validation

Le code Android 2.1.1 ajoute la normalisation des noms, le diagnostic de service activé/connecté, le nettoyage à la déconnexion et des libellés plus précis. La construction locale réussit, mais un certificat différent de celui de l’installation existante interdit sa mise à jour. Aucun APK divergent n’est installé ou publié ; aucun appairage perdu.

- Relais : **80 tests Vitest + 3 tests Node réussis**, TypeScript sans erreur.
- Android : **65 tests JVM réussis**, lint **0 erreur / 22 avertissements**, assemblage réussi avec un seul worker.
- Régressions observées en échec avant correction : noms avec séparateurs, collisions masquées par le filtrage natif, priorité des noms courts, reprise du même UUID après changement d’inventaire, diagnostics et projection temporaire.
- Revue indépendante du code et des preuves clôturée : aucun constat matériel restant.
- Déploiement avec la configuration de production existante : trois liaisons d’infrastructure, cinq noms de secrets et migration inchangés ; version de retour arrière conservée localement. Aucun contenu de configuration privée lu ou publié.

La recette écrite en deux appels est démontrée après préparation PC. Le réveil autonome, le redémarrage HyperOS, la voix en conduite, la veille prolongée et l’ensemble des gestes ne sont pas certifiés. Les essais historiques T1 à T12 conservent leur propre statut. Le compte rendu local détaille les preuves et la capitalisation Notion encore soumise à l’accord de transmission demandé par le contrôle automatique.
