"use strict";

/**
 * pudding — implementation.
 *
 * VLESS with two transports (XHTTP + WebSocket) behind ONE public port,
 * designed for HTTP-edge PaaS platforms (TLS terminated at the edge).
 *
 * Topology:
 *
 *   client --TLS--> platform edge --plain HTTP--> path router (this file)
 *                                                      | path = XHTTP_PATH
 *                                                      +--> Xray XHTTP inbound (127.0.0.1:XHTTP_PORT)
 *                                                      | path = WS_PATH
 *                                                      +--> Xray WebSocket inbound (127.0.0.1:WS_PORT)
 *
 * XHTTP serves Xray-core clients (v2rayN / v2rayNG / Streisand / Happ).
 * WebSocket serves sing-box-core clients (NekoBox and friends), which
 * do not implement XHTTP. Any other path gets a plain 404.
 *
 * Why a router instead of Xray "fallbacks"? Fallback forwarding into an
 * XHTTP inbound is unreliable (the session path gets mangled and Xray
 * logs 'failed to find the default "path" config'), while WebSocket
 * works. A tiny explicit HTTP router has no such surprises.
 *
 * NO credentials are hardcoded in this repository:
 *
 * Environment variables:
 *   PORT        Public listen port of the router (default: 8080)
 *   XHTTP_PORT  Internal XHTTP port (default: 5001)
 *   WS_PORT     Internal WebSocket port (default: 5002)
 *   UUID        VLESS client UUID. If unset, a random UUID is
 *               generated at every start and printed to the log.
 *   XHTTP_PATH  XHTTP path. If unset, a random path is generated at
 *               every start and printed to the log.
 *   WS_PATH     WebSocket path. If unset, a random path is generated
 *               at every start and printed to the log.
 *   LOG_LEVEL   Xray log level (default: warning)
 *   ACCESS_LOG  Xray access log path (default: disabled)
 *
 * For a stable client configuration, set UUID, XHTTP_PATH and WS_PATH
 * in the platform's environment variables.
 */

const fs = require("fs");
const os = require("os");
const http = require("http");
const net = require("net");
const path = require("path");
const crypto = require("crypto");
const { spawn, execFileSync } = require("child_process");

const ROOT = __dirname;
const PORT = parseInt(process.env.PORT || "8080", 10);
const XHTTP_PORT = parseInt(process.env.XHTTP_PORT || "5001", 10);
const WS_PORT = parseInt(process.env.WS_PORT || "5002", 10);
const UUID = process.env.UUID || crypto.randomUUID();
const XHTTP_PATH = process.env.XHTTP_PATH || "/xh-" + crypto.randomBytes(4).toString("hex");
const WS_PATH = process.env.WS_PATH || "/ws-" + crypto.randomBytes(4).toString("hex");
const LOG_LEVEL = process.env.LOG_LEVEL || "warning";
const ACCESS_LOG = process.env.ACCESS_LOG || "";

function sniffing() {
  return { enabled: true, destOverride: ["http", "tls", "quic"], routeOnly: true };
}

function buildConfig() {
  const log = { loglevel: LOG_LEVEL };
  if (ACCESS_LOG) log.access = ACCESS_LOG;
  return {
    log,
    inbounds: [
      {
        tag: "xhttp",
        listen: "127.0.0.1",
        port: XHTTP_PORT,
        protocol: "vless",
        settings: { clients: [{ id: UUID, flow: "" }], decryption: "none" },
        streamSettings: {
          network: "xhttp",
          security: "none",
          xhttpSettings: { path: XHTTP_PATH, mode: "auto" }
        },
        sniffing: sniffing()
      },
      {
        tag: "ws",
        listen: "127.0.0.1",
        port: WS_PORT,
        protocol: "vless",
        settings: { clients: [{ id: UUID, flow: "" }], decryption: "none" },
        streamSettings: {
          network: "ws",
          security: "none",
          wsSettings: { path: WS_PATH }
        },
        sniffing: sniffing()
      }
    ],
    outbounds: [{ protocol: "freedom", tag: "direct" }]
  };
}

function routeTarget(url) {
  if (typeof url === "string") {
    if (url.startsWith(XHTTP_PATH)) return XHTTP_PORT;
    if (url.startsWith(WS_PATH)) return WS_PORT;
  }
  return 0;
}

function startRouter() {
  const server = http.createServer((req, res) => {
    const target = routeTarget(req.url);
    if (!target) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("not found");
      return;
    }
    const upstream = http.request(
      { host: "127.0.0.1", port: target, method: req.method, path: req.url, headers: req.headers },
      (upRes) => {
        res.writeHead(upRes.statusCode || 502, upRes.headers);
        upRes.pipe(res);
      }
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "text/plain" });
      res.end();
    });
    req.on("error", () => upstream.destroy());
    req.pipe(upstream);
  });

  // WebSocket (and any other) upgrades: raw TCP pipe after replaying
  // the original request head verbatim.
  server.on("upgrade", (req, socket, head) => {
    const target = routeTarget(req.url);
    if (!target) { socket.destroy(); return; }
    const upstream = net.connect(target, "127.0.0.1", () => {
      const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
      for (let i = 0; i + 1 < req.rawHeaders.length; i += 2) {
        lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
      }
      upstream.write(lines.join("\r\n") + "\r\n\r\n");
      if (head && head.length) upstream.write(head);
      upstream.pipe(socket);
      socket.pipe(upstream);
    });
    upstream.on("error", () => socket.destroy());
    socket.on("error", () => upstream.destroy());
  });

  // XHTTP download streams are long-lived: disable Node's timeouts.
  server.requestTimeout = 0;
  server.headersTimeout = 0;
  server.timeout = 0;
  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[pudding] router listening on 0.0.0.0:${PORT} (xhttp ${XHTTP_PATH} -> 127.0.0.1:${XHTTP_PORT}, ws ${WS_PATH} -> 127.0.0.1:${WS_PORT})`);
  });
  return server;
}

async function ensureXray() {
  const local = path.join(ROOT, "xray");
  if (fs.existsSync(local)) return local;
  const alt = path.join(os.homedir(), ".local", "bin", "xray");
  if (fs.existsSync(alt)) return alt;
  console.log("[pudding] fetching Xray binary (postinstall should have done this)...");
  execFileSync(process.execPath, [path.join(ROOT, "fetch-xray.js")], { stdio: "inherit" });
  return local;
}

async function main() {
  const xray = await ensureXray();
  const cfgPath = path.join(os.tmpdir(), `pudding-xray-${PORT}.json`);
  fs.writeFileSync(cfgPath, JSON.stringify(buildConfig(), null, 2));
  console.log(`[pudding] UUID=${UUID}`);
  console.log(`[pudding] XHTTP path=${XHTTP_PATH}`);
  console.log(`[pudding] WS path=${WS_PATH}`);
  const child = spawn(xray, ["run", "-config", cfgPath], { stdio: "inherit" });
  const server = startRouter();
  const stop = (sig) => { try { child.kill(sig); } catch (_) {} try { server.close(); } catch (_) {} };
  process.on("SIGTERM", () => stop("SIGTERM"));
  process.on("SIGINT", () => stop("SIGINT"));
  child.on("exit", (code, signal) => {
    console.log(`[pudding] Xray exited (code=${code}, signal=${signal})`);
    process.exit(code == null ? 1 : code);
  });
}

if (require.main === module) {
  main().catch((e) => { console.error("[pudding] fatal:", e); process.exit(1); });
}

module.exports = { main, buildConfig, startRouter };
