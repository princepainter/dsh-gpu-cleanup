# dsh-gpu-cleanup

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）插件：在对话页右上角（Session log 按钮旁）添加一个 **「释放显存」** 按钮，一键卸载本地 Ollama（及任意 OpenAI 兼容服务）已加载的模型，把 GPU 显存腾出来给 ComfyUI / SDXL / 其他 GPU 任务使用。

> 典型场景：用 DSH 跑完一个本地模型任务后，模型仍驻留在显存里，直接去开 ComfyUI 会 OOM。点一下按钮即可卸载，无需重启 DSH。

A DeepSeek Harness plugin that adds a **"Release GPU"** button next to the Session log button, unloading local Ollama (and any OpenAI-compatible) models on demand to free VRAM for ComfyUI / SDXL and other GPU workloads.
<img width="1585" height="915" alt="image" src="https://github.com/user-attachments/assets/e7592c4c-4fae-4ad6-bbf0-959c30fe8590" />

## 功能特性

- **一键释放显存**：自动发现本地 LLM 服务，卸载所有已加载模型
- **自动发现**：从 DSH 的 `settings.yaml` 读取 provider 配置，自动识别 Ollama 端点（含 `:11434` 端口或名字含 `ollama`）
- **兜底机制**：即使配置里没有 Ollama，也会尝试 `http://127.0.0.1:11434`
- **实时日志**：弹窗展示卸载进度，支持复制日志
- **中英双语**：跟随 DSH 的 UI 语言自动切换
- **失败不再静默**：请求失败会明确报出 HTTP 状态码；被 CORS 拒绝时直接给出修复提示，而不是假装"没有加载模型"

## 兼容性

| DSH 版本 | 状态 |
|---|---|
| `0.2.0-rc.2`（桌面客户端） | ✅ 支持 |
| `0.1.0-rc.6`（Web UI / dsh CLI） | 需使用 `v0.1.0-rc.6` 之前的 tag，0.2.0 的客户端模块白名单有重大变更 |

> 从 0.1.x 升级到 0.2.0 的两处改动：`@deepseek-ai/dsh-client-runtime` 已并入 `@deepseek-ai/dsh-client-store`；`primitives.Icon*16` 系列图标已移除。

## 安装

### 方式一：DSH 桌面客户端（0.2.0-rc.2）

桌面客户端**没有独立的 `dsh` CLI**，dsh 核心打包在 `resources/app.asar` 内，因此靠改 profile 文件来安装。

1. 把插件源码放到 `~/.dsh/plugins-src/dsh-gpu-cleanup`（或任意目录）。
2. 在 `~/.dsh/profiles/desktop/package.json` 的 `dependencies` 里加依赖，并让包能被解析到：
   ```json
   "dependencies": { "@princepainter/dsh-gpu-cleanup": "link:C:/Users/<你>/.dsh/plugins-src/dsh-gpu-cleanup" }
   ```
   > pnpm 在 `nodeLinker: hoisted` 下对 `link:` 依赖**不建链接**（只创建空目录）。稳一点直接用 Windows 目录联接：
   > `cmd /c mklink /J "<profile>\node_modules\@princepainter\dsh-gpu-cleanup" "<插件源码目录>"`
3. 在 `~/.dsh/profiles/desktop/cordis.patch.yml` 里注册插件（**不要放进 `dsh.profile.bundles`**，那是 bundle 专用字段）：
   ```yaml
   - insert:
       - id: gpu-cleanup
         name: '@princepainter/dsh-gpu-cleanup'
   ```
4. 插件的 `peerDependencies` 要求与当前 dsh 版本不符时，写版本豁免：
   `~/.dsh/profiles/desktop/compatibility.json`（**格式是纯 map，不要套一层 `exemptions`**）
   ```json
   { "@princepainter/dsh-gpu-cleanup@0.1.0": ["0.2.0-rc.2"] }
   ```
   key 必须是精确的 `包名@版本`，value 是允许的**精确** DSH 版本数组。

### 方式二：dsh plugin 命令（dsh CLI / Web profile）

```bash
dsh plugin --profile web add github:princepainter/dsh-gpu-cleanup
```

> ⚠️ 仅适用于有独立 `dsh` CLI 的场景。桌面客户端请用方式一。
> 另外 `github:` 前缀会被 pnpm 解析成 `git+ssh://`，需要本机配好 GitHub SSH key。

### 方式三：手动安装（Web profile）

