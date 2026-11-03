# pudding

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Xray-core](https://img.shields.io/badge/Powered%20by-Xray--core-blue)

A lightweight WebSocket proxy service powered by [Xray-core](https://github.com/XTLS/Xray-core),
speaking the **VLESS** protocol over a **WebSocket** transport. It runs in two modes:

- **Node.js mode** — for buildpack-based PaaS platforms (e.g. infrlo, Heroku-style platforms):
  the platform detects `package.json`, installs dependencies, and starts the app with Node.js.
- **Docker mode** — for any container platform: the included `Dockerfile` builds a minimal
  Alpine image that runs the same service through `entrypoint.sh`.

Both modes share the same configuration semantics and the same environment variables.

---

## Features

- VLESS inbound over WebSocket, `freedom` outbound (direct egress)
- Zero runtime dependencies in Node.js mode — the official Xray-core binary is
  downloaded automatically at install time (`postinstall`) or at first boot,
  using only the Node.js standard library
- Fully configured through environment variables (`PORT`, `UUID`, `WS_PATH`)
- HTTP / TLS sniffing enabled, matching the reference Xray configuration
- MIT licensed, bilingual documentation (English / 简体中文）

## How It Works

1. On start, the launcher (`index.js`, or `entrypoint.sh` in Docker mode) renders
   an Xray configuration file from the environment variables.
2. The Xray-core binary is fetched from the official XTLS GitHub release
   (Docker mode: at image build time; Node.js mode: during `npm install`,
   with a boot-time fallback in `fetch-xray.js`).
3. Xray listens on `0.0.0.0:$PORT` and accepts VLESS connections that arrive
   through a WebSocket upgrade on the configured path. All other paths
   return `404`, and a plain HTTP request on the WebSocket path returns `400` —
   this is a quick health check that the service is up.

## Deployment

### Option A — Node.js PaaS (buildpack platforms)

1. Push this repository to your Git host.
2. Create an app from the repository on your platform and connect the repo.
3. Build command: `npm install` · Start command: `npm start`
   (these are the platform defaults for Node.js apps; the `postinstall`
   script downloads the Xray binary automatically).
4. Set environment variables as needed (see *Configuration*) and deploy.
   The platform injects `PORT`; the service binds to it automatically.

### Option B — Docker

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 8080:8080 \
  -e UUID=<your-uuid> \
  -e WS_PATH=<your-ws-path> \
  pudding
```

## Configuration

| Variable  | Default                              | Description                                  |
|-----------|--------------------------------------|----------------------------------------------|
| `PORT`    | `8080` (or platform-injected)        | TCP port the service listens on              |
| `UUID`    | Defined in `index.js` / `Dockerfile` | VLESS client UUID — treat it as a credential |
| `WS_PATH` | Defined in `index.js` / `Dockerfile` | WebSocket path, e.g. `/ws-xxxxxxxx`          |

**Always override `UUID` (and ideally `WS_PATH`) in production** through your
platform's environment-variable settings. Anyone who knows the UUID can use
your service.

## Client Usage

Any VLESS-capable client (v2rayN, v2rayNG, Shadowrocket, Streisand, Nekoray,
sing-box, etc.) can connect. A share link looks like:

```
vless://<UUID>@<your-app-domain>:443?encryption=none&security=tls&type=ws&host=<your-app-domain>&path=<WS_PATH>#pudding
```

- `address` / `host`: your app's public domain
- `port`: `443` when the platform terminates TLS in front of the service
- `path`: must match `WS_PATH` exactly (URL-encode `/` as `%2F` if your client requires it)

## Project Structure

```
.
├── index.js        # Node.js entry point: renders config, launches Xray
├── fetch-xray.js   # Downloads & extracts the official Xray binary (stdlib only)
├── package.json    # Node.js manifest (postinstall + start scripts)
├── Dockerfile      # Alpine-based image definition (Docker mode)
├── entrypoint.sh   # Container entry point (Docker mode)
├── LICENSE         # MIT License
└── README.md
```

## Local Development

```bash
npm install        # also downloads the Xray binary via postinstall
npm start          # listens on $PORT (default 8080)

# smoke tests
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/<WS_PATH>   # expect 400
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/other       # expect 404
```

## Security Notes

- The `UUID` is the only credential — keep it secret and rotate it if leaked
  (change the environment variable and redeploy).
- Run the service behind TLS whenever possible (most PaaS platforms terminate
  TLS automatically at their edge).
- Keep an eye on upstream Xray-core releases; the binary is fetched from the
  official XTLS repository only.

## License

Released under the [MIT License](./LICENSE).

## Disclaimer

This project is provided for learning, research, and lawful personal use only.
You are responsible for complying with the laws and regulations of your
jurisdiction and with the terms of service of any platform you deploy it on.

---

# pudding（中文说明）

一个基于 [Xray-core](https://github.com/XTLS/Xray-core) 的轻量 WebSocket 代理服务，
使用 **VLESS** 协议 + **WebSocket** 传输。支持两种运行方式：

- **Node.js 模式**——面向 Buildpack 类 PaaS 平台（如 infrlo、Heroku 风格平台）：
  平台检测到 `package.json` 后自动安装依赖并用 Node.js 启动应用。
- **Docker 模式**——面向任意容器平台：仓库自带的 `Dockerfile` 构建一个
  精简的 Alpine 镜像，通过 `entrypoint.sh` 运行同一套服务。

两种模式共用同一套配置语义和环境变量。

## 特性

- VLESS 入站 + WebSocket 传输，出站为 `freedom`（直连）
- Node.js 模式零运行时依赖：Xray-core 官方二进制在安装时（`postinstall`）
  或首次启动时自动下载，全程只用 Node.js 标准库实现
- 全部配置来自环境变量（`PORT`、`UUID`、`WS_PATH`）
- 开启 HTTP / TLS 嗅探，与参考 Xray 配置保持一致
- MIT 开源协议，中英双语文档

## 工作原理

1. 启动时，启动器（Node.js 模式为 `index.js`，Docker 模式为 `entrypoint.sh`）
   根据环境变量生成 Xray 配置文件。
2. Xray-core 二进制从 XTLS 官方 GitHub 发布页获取
   （Docker 模式在构建镜像时下载；Node.js 模式在 `npm install` 时下载，
   并由 `fetch-xray.js` 提供启动时兜底下载）。
3. Xray 监听 `0.0.0.0:$PORT`，仅接受在约定路径上通过 WebSocket 升级的
   VLESS 连接。访问其他路径返回 `404`，在 WebSocket 路径上发普通 HTTP
   请求返回 `400`——可据此快速判断服务是否存活。

## 部署方式

### 方式 A — Node.js PaaS（Buildpack 平台）

1. 将本仓库推送到你的 Git 托管平台。
2. 在目标平台上从该仓库创建应用并关联仓库。
3. 构建命令：`npm install`；启动命令：`npm start`
   （这是各平台对 Node.js 应用的默认配置；`postinstall` 脚本会
   自动完成 Xray 二进制的下载）。
4. 按需设置环境变量（见“配置”一节）后部署。平台会注入 `PORT`，
   服务会自动绑定该端口。

### 方式 B — Docker

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 8080:8080 \
  -e UUID=<你的UUID> \
  -e WS_PATH=<你的WS路径> \
  pudding
```

## 配置

| 变量        | 默认值                    | 说明                                     |
|-------------|---------------------------|------------------------------------------|
| `PORT`      | `8080`（或平台注入的值）  | 服务监听的 TCP 端口                      |
| `UUID`      | 见 `index.js` / `Dockerfile` | VLESS 客户端 UUID，等同于访问凭证     |
| `WS_PATH`   | 见 `index.js` / `Dockerfile` | WebSocket 路径，如 `/ws-xxxxxxxx`     |

**生产环境务必通过平台的环境变量设置覆盖 `UUID`（建议连 `WS_PATH` 一起换）**：
任何知道 UUID 的人都能使用你的服务。

## 客户端使用

支持 VLESS 的客户端均可连接（如 v2rayN、v2rayNG、Shadowrocket、Streisand、
Nekoray、sing-box 等）。分享链接格式如下：

```
vless://<UUID>@<你的应用域名>:443?encryption=none&security=tls&type=ws&host=<你的应用域名>&path=<WS_PATH>#pudding
```

- `address` / `host`：应用的公开域名
- `port`：平台在前端终止 TLS 时填 `443`
- `path`：必须与 `WS_PATH` 完全一致（如客户端要求，将 `/` 写为 `%2F`）

## 项目结构

```
.
├── index.js        # Node.js 入口：生成配置、拉起 Xray
├── fetch-xray.js   # 下载并解压官方 Xray 二进制（纯标准库）
├── package.json    # Node.js 清单（postinstall + start 脚本）
├── Dockerfile      # 基于 Alpine 的镜像定义（Docker 模式）
├── entrypoint.sh   # 容器入口脚本（Docker 模式）
├── LICENSE         # MIT 协议
└── README.md
```

## 本地开发

```bash
npm install        # postinstall 会一并下载 Xray 二进制
npm start          # 监听 $PORT（默认 8080）

# 冒烟测试
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/<WS_PATH>   # 期望 400
curl -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/other       # 期望 404
```

## 安全说明

- `UUID` 是唯一的访问凭证，请妥善保管；一旦泄露，修改环境变量并
  重新部署即可轮换。
- 尽量让服务运行在 TLS 之后（多数 PaaS 平台会在边缘自动终止 TLS）。
- Xray 二进制只从 XTLS 官方仓库获取；建议关注上游版本更新。

## 开源协议

本项目基于 [MIT 协议](./LICENSE) 开源。

## 免责声明

本项目仅供学习、研究与合法的个人用途。使用时请遵守你所在司法辖区的
法律法规，以及你所部署平台的服务条款；由此产生的责任由使用者自行承担。
