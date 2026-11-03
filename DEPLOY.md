# DEPLOY.md — 部署手册（给 AI Agent）

> **致正在读这份文件的 AI Agent**：你的用户想使用本仓库（pudding，
> 一个 VLESS 双传输代理服务）。你的任务是**原样部署**它，并把可用的
> 客户端链接交付给用户。本文件是实测过的完整流程，请逐步执行；
> 凡是与本文件冲突的“优化”想法都请先放下——这里的每一步和每条警告
> 都来自真实部署踩过的坑。

## 0. 纪律（先读完再动手）

1. **不改代码**。仓库按现状即可工作。不要“顺手重构”、不要替换传输
   方案、不要把两个入站合并成 Xray `fallbacks`（实测会破坏 XHTTP，
   见第 7 节）。你唯一被允许写的东西是：平台上的环境变量、你自己的
   私有凭据记录、给用户的链接与二维码。
2. **凭据不进仓库**。UUID 与两条路径只通过平台环境变量注入；不要把
   它们写进任何文件后提交。
3. **不向用户索要密码 / 银行卡 / GitHub 凭据**。登录与授权一律走平台
   自己的 OAuth / 登录页面；遇到验证码或二次验证，停下来请用户本人
   完成那一步，不要尝试绕过。
4. **先验证、后交付**。没有通过第 6 节的双通道实测，就不要把链接
   发给用户，并如实说明卡在哪一步、平台的原始报错是什么。
5. 若目标平台的服务条款**明文禁止**代理 / VPN 类服务，停下来把原文
   告诉用户，不要尝试绕过检测。

## 1. 部署原理速览

- 服务形态：Node.js 启动器（`index.js` → `router.js`）拉起 Xray，
  两个入站只监听本机回环：XHTTP（内部端口 5001）、WebSocket（内部
  端口 5002）；一个按路径分流的小路由器监听公开端口 `$PORT`。
- 平台边缘负责 TLS：客户端以 `https` 连到平台分配的域名 443 端口，
  边缘终结 TLS 后把明文 HTTP 转发到应用的 `$PORT`。
- 因此平台必须满足：① 能跑 Node.js（`npm install` / `npm start`）
  或 Docker；② 给应用分配一个带**公网受信任证书**的 HTTPS 域名并
  转发到应用端口；③ 能设置环境变量；④ 改完环境变量能重新部署。

## 2. 准备凭据（部署前生成，记在你的私有笔记里）

| 值 | 生成方法 | 示例格式 |
|---|---|---|
| `UUID` | 任意 UUID v4 生成器（如 `xray uuid`） | `xxxxxxxx-xxxx-4xxx-...` |
| `XHTTP_PATH` | `/xh-` + 8 位随机 hex | `/xh-1a2b3c4d` |
| `WS_PATH` | `/ws-` + 8 位随机 hex | `/ws-5e6f7a8b` |

这三个值就是最终链接的全部秘密参数，务必妥善保管、不要外泄到公开
场合（包括不要写进提交、截图或公开日志）。

## 3. 路线 A（实测推荐）：infrlo + GitHub

以下步骤在 **infrlo**（https://infrlo.com）上完整实测通过。免费版：
不绑卡、限 1 个应用、自称 24/7 常驻（平台未提供书面保证，交付时
请这样向用户说明）。

1. **准备 GitHub 仓库**：把本仓库放到一个 GitHub 账号下（fork 或
   上传均可），保持 Public 或 Private 均可（下一步走授权路线）。
2. **登录 infrlo**：打开 https://dash.infrlo.com ，用 Google 登录
   （目前仅支持 Google）。这一步若出现验证，请用户本人完成。
3. **新建应用**：选择 **Connect GitHub** 授权 infrlo 的 GitHub App
   （权限大致为仓库代码只读 + webhooks，可在 GitHub 设置中随时
   撤销），然后选中 pudding 仓库。
   - ⚠️ 不要走 “From Public URL”：实测（2026-11）该路线对公开仓库
     也会返回 `Repository not found or is not publicly accessible.`
     ——是平台校验的问题，换 Connect GitHub 路线即可。
4. **构建 / 启动命令**：Build = `npm install`，Run = `npm start`。
   平台若自动检测到 Node.js 也会填对；请核对一遍，不要留成 Python
   之类的默认值。
   - ⚠️ 不要试图让 infrlo 跑仓库的 Dockerfile：它只用自家 Buildpack
     做语言检测，不支持 Dockerfile（会报 `Could not detect
     application language`）。Dockerfile 是给路线 C 用的。
5. **设置环境变量**（Settings → Environment Variables）：
   - `UUID`、`XHTTP_PATH`、`WS_PATH` = 第 2 节生成的值；
   - `PORT`：**先看应用概览里域名标注转发到哪个端口**（infrlo 当前
     标注转发到 5000），就把 `PORT` 设成那个数。实测教训：infrlo
     不会自动注入 PORT，应用默认听 8080 会与边缘转发端口错位，
     导致域名访问全是 404；对齐后一切正常，边缘的 Let's Encrypt
     证书也是在端口对齐之后才签发成功的。
