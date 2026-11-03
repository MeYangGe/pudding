# pudding

[简体中文](README.md) | **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Xray-core](https://img.shields.io/badge/Powered%20by-Xray--core-blue)

A lightweight proxy service powered by [Xray-core](https://github.com/XTLS/Xray-core),
using **VLESS + XHTTP** transport. XHTTP is Xray's transport designed for
HTTP-forwarding / CDN / PaaS-edge scenarios (the successor of WebSocket):
traffic reaches the platform edge as ordinary HTTPS requests and is forwarded
to the app, which makes it a natural fit for hosting platforms that only
offer an HTTP(S) entry point.

Two runtime modes are supported, with identical configuration semantics:

- **Node.js mode** — for buildpack-based PaaS platforms (e.g. infrlo,
  Heroku-style platforms): the platform detects `package.json`, installs,
  and starts the app with Node.js; the Xray binary is downloaded
  automatically by the install script (zero runtime dependencies).
- **Docker mode** — the included `Dockerfile`, for VPS hosts and container
  platforms (a TLS-terminating layer in front is required: platform edge,
  reverse proxy, or CDN).

## 🔐 Credential Management (Design Point)

**No credentials are hardcoded in this repository.** The UUID and the XHTTP
path come from exactly two sources:

1. Platform environment variables (`UUID`, `XHTTP_PATH`) — recommended,
   stable across restarts;
2. If unset, they are **randomly generated at every start** and printed to
   the startup log.

The same code can therefore be deployed by anyone, with per-deployment
credentials that never appear in the source.

## Features

- VLESS inbound + XHTTP transport (`mode=auto`), `freedom` outbound (direct)
- Zero hardcoded credentials: injected via environment, or randomly
  generated at start
- Zero runtime dependencies in Node.js mode; the official Xray binary is
  downloaded at install time using only the standard library, and
  re-fetched at boot if missing
- MIT licensed; Chinese documentation is the default, this file is the
  English version

## How It Works

1. The launcher (`index.js` in Node.js mode, `entrypoint.sh` in Docker
   mode) reads environment variables and renders the Xray configuration
   (generating random credentials at this point if none were provided).
2. The client connects to the platform edge on port 443 with TLS; the edge
   terminates TLS and forwards the HTTP requests on the agreed path to the
   app's `$PORT`.
3. Xray serves XHTTP sessions on that path, carries traffic via VLESS, and
   exits through the `freedom` outbound; all other paths return 404.

Note: encryption is provided by TLS on the client ↔ platform-edge leg, so
only use this on platforms/domains that present a valid certificate.

## Deployment

### Option A — Node.js PaaS (buildpack platforms)

1. Push this repository to your Git host and link it on the target platform;
2. Build command: `npm install` · Start command: `npm start` (the
   `postinstall` script downloads the Xray binary automatically);
3. Set `UUID` and `XHTTP_PATH` in the platform's environment variables
   (generate them with `xray uuid` and a random string — or leave unset
   and read the generated values from the startup log);
4. Deploy. The platform-injected `PORT` is adopted automatically.

### Option B — Docker (TLS-terminating layer in front required)

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 8080:8080 \
  -e UUID=<your-uuid> \
  -e XHTTP_PATH=<your-path> \
  pudding
```

## Configuration

| Variable      | Default                          | Description                                  |
|---------------|----------------------------------|----------------------------------------------|
| `PORT`        | `8080` (or platform-injected)    | Listen port                                  |
| `UUID`        | Randomly generated at start      | VLESS client UUID — treat it as a credential |
| `XHTTP_PATH`  | Randomly generated at start      | XHTTP path, e.g. `/xh-xxxxxxxx`              |

## Client Usage

Any client supporting VLESS + XHTTP can connect (recent versions of
v2rayN, v2rayNG, Nekoray, sing-box, etc.). Share-link format:

```
vless://<UUID>@<your-app-domain>:443?encryption=none&security=tls&type=xhttp&path=<XHTTP_PATH>&mode=auto#pudding
```

Key points: `security=tls` (TLS is provided by the platform edge);
`type=xhttp`; `mode=auto`; `path` must match the server exactly
(URL-encode `/` as `%2F` in links).

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
npm start     # listens on $PORT (default 8080); watch the log for generated credentials
```

## Security Notes

- The UUID and path are the access credentials: never commit values you
  set via environment variables to any repository; if you use generated
  values, record them from the startup log.
- To rotate credentials, change the environment variables and restart
  (or simply restart to regenerate random ones).
- Always let clients use TLS (port 443 with a valid certificate); do not
  expose a plaintext HTTP entry to the public internet.
- The Xray binary is fetched from the official XTLS repository only; keep
  an eye on upstream releases.

## License

Released under the [MIT License](./LICENSE).

## Disclaimer

This project is provided for learning, research, and lawful personal use only.
You are responsible for complying with the laws and regulations of your
jurisdiction and with the terms of service of any platform you deploy it on.
