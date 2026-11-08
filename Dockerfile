FROM alpine:latest
RUN apk add --no-cache curl unzip ca-certificates nodejs
WORKDIR /app
RUN set -eux; case "$(uname -m)" in aarch64|arm64) ASSET=Xray-linux-arm64-v8a.zip ;; *) ASSET=Xray-linux-64.zip ;; esac; ok=0; for u in "https://github.com/XTLS/Xray-core/releases/latest/download/$ASSET" "https://ghfast.top/https://github.com/XTLS/Xray-core/releases/latest/download/$ASSET" "https://gh-proxy.com/https://github.com/XTLS/Xray-core/releases/latest/download/$ASSET" "https://ghproxy.net/https://github.com/XTLS/Xray-core/releases/latest/download/$ASSET" "https://gh.llkk.cc/https://github.com/XTLS/Xray-core/releases/latest/download/$ASSET"; do echo "==> trying $u"; if curl -fL --retry 5 --retry-delay 2 --retry-all-errors --connect-timeout 20 --max-time 600 -o /tmp/xray.zip "$u" && unzip -tq /tmp/xray.zip; then echo "==> ok: $u"; ok=1; break; fi; echo "==> failed: $u"; done; if [ "$ok" != 1 ]; then echo "FATAL: no reachable Xray-core download source"; exit 1; fi; unzip -o /tmp/xray.zip && rm -f /tmp/xray.zip && chmod +x xray && ./xray version
COPY router.js /app/router.js
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
CMD ["/app/entrypoint.sh"]