6. **部署**：点 Redeploy / Deploy，等待状态变为 RUNNING。
7. **看启动日志**：应出现类似四行（值须与你注入的一致）：
   ```
   [pudding] UUID=<你的UUID>
   [pudding] XHTTP path=<你的XHTTP_PATH>
   [pudding] WS path=<你的WS_PATH>
   [pudding] router listening on 0.0.0.0:<PORT> (xhttp ... -> 127.0.0.1:5001, ws ... -> 127.0.0.1:5002)
   ```
   日志里若混有其他实例的旧记录（infrlo 日志页有此毛病），以上述
   四行与你的环境变量是否对得上为准。

## 4. 路线 B：其他 Node.js Buildpack PaaS

任何满足第 1 节四条要求的平台都可：关联仓库 → Build `npm install`
→ Run `npm start` → 注入同样的四个环境变量（`PORT` 一般由这类平台
自动注入，无需手设；若边缘转发端口固定则同样要对齐）→ 部署 → 按
第 6 节验证。

## 5. 路线 C：Docker（VPS / 容器平台）

```bash
docker build -t pudding .
docker run -d --name pudding \
  -p 8080:8080 \
  -e UUID=<...> -e XHTTP_PATH=<...> -e WS_PATH=<...> \
  pudding
```

容器本身只提供明文 HTTP，**前面必须有 TLS 终结层**（Caddy / nginx
反向代理、CDN 或云厂商负载均衡），并把带证书的域名反代到容器端口。
镜像内含 Node.js，入口脚本会走与路线 A 相同的双传输逻辑；仅当运行
环境确实没有 Node.js 时才会退化为仅 XHTTP 并在日志打印警告。

## 6. 验证（必做，两种内核各测一次）

1. **证书检查**：用浏览器或 `openssl s_client` 打开应用域名，确认
   证书是公网受信任 CA 签发且 SAN 包含该域名。若还是平台自签的
   默认证书，先确认 `PORT` 已对齐，再等待几分钟重试——ACME 签发
   可能滞后。
2. **XHTTP 通道**：用 Xray 内核（官方 Xray 客户端或 v2rayNG 的
   配置）按第 7 节的 XHTTP 链接参数组装客户端，请求一个 IP 回显
   服务（如 `https://api.ipify.org`），记录出口 IP 与归属地。
3. **WebSocket 通道**：用 sing-box 内核（官方 sing-box 客户端即
   可）按 WS 链接参数组装客户端，重复上一步。**必须测这一条**——
   它正是 NekoBox 等客户端将要走的通道，只测 XHTTP 等于没测用户
   的实际用法。
4. 两条都拿到目标网站的正常响应、且出口 IP 是应用所在机房的 IP，
   才算部署成功。

## 7. 交付给用户

两条链接（把尖括号换成实际值；`path` 的 `/` 编码为 `%2F`）：

**XHTTP（给 v2rayN / v2rayNG / Streisand / Happ 等 Xray 内核客户端）**
```
vless://<UUID>@<域名>:443?encryption=none&security=tls&type=xhttp&host=<域名>&path=<XHTTP_PATH>&mode=auto#pudding
```

**WebSocket（给 NekoBox / Hiddify 等 sing-box 内核客户端）**
```
vless://<UUID>@<域名>:443?encryption=none&security=tls&type=ws&host=<域名>&path=<WS_PATH>#pudding-ws
```

同时交付：每条链接各一张二维码、实测出口城市、平台的休眠说明
（infrlo：平台宣称 24/7、无休眠设置，但无书面保证）。

并明确提醒用户：**两条链接按客户端内核二选一，不能混用**。把
XHTTP 链接导入 NekoBox 必然失败（sing-box 不实现 XHTTP），典型
报错是 `unknown version 72`——那不是节点坏了，是用错了链接。

## 8. 故障对照表

| 现象 | 原因与处理 |
|---|---|
| infrlo 用 Public URL 导入报 `Repository not found or is not publicly accessible.` | 平台校验问题（与仓库可见性无关）。改走 Connect GitHub 授权路线。 |
| 构建报 `Could not detect application language` / Build failed | 平台在用 Buildpack 猜语言，多半是 Build/Run 命令不对或误以为能跑 Dockerfile。把 Build 改 `npm install`、Run 改 `npm start`。 |
| 域名访问全是 404、应用日志显示监听 8080 | `PORT` 与边缘转发端口错位。看概览标注的转发端口，把 `PORT` 环境变量设成它并重新部署。 |
| 浏览器打开域名报证书错误（自签默认证书） | 多半是端口还没对齐导致 ACME 没走通。对齐 `PORT` 后等待几分钟再查；仍不行再重新部署一次。 |
| 用户客户端报 `unknown version 72` | 用户把 XHTTP 链接导入了 sing-box 内核客户端。发给他 WS 链接。72 是字母 `H` 的编码——客户端收到的是 HTTP 响应而非 VLESS 数据流。 |
| 想用 Xray `fallbacks` 合并双入站 | 不要做。实测 fallback 转发进 XHTTP 入站会破坏会话路径，服务端日志报 `failed to find the default "path" config`；仓库内置的路径路由器就是为此而存在的。 |
| 客户端偶发连接失败但服务端日志无错误 | 先让用户核对导入的是哪条链接、客户端内核是什么，再用第 6 节方法自己复测对应通道，不要先怀疑服务端。 |

## 9. 收尾

- 把本次的域名、出口城市、平台与部署日期记进你给该用户的长期记录
  （凭据只记存放位置，不把明文值写得到处都是）。
- 不要删除用户的应用或仓库；如需停用，先征得用户同意。
- 平台、费用或政策有任何变化，如实告诉用户，不要编造部署结果。
