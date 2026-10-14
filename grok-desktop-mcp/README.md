# Paquet `run_desktop` — à appliquer sur la box de Grok

Préparé par une session Claude Code cloud **qui n'a aucun accès à la box**
(`/home/box` absent, ni Tailscale ni SSH ni X11, `*.ts.net` bloqué par le réseau).
Le vrai `server.mjs`/`sandbox.mjs` n'a donc pas pu être lu : les points
d'insertion ci-dessous sont décrits sans numéros de ligne, à confirmer à
l'application par l'agent qui a la main sur la box (ChatGPT/Codex via Remote
Desktop Commander, ou le terminal Grok).

## Contenu

| Fichier | Rôle |
|---|---|
| `run_desktop.mjs` | L'outil : exécute hors sandbox avec `DISPLAY=:3` + DBUS de la session :3, gardes STOP + journal masqué. Sans dépendance. |
| `verifier-desktop.sh` | Script de preuve à lancer sur la box. Écrit la preuve dans `/workspace/` et sa copie. |
| `DESKTOP-CHATGPT.md` | Doc (fonctionnement, risque, OFF, rollback) → à copier dans `/workspace/pont-sauvegardes-*/`. |
| `README.md` | Ce fichier : application, câblage, tests, rollback. |

## 0. Audit + sauvegarde (avant toute modification)

```bash
cd /home/box/grok-free-poc/full-bridge
mkdir -p ~/backups && chmod 700 ~/backups
tar --exclude=node_modules -czf ~/backups/full-bridge-$(date +%F-%H%M).tgz \
  -C /home/box/grok-free-poc full-bridge
# relever la commande de démarrage exacte du pont et ses variables d'env :
ps -eo pid,args | grep -E '[s]erver\.mjs'
```

## 1. Déposer le paquet

```bash
cp -r grok-desktop-mcp /home/box/grok-free-poc/full-bridge/desktop/
# vérifier que le module se charge et que :3 répond (test local, hors ChatGPT) :
cd /home/box/grok-free-poc/full-bridge/desktop
node run_desktop.mjs 'echo DISPLAY=$DISPLAY; xdotool getdisplaygeometry'
```
Attendu : `DISPLAY=:3` puis la géométrie. Si `xdotool`/`import`/`xfconf-query`
manquent : `sudo apt-get install -y xdotool imagemagick xfconf` (ne touche à rien
d'autre).

## 2. Câbler dans `server.mjs` (chemin SÉPARÉ, run_shell intact)

En tête du fichier, à côté des autres imports :
```js
import { runDesktopTool, handleRunDesktop } from './desktop/run_desktop.mjs';
```

Là où les outils sont déclarés au serveur MCP (près de l'enregistrement de
`run_shell`), ajouter l'outil **sans retirer** `run_shell` :

- **SDK officiel `@modelcontextprotocol/sdk`** (handlers `ListTools` / `CallTool`) :
  ajouter `runDesktopTool` au tableau renvoyé par `ListTools`, et dans `CallTool` :
  ```js
  if (request.params.name === 'run_desktop') return await handleRunDesktop(request.params.arguments);
  ```
- **`server.tool(name, schema, handler)`** :
  ```js
  server.tool(runDesktopTool.name, runDesktopTool.inputSchema,
    async (args) => handleRunDesktop(args));
  ```

Puis : `node --check server.mjs`.

> Ne jamais journaliser `body`, l'en-tête `Authorization`, ni le PIN (comme pour
> le reste du pont). `run_desktop` ne touche pas à l'auth : il passe par le `/mcp`
> déjà protégé.

## 3. Redémarrer le pont

Avec **la commande et les variables relevées à l'étape 0** (ne pas improviser).
Aucun port ne change ; le Funnel 443 → 17779 reste tel quel.

## 4. Preuves sur la box

```bash
cd /home/box/grok-free-poc/full-bridge/desktop
bash verifier-desktop.sh
```
→ `/workspace/preuve-desktop-chatGPT-AAAAMMJJ-HHMM.txt` (+ copie workspace).

Déposer aussi la doc :
```bash
cp DESKTOP-CHATGPT.md /home/box/grok-free-poc/full-bridge/../ 2>/dev/null
cp DESKTOP-CHATGPT.md "$(ls -d /workspace/pont-sauvegardes-* 2>/dev/null | head -1)/" 2>/dev/null || \
  cp DESKTOP-CHATGPT.md /workspace/DESKTOP-CHATGPT.md
```

## 5. Test ChatGPT (la preuve « comme ChatGPT »)

Dans une conversation ChatGPT, connecteur « Grok Linux MCP - complet » activé :

> Avec l'outil `run_desktop`, exécute et montre chaque résultat brut :
> 1) `echo $DISPLAY` ; 2) `xdotool getdisplaygeometry` ;
> 3) `xfconf-query -c xfce4-desktop -l | grep last-image` ;
> 4) change le fond d'écran avec `xfconf-query ... -s <chemin>` puis remets
>    l'ancienne valeur ; 5) `import -window root /workspace/preuve-chatgpt.png`
>    puis `ls -l /workspace/preuve-chatgpt.png` ; 6) `xdotool search --name .`

Vérifier l'**interrupteur OFF** : `touch /workspace/desktop-chatGPT.STOP`, relancer
un appel (doit être refusé), puis `rm /workspace/desktop-chatGPT.STOP`.

## Rollback (retour au sandbox strict d'avant)

1. `touch /home/box/grok-mcp-workspace/desktop-chatGPT.STOP` (coupe immédiatement).
2. Dans `server.mjs` : retirer l'`import` et le bloc d'enregistrement `run_desktop`.
3. `node --check server.mjs`, puis redémarrer le pont avec la commande d'origine.
4. `run_shell`/`sandbox.mjs` n'ayant pas été modifiés, l'état d'avant est restauré.
   En dernier recours : restaurer `~/backups/full-bridge-*.tgz`.
