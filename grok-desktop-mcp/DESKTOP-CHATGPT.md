# Bureau Linux de Grok ouvert à ChatGPT (outil `run_desktop`)

> Destination finale sur la box : `/workspace/pont-sauvegardes-*/DESKTOP-CHATGPT.md`
> (copie de ce fichier, à déposer à l'application).

## Ce que ça fait

Ajoute au pont MCP un outil `run_desktop` **à côté** de `run_shell`. Là où
`run_shell` passe par le sandbox bubblewrap (`sandbox.mjs`), sans `DISPLAY`,
`run_desktop` s'exécute **hors de ce sandbox**, avec :

- `DISPLAY=:3` (le bureau principal : xfwm4 / xfdesktop / xfce4-panel ou Plank) ;
- le `DBUS_SESSION_BUS_ADDRESS` **de la vraie session :3**, lu dans
  `/proc/<pid>/environ` d'un process du bureau (xfce4-session / xfwm4), jamais
  codé en dur ;
- `XAUTHORITY=/home/box/.Xauthority`.

ChatGPT peut alors, par le même `/mcp` authentifié : `xfconf-query` (fond
d'écran), `xdotool` (souris, clavier, fenêtres), `import` (capture),
`plank` / `xfce4-panel` (barre des tâches), ouvrir des applications — comme s'il
était devant l'écran.

## Ce qui ne change pas

- **Authentification** : même OAuth, mêmes jetons, même Funnel 443 `/mcp`.
  **Aucun nouveau port public.** 6443 (noVNC tailnet-only) n'est pas touché.
- **`run_shell` et son sandbox** restent intacts : `run_desktop` est un chemin
  séparé, pas une modification de l'existant.
- Chrome persistant `gfp-browser`, piloté par CDP (`nav.mjs`), inchangé.

## Risque (à assumer explicitement)

**ChatGPT peut tout faire sur le bureau :3** : déplacer/fermer des fenêtres,
taper au clavier, cliquer, changer la configuration XFCE, lancer n'importe quelle
application dans la session de l'utilisateur. Ce n'est plus confiné. C'est le but
demandé, mais c'est un accès réel et large. Les gardes ci-dessous le bornent sans
l'empêcher.

## Gardes

1. **Interrupteur OFF — une commande.** Dès que le fichier
   `/workspace/desktop-chatGPT.STOP` existe, `run_desktop` refuse tout :
   ```bash
   touch /home/box/grok-mcp-workspace/desktop-chatGPT.STOP   # coupe le bureau
   rm   /home/box/grok-mcp-workspace/desktop-chatGPT.STOP    # réautorise
   ```
   (depuis ChatGPT, `/workspace/desktop-chatGPT.STOP`). Aucun redémarrage requis :
   le fichier est testé à chaque appel.

2. **Journal sans secret** : chaque commande est horodatée dans
   `/workspace/desktop-chatGPT.log` (`RUN` ou `STOP`), après masquage de toute
   suite de 8+ chiffres et de toute valeur qui suit `token/secret/pin/bearer/
   authorization/cookie/key/password`. Les cookies, jetons et clés ne sont jamais
   journalisés ni renvoyés par l'outil.

3. **Aucune suppression de données** par l'outil lui-même. Le script de preuve
   n'écrit que des fichiers horodatés (jamais d'écrasement).

## Désactivation / rollback

- **Désactiver sans toucher au code** : `touch .../desktop-chatGPT.STOP`.
- **Retour au sandbox strict d'avant** : retirer l'enregistrement de l'outil dans
  `server.mjs` (le bloc marqué `run_desktop`), retirer l'`import`, redémarrer le
  pont avec la commande relevée à l'audit. `run_shell`/`sandbox.mjs` n'ayant pas
  été modifiés, l'état d'avant est exactement restauré. Voir `README.md §Rollback`.

## Preuves

Lancer sur la box, dans le répertoire du pont :
```bash
bash verifier-desktop.sh
```
Produit `/workspace/preuve-desktop-chatGPT-AAAAMMJJ-HHMM.txt` (+ copie dans
`/home/box/grok-mcp-workspace/`) avec : `echo $DISPLAY`→`:3`,
`xdotool getdisplaygeometry`, changement **puis restauration** du fond d'écran,
capture `import -window root`, liste des fenêtres.

La preuve « comme ChatGPT » se fait ensuite dans une conversation ChatGPT avec le
connecteur, en appelant l'outil `run_desktop` (voir `README.md §Test ChatGPT`).
