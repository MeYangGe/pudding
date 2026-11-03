FROM alpine:latest
RUN apk add --no-cache curl unzip ca-certificates
WORKDIR /app
RUN curl -L -o xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip && unzip xray.zip && rm xray.zip && chmod +x xray
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENV UUID=64d143a4-1e3d-416a-9d51-03b3e3e5c640
ENV WS_PATH=/ws-6bbdedb5
EXPOSE 8080
CMD ["/app/entrypoint.sh"]
