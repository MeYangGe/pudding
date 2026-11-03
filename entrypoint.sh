#!/bin/sh
PORT=${PORT:-443}
UUID=${UUID:-aacdae76-688f-4746-9468-df13708f7104}
REALITY_PRIVATE_KEY=${REALITY_PRIVATE_KEY:-KNu8j493DpynCz81fHguz2su6R0KZD38LfscfdP_Vko}
REALITY_SNI=${REALITY_SNI:-www.microsoft.com}
REALITY_DEST=${REALITY_DEST:-www.microsoft.com:443}
REALITY_SHORT_ID=${REALITY_SHORT_ID:-6b36dc2b7df3ac0a}
cat > /app/config.json <<EOF
{
"log": { "loglevel": "warning"},
"inbounds": [
{
"listen": "0.0.0.0",
"port": ${PORT},
"protocol": "vless",
"settings": {
"clients": [ { "id": "${UUID}", "flow": "xtls-rprx-vision"}],
"decryption": "none"
},
"streamSettings": {
"network": "raw",
"security": "reality",
"realitySettings": {
"show": false,
"dest": "${REALITY_DEST}",
"xver": 0,
"serverNames": ["${REALITY_SNI}"],
"privateKey": "${REALITY_PRIVATE_KEY}",
"shortIds": ["${REALITY_SHORT_ID}"]
}
},
"sniffing": { "enabled": true, "destOverride": ["http", "tls"]}
}
],
"outbounds": [ { "protocol": "freedom"}]
}
EOF
exec /app/xray run -c /app/config.json
