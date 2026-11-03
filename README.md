# pudding

**简体中文** | [English](README.en.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Xray-core](https://img.shields.io/badge/Powered%20by-Xray--core-blue)

一个基于 [Xray-core](https://github.com/XTLS/Xray-core) 的轻量代理服务，
在**单个公开端口**上同时提供 **VLESS + XHTTP** 与 **VLESS + WebSocket**
两种传输：流量都以普通 HTTPS 请求的形式到达平台边缘、再转发给应用，
天然适配只提供 HTTP(S) 入口的托管平台。

为什么要两种传输？XHTTP 是 Xray 官方设计的现代传输（WebSocket 的继
任者），但 **sing-box 内核并不实现 XHTTP**——NekoBox 等 sing-box 系
客户端只能走 WebSocket。本服务内置一个按路径分流的小型路由器，让
两类客户端共用同一个节点、同一个 UUID，只是路径不同：

- **Xray 内核客户端**（v2rayN、v2rayNG、Streisand、Happ 等）→ 走 XHTTP；
- **sing-box 内核客户端**（NekoBox、Hiddify 等）→ 走 WebSocket。

支持两种运行形态，配置语义完全一致：

- **Node.js 模式**——面向 Buildpack 类 PaaS（如 infrlo、Heroku 风格平台）：
  平台检测到 `package.json` 后自动安装并用 Node.js 启动，二进制由安装
  脚本自动下载（零运行时依赖）。
- **Docker 模式**——仓库自带 `Dockerfile`（镜像内含 Node.js，同样走
  双传输）；若某个运行环境实在没有 Node.js，`entrypoint.sh` 会退化为
  仅 XHTTP 的兼容模式并打印警告。

## 🔐 凭据管理（设计要点）

**本仓库不写死任何凭据。** UUID 与两条路径的来源只有两个：

1. 平台的环境变量（`UUID`、`XHTTP_PATH`、`WS_PATH`）——推荐做法，重启不变；
2. 都不设置时，服务在每次启动时**随机生成**，并打印到启动日志中。

因此同一份代码可以被任何人部署，各自的凭据互不相同、且不出现在代码里。

## 特性

- 单公开端口双传输：XHTTP（`mode=auto`）+ WebSocket，按路径分流
- VLESS 入站，出站为 `freedom` 直连
- 凭据零写死：环境变量注入或启动时随机生成
- Node.js 模式零运行时依赖，Xray 官方二进制在安装时自动下载（纯标准库
  实现），启动时缺失会自动补下载
- MIT 开源协议；中文文档为默认，英文版见 [README.en.md](README.en.md)

## 工作原理

1. 客户端以 TLS 连接平台边缘的 443 端口，边缘终结 TLS 后，将 HTTP
   请求转发给应用的 `$PORT`。
2. 应用内的路径路由器按请求路径分流：`XHTTP_PATH` 开头的请求交给
   Xray 的 XHTTP 入站（内部端口 `XHTTP_PORT`），`WS_PATH` 开头的交给
   WebSocket 入站（内部端口 `WS_PORT`），其余路径返回 404。
3. Xray 按 VLESS 协议承载流量、经 `freedom` 出站直连。

注：加密由“客户端 ↔ 平台边缘”这一段的 TLS 提供，请只在能提供有效证书
的平台/域名上使用。

**为什么不用 Xray 自带的 fallbacks 分流？** 实测中 fallback 转发进
XHTTP 入站并不可靠（会话路径会被破坏，日志报 `failed to find the
default "path" config`），WebSocket 则没有这个问题；用一个显式的
HTTP 路由器分流行为最可预测。

## 部署

### 方式 A — Node.js PaaS（Buildpack 平台）

1. 将本仓库推送到你的 Git 托管平台并在目标平台关联仓库；
2. 构建命令 `npm install`，启动命令 `npm start`（`postinstall` 会自动
   下载 Xray 二进制）；
3. 在平台的环境变量中设置 `UUID`、`XHTTP_PATH` 与 `WS_PATH`（UUID 可
   用 `xray uuid` 生成，路径用随机字符串；或留空由服务随机生成后从
   日志读取）；
4. 部署。平台注入的 `PORT` 会被自动采用。

### 方式 B — Docker（前面需有 TLS 终结层）

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 8080:8080 \
  -e UUID=<你的UUID> \
  -e XHTTP_PATH=<你的XHTTP路径> \
  -e WS_PATH=<你的WS路径> \
  pudding
```

## 配置

| 变量          | 默认值                 | 说明                                        |
|---------------|------------------------|---------------------------------------------|
| `PORT`        | `8080`（或平台注入）   | 路由器公开监听端口                          |
| `UUID`        | 启动时随机生成         | VLESS 客户端 UUID，等同访问凭证（两传输共用） |
| `XHTTP_PATH`  | 启动时随机生成         | XHTTP 路径，如 `/xh-xxxxxxxx`               |
| `WS_PATH`     | 启动时随机生成         | WebSocket 路径，如 `/ws-xxxxxxxx`           |
| `XHTTP_PORT`  | `5001`                 | 内部 XHTTP 端口（仅监听 127.0.0.1）         |
| `WS_PORT`     | `5002`                 | 内部 WebSocket 端口（仅监听 127.0.0.1）     |
| `LOG_LEVEL`   | `warning`              | Xray 日志级别                               |
| `ACCESS_LOG`  | 空（禁用）             | Xray 访问日志文件路径                       |

## 客户端使用

同一个节点有两条分享链接，**按你的客户端内核二选一**：

**Xray 内核客户端**（v2rayN、v2rayNG、Streisand、Happ 等）走 XHTTP：

```
vless://<UUID>@<你的应用域名>:443?encryption=none&security=tls&type=xhttp&host=<你的应用域名>&path=<XHTTP_PATH>&mode=auto#pudding
```

**sing-box 内核客户端**（NekoBox、Hiddify 等）走 WebSocket：

```
vless://<UUID>@<你的应用域名>:443?encryption=none&security=tls&type=ws&host=<你的应用域名>&path=<WS_PATH>#pudding-ws
```

要点：`security=tls`（TLS 由平台边缘提供）；`type` 与 `path` 必须与所选
传输一致（链接中 `/` 建议编码为 `%2F`）。把 XHTTP 链接导入 sing-box
客户端会因为内核不支持而连接失败（常见报错 `unknown version 72`，
那是客户端把对端返回的 HTTP 响应误当成了协议数据）。

## 项目结构

```
.
├── README.md       # 中文文档（默认）
├── README.en.md    # English documentation
├── index.js        # Node.js 入口（npm start）：转交 router.js
├── router.js       # 实现：生成 Xray 配置、拉起 Xray、按路径分流
├── fetch-xray.js   # 下载并解压官方 Xray 二进制（纯标准库）
├── package.json    # Node.js 清单（postinstall + start 脚本）
├── Dockerfile      # 基于 Alpine（含 Node.js）的镜像定义
├── entrypoint.sh   # 容器入口：优先 node router.js，无 Node 时退化为仅 XHTTP
└── LICENSE         # MIT 协议
```

## 本地开发

```bash
npm install   # postinstall 会一并下载 Xray 二进制
npm start     # 监听 $PORT（默认 8080）；未设凭据时看日志里的随机值
```

## 安全说明

- UUID 与路径是访问凭证：通过环境变量设置时请勿提交进任何仓库；
  使用随机生成时，请从启动日志中妥善记录。
- 轮换凭据：修改环境变量并重启（或直接重启以重新随机生成）即可。
- 务必让客户端走 TLS（443 + 有效证书），不要暴露明文 HTTP 入口给公网。
- Xray 二进制只从 XTLS 官方仓库获取；建议关注上游版本更新。

## 开源协议

本项目基于 [MIT 协议](./LICENSE) 开源。

## 免责声明

本项目仅供学习、研究与合法的个人用途。使用时请遵守你所在司法辖区的
法律法规，以及你所部署平台的服务条款；由此产生的责任由使用者自行承担。
