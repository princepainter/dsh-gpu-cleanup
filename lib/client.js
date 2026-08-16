// dsh-gpu-cleanup: drops a "Release GPU" button into the DeepSeek Harness
// conversation header (same slot as the Session log button) so a finished task
// can offload local Ollama / OpenAI-compatible models before the user launches
// ComfyUI / SDXL / other VRAM-hungry jobs without restarting the harness.
window.__ModuleLoader__.load({
	id: "@princepainter/dsh-gpu-cleanup",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		let jsxRuntime = require("react/jsx-runtime");
		let react = require("react");
		let primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		let runtime = require("@deepseek-ai/dsh-client-runtime/client");

		// CSS — same chrome as the Session log button so the two sit flush.
		const css = [
			".pqGPU_btn{border:1px solid var(--dsw-alias-border-l2);min-width:111px;height:32px;color:var(--dsw-alias-label-primary);font-family:var(--dsw-font-family);cursor:pointer;background:transparent;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:6px 12px;font-size:13px;font-weight:400;line-height:20px;display:inline-flex}",
			".pqGPU_btn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
			".pqGPU_btn:disabled{color:var(--dsw-alias-label-dimmed);cursor:wait}",
			".pqGPU_btn>*{flex:none}",
			".pqGPU_btn>span{white-space:nowrap}",
			".pqGPU_logWrap{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:10px 12px;font-family:var(--dsw-font-family-mono, ui-monospace, monospace);font-size:12px;line-height:1.5;max-height:200px;overflow:auto;white-space:pre-wrap;word-break:break-all;color:var(--dsw-alias-label-secondary);margin:0}",
			".pqGPU_logOk{color:var(--dsw-alias-label-success, #16a34a)}",
			".pqGPU_logErr{color:var(--dsw-alias-label-error, #dc2626)}"
		].join("");
		const cssTagId = "@princepainter/dsh-gpu-cleanup/ReleaseGpuButton.module.css";
		if (typeof document !== "undefined" && document.querySelector('style[data-plugin-css=' + JSON.stringify(cssTagId) + ']') === null) {
			const styleTag = document.createElement('style');
			styleTag.dataset.plugin = '@princepainter/dsh-gpu-cleanup';
			styleTag.dataset.pluginCss = cssTagId;
			styleTag.textContent = css;
			document.head.appendChild(styleTag);
		}
		const cls = {
			button: "pqGPU_btn",
			log: "pqGPU_logWrap",
			logOk: "pqGPU_logOk",
			logErr: "pqGPU_logErr"
		};

		const NS = "gpu-cleanup";
		const i18n = {
			zh: {
				"button.label": "释放显存",
				"button.title": "从 Ollama (以及其它本地 OpenAI 兼容服务) 卸载模型，腾出 GPU 显存",
				"dialog.title": "释放显存",
				"dialog.idle": "准备就绪。点击「执行」会卸载所有可发现的本地模型。",
				"dialog.running": "正在卸载模型……",
				"dialog.successTitle": "已完成",
				"dialog.successDesc": "模型已卸载，GPU 显存应已释放。",
				"dialog.errorTitle": "执行失败",
				"dialog.run": "执行",
				"dialog.close": "关闭",
				"dialog.stop": "停止",
				"dialog.copy": "复制日志",
				"providers.empty": "未发现可清理的本地 LLM 服务",
				"log.empty": "(暂无日志)",
				"ollama.unloaded": "Ollama：已卸载 {model}（{reason}）",
				"ollama.nomodel": "Ollama：当前没有加载模型",
				"http.err": "Ollama：HTTP {status} {body}",
				"network.err": "Ollama：{message}"
			},
			en: {
				"button.label": "Release GPU",
				"button.title": "Unload models from Ollama (and any local OpenAI-compatible service) to free VRAM",
				"dialog.title": "Release GPU memory",
				"dialog.idle": "Ready. Hit 'Run' to unload every model found at the configured local endpoints.",
				"dialog.running": "Unloading models…",
				"dialog.successTitle": "Done",
				"dialog.successDesc": "Models have been unloaded; VRAM should now be free.",
				"dialog.errorTitle": "Failed",
				"dialog.run": "Run",
				"dialog.close": "Close",
				"dialog.stop": "Stop",
				"dialog.copy": "Copy log",
				"providers.empty": "No local LLM service discovered.",
				"log.empty": "(empty)",
				"ollama.unloaded": "Ollama: unloaded {model} ({reason})",
				"ollama.nomodel": "Ollama: no model currently loaded",
				"http.err": "Ollama: HTTP {status} {body}",
				"network.err": "Ollama: {message}"
			}
		};

		function t(dictionary, key, vars) {
			const template = (dictionary && dictionary[key]) || key;
			if (!vars) return template;
			return template.replace(/\{(\w+)\}/g, (m, name) => (vars[name] !== undefined ? String(vars[name]) : m));
		}

		// ---- controller: a tiny state machine the button + dialog both watch ----
		const STATUS = { idle: "idle", running: "running", success: "success", error: "error" };

		function makeController(orchestrator) {
			const initState = { status: STATUS.idle, log: [], lastError: null, hasCopied: false };
			const store = (0, runtime.createSnapshotStore)(initState);
			let abortCtrl = null;

			function append(level, text) {
				const stamp = new Date().toLocaleTimeString();
				store.update((s) => {
					s.log = [...s.log, { level, text, stamp }];
					if (s.log.length > 400) s.log = s.log.slice(s.log.length - 400);
				});
			}

			async function run() {
				if (abortCtrl) return;
				const ac = new AbortController();
				abortCtrl = ac;
				store.update((s) => { s.status = STATUS.running; s.log = []; s.lastError = null; s.hasCopied = false; });
				append("info", "▶ start " + new Date().toISOString());
				let hadFailure = false;
				try {
					const results = await orchestrator(ac.signal, append);
					for (const r of results) {
						if (r.ok) append("ok", r.message);
						else { append("err", r.message); hadFailure = true; }
					}
					if (results.length === 0) append("info", "— (no providers)");
					store.update((s) => { s.status = hadFailure ? STATUS.error : STATUS.success; });
				} catch (e) {
					if (e && e.name === "AbortError") {
						append("warn", "■ aborted by user");
						store.update((s) => { s.status = STATUS.idle; });
					} else {
						append("err", String((e && e.message) || e));
						store.update((s) => { s.status = STATUS.error; s.lastError = String((e && e.message) || e); });
					}
				} finally {
					abortCtrl = null;
					append("info", "■ end " + new Date().toISOString());
				}
			}

			function stop() { if (abortCtrl) abortCtrl.abort(); }
			function reset() {
				if (abortCtrl) abortCtrl.abort();
				abortCtrl = null;
				store.update((s) => { s.status = STATUS.idle; s.log = []; s.lastError = null; s.hasCopied = false; });
			}

			return { store, run, stop, reset, append };
		}

		// ---- providers: discover Ollama base URLs ---------------------------------
		function discoverProviders(snapshot) {
			const out = [];
			try {
				const providers = snapshot && snapshot.llm && snapshot.llm.providers;
				if (providers && typeof providers === "object") {
					for (const [name, p] of Object.entries(providers)) {
						const baseURL = (p && typeof p.baseURL === "string") ? p.baseURL.replace(/\/+$/u, "") : "";
						if (!baseURL) continue;
						const lower = baseURL.toLowerCase();
						const seemsOllama = lower.includes(":11434") || /ollama/i.test(name);
						if (seemsOllama) {
							const fallbackModel = Array.isArray(p.models) && p.models.length > 0 ? p.models[0].id : null;
							const root = baseURL.replace(/\/v\d+\/?$/u, "");
							out.push({ kind: "ollama", label: "Ollama (" + name + ")", baseUrl: root, fallbackModel, dictionary: (i18n.zh || i18n.en) });
						}
					}
				}
			} catch (e) { /* discovery failed — fall through to localhost default */ }

			let hasLocal = false;
			for (const p of out) if (p.baseUrl === "http://127.0.0.1:11434" || p.baseUrl === "http://localhost:11434") { hasLocal = true; break; }
			if (!hasLocal) out.push({ kind: "ollama", label: "Ollama (localhost)", baseUrl: "http://127.0.0.1:11434", fallbackModel: null, dictionary: (i18n.zh || i18n.en) });
			return out;
		}

		// ---- default orchestrator: Ollama /api/ps + /api/generate with keep_alive:0 --
		async function ollamaOrchestrator(signal, append, providers, dictionary) {
			const out = [];
			for (const p of providers) {
				if (p.kind !== "ollama") continue;
				try {
					const seen = new Set();
					let toUnload = [];
					try {
						const ps = await fetch(p.baseUrl + "/api/ps", { signal });
						if (ps.ok) {
							const body = await ps.json();
							if (Array.isArray(body && body.models)) {
								for (const m of body.models) if (m && typeof m.name === "string") toUnload.push(m.name);
							}
						}
					} catch (e) {
						if (e && e.name === "AbortError") throw e;
						// /api/ps failed — we'll try the configured fallback instead
					}
					if (toUnload.length === 0 && p.fallbackModel) toUnload.push(p.fallbackModel);
					for (const model of toUnload) {
						if (seen.has(model)) continue;
						seen.add(model);
						append("info", "· POST " + p.baseUrl + "/api/generate model=" + model);
						const resp = await fetch(p.baseUrl + "/api/generate", {
							method: "POST",
							headers: { "Content-Type": "application/json" },
							body: JSON.stringify({ model: model, keep_alive: 0 }),
							signal: signal
						});
						const raw = await resp.text();
						let parsed = null;
						try { parsed = JSON.parse(raw); } catch (_) {}
						if (!resp.ok) {
							out.push({ ok: false, message: t(dictionary, "http.err", { status: resp.status, body: (raw || "").slice(0, 200) }) });
							continue;
						}
						const reason = (parsed && parsed.done_reason) || "unload";
						out.push({ ok: true, message: t(dictionary, "ollama.unloaded", { model: model, reason: reason }) });
					}
					if (toUnload.length === 0) out.push({ ok: true, message: t(dictionary, "ollama.nomodel") });
				} catch (e) {
					if (e && e.name === "AbortError") throw e;
					out.push({ ok: false, message: t(dictionary, "network.err", { message: (e && e.message) || String(e) }) });
				}
			}
			return out;
		}

		// ---- UI components ---------------------------------------------------------
		function ReleaseGpuButton(props) {
			const { useGpuCleanup, request, dictionary } = props;
			const state = useGpuCleanup(function (s) { return s; });
			const busy = state.status === STATUS.running;
			return (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
				children: [
					(0, jsxRuntime.jsx)("button", {
						type: "button",
						className: cls.button,
						disabled: busy,
						"aria-busy": busy,
						title: t(dictionary, "button.title"),
						onClick: function () { request(); },
						children: (0, jsxRuntime.jsxs)("span", { children: [
							(0, jsxRuntime.jsx)("span", { children: t(dictionary, "button.label") }),
							" ",
							(0, jsxRuntime.jsx)(primitives.IconTrashOutline16, { size: 12 })
						] })
					}),
					(0, jsxRuntime.jsx)(ReleaseGpuDialog, props)
				]
			});
		}

		function ReleaseGpuDialog(props) {
			const { useGpuCleanup, run, stop, dismiss, dictionary, providers } = props;
			const state = useGpuCleanup(function (s) { return s; });
			const isOpen = state.status !== STATUS.idle;
			const isRunning = state.status === STATUS.running;
			const isError = state.status === STATUS.error;
			const title = isRunning
				? t(dictionary, "dialog.title") + " — " + t(dictionary, "dialog.running")
				: isError
					? t(dictionary, "dialog.errorTitle")
					: state.status === STATUS.success
						? t(dictionary, "dialog.successTitle")
						: t(dictionary, "dialog.title");
			const description = state.status === STATUS.success
				? t(dictionary, "dialog.successDesc")
				: state.status === STATUS.idle
					? (providers.length === 0 ? t(dictionary, "providers.empty") : t(dictionary, "dialog.idle"))
					: (state.lastError || (isRunning ? t(dictionary, "dialog.running") : t(dictionary, "dialog.errorTitle")));
			const logText = state.log.length === 0
				? t(dictionary, "log.empty")
				: state.log.map(function (e) { return "[" + e.stamp + "] [" + e.level + "] " + e.text; }).join("\n");
			const onCopy = async function () {
				try {
					if (navigator && navigator.clipboard && navigator.clipboard.writeText) {
						await navigator.clipboard.writeText(logText);
						props.markCopied && props.markCopied();
					}
				} catch (e) { /* clipboard may be unavailable, ignore */ }
			};
			return (0, jsxRuntime.jsx)(primitives.Modal, {
				open: isOpen,
				onClose: function () { dismiss(); },
				title: title,
				description: description,
				closeLabel: t(dictionary, "dialog.close"),
				footer: (0, jsxRuntime.jsxs)(jsxRuntime.Fragment, {
					children: [
						(0, jsxRuntime.jsx)(primitives.Button, {
							variant: "secondary",
							onClick: onCopy,
							children: t(dictionary, "dialog.copy")
						}),
						isRunning
							? (0, jsxRuntime.jsx)(primitives.Button, {
								variant: "primary",
								onClick: function () { stop(); },
								children: t(dictionary, "dialog.stop")
							})
							: (0, jsxRuntime.jsx)(primitives.Button, {
								variant: "primary",
								onClick: function () {
									if (state.status === STATUS.idle) run();
									else dismiss();
								},
								children: state.status === STATUS.idle ? t(dictionary, "dialog.run") : t(dictionary, "dialog.close")
							})
					]
				}),
				children: (0, jsxRuntime.jsx)("pre", {
					className: cls.log + " " + (isError ? cls.logErr : state.status === STATUS.success ? cls.logOk : ""),
					"aria-label": "log",
					children: logText
				})
			});
		}

		const inject = ["slots", "locale"];

		function apply(ctx) {
			let providers = discoverProviders({});
			let currentDict = i18n.zh;

			// Subscribe to locale changes so the dialog picks up the active language.
			try {
				if (ctx.locale && typeof ctx.locale.revision !== "undefined") {
					const update = function () {
						const lang = (ctx.locale.active && ctx.locale.active.lang) || (typeof navigator !== "undefined" && navigator.language) || "zh";
						currentDict = /^en\b/i.test(lang) ? i18n.en : i18n.zh;
					};
					update();
					if (typeof ctx.locale.subscribe === "function") ctx.locale.subscribe(update);
				}
			} catch (e) { /* keep default zh */ }

			// Best-effort subscribe to the LLM provider snapshot for fresh base URLs.
			try {
				const llm = ctx.inject && ctx.inject.llm;
				if (llm) {
					const refresh = function () {
						const snap = (llm.getSnapshot && llm.getSnapshot()) || llm;
						providers = discoverProviders(snap);
					};
					refresh();
					if (typeof llm.subscribe === "function") llm.subscribe(refresh);
				}
			} catch (e) { /* keep defaults */ }

			const controller = makeController(function (signal, append) {
				return ollamaOrchestrator(signal, append, providers, currentDict);
			});

			ctx.provide("gpuCleanup", controller);
			ctx.effect(function () { return async function () { controller.stop(); }; }, "gpu-cleanup: cancel on fiber unload");
			ctx.effect(function () { return ctx.locale.register(NS, { zh: i18n.zh, en: i18n.en }); }, "gpu-cleanup: locale dictionaries");

			ctx.slots.inject("conversation.session.header.utilities", function () {
				return ctx.slots.register({
					name: "conversation.session.header.utilities",
					id: "gpu-cleanup-release",
					locale: NS,
					inject: function () { return {
						hooks: { gpuCleanup: controller.store },
						request: function () { controller.run(); },
						run: function () { controller.run(); },
						stop: function () { controller.stop(); },
						dismiss: function () { controller.reset(); },
						markCopied: function () { /* no-op for now */ },
						providers: providers,
						dictionary: currentDict
					}; }
				}, ReleaseGpuButton);
			});
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
