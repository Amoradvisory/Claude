#!/usr/bin/env bash
# Read-only audit of the Grok MCP bridge. Changes nothing, prints no secret:
# file CONTENTS of .owner-pin / .env / state files are never read; any 8+ digit
# run and anything that looks like a token is masked in all output.
# Usage (on the Grok VM, as user box):  bash audit.sh [/home/box/grok-free-poc/full-bridge]
set -u
P="${1:-/home/box/grok-free-poc/full-bridge}"
mask() { sed -E 's/[0-9]{8,}/<DIGITS>/g; s/((token|secret|pin|bearer|authorization)[^A-Za-z0-9]{1,4})[A-Za-z0-9._~+\/=-]{12,}/\1<MASKED>/Ig'; }
h() { printf '\n===== %s =====\n' "$*"; }

h "identity"; echo "host=$(hostname) user=$(whoami) date=$(date -Is)"; uname -a
h "project dir"; ls -la "$P" 2>&1 | mask
h "owner pin (metadata only)"; stat -c '%n mode=%a owner=%U size=%s mtime=%y' "$P/.owner-pin" 2>&1
h "files modified in last 3 days (Codex work?)"
find "$P" -maxdepth 3 -type f -mtime -3 -not -path '*/node_modules/*' -printf '%TY-%Tm-%Td %TH:%TM  %m  %s  %p\n' 2>/dev/null | sort | mask
h "backups / originals"; find "$P" -maxdepth 3 \( -name '*.bak*' -o -name '*.orig' -o -name '*.before-*' -o -name '*~' \) -not -path '*/node_modules/*' 2>/dev/null | mask
h "state/json files (metadata only)"
find "$P" -maxdepth 3 -name '*.json' -not -path '*/node_modules/*' -printf '%m %u %s %p\n' 2>/dev/null | mask
h "OAuth persistence in code"
grep -rnE --include='*.mjs' --include='*.js' --exclude-dir=node_modules \
  'new Map|clients\b|registerClient|register|writeFile|rename\(|oauth-store|STORE|client_id|invalid_client|fsync|chmod' "$P" 2>/dev/null \
  | cut -c1-180 | mask | head -80
h "listening ports 17778 / 17779 / 8443"; (ss -ltnp 2>/dev/null || netstat -ltnp 2>/dev/null) | grep -E ':(17778|17779|8443)\b' | mask
h "node processes"; ps -eo pid,ppid,lstart,args | grep -E '[n]ode' | cut -c1-220 | mask
h "start method"
crontab -l 2>/dev/null | mask; systemctl --user list-units --no-pager 2>/dev/null | grep -iE 'grok|mcp|bridge'
ls "$P"/*.sh "$P"/start* 2>/dev/null
h "tailscale"; (tailscale status 2>&1 | head -5; tailscale funnel status 2>&1; tailscale serve status 2>&1) | mask
h "local endpoints"
for u in http://127.0.0.1:17779/health http://127.0.0.1:17779/.well-known/oauth-authorization-server http://127.0.0.1:17779/.well-known/oauth-protected-resource; do
  printf '%s -> ' "$u"; curl -s -m 5 -o /dev/null -w '%{http_code}\n' "$u"
done
printf 'POST /mcp unauthenticated (expect 401) -> '; curl -s -m 5 -o /dev/null -w '%{http_code}\n' -X POST http://127.0.0.1:17779/mcp -H 'content-type: application/json' -d '{}'
printf 'direct 17778 bound to: '; (ss -ltn 2>/dev/null | awk '$4 ~ /:17778$/ {print $4}')
echo; echo "audit done (read-only)."
