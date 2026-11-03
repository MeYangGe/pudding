FROM alpine:latest
RUN apk add --no-cache curl unzip ca-certificates
WORKDIR /app
RUN curl -L -o xray.zip https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip && unzip xray.zip && rm xray.zip && chmod +x xray
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
ENV UUID=aacdae76-688f-4746-9468-df13708f7104
ENV REALITY_PRIVATE_KEY=KNu8j493DpynCz81fHguz2su6R0KZD38LfscfdP_Vko
ENV REALITY_SNI=www.microsoft.com
ENV REALITY_DEST=www.microsoft.com:443
ENV REALITY_SHORT_ID=6b36dc2b7df3ac0a
EXPOSE 443
CMD ["/app/entrypoint.sh"]
