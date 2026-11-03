"use strict";

/**
 * pudding — entry point (`npm start` / `node index.js`).
 * The implementation lives in router.js: a path router in front of two
 * Xray inbounds providing VLESS + XHTTP and VLESS + WebSocket on a
 * single public port. See router.js and README.md for details.
 */

require("./router.js").main().catch((e) => {
  console.error("[pudding] fatal:", e);
  process.exit(1);
});
