# Paquet `run_desktop` — installation sur la box de Grok (redémarrage inclus)

Préparé par une session Claude Code cloud **sans accès à la box** (`/home/box` absent, ni
Tailscale ni SSH ni X11, `*.ts.net` bloqué). Le vrai `server.mjs` n'a donc jamais été lu :
`apply.sh` le branche par reconnaissance de motifs et **n'écrit rien s'il ne le reconnaît pas**.

## En une commande (sur la box, utilisateur `box`)

```bash
git clone --depth 1 -b claude/eloquent-hamilton-wjsc5v https://github.com/Amoradvisory/Claude ~/claude-desktop-pkg
cd ~/claude-desktop-pkg/grok-desktop-mcp
bash apply.sh --dry-run     # 1) montre le diff de server.mjs, ne modifie rien
bash apply.sh               # 2) applique, redémarre le pont, vérifie, produit les preuves
```
(Si `git` est absent ou GitHub injoignable, copier le dossier `grok-desktop-mcp/` à la main.)

## Ce que fait `apply.sh`

1. **Sauvegarde** `full-bridge` en `~/backups/full-bridge-AAAAMMJJ-HHMM.tgz` (0600) et garde
   `server.mjs.before-run_desktop`.
2. Copie le module dans `full-bridge/desktop/`, lance les **tests des gardes** et vérifie `DISPLAY=:3`.
3. **Patche `server.mjs`** (`patch-server.mjs`) : ajoute `run_desktop` à côté de `run_shell`, contrôle la
   syntaxe sur une copie avant d'écrire. Motif inconnu → code 3, **fichier intact**, câblage manuel
   (voir plus bas).
4. **Redémarre le pont à l'identique** : même commande, même répertoire, même environnement, lus dans
   `/proc` (copie 0600 dans un dossier 0700, supprimée à la sortie, jamais affichée). Unité
   `systemd --user` détectée → `systemctl --user restart`. Superviseur qui relance seul → pas de doublon.
5. **Contrôle de santé** : port 17778 à l'écoute et passerelle OAuth 17779 qui répond **401** sans jeton.
6. **Retour arrière automatique** si la santé échoue : `server.mjs` d'origine restauré, pont relancé
   (depuis l'instantané si le pont patché a planté). L'état d'avant est rétabli, le script sort en erreur.
7. Dépose `DESKTOP-CHATGPT.md` dans `pont-sauvegardes-*` et lance `verifier-desktop.sh`
   (`/workspace/preuve-desktop-chatGPT-AAAAMMJJ-HHMM.txt` + copie).

Options : `--dry-run`, `--no-restart` (patche sans relancer), `--rollback`.
Variables : `BRIDGE`, `DESKTOP_WORKSPACE`, `BRIDGE_PORT` (17778), `OAUTH_PORT` (17779), `BACKUPS`.
Aucun port ouvert, Funnel/Tailscale/OAuth/jetons/6443/Chrome persistant non touchés.

## Ce qui a été testé ici (et ce qui ne l'a pas été)

Testé dans le conteneur, sur un **faux pont** (HTTP sur ports de test, env avec un faux secret) :
application + redémarrage réel + `run_desktop` appelable (`bureau=:3`) + `run_shell` intact ;
fichier STOP effectif ; journal masqué ; **aucune fuite** du secret d'environnement ;
retour arrière automatique quand le pont patché plante ; `--rollback` manuel ; 11 tests unitaires
(`node --test patch-server.test.mjs run_desktop.test.mjs`).

**Non testé** (impossible hors box) : le vrai `server.mjs`, le vrai X11 `:3` (xdotool, xfconf-query,
import), le Funnel 443 et ChatGPT. Les preuves bureau ne peuvent naître que sur la box.

## Câblage manuel (si `apply.sh` répond « motif non reconnu »)

Dans `server.mjs` : `import { runDesktopTool, handleRunDesktop } from './desktop/run_desktop.mjs';`
- liste d'outils : ajouter `runDesktopTool` ;
- dispatch : `case 'run_desktop': return handleRunDesktop(<arguments de l'appel>);`
- SDK `McpServer` : `server.tool('run_desktop', desc, { command: z.string() }, async (a) => handleRunDesktop(a));`
  (le schéma est **zod**, pas le JSON Schema de `runDesktopTool`).
Puis `node --check server.mjs` et redémarrer avec la commande d'origine.

## Test ChatGPT (la preuve « comme ChatGPT »)

Connecteur « Grok Linux MCP - complet » activé, dans une conversation :

> Avec l'outil `run_desktop`, exécute et montre chaque résultat brut : 1) `echo $DISPLAY` ;
> 2) `xdotool getdisplaygeometry` ; 3) `xfconf-query -c xfce4-desktop -l | grep last-image` ;
> 4) change le fond d'écran avec `xfconf-query ... -s <chemin>` puis remets l'ancienne valeur ;
> 5) `import -window root /workspace/preuve-chatgpt.png` puis `ls -l` ; 6) `xdotool search --name .`

Si le connecteur ne voit pas le nouvel outil : le re-synchroniser (rafraîchir / reconnecter l'app dans
ChatGPT) — la liste des outils est mise en cache côté ChatGPT.

## Arrêt et retour arrière

```bash
touch /home/box/grok-mcp-workspace/desktop-chatGPT.STOP   # coupe run_desktop tout de suite, sans redémarrage
rm    /home/box/grok-mcp-workspace/desktop-chatGPT.STOP   # réautorise
bash apply.sh --rollback    # pose STOP, restaure server.mjs d'avant, redémarre : sandbox strict seul
```
En dernier recours : restaurer `~/backups/full-bridge-*.tgz`.
