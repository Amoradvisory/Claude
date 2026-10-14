#!/usr/bin/env bash
# verifier-desktop.sh — produit les preuves exigées, À LANCER SUR LA BOX de Grok
# (utilisateur box), depuis le répertoire du pont, dans le MÊME contexte que
# run_desktop : DISPLAY=:3 + DBUS de la session :3 hérité du process réel.
#
#   bash verifier-desktop.sh
#
# Écrit : /workspace/preuve-desktop-chatGPT-AAAAMMJJ-HHMM.txt
#     et : /home/box/grok-mcp-workspace/preuve-desktop-chatGPT-AAAAMMJJ-HHMM.txt
# Ne supprime aucun fichier. Change le fond d'écran PUIS le restaure.
set -u

DISPLAY_TARGET="${DESKTOP_DISPLAY:-:3}"
WS_REAL="${DESKTOP_WORKSPACE:-/home/box/grok-mcp-workspace}"
WS_VIEW="/workspace"
STAMP="$(date +%Y%m%d-%H%M)"
NAME="preuve-desktop-chatGPT-${STAMP}.txt"

# DBUS de la session :3, lu dans le premier process bureau qui la porte.
resolve_dbus() {
  for pid in $(pgrep -x xfce4-session; pgrep -x xfwm4; pgrep -x xfdesktop) ''; do
    [ -n "$pid" ] || continue
    local v
    v="$(tr '\0' '\n' < "/proc/$pid/environ" 2>/dev/null | sed -n 's/^DBUS_SESSION_BUS_ADDRESS=//p' | head -1)"
    [ -n "$v" ] && { printf '%s' "$v"; return 0; }
  done
  return 1
}

export DISPLAY="$DISPLAY_TARGET"
export XAUTHORITY="${DESKTOP_XAUTHORITY:-/home/box/.Xauthority}"
DBUS_ADDR="$(resolve_dbus || true)"
[ -n "${DBUS_ADDR:-}" ] && export DBUS_SESSION_BUS_ADDRESS="$DBUS_ADDR"

OUT="$(
  echo "=== Preuve bureau ChatGPT — $(date -Is) ==="
  echo "host=$(hostname) user=$(whoami)"
  echo "DISPLAY attendu=:3  dbus=$([ -n "${DBUS_ADDR:-}" ] && echo resolved || echo none)"
  echo

  echo "# 1) echo \$DISPLAY (attendu :3)"
  echo "DISPLAY=$DISPLAY"
  echo

  echo "# 2) xdotool getdisplaygeometry"
  if command -v xdotool >/dev/null; then xdotool getdisplaygeometry 2>&1; else echo "xdotool absent"; fi
  echo

  echo "# 3) fond d'écran : sauvegarde, changement, restauration"
  if command -v xfconf-query >/dev/null; then
    PROP="$(xfconf-query -c xfce4-desktop -l 2>/dev/null | grep -m1 'last-image' || true)"
    if [ -n "$PROP" ]; then
      OLD="$(xfconf-query -c xfce4-desktop -p "$PROP" 2>/dev/null)"
      echo "propriété=$PROP"
      echo "ancienne valeur=$OLD"
      xfconf-query -c xfce4-desktop -p "$PROP" -s "/usr/share/backgrounds/preuve-chatgpt-inexistant.png" 2>&1
      echo "nouvelle valeur=$(xfconf-query -c xfce4-desktop -p "$PROP" 2>/dev/null)"
      # restauration systématique
      if [ -n "$OLD" ]; then xfconf-query -c xfce4-desktop -p "$PROP" -s "$OLD" 2>&1; fi
      echo "valeur restaurée=$(xfconf-query -c xfce4-desktop -p "$PROP" 2>/dev/null)"
      [ "$(xfconf-query -c xfce4-desktop -p "$PROP" 2>/dev/null)" = "$OLD" ] && echo "RESTAURATION OK" || echo "RESTAURATION À VÉRIFIER"
    else
      # repli : couleur de fond, sauvegarde/restauration
      CP="/backdrop/screen0/monitor0/workspace0/color-style"
      OLDC="$(xfconf-query -c xfce4-desktop -p "$CP" 2>/dev/null || echo '')"
      echo "pas de last-image ; test couleur sur $CP (ancienne=$OLDC)"
      xfconf-query -c xfce4-desktop -p "$CP" -s 0 2>&1 || echo "(création impossible, ignoré)"
      [ -n "$OLDC" ] && xfconf-query -c xfce4-desktop -p "$CP" -s "$OLDC" 2>&1
      echo "couleur restaurée=$(xfconf-query -c xfce4-desktop -p "$CP" 2>/dev/null || echo '(n/a)')"
    fi
  else
    echo "xfconf-query absent"
  fi
  echo

  echo "# 4) capture import -window root"
  SHOT="${WS_REAL}/preuve-capture-${STAMP}.png"
  if command -v import >/dev/null; then
    import -window root "$SHOT" 2>&1 && echo "capture écrite : $SHOT ($(stat -c '%s octets' "$SHOT" 2>/dev/null))"
  else
    echo "import (ImageMagick) absent ; essai scrot/xwd"
    command -v scrot >/dev/null && scrot "$SHOT" 2>&1 && echo "capture (scrot) : $SHOT"
  fi
  echo

  echo "# 5) liste des fenêtres (xdotool search --name .)"
  if command -v xdotool >/dev/null; then
    for id in $(xdotool search --name . 2>/dev/null | head -20); do
      printf '  %s  %s\n' "$id" "$(xdotool getwindowname "$id" 2>/dev/null)"
    done
  else echo "xdotool absent"; fi
  echo
  echo "=== fin de preuve ==="
)"

printf '%s\n' "$OUT"

# Écriture dans les deux emplacements (jamais d'écrasement destructif : noms horodatés)
mkdir -p "$WS_REAL"
printf '%s\n' "$OUT" > "${WS_REAL}/${NAME}" && echo "[écrit] ${WS_REAL}/${NAME}"
if [ -d "$WS_VIEW" ] && [ "$WS_VIEW" != "$WS_REAL" ]; then
  printf '%s\n' "$OUT" > "${WS_VIEW}/${NAME}" && echo "[écrit] ${WS_VIEW}/${NAME}"
fi
