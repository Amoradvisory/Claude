#!/usr/bin/env bash
# apply.sh — installe run_desktop sur la box, REDÉMARRAGE DU PONT COMPRIS, avec
# retour arrière automatique si le pont ne repart pas sain.
#
#   bash apply.sh              # applique (sauvegarde → copie → tests → patch → redémarrage → santé → preuves)
#   bash apply.sh --dry-run    # montre le diff de server.mjs, ne modifie rien
#   bash apply.sh --no-restart # applique sans redémarrer (le pont garde l'ancien code)
#   bash apply.sh --rollback   # coupe (fichier STOP), restaure server.mjs d'avant, redémarre
#
# Variables : BRIDGE (défaut /home/box/grok-free-poc/full-bridge), DESKTOP_WORKSPACE
# (défaut /home/box/grok-mcp-workspace), BRIDGE_PORT (17778), OAUTH_PORT (17779), BACKUPS.
# Ne touche pas : Tailscale/Funnel, OAuth, jetons, 6443, gfp-browser, données utilisateur.
# Aucun secret n'est affiché : l'environnement du pont est copié 0600 dans un dossier
# temporaire 0700, passé à relaunch.mjs, puis supprimé.
set -euo pipefail
umask 077

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BRIDGE="${BRIDGE:-/home/box/grok-free-poc/full-bridge}"
WORKSPACE="${DESKTOP_WORKSPACE:-/home/box/grok-mcp-workspace}"
BACKUPS="${BACKUPS:-$HOME/backups}"
PORT="${BRIDGE_PORT:-17778}"
OAUTH_PORT="${OAUTH_PORT:-17779}"
STAMP="$(date +%Y%m%d-%H%M)"
MODE=apply; RESTART=1
for a in "$@"; do
  case "$a" in
    --dry-run) MODE=dry ;; --no-restart) RESTART=0 ;; --rollback) MODE=rollback ;;
    *) echo "option inconnue : $a" >&2; exit 2 ;;
  esac
done

say() { printf '[apply] %s\n' "$*"; }
die() { printf '[apply] ÉCHEC : %s\n' "$*" >&2; exit 1; }

SERVER="$BRIDGE/server.mjs"
SAVED="$BRIDGE/server.mjs.before-run_desktop"
STOP_FILE="$WORKSPACE/desktop-chatGPT.STOP"
[ -f "$SERVER" ] || die "server.mjs introuvable dans $BRIDGE"
mkdir -p "$BACKUPS" "$WORKSPACE"; chmod 700 "$BACKUPS" 2>/dev/null || true

find_pid() {
  local p cwd
  for p in $(pgrep -x node 2>/dev/null || true); do
    cwd="$(readlink "/proc/$p/cwd" 2>/dev/null || true)"
    if tr '\0' ' ' < "/proc/$p/cmdline" 2>/dev/null | grep -q "server\.mjs"; then
      if [ "$cwd" = "$BRIDGE" ] || tr '\0' ' ' < "/proc/$p/cmdline" | grep -q "$BRIDGE/server\.mjs"; then
        echo "$p"; return 0
      fi
    fi
  done
  return 1
}

