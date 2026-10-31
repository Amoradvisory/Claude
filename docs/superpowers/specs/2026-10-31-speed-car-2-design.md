# Speed Car 2.0 — conception issue du cahier des charges utilisateur

Étendre l'application Kotlin personnelle existante, le Worker MCP et leur WSS authentifiée. Conserver les sept outils 0.3.1 et la clé de signature de développement. L'utilisateur demande l'exécution autonome sans approbation de plan intermédiaire.

Priorité : localisation ponctuelle réelle (âge/précision/fournisseur explicites), Google Maps/navigation, applications, médias, torche et recherche. Puis informations système, partage préparé, TTS/alarme et notifications. Pour l'écran, accès sémantique volontaire et gestes limités ; capture MediaProjection à consentement Android et actions sensibles à validation locale, sans contournement.

Choix d'implémentation : API Android du framework, aucun nouveau SDK lourd ni GPS continu ; liste des applications lançables uniquement, résolution des noms ambiguë refusée. Navigation transporte une destination à Maps sans prétendre prouver l'itinéraire. Maison reste une destination configurée localement, jamais déduite. Localisation au premier plan temporaire si Android l'exige ; aucun droit de localisation permanente par défaut.

Tous les nouveaux reçus ont command_id/status/outcome/proof_scope/duration_ms/sampled_at. Délais définis par capacité, une admission avant expiration, une exécution après revendication SQLite. Les résultats sensibles ne vont pas dans le stockage durable du relais : mémoire transitoire bornée ; seules preuves expurgées sont conservées. Un résultat expurgé ne permet pas de reconstituer un contenu privé par command_status. Aucun contenu privé dans les journaux, preuves publiques ou tests réels publiés.

La feuille de partage prépare, l'utilisateur choisit et envoie lui-même. Pas de permission CALL_PHONE/SEND_SMS, pas de contacts ou microphone inutiles. Permissions GPS/caméra/Bluetooth et accès notifications/accessibilité sont activés volontairement dans l'interface Android. Pas d'activation par ADB. Les actions d'interface sensibles restent bloquées ou imposent une confirmation locale.

Validation : tests des contrats, expirations, confidentialité et anciennes commandes ; tests JVM des politiques et intents ; APK compilé/analyse ; installation en mise à jour sans effacement ; essais natifs/MCP avec reçus. Les permissions ou manipulations physiques impossibles sont classées préparées/bloquées sans réussite inventée. Son/torche/navigation visibles annoncés, aucune interruption d'appel.
