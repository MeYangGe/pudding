FROM alpine:latest
RUN apk add --no-cache curl unzip ca-certificates nodejs
WORKDIR /app
RUN curl -L -o xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip && unzip xray.zip && rm xray.zip && chmod +x xray
COPY router.js /app/router.js
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
CMD ["/app/entrypoint.sh"]