port_listening() {
  if command -v ss >/dev/null 2>&1; then ss -ltn 2>/dev/null | awk '{print $4}' | grep -qE "[:.]$1\$"
  else (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; fi
}

wait_port() { local i; for i in $(seq 1 60); do port_listening "$1" && return 0; sleep 0.5; done; return 1; }

# Instantané (cmd, cwd, env) du pont vivant, gardé jusqu'à la fin du script (dossier 0700,
# supprimé à la sortie) : il sert aussi au retour arrière si le pont patché plante.
SNAP=""; UNIT=""
trap '[ -n "$SNAP" ] && rm -rf "$SNAP"' EXIT

# Redémarre le pont : unité systemd --user si elle existe, sinon arrêt propre (SIGTERM)
# puis relance à l'identique (même cmd, cwd, env). Si un superviseur relance déjà le
# pont tout seul (boucle, tmux…), on ne double pas le process. Si le pont est mort,
# on relance depuis l'instantané.
restart_bridge() {
  local pid; pid="$(find_pid || true)"
  if [ -n "$pid" ]; then
    if [ -z "$SNAP" ]; then
      UNIT="$(systemctl --user status "$pid" 2>/dev/null | head -1 | grep -oE '[A-Za-z0-9@:._-]+\.service' | grep -v '^user@' | head -1 || true)"
      SNAP="$(mktemp -d)"; chmod 700 "$SNAP"
      cp "/proc/$pid/environ" "$SNAP/env"; cp "/proc/$pid/cmdline" "$SNAP/cmd"
      readlink "/proc/$pid/cwd" > "$SNAP/cwd"
    fi
    if [ -n "$UNIT" ]; then
      say "redémarrage via systemd --user : $UNIT"; systemctl --user restart "$UNIT"; return 0
    fi
    say "arrêt du pont (pid $pid, SIGTERM)"
    kill -TERM "$pid"
    local i; for i in $(seq 1 40); do kill -0 "$pid" 2>/dev/null || break; sleep 0.25; done
    if kill -0 "$pid" 2>/dev/null; then say "pid $pid résiste : SIGKILL"; kill -KILL "$pid"; sleep 0.5; fi
    for i in $(seq 1 24); do   # un superviseur peut relancer seul : on lui laisse 6 s
      local np; np="$(find_pid || true)"
      if [ -n "$np" ] && [ "$np" != "$pid" ]; then say "relancé par un superviseur (pid $np)"; return 0; fi
      sleep 0.25
    done
  else
    if [ -n "$UNIT" ]; then say "redémarrage via systemd --user : $UNIT"; systemctl --user restart "$UNIT"; return 0; fi
    [ -f "${SNAP:-/nonexistent}/cmd" ] || die "processus du pont introuvable (cwd=$BRIDGE) et aucun instantané : redémarrage manuel nécessaire"
    say "aucun pont actif : relance depuis l'instantané"
  fi
  local log="$BACKUPS/bridge-restart-$STAMP.log"
  say "relance à l'identique (journal : $log)"
  node "$HERE/relaunch.mjs" "$SNAP/env" "$SNAP/cmd" "$(cat "$SNAP/cwd")" "$log"
}

healthy() {
  wait_port "$PORT" || { say "le port $PORT n'écoute pas"; return 1; }
  if port_listening "$OAUTH_PORT"; then
    local c; c="$(curl -s -m 5 -o /dev/null -w '%{http_code}' -X POST "http://127.0.0.1:$OAUTH_PORT/mcp" -H 'content-type: application/json' -d '{}' || true)"
    say "passerelle OAuth $OAUTH_PORT : POST /mcp sans jeton → HTTP $c (401 attendu)"
    [ "$c" = "401" ] || { say "réponse inattendue"; return 1; }
  else
    say "avertissement : $OAUTH_PORT n'écoute pas (autre processus ?)"
  fi
  return 0
}

restore_and_restart() {
  [ -f "$SAVED" ] || die "pas de sauvegarde $SAVED : restaurer l'archive dans $BACKUPS"
  cp -p "$SAVED" "$SERVER"
  say "server.mjs d'origine restauré"
  [ "$RESTART" = 1 ] && restart_bridge && healthy
}

# ───────────────────────────── rollback ─────────────────────────────
if [ "$MODE" = rollback ]; then
  : > "$STOP_FILE"; say "interrupteur posé : $STOP_FILE"
  restore_and_restart || die "restauration faite mais pont non sain : voir $BACKUPS"
  say "retour au sandbox strict effectué (run_shell seul)"; exit 0
fi

# ───────────────────────────── préparation ─────────────────────────────
command -v node >/dev/null || die "node introuvable"
for t in xdotool xfconf-query import; do
  command -v "$t" >/dev/null || say "avertissement : $t absent (sudo apt-get install -y xdotool xfconf imagemagick)"
done

if [ "$MODE" = dry ]; then
  T="$(mktemp -d)"; cp "$SERVER" "$T/server.mjs"
  node "$HERE/patch-server.mjs" "$T/server.mjs" || die "motif non reconnu : câblage manuel (README.md §2)"
  diff -u "$SERVER" "$T/server.mjs" || true
  rm -rf "$T"; say "dry-run terminé, rien modifié"; exit 0
fi

say "sauvegarde"
tar --exclude=node_modules -czf "$BACKUPS/full-bridge-$STAMP.tgz" -C "$(dirname "$BRIDGE")" "$(basename "$BRIDGE")"
chmod 600 "$BACKUPS/full-bridge-$STAMP.tgz"

say "copie du module dans $BRIDGE/desktop"
mkdir -p "$BRIDGE/desktop"
cp "$HERE"/run_desktop.mjs "$HERE"/run_desktop.test.mjs "$HERE"/verifier-desktop.sh "$HERE"/DESKTOP-CHATGPT.md "$BRIDGE/desktop/"
chmod +x "$BRIDGE/desktop/verifier-desktop.sh"

say "tests des gardes (STOP, journal masqué)"
( cd "$BRIDGE/desktop" && node --test run_desktop.test.mjs >/dev/null ) || die "tests des gardes en échec"
D="$(cd "$BRIDGE/desktop" && node run_desktop.mjs 'echo $DISPLAY')"
[ "$D" = ":3" ] || die "DISPLAY attendu :3, obtenu '$D'"

# ───────────────────────────── patch + redémarrage ─────────────────────────────
[ -f "$SAVED" ] || cp -p "$SERVER" "$SAVED"
node "$HERE/patch-server.mjs" "$SERVER" || die "motif non reconnu, server.mjs INTACT : câblage manuel (README.md §2)"

if [ "$RESTART" = 0 ]; then
  say "--no-restart : le pont tourne encore avec l'ancien code. Relancer apply.sh sans l'option pour redémarrer."
else
  restart_bridge || { say "redémarrage impossible : retour arrière"; restore_and_restart || true; exit 1; }
  if ! healthy; then
    say "pont non sain après redémarrage : RETOUR ARRIÈRE AUTOMATIQUE"
    restore_and_restart || die "restauration faite mais pont non sain : voir $BACKUPS"
    die "run_desktop non installé (pont restauré à l'état d'avant)"
  fi
fi

# ───────────────────────────── preuves + doc ─────────────────────────────
DOCDIR="$(ls -d "$WORKSPACE"/pont-sauvegardes-* 2>/dev/null | head -1 || true)"
DOCDIR="${DOCDIR:-$WORKSPACE}"
cp "$HERE/DESKTOP-CHATGPT.md" "$DOCDIR/DESKTOP-CHATGPT.md" && say "doc : $DOCDIR/DESKTOP-CHATGPT.md"
rm -f "$STOP_FILE"
say "preuves"
DESKTOP_WORKSPACE="$WORKSPACE" bash "$BRIDGE/desktop/verifier-desktop.sh" || say "verifier-desktop.sh a signalé des erreurs (voir ci-dessus)"
say "TERMINÉ. Outil ChatGPT : run_desktop. Arrêt : touch $STOP_FILE. Retour arrière : bash apply.sh --rollback"
