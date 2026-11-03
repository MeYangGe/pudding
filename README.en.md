# pudding

[简体中文](README.md) | **English**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Xray-core](https://img.shields.io/badge/Powered%20by-Xray--core-blue)

A lightweight proxy service powered by [Xray-core](https://github.com/XTLS/Xray-core)
that serves **two transports on a single public port**: **VLESS + XHTTP**
and **VLESS + WebSocket**. All traffic reaches the platform edge as
ordinary HTTPS requests and is forwarded to the app, which makes it a
natural fit for hosting platforms that only offer an HTTP(S) entry point.

Why two transports? XHTTP is Xray's modern transport (the successor of
WebSocket), but **the sing-box core does not implement XHTTP** — sing-box
clients such as NekoBox can only speak WebSocket. A small built-in path
router lets both client families share one node and one UUID; only the
path differs:

- **Xray-core clients** (v2rayN, v2rayNG, Streisand, Happ, …) → XHTTP;
- **sing-box-core clients** (NekoBox, Hiddify, …) → WebSocket.

Two runtime modes are supported, with identical configuration semantics:

- **Node.js mode** — for buildpack-based PaaS platforms (e.g. infrlo,
  Heroku-style platforms): the platform detects `package.json`, installs,
  and starts the app with Node.js; the Xray binary is downloaded
  automatically by the install script (zero runtime dependencies).
- **Docker mode** — the included `Dockerfile` (the image ships Node.js,
  so it serves both transports too). If Node.js is genuinely unavailable
  in some runtime, `entrypoint.sh` degrades to an XHTTP-only
  compatibility mode and prints a warning.

## 🔐 Credential Management (Design Point)

**No credentials are hardcoded in this repository.** The UUID and both
paths come from exactly two sources:

1. Platform environment variables (`UUID`, `XHTTP_PATH`, `WS_PATH`) —
   recommended, stable across restarts;
2. If unset, they are **randomly generated at every start** and printed
   to the startup log.

The same code can therefore be deployed by anyone, with per-deployment
credentials that never appear in the source.

## Features

- Two transports on one public port: XHTTP (`mode=auto`) + WebSocket,
  routed by request path
- VLESS inbounds, `freedom` outbound (direct)
- Zero hardcoded credentials: injected via environment, or randomly
  generated at start
- Zero runtime dependencies in Node.js mode; the official Xray binary is
  downloaded at install time using only the standard library, and
  re-fetched at boot if missing
- MIT licensed; Chinese documentation is the default, this file is the
  English version

## How It Works

1. The client connects to the platform edge on port 443 with TLS; the
   edge terminates TLS and forwards the HTTP requests to the app's
   `$PORT`.
2. A path router inside the app dispatches by request path: requests
   under `XHTTP_PATH` go to the Xray XHTTP inbound (internal port
   `XHTTP_PORT`), requests under `WS_PATH` go to the WebSocket inbound
   (internal port `WS_PORT`); any other path returns 404.
3. Xray carries the traffic via VLESS and exits through the `freedom`
   outbound.

Note: encryption is provided by TLS on the client ↔ platform-edge leg, so
only use this on platforms/domains that present a valid certificate.

**Why not use Xray's built-in "fallbacks" for the dispatch?** In testing,
fallback forwarding into an XHTTP inbound proved unreliable (the session
path gets mangled and Xray logs `failed to find the default "path"
config`), while WebSocket was unaffected; an explicit HTTP router is the
most predictable option.

## Deployment

### Option A — Node.js PaaS (buildpack platforms)

1. Push this repository to your Git host and link it on the target platform;
2. Build command: `npm install` · Start command: `npm start` (the
   `postinstall` script downloads the Xray binary automatically);
3. Set `UUID`, `XHTTP_PATH` and `WS_PATH` in the platform's environment
   variables (generate the UUID with `xray uuid` and the paths from
   random strings — or leave unset and read the generated values from
   the startup log);
4. Deploy. The platform-injected `PORT` is adopted automatically.

### Option B — Docker (TLS-terminating layer in front required)

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 8080:8080 \
  -e UUID=<your-uuid> \
  -e XHTTP_PATH=<your-xhttp-path> \
  -e WS_PATH=<your-ws-path> \
  pudding
```

## Configuration

| Variable      | Default                          | Description                                       |
|---------------|----------------------------------|---------------------------------------------------|
| `PORT`        | `8080` (or platform-injected)    | Public listen port of the router                  |
| `UUID`        | Randomly generated at start      | VLESS client UUID — a credential, shared by both transports |
| `XHTTP_PATH`  | Randomly generated at start      | XHTTP path, e.g. `/xh-xxxxxxxx`                   |
| `WS_PATH`     | Randomly generated at start      | WebSocket path, e.g. `/ws-xxxxxxxx`               |
| `XHTTP_PORT`  | `5001`                           | Internal XHTTP port (127.0.0.1 only)              |
| `WS_PORT`     | `5002`                           | Internal WebSocket port (127.0.0.1 only)          |
| `LOG_LEVEL`   | `warning`                        | Xray log level                                    |
| `ACCESS_LOG`  | Empty (disabled)                 | Path of the Xray access log file                  |

## Client Usage

One node, two share links — **pick by your client's core**:

**Xray-core clients** (v2rayN, v2rayNG, Streisand, Happ, …) use XHTTP:

```
vless://<UUID>@<your-app-domain>:443?encryption=none&security=tls&type=xhttp&host=<your-app-domain>&path=<XHTTP_PATH>&mode=auto#pudding
```

**sing-box-core clients** (NekoBox, Hiddify, …) use WebSocket:

```
vless://<UUID>@<your-app-domain>:443?encryption=none&security=tls&type=ws&host=<your-app-domain>&path=<WS_PATH>#pudding-ws
```

Key points: `security=tls` (TLS is provided by the platform edge);
`type` and `path` must match the transport you picked (URL-encode `/`
as `%2F` in links). Importing the XHTTP link into a sing-box client
cannot work — the core has no XHTTP implementation (a typical symptom
is the error `unknown version 72`: the client mistook the peer's HTTP
response for protocol data).

## Project Structure

```
.
├── README.md       # Chinese documentation (default)
├── README.en.md    # English documentation
├── index.js        # Node.js entry point (npm start): delegates to router.js
├── router.js       # Implementation: renders Xray config, launches Xray, routes by path
├── fetch-xray.js   # Downloads & extracts the official Xray binary (stdlib only)
├── package.json    # Node.js manifest (postinstall + start scripts)
├── Dockerfile      # Alpine-based image definition (includes Node.js)
├── entrypoint.sh   # Container entry point: node router.js preferred; XHTTP-only fallback without Node.js
└── LICENSE         # MIT License
```

## Local Development

```bash
npm install   # the postinstall script also downloads the Xray binary
npm start     # listens on $PORT (default 8080); watch the log for generated credentials
```

## Security Notes

- The UUID and paths are the access credentials: never commit values you
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
