# pudding

[简体中文](README.md) | **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Xray-core](https://img.shields.io/badge/Powered%20by-Xray--core-blue)

A lightweight proxy service powered by [Xray-core](https://github.com/XTLS/Xray-core),
using **VLESS + REALITY** (XTLS Vision flow) over raw TCP. REALITY borrows the TLS
handshake characteristics of a real, well-known website for camouflage, so the
traffic looks like ordinary TLS without needing your own domain or certificate —
currently the mainstream combination for both security and compatibility.

Two runtime modes are supported, with identical configuration semantics:

- **Docker mode** — the included `Dockerfile`, for VPS hosts and any platform
  that can reach the container port directly.
- **Node.js mode** — for buildpack-based platforms: the platform detects
  `package.json`, installs, and starts the app with Node.js; the Xray binary is
  downloaded automatically by the install script (zero runtime dependencies).

## ⚠️ Deployment Requirement (Important)

REALITY operates at the raw TCP layer. **The host platform must pass raw TCP
traffic from a public port straight through to the service process**, without
terminating TLS in between. Therefore:

- ✅ Suitable: VPS / dedicated servers, container platforms with raw TCP port mapping;
- ❌ Not suitable: PaaS platforms that only offer an HTTP(S) reverse-proxy entry
  (their edge terminates TLS and forwards plain HTTP, which a REALITY handshake
  cannot pass through).

## Features

- VLESS inbound + REALITY transport security + `xtls-rprx-vision` flow,
  `freedom` outbound (direct egress)
- No domain or certificate of your own required: REALITY mirrors the handshake
  of a target site (e.g. `www.microsoft.com`)
- Fully configured through environment variables: port, UUID, REALITY key pair,
  camouflage SNI/destination, shortId
- Zero runtime dependencies in Node.js mode; the official Xray binary is
  downloaded at install time using only the standard library, and re-fetched
  at boot if missing
- MIT licensed; Chinese documentation is the default, this file is the English version

## How It Works

1. The launcher (`entrypoint.sh` in Docker mode, `index.js` in Node.js mode)
   renders the Xray configuration from environment variables.
2. Xray listens on `0.0.0.0:$PORT` (default 443). When a client starts a
   TLS-style handshake, REALITY authenticates it with the x25519 key pair and
   shortId; connections that fail authentication are transparently relayed to
   the camouflage target site, looking exactly like a visit to the real site.
3. Authenticated connections carry traffic via VLESS (Vision flow) and exit
   through the `freedom` outbound.

## Deployment

### Option A — Docker (recommended)

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 443:443 \
  -e UUID=<your-uuid> \
  -e REALITY_PRIVATE_KEY=<your-private-key> \
  -e REALITY_SHORT_ID=<your-short-id> \
  pudding
```

### Option B — Node.js (platform must support raw TCP ports)

1. Push this repository to your Git host and link it on the target platform;
2. Build command: `npm install` · Start command: `npm start` (the `postinstall`
   script downloads the Xray binary automatically);
3. Make sure the platform maps a public TCP port directly to the app's `$PORT`,
   set environment variables as needed, and deploy.

## Configuration

| Variable              | Default                        | Description                                    |
|-----------------------|--------------------------------|------------------------------------------------|
| `PORT`                | `443`                          | Listen port                                    |
| `UUID`                | See `index.js` / `Dockerfile`  | VLESS client UUID — treat it as a credential   |
| `REALITY_PRIVATE_KEY` | See `index.js` / `Dockerfile`  | REALITY x25519 private key (server-side secret) |
| `REALITY_PUBLIC_KEY`  | See `index.js`                 | REALITY x25519 public key (`pbk` in client links) |
| `REALITY_SNI`         | `www.microsoft.com`            | Camouflage SNI; must match the target site     |
| `REALITY_DEST`        | `www.microsoft.com:443`        | Camouflage target (must support TLS 1.3)       |
| `REALITY_SHORT_ID`    | See `index.js` / `Dockerfile`  | REALITY short ID (hex string)                  |

Generate fresh keys and parameters:

```bash
xray x25519          # REALITY key pair (PrivateKey / PublicKey)
xray uuid            # a new UUID
openssl rand -hex 8  # a new shortId
```

**Always override `UUID`, `REALITY_PRIVATE_KEY`, and `REALITY_SHORT_ID` via
environment variables in production** — the defaults live in public source code
and are visible to everyone.

## Client Usage

Any client supporting VLESS + REALITY can connect (v2rayN, v2rayNG,
Shadowrocket, Streisand, Nekoray, sing-box, etc.). Share-link format:

```
vless://<UUID>@<server-address>:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=<public-key>&sid=<short-id>&type=tcp#pudding
```

Key points: `flow` must be `xtls-rprx-vision`; `security=reality`; `fp`
(fingerprint) should be `chrome`; `pbk`, `sid`, and `sni` must exactly match
the server configuration.

## Project Structure

```
.
├── README.md       # Chinese documentation (default)
├── README.en.md    # English documentation
├── index.js        # Node.js entry point: renders config, launches Xray
├── fetch-xray.js   # Downloads & extracts the official Xray binary (stdlib only)
├── package.json    # Node.js manifest (postinstall + start scripts)
├── Dockerfile      # Alpine-based image definition (Docker mode)
├── entrypoint.sh   # Container entry point (Docker mode)
└── LICENSE         # MIT License
```

## Local Development

```bash
npm install   # the postinstall script also downloads the Xray binary
npm start     # listens on $PORT (default 443)
```

## Security Notes

- `UUID` and `REALITY_PRIVATE_KEY` are the core credentials: the private key
  must only ever appear in the server configuration, never in client links;
  clients only need the public key (`pbk`).
- If parameters may have leaked, regenerate the key pair/UUID, update the
  environment variables, and restart the service to rotate them.
- Choose a camouflage target that supports TLS 1.3 and is stable long-term,
  and keep `REALITY_SNI` identical to the target's domain name.
- The Xray binary is fetched from the official XTLS repository only; keep an
  eye on upstream releases.

## License

Released under the [MIT License](./LICENSE).

## Disclaimer

This project is provided for learning, research, and lawful personal use only.
You are responsible for complying with the laws and regulations of your
jurisdiction and with the terms of service of any platform you deploy it on.
