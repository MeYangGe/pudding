"use strict";

/**
 * fetch-xray.js
 *
 * Downloads the official Xray-core release archive (Xray-linux-64.zip)
 * from the XTLS GitHub repository and extracts the `xray` binary into
 * the project root. Pure Node.js standard library: no dependencies.
 *
 * Runs automatically after `npm install` (postinstall) and is also
 * invoked by index.js at boot when the binary is missing.
 */

const fs = require("fs");
const path = require("path");
const https = require("https");
const zlib = require("zlib");

const XRAY_ZIP_URL =
  "https://github.com/XTLS/Xray-core/releases/latest/download/Xray-linux-64.zip";
const ROOT_DIR = __dirname;
const ZIP_PATH = path.join(ROOT_DIR, "xray.zip");
const BIN_PATH = path.join(ROOT_DIR, "xray");

function download(url, dest, redirectsLeft) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { "User-Agent": "pudding-fetch-xray" } }, (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error("Too many redirects while downloading Xray"));
            return;
          }
          resolve(download(res.headers.location, dest, redirectsLeft - 1));
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Download failed with HTTP ${status}`));
          return;
        }
        const out = fs.createWriteStream(dest);
        res.pipe(out);
        out.on("finish", () => out.close(resolve));
        out.on("error", reject);
      })
      .on("error", reject);
  });
}

/** Extracts a single entry from a ZIP archive (stored or deflated). */
function extractZipEntry(zipPath, entryName, destPath) {
  const buf = fs.readFileSync(zipPath);

  // Locate the End Of Central Directory record (scan the tail).
  let eocd = -1;
  const tailStart = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= tailStart; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Invalid ZIP: end of central directory not found");

  const total = buf.readUInt16LE(eocd + 10);
  let off = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error("Invalid ZIP: corrupt central directory");
    }
    const method = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localOff = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);

    if (name === entryName) {
      if (compSize === 0xffffffff) {
        throw new Error("ZIP64 archives are not supported by this extractor");
      }
      const lNameLen = buf.readUInt16LE(localOff + 26);
      const lExtraLen = buf.readUInt16LE(localOff + 28);
      const dataStart = localOff + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      let data;
      if (method === 0) {
        data = Buffer.from(raw);
      } else if (method === 8) {
        data = zlib.inflateRawSync(raw);
      } else {
        throw new Error(`Unsupported ZIP compression method: ${method}`);
      }
      fs.writeFileSync(destPath, data);
      return data.length;
    }
    off += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`Entry "${entryName}" not found in ZIP archive`);
}

async function ensureXray() {
  if (fs.existsSync(BIN_PATH)) {
    try {
      fs.accessSync(BIN_PATH, fs.constants.X_OK);
      return BIN_PATH;
    } catch (_) {
      fs.chmodSync(BIN_PATH, 0o755);
      return BIN_PATH;
    }
  }
  console.log("[pudding] Xray binary not found, downloading official release...");
  await download(XRAY_ZIP_URL, ZIP_PATH, 6);
  const size = extractZipEntry(ZIP_PATH, "xray", BIN_PATH);
  fs.chmodSync(BIN_PATH, 0o755);
  fs.unlinkSync(ZIP_PATH);
  if (size < 1024 * 1024) {
    throw new Error(`Extracted xray binary looks too small (${size} bytes)`);
  }
  console.log(`[pudding] Xray binary ready (${size} bytes).`);
  return BIN_PATH;
}

if (require.main === module) {
  ensureXray().catch((err) => {
    console.error(`[pudding] Failed to fetch Xray: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { ensureXray };
