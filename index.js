"use strict";

/**
 * pudding - Node.js entry point.
 *
 * Generates the Xray-core configuration from environment variables
 * (identical semantics to entrypoint.sh used by the Docker image) and
 * launches the xray binary as a child process.
 *
 * The service is VLESS + XHTTP over plain HTTP, designed to run behind
 * a platform edge / reverse proxy that terminates TLS (the client
 * connects to the edge with TLS; see README).
 *
 * NO credentials are hardcoded in this repository:
 *
 * Environment variables:
 *   PORT        Listen port   (default: 8080)
 *   UUID        VLESS client UUID. If unset, a random UUID is generated
 *               at every start and printed to the log.
 *   XHTTP_PATH  XHTTP path. If unset, a random path is generated at
 *               every start and printed to the log.
 *
 * For a stable client configuration, set UUID and XHTTP_PATH in the
 * platform's environment variables.
 */

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { ensureXray } = require("./fetch-xray");

const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");

const PORT = parseInt(process.env.PORT || "8080", 10);
const UUID = process.env.UUID || crypto.randomUUID();
const XHTTP_PATH_RAW =
  process.env.XHTTP_PATH || `/xh-${crypto.randomBytes(4).toString("hex")}`;
const XHTTP_PATH = XHTTP_PATH_RAW.startsWith("/")
  ? XHTTP_PATH_RAW
  : `/${XHTTP_PATH_RAW}`;
const UUID_FROM_ENV = Boolean(process.env.UUID);
const PATH_FROM_ENV = Boolean(process.env.XHTTP_PATH);

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
          network: "xhttp",
          security: "none",
          xhttpSettings: {
            path: XHTTP_PATH,
            mode: "auto",
          },
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
  console.log(`[pudding] Starting Xray (VLESS + XHTTP) on 0.0.0.0:${PORT}`);
  console.log(
    `[pudding] UUID: ${UUID}${UUID_FROM_ENV ? "" : " (randomly generated, set env UUID to fix it)"}`
  );
  console.log(
    `[pudding] XHTTP path: ${XHTTP_PATH}${PATH_FROM_ENV ? "" : " (randomly generated, set env XHTTP_PATH to fix it)"}`
  );

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
