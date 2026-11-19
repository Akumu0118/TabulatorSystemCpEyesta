#!/usr/bin/env sh
# Starts the tabulator in Docker and makes it reachable from other devices on the LAN (macOS/Linux).
#   sh scripts/start-lan.sh
set -eu
cd "$(dirname "$0")/.."
ENV_FILE=.env

lan_ips() {
  if command -v ip >/dev/null 2>&1; then
    ip -4 route get 1.1.1.1 2>/dev/null | awk '{for (i=1;i<=NF;i++) if ($i=="src") print $(i+1)}'
  elif command -v ipconfig >/dev/null 2>&1; then
    for ifc in en0 en1; do ipconfig getifaddr "$ifc" 2>/dev/null || true; done
  else
    hostname -I 2>/dev/null | tr ' ' '\n'
  fi
}
secret() { head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'; }
get() { grep -E "^$1=" "$ENV_FILE" 2>/dev/null | head -n1 | cut -d= -f2- || true; }
set_kv() {
  tmp="$ENV_FILE.tmp"
  grep -vE "^$1=" "$ENV_FILE" > "$tmp" || true
  printf '%s=%s\n' "$1" "$2" >> "$tmp"
  mv "$tmp" "$ENV_FILE"
}

[ -f "$ENV_FILE" ] || cp .env.example "$ENV_FILE"
[ -n "$(get DJANGO_SECRET_KEY)" ] || set_kv DJANGO_SECRET_KEY "$(secret 48)"
[ -n "$(get POSTGRES_PASSWORD)" ] || set_kv POSTGRES_PASSWORD "$(secret 24)"
IPS=$(lan_ips | grep -vE '^(127\.|169\.254\.)' | sort -u | paste -sd, -)
set_kv HOST_LAN_IP "$IPS"
PORT=$(get APP_PORT); [ -n "$PORT" ] || { PORT=8000; set_kv APP_PORT "$PORT"; }

docker compose up -d --build

echo "Waiting for the app to become healthy..."
i=0
until curl -fsS "http://localhost:$PORT/api/health" >/dev/null 2>&1; do
  i=$((i + 1)); [ "$i" -ge 60 ] && { echo "App did not answer yet. Check: docker compose logs web"; break; }
  sleep 2
done

echo
echo "ICPEP Tabulator is running."
echo "  On this computer: http://localhost:$PORT"
if [ -n "$IPS" ]; then
  echo "$IPS" | tr ',' '\n' | while read -r ip; do echo "  Judges on the same Wi-Fi/LAN: http://$ip:$PORT"; done
else
  echo "  No LAN address found. Connect to the event Wi-Fi and run again."
fi
