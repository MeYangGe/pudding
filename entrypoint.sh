#!/bin/sh
PORT=${PORT:-8080}
UUID=${UUID:-64d143a4-1e3d-416a-9d51-03b3e3e5c640}
WS_PATH=${WS_PATH:-/ws-6bbdedb5}
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
"network": "ws",
"wsSettings": { "path": "${WS_PATH}"}
},
"sniffing": { "enabled": true, "destOverride": ["http", "tls"]}
}
],
"outbounds": [ { "protocol": "freedom"}]
}
EOF
exec /app/xray run -c /app/config.json
