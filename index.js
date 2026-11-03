"use strict";

/**
 * pudding - Node.js entry point.
 *
 * Generates the Xray-core configuration from environment variables
 * (identical semantics to entrypoint.sh used by the Docker image) and
 * launches the xray binary as a child process.
 *
 * The service is VLESS + REALITY (XTLS Vision flow) over raw TCP.
 * REALITY requires the host platform to pass raw TCP traffic through
 * to the process on the listen port; HTTP reverse proxies cannot be used.
 *
 * Environment variables:
 *   PORT                  Listen port            (default: 443)
 *   UUID                  VLESS client UUID      (default: see below)
 *   REALITY_PRIVATE_KEY   REALITY x25519 private key (server-side secret)
 *   REALITY_PUBLIC_KEY    REALITY x25519 public key  (client-side, for links)
 *   REALITY_SNI           Camouflage SNI         (default: www.microsoft.com)
 *   REALITY_DEST          Camouflage destination (default: www.microsoft.com:443)
 *   REALITY_SHORT_ID      REALITY short ID       (default: see below)
 */

const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { ensureXray } = require("./fetch-xray");

const ROOT_DIR = __dirname;
const CONFIG_PATH = path.join(ROOT_DIR, "config.json");

const PORT = parseInt(process.env.PORT || "443", 10);
const UUID = process.env.UUID || "aacdae76-688f-4746-9468-df13708f7104";
const REALITY_PRIVATE_KEY =
  process.env.REALITY_PRIVATE_KEY || "KNu8j493DpynCz81fHguz2su6R0KZD38LfscfdP_Vko";
const REALITY_PUBLIC_KEY =
  process.env.REALITY_PUBLIC_KEY || "ktJSuz5AFdmzEEO8f3G3fDWuStJPP-rJ35_-GJkfUwM";
const REALITY_SNI = process.env.REALITY_SNI || "www.microsoft.com";
const REALITY_DEST = process.env.REALITY_DEST || "www.microsoft.com:443";
const REALITY_SHORT_ID = process.env.REALITY_SHORT_ID || "6b36dc2b7df3ac0a";

function buildConfig() {
  return {
    log: { loglevel: "warning" },
    inbounds: [
      {
        listen: "0.0.0.0",
        port: PORT,
        protocol: "vless",
        settings: {
          clients: [{ id: UUID, flow: "xtls-rprx-vision" }],
          decryption: "none",
        },
        streamSettings: {
          network: "raw",
          security: "reality",
          realitySettings: {
            show: false,
            dest: REALITY_DEST,
            xver: 0,
            serverNames: [REALITY_SNI],
            privateKey: REALITY_PRIVATE_KEY,
            shortIds: [REALITY_SHORT_ID],
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
  console.log(`[pudding] Starting Xray (VLESS + REALITY) on 0.0.0.0:${PORT}`);
  console.log(`[pudding] SNI/dest: ${REALITY_SNI} (${REALITY_DEST}), shortId: ${REALITY_SHORT_ID}`);
  console.log(`[pudding] Client public key (pbk): ${REALITY_PUBLIC_KEY}`);

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
