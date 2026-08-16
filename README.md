# dsh-gpu-cleanup

一个 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)（DSH）Web UI 插件：在对话页右上角（Session log 按钮旁）添加一个 **「释放显存」** 按钮，一键卸载本地 Ollama（及任意 OpenAI 兼容服务）已加载的模型，把 GPU 显存腾出来给 ComfyUI / SDXL / 其他 GPU 任务使用。

> 典型场景：用 DSH 跑完一个本地模型任务后，模型仍驻留在显存里，直接去开 ComfyUI 会 OOM。点一下按钮即可卸载，无需重启 DSH。

A DeepSeek Harness Web UI plugin that adds a **"Release GPU"** button next to the Session log button, unloading local Ollama (and any OpenAI-compatible) models on demand to free VRAM for ComfyUI / SDXL and other GPU workloads.

## 功能特性

- **一键释放显存**：自动发现本地 LLM 服务，卸载所有已加载模型
- **自动发现**：从 DSH 的 `settings.yaml` 读取 provider 配置，自动识别 Ollama 端点（含 `:11434` 端口或名字含 `ollama`）
- **兜底机制**：即使配置里没有 Ollama，也会尝试 `http://127.0.0.1:11434`
- **实时日志**：弹窗展示卸载进度，支持复制日志
- **中英双语**：跟随 DSH 的 UI 语言自动切换

## 安装

### 方式一：dsh plugin 命令（推荐）

```bash
dsh plugin --profile web add github:princepainter/dsh-gpu-cleanup
```

### 方式二：手动安装

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

安装后重启 DSH，然后 **强制刷新**（`Ctrl+Shift+R`）浏览器页面，即可在对话页右上角看到「释放显存」按钮。

## 使用

1. 打开 DSH Web UI（`http://127.0.0.1:3080`）
2. 右上角点击 **「释放显存」** 按钮
3. 弹窗中点击 **「执行」**
4. 等待日志显示 `done_reason=unload`，显存即已释放

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

- DeepSeek Harness `v0.1.0-rc.6`（开发者预览版）
- 本地 Ollama（可选，没有 Ollama 时按钮仍会显示，但执行时提示无可用服务）

## License

[MIT](./LICENSE)
