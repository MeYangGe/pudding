# pudding

**简体中文** | [English](README.en.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green)
![Xray-core](https://img.shields.io/badge/Powered%20by-Xray--core-blue)

一个基于 [Xray-core](https://github.com/XTLS/Xray-core) 的轻量代理服务，使用
**VLESS + REALITY**（XTLS Vision 流控） over 原始 TCP。REALITY 借用真实知名站点的
TLS 握手特征进行伪装，无需域名证书即可获得与真实 TLS 一致的外观，是目前
安全性与兼容性的主流组合。

支持两种运行形态，配置语义完全一致：

- **Docker 模式**——仓库自带 `Dockerfile`，适用于 VPS 及任何能直达容器端口的平台。
- **Node.js 模式**——面向 Buildpack 类平台：平台检测到 `package.json` 后自动
  安装并用 Node.js 启动，二进制由安装脚本自动下载（零运行时依赖）。

## ⚠️ 部署前提（重要）

REALITY 工作在原始 TCP 层，**要求宿主平台把公网端口的原始 TCP 流量直达服务
进程**，并且不能在中间终结 TLS。因此：

- ✅ 适用：VPS / 独立服务器、支持原始 TCP 端口映射的容器平台；
- ❌ 不适用：只提供 HTTP(S) 反向代理入口的 PaaS（其边缘会终结 TLS 并按
  HTTP 转发，REALITY 握手无法穿过）。

## 特性

- VLESS 入站 + REALITY 传输安全 + `xtls-rprx-vision` 流控，出站为 `freedom` 直连
- 无需自备域名与证书：REALITY 借用目标站点（如 `www.microsoft.com`）的握手特征
- 全部配置来自环境变量：端口、UUID、REALITY 密钥对、伪装 SNI/目标、shortId
- Node.js 模式零运行时依赖，Xray 官方二进制在安装时自动下载（纯标准库实现），
  启动时缺失会自动补下载
- MIT 开源协议；中文文档为默认，英文版见 [README.en.md](README.en.md)

## 工作原理

1. 启动器（Docker 模式为 `entrypoint.sh`，Node.js 模式为 `index.js`）根据
   环境变量生成 Xray 配置。
2. Xray 监听 `0.0.0.0:$PORT`（默认 443）。客户端发起 TLS 风格握手时，
   REALITY 用 x25519 密钥对与 shortId 完成身份验证；未通过验证的连接会被
   无缝转发到伪装目标站点，外观与访问真实站点无异。
3. 通过验证的连接按 VLESS 协议（Vision 流控）承载流量，经 `freedom` 出站直连。

## 部署

### 方式 A — Docker（推荐）

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 443:443 \
  -e UUID=<你的UUID> \
  -e REALITY_PRIVATE_KEY=<你的私钥> \
  -e REALITY_SHORT_ID=<你的shortId> \
  pudding
```

### 方式 B — Node.js（要求平台支持原始 TCP 端口）

1. 将本仓库推送到你的 Git 托管平台并在目标平台关联仓库；
2. 构建命令 `npm install`，启动命令 `npm start`（`postinstall` 会自动
   下载 Xray 二进制）；
3. 确认平台将公网 TCP 端口直达应用的 `$PORT`，再按需设置环境变量并部署。

## 配置

| 变量                  | 默认值                       | 说明                                   |
|-----------------------|------------------------------|----------------------------------------|
| `PORT`                | `443`                        | 监听端口                               |
| `UUID`                | 见 `index.js` / `Dockerfile` | VLESS 客户端 UUID，等同访问凭证        |
| `REALITY_PRIVATE_KEY` | 见 `index.js` / `Dockerfile` | REALITY x25519 私钥（服务端保密）      |
| `REALITY_PUBLIC_KEY`  | 见 `index.js`                | REALITY x25519 公钥（客户端链接中的 `pbk`） |
| `REALITY_SNI`         | `www.microsoft.com`          | 伪装 SNI，需与目标站点一致             |
| `REALITY_DEST`        | `www.microsoft.com:443`      | 伪装目标（需支持 TLS 1.3）             |
| `REALITY_SHORT_ID`    | 见 `index.js` / `Dockerfile` | REALITY shortId（十六进制字符串）      |

生成新的密钥对与参数：

```bash
xray x25519          # 生成 REALITY 密钥对（PrivateKey / PublicKey）
xray uuid            # 生成 UUID
openssl rand -hex 8  # 生成 shortId
```

**生产环境务必通过环境变量覆盖 `UUID`、`REALITY_PRIVATE_KEY` 与
`REALITY_SHORT_ID` 的默认值**——默认值写在公开代码中，任何人可见。

## 客户端使用

支持 VLESS + REALITY 的客户端均可连接（如 v2rayN、v2rayNG、Shadowrocket、
Streisand、Nekoray、sing-box 等）。分享链接格式：

```
vless://<UUID>@<服务器地址>:443?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.microsoft.com&fp=chrome&pbk=<公钥>&sid=<shortId>&type=tcp#pudding
```

要点：`flow` 必须为 `xtls-rprx-vision`；`security=reality`；`fp`（指纹）
建议 `chrome`；`pbk`、`sid`、`sni` 必须与服务端配置完全一致。

## 项目结构

```
.
├── README.md       # 中文文档（默认）
├── README.en.md    # English documentation
├── index.js        # Node.js 入口：生成配置、拉起 Xray
├── fetch-xray.js   # 下载并解压官方 Xray 二进制（纯标准库）
├── package.json    # Node.js 清单（postinstall + start 脚本）
├── Dockerfile      # 基于 Alpine 的镜像定义（Docker 模式）
├── entrypoint.sh   # 容器入口脚本（Docker 模式）
└── LICENSE         # MIT 协议
```

## 本地开发

```bash
npm install   # postinstall 会一并下载 Xray 二进制
npm start     # 监听 $PORT（默认 443）
```

## 安全说明

- `UUID` 与 `REALITY_PRIVATE_KEY` 是核心凭证：私钥只应出现在服务端配置中，
  绝不要写进客户端链接；客户端只需要公钥（`pbk`）。
- 怀疑参数泄露时，重新生成密钥对/UUID 并通过环境变量更新、重启服务即可轮换。
- 伪装目标应选择支持 TLS 1.3、长期稳定的大型站点，并保持 `REALITY_SNI`
  与目标域名一致。
- Xray 二进制只从 XTLS 官方仓库获取；建议关注上游版本更新。

## 开源协议

本项目基于 [MIT 协议](./LICENSE) 开源。

## 免责声明

本项目仅供学习、研究与合法的个人用途。使用时请遵守你所在司法辖区的
法律法规，以及你所部署平台的服务条款；由此产生的责任由使用者自行承担。