```bash
mkdir -p ~/.dsh/profiles/node_modules/@princepainter
cd ~/.dsh/profiles/node_modules/@princepainter
git clone https://github.com/princepainter/dsh-gpu-cleanup.git
```

然后在 `~/.dsh/profiles/web/cordis.patch.yml` 里注册插件：

```yaml
- insert:
    - id: gpu-cleanup
      name: '@princepainter/dsh-gpu-cleanup'
```

### 重启并刷新

安装后重启 DSH，然后 **强制刷新**（`Ctrl+Shift+R`）页面，即可在对话页右上角看到「释放显存」按钮。

## 使用

1. 打开 DSH（Web UI 为 `http://127.0.0.1:3080`；桌面客户端直接开应用）
2. 右上角点击 **「释放显存」** 按钮
3. 弹窗中点击 **「执行」**
4. 等待日志显示 `done_reason=unload`，显存即已释放

## 常见问题

### 按钮点了没反应 / 显存没有释放

**头号原因：Ollama 的 CORS 策略把请求挡了。**

DSH 桌面客户端的主界面是 `file://` 页面，属于 opaque origin，渲染进程发出的跨域请求会带上 **`Origin: null`**。
而 Ollama 的默认 CORS 白名单里有 `http://localhost`、`app://*`、`file://*`，**唯独不含 `null`** → 所有请求被 **403**。

排查方法：

```bash
# 复现 403（注意 --noproxy，本机可能注入了 http_proxy）
curl --noproxy '*' -i -H "Origin: null" http://127.0.0.1:11434/api/ps

# 对照组：不带 Origin 是 200
curl --noproxy '*' -i http://127.0.0.1:11434/api/ps
```

也可以直接看 Ollama 的服务日志（`%LOCALAPPDATA%\Ollama\server.log`），里面会记录每个请求的状态码。

**修复**：设置环境变量 `OLLAMA_ORIGINS=*` 后**重启 Ollama**（必须让新进程读到该变量；只写注册表往往不够，explorer 会缓存旧环境块，最稳的是注销重登或用 `cmd /c start` 显式带入环境变量）。

> ⚠️ 不要写成 `OLLAMA_ORIGINS=null` —— Ollama 会直接 panic：`bad origin: origins must contain '*' or include http://,https://,chrome-extension://...`。放行 opaque origin **只能用 `*`**。

### 装完看不到按钮

检查两件事：

1. **快捷键冲突**：「强制刷新」是 `Ctrl+Shift+R`。
2. **崩溃日志**：`%APPDATA%\@deepseek-ai\dsh-desktop\logs\crash-<时间>-web-boot.log`。
   若出现 `client-modules: require("...") missed the module table`，说明插件 require 了 0.2.0 客户端模块白名单之外的包，
   需要改用 `@deepseek-ai/dsh-client-store` / `dsh-client-ui-slots` / `dsh-client-ui-primitives` 等白名单内的包。

## 工作原理

插件调用 Ollama 的 API 卸载模型：

```bash
# 1. 查询当前已加载的模型
GET http://127.0.0.1:11434/api/ps

# 2. 对每个模型发送卸载请求（keep_alive: 0 = 立即卸载）
POST http://127.0.0.1:11434/api/generate
{ "model": "qwen3.8-27b:latest", "keep_alive": 0 }
# => { "done": true, "done_reason": "unload" }
```

Ollama 返回 `done_reason: "unload"` 即代表模型已从显存卸载。

## 技术架构

本插件遵循 DSH 的「一切皆插件」架构，是一个 **dual-face** 包：

| 文件 | 作用 |
|------|------|
| `lib/index.js` | Node 端占位（host half），保证 Cordis loader 可导入 |
| `lib/client.js` | 浏览器端（client half），渲染按钮并注入到 `conversation.session.header.utilities` slot |
| `lib/invariant.js` | Invariant 占位，满足 DSH dual-face 协议 |

按钮通过 DSH 的 slot 系统注入，与官方「Session log」按钮同属 `conversation.session.header.utilities` slot，风格自动保持一致。

## 依赖

- DeepSeek Harness `0.2.0-rc.2`（桌面客户端）或 `0.1.0-rc.6`（Web UI / dsh CLI，需旧版插件）
- 本地 Ollama（可选，没有 Ollama 时按钮仍会显示，但执行时提示无可用服务）
- 使用桌面客户端时需设置 `OLLAMA_ORIGINS=*`，详见[常见问题](#按钮点了没反应--显存没有释放)

## License

[MIT](./LICENSE)
