"use strict";

/**
 * pudding - Node.js entry point.
 *
 * Generates the Xray-core configuration from environment variables
 * (identical semantics to entrypoint.sh used by the Docker image) and
 * launches the xray binary as a child process.
 *
 * Environment variables:
 *   PORT     Listen port                 (default: 8080)
 *   UUID     VLESS client UUID           (default: see below)
 *   WS_PATH  WebSocket path              (default: see below)
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ensureXray } = require("./fetch-xray");

const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");

const PORT = parseInt(process.env.PORT || "8080", 10);
const UUID = process.env.UUID || "64d143a4-1e3d-416a-9d51-03b3e3e5c640";
const WS_PATH_RAW = process.env.WS_PATH || "/ws-6bbdedb5";
const WS_PATH = WS_PATH_RAW.startsWith("/") ? WS_PATH_RAW : `/${WS_PATH_RAW}`;

function buildConfig() {
  return {
    log: { loglevel: "warning" },
    inbounds: [
      {
        listen: "0.0.0.0",
        port: PORT,
        protocol: "vless",
        settings: {
          clients: [{ id: UUID, flow: "" }],
          decryption: "none",
        },
        streamSettings: {
          network: "ws",
          wsSettings: { path: WS_PATH },
        },
        sniffing: { enabled: true, destOverride: ["http", "tls"] },
      },
    ],
    outbounds: [{ protocol: "freedom" }],
  };
}

async function main() {
  const xrayPath = await ensureXray();

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(buildConfig(), null, 2));
  console.log(`[pudding] Starting Xray on 0.0.0.0:${PORT} (WebSocket path ${WS_PATH})`);

  const child = spawn(xrayPath, ["run", "-c", CONFIG_PATH], {
    stdio: "inherit",
  });

  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => child.kill(sig));
  }

  child.on("error", (err) => {
    console.error(`[pudding] Failed to start Xray: ${err.message}`);
    process.exit(1);
  });
  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code == null ? 0 : code);
    }
  });
}

main().catch((err) => {
  console.error(`[pudding] Fatal: ${err.message}`);
  process.exit(1);
});
