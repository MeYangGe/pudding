#!/bin/sh
# pudding — Docker / shell entry point.
#
# Preferred path: Node.js (the Docker image ships it) runs router.js,
# which serves the full dual-transport service — VLESS + XHTTP and
# VLESS + WebSocket behind a single public port via a path router —
# with exactly the same semantics as `npm start`.
#
# Fallback (no Node.js available): XHTTP-only, Xray listening on the
# public port directly. WebSocket clients (sing-box cores such as
# NekoBox) cannot use this fallback mode.
#
# Credentials are NEVER hardcoded: set UUID / XHTTP_PATH / WS_PATH as
# environment variables. Anything unset is generated randomly at
# startup and printed to the log (ephemeral — set env vars in
# production).
set -eu

cd "$(dirname "$0")"

if command -v node >/dev/null 2>&1 && [ -f ./router.js ]; then
  echo "[pudding] starting via Node entry (dual transport: XHTTP + WebSocket)"
  exec node router.js
fi

echo "[pudding] WARNING: Node.js not found — starting XHTTP-only fallback (no WebSocket support)"

PORT="${PORT:-8080}"
UUID="${UUID:-$(cat /proc/sys/kernel/random/uuid)}"
XHTTP_PATH="${XHTTP_PATH:-/xh-$(cut -c1-8 /proc/sys/kernel/random/uuid)}"

# --- Xray core: use a local binary if present, otherwise download the
# official release. ---
XRAY="./xray"
if [ ! -x "$XRAY" ]; then
  BASE_URL="https://github.com/XTLS/Xray-core/releases/latest/download"
  TMP="$(mktemp -d)"
  echo "[pudding] downloading Xray core..."
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL -o "$TMP/xray.zip" "$BASE_URL/Xray-linux-64.zip"
  else
    wget -qO "$TMP/xray.zip" "$BASE_URL/Xray-linux-64.zip"
  fi
  if command -v python3 >/dev/null 2>&1; then
    python3 -c 'import zipfile,sys; zipfile.ZipFile(sys.argv[1]).extract("xray", sys.argv[2])' "$TMP/xray.zip" "$TMP"
  else
    unzip -o -j "$TMP/xray.zip" xray -d "$TMP" >/dev/null
  fi
  cp "$TMP/xray" ./xray
  chmod +x ./xray
  rm -rf "$TMP"
fi

CFG="$(mktemp)"
cat > "$CFG" <<EOF
{
  "log": { "loglevel": "warning" },
  "inbounds": [
    {
      "listen": "0.0.0.0",
      "port": ${PORT},
      "protocol": "vless",
      "settings": { "clients": [{ "id": "${UUID}", "flow": "" }], "decryption": "none" },
      "streamSettings": {
        "network": "xhttp",
        "security": "none",
        "xhttpSettings": { "path": "${XHTTP_PATH}", "mode": "auto" }
      },
      "sniffing": { "enabled": true, "destOverride": ["http", "tls", "quic"], "routeOnly": true }
    }
  ],
  "outbounds": [{ "protocol": "freedom", "tag": "direct" }]
}
EOF

echo "[pudding] starting Xray (XHTTP only): 0.0.0.0:${PORT}"
echo "[pudding] UUID=${UUID}"
echo "[pudding] XHTTP path=${XHTTP_PATH}"
exec "$XRAY" run -config "$CFG"
