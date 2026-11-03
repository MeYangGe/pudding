#!/bin/sh
# No credentials are hardcoded: UUID and XHTTP_PATH come from the
# environment; when unset, random values are generated at start.
PORT=${PORT:-8080}
UUID=${UUID:-$(cat /proc/sys/kernel/random/uuid)}
XHTTP_PATH=${XHTTP_PATH:-/xh-$(cut -c1-8 /proc/sys/kernel/random/uuid)}
cat > /app/config.json <<EOF
{
"log": { "loglevel": "warning"},
"inbounds": [
{
"listen": "0.0.0.0",
"port": ${PORT},
"protocol": "vless",
"settings": {
"clients": [ { "id": "${UUID}", "flow": ""}],
"decryption": "none"
},
"streamSettings": {
"network": "xhttp",
"security": "none",
"xhttpSettings": { "path": "${XHTTP_PATH}", "mode": "auto"}
},
"sniffing": { "enabled": true, "destOverride": ["http", "tls"]}
}
],
"outbounds": [ { "protocol": "freedom"}]
}
EOF
echo "[pudding] UUID: ${UUID}"
echo "[pudding] XHTTP path: ${XHTTP_PATH}"
exec /app/xray run -c /app/config.json
