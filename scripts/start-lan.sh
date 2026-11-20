#!/usr/bin/env sh
# Starts the tabulator in Docker and makes it reachable from the tablets on the event hotspot (macOS/Linux).
#   sh scripts/start-lan.sh            start, then keep watching this laptop's address
#   sh scripts/start-lan.sh --no-watch start and exit
#   LAN_IP=192.168.43.25 sh scripts/start-lan.sh   use this address instead of detecting one
#
# Event setup: a phone runs a Wi-Fi hotspot (no internet needed); this laptop and the judges'
# tablets join it. If the hotspot hands this laptop a new address, the watcher updates the HTTPS
# certificate, restarts the containers and prints the new address.
set -eu
cd "$(dirname "$0")/.."
ENV_FILE=.env
WATCH=1
[ "${1:-}" = "--no-watch" ] && WATCH=0

# Windows (Git Bash, MSYS, Cygwin): this script can't read Windows network settings, so run the
# PowerShell version, which also handles the firewall and Docker Desktop.
case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*)
    PS="$(cygpath -u "${SYSTEMROOT:-C:\\Windows}")/System32/WindowsPowerShell/v1.0/powershell.exe"
    set -- -NoProfile -ExecutionPolicy Bypass -File "$(cygpath -w "$PWD/scripts/start-lan.ps1")" \
      ${LAN_IP:+-Ip "$LAN_IP"} $([ "$WATCH" = 0 ] && echo -NoWatch)
    echo "Windows detected: running scripts/start-lan.ps1 in PowerShell."
    exec "$PS" "$@"
    ;;
esac

lan_ips() {
  if [ -n "${LAN_IP:-}" ]; then echo "$LAN_IP"; return; fi
  if command -v ip >/dev/null 2>&1; then
    # The route towards any outside address leaves through the hotspot (the phone is the gateway,
    # even without internet). Then any other address, skipping VPN and container interfaces.
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}'
    ip -4 -o addr show scope global 2>/dev/null | grep -vE ' (docker|br-|veth|virbr|zt|tailscale|tun|wg)' | awk '{print $4}' | cut -d/ -f1
  elif [ "$(uname -s)" = Darwin ]; then
    for ifc in en0 en1; do ipconfig getifaddr "$ifc" 2>/dev/null || true; done
  else
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}
# Only real IPv4 addresses: anything else would end up in the HTTPS proxy's config and break it.
detect() {
  lan_ips | grep -E '^[0-9]{1,3}(\.[0-9]{1,3}){3}$' | grep -vE '^(127\.|169\.254\.)' | awk '!seen[$0]++' | paste -sd, -
}
secret() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true; }
set_kv() {
  tmp="$ENV_FILE.tmp"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
}
set_lan_env() {
  set_kv HOST_LAN_IP "$1"
  # HTTPS certificates are issued by the proxy for exactly these addresses (no internet needed).
  sites="https://localhost:$HTTPS_PORT"
  for a in $(echo "$1" | tr ',' ' '); do sites="$sites, https://$a:$HTTPS_PORT"; done
  set_kv CADDY_SITES "$sites"
  # Tablets open the app by IP, which carries no server name, so HTTPS answers for the first address.
  first=$(echo "$1" | cut -d, -f1)
  set_kv TLS_DEFAULT_SNI "${first:-localhost}"
}
show_addresses() {
  echo
  echo "  ----------------------------------------------------------------"
  echo "  Tablet address:  $1"
  echo "    First time on a tablet:  http://$1:$PORT/setup"
  echo "    Then the app:            https://$1:$HTTPS_PORT"
  echo "    (without the setup:      http://$1:$PORT)"
  echo "  ----------------------------------------------------------------"
}
show_moved() {
  echo
  echo "  WARNING: this laptop's address changed: it was $1, it is now $2."
  echo "  On each tablet opened on the old address, tap 'Laptop address changed?' and type $2."
  echo "  Their unsent sheets, drafts and login come along."
}

docker info >/dev/null 2>&1 || { echo "Docker is not running. Start it, then run this again." >&2; exit 1; }

[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"
[ -n "$(get DJANGO_SECRET_KEY)" ] || set_kv DJANGO_SECRET_KEY "$(secret 48)"
[ -n "$(get POSTGRES_PASSWORD)" ] || set_kv POSTGRES_PASSWORD "$(secret 24)"
PORT=$(get APP_PORT); [ -n "$PORT" ] || { PORT=8000; set_kv APP_PORT "$PORT"; }
HTTPS_PORT=$(get HTTPS_PORT); [ -n "$HTTPS_PORT" ] || { HTTPS_PORT=8443; set_kv HTTPS_PORT "$HTTPS_PORT"; }

PREVIOUS=$(get HOST_LAN_IP | cut -d, -f1)
IPS=$(detect)
[ -n "$IPS" ] || echo "This laptop is not on a network. Join the hotspot first; the tabulator still starts for this laptop only."
set_lan_env "$IPS"
PRIMARY=$(echo "$IPS" | cut -d, -f1)

docker compose up -d --build

echo "Waiting for the app to become healthy..."
i=0
until curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "App did not answer yet. Check: docker compose logs web"; break; }
  sleep 2
done

echo
echo "ICPEP Tabulator is running."
echo "  On this laptop: http://localhost:$PORT"
[ -n "$PRIMARY" ] && show_addresses "$PRIMARY"
[ -n "$PREVIOUS" ] && [ -n "$PRIMARY" ] && [ "$PREVIOUS" != "$PRIMARY" ] && show_moved "$PREVIOUS" "$PRIMARY"
echo
echo "If tablets cannot connect, allow TCP ports $PORT and $HTTPS_PORT in this laptop's firewall."
echo "Event-day reminders: keep this laptop plugged in and awake, keep the hotspot phone charging with"
echo "its hotspot auto-off disabled, and turn off mobile data on the tablets."

[ "$WATCH" = 1 ] || exit 0
echo
echo "Watching this laptop's address. Leave this window open; Ctrl+C stops watching (the tabulator keeps running)."
OFFLINE=0
while :; do
  sleep 15
  NOW=$(detect)
  if [ -z "$NOW" ]; then
    [ "$OFFLINE" = 1 ] || { echo "$(date +%H:%M) Lost the hotspot. Tablets keep their scores and send them when this laptop is back."; printf '\a'; }
    OFFLINE=1
    continue
  fi
  [ "$OFFLINE" = 1 ] && { echo "$(date +%H:%M) Back on the network."; OFFLINE=0; }
  FIRST=$(echo "$NOW" | cut -d, -f1)
  [ "$FIRST" = "$PRIMARY" ] && continue
  OLD=$PRIMARY
  PRIMARY=$FIRST
  echo
  echo "$(date +%H:%M) New address $PRIMARY (was ${OLD:-none}). Updating the certificate and restarting..."
  set_lan_env "$NOW"
  docker compose up -d || echo "docker compose failed. Run this script again."
  printf '\a\a'
  show_addresses "$PRIMARY"
  [ -n "$OLD" ] && show_moved "$OLD" "$PRIMARY"
done
