// DSH <-> Telegram bridge core.
//
// Architecture:
//   - A Telegram getUpdates poll loop ONLY enqueues updates (never blocks on
//     processing); a separate worker drains the queue. Button callbacks and
//     new messages therefore stay responsive even while a turn is running.
//   - A mux WebSocket (server events) drives progress: assistant text is
//     forwarded to Telegram immediately, tool calls are coalesced into one
//     editable progress message that is deleted when the turn ends, and
//     approval/question requests become inline-keyboard buttons whose answers
//     are delivered back to DSH via /api/respond.
//   - State (session id, getUpdates offset, pending button mappings) is
//     persisted to a JSON file so restarts are lossless.
//
// The DSH side is reached over its client HTTP/WebSocket API on the loopback
// address, exactly like the standalone bridge it replaces.

import { readFileSync, writeFileSync, readlinkSync } from "node:fs";
import { loadavg } from "node:os";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { dshHomePath } from "@deepseek-ai/dsh-home-paths";
import { createTelegramClient } from "./telegram.js";
import { formatForTelegram, unescapeMarkdownV2 } from "./markdown.js";

/** Conventional web log location under the harness home (watchdog fallback). */
const dshHomeLogPath = dshHomePath("dsh-web.log");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MESSAGE_LIMIT = 4000;

/** Local-time log stamp: 2026-08-16 13:00:23 (server-local, no UTC Z). */
function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Format a token count with k/M suffixes (e.g. 75557632 -> 75.6M). */
function fmtTokens(n) {
  if (!Number.isFinite(n)) return "0";
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

/** Format milliseconds as a compact human duration (e.g. 5169396 -> 1h26m). */
function fmtMs(ms) {
  if (!Number.isFinite(ms) || ms < 0) return "0";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m${s % 60}s`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

/** Extract the text of a TG message's quoted original (reply_to_message). */
function quotedTextOf(msg) {
  const q = msg?.reply_to_message;
  if (!q) return "";
  const qtext = (q.text ?? q.caption ?? "").trim();
  if (qtext) return qtext;
  // Fall back to describing a media/sticker quote.
  if (q.sticker) return "[贴纸]";
  if (q.photo || q.video || q.animation || q.document) return "[媒体文件]";
  if (q.voice || q.audio) return "[语音]";
  if (q.location) return "[位置]";
  if (q.poll) return "[投票]";
  return "";
}

/**
* Resolve where this process's stdout points (e.g. a dsh-web.log file), so the
* restart watchdog can redirect the relaunched process to the same log file.
* Falls back to the conventional DSH home log when stdout is /dev/null, a pipe,
* or a tty — or when /proc is unavailable (Windows) — so a log-less relaunch
* still lands somewhere greppable.
*/
function stdoutTarget() {
  try {
    const target = readlinkSync("/proc/self/fd/1");
    if (target.startsWith("/") && target !== "/dev/null") return target;
  } catch {}
  return dshHomeLogPath;
}

export class Bridge {
  constructor(config) {
    this.config = config;
    this.chat = String(config.allowedChat);
    this.tg = createTelegramClient({
      tgApiBase: config.tgApiBase,
      botToken: config.botToken,
      timeoutMs: config.tgTimeoutMs,
    });

    // Optional host-service handles injected by the plugin entry (index.js):
    // permissionPresets lets TG switch the current session's permission preset;
    // sessionService exposes the live Session objects for those switches.
    this.permissionPresets = null;
    this.sessionService = null;

    this.state = { sessionId: null, offset: 0, lastTurnEndSeq: 0 };
    this.pendingApprovals = new Map();   // rpcId -> {approvalId, sessionId, tgMsgId}
    this.pendingQuestions = new Map();   // rpcId -> {sessionId, tgMsgId, questions}

    this.updateQueue = [];
    this.queueBusy = false;

    this.mux = null;
    this.typingTimer = null;
    this.finalText = null;
    this.sentText = false;
    this.progressMsgId = null;
    this.toolLog = [];
    this.permissionReply = undefined;
    this.effortReply = undefined;

    this.stopped = false;
    this.load();
  }

  /** Attach host services (permission presets + session store) from the plugin entry. */
  attachHost({ permissionPresets, sessionService }) {
    if (permissionPresets !== undefined) this.permissionPresets = permissionPresets;
    if (sessionService !== undefined) this.sessionService = sessionService;
  }

  log(...a) {
    console.log(ts(), "[tg-bridge]", ...a);
  }

  // ---------- state persistence ----------

  save() {
    try {
      writeFileSync(this.config.stateFile, JSON.stringify({
        ...this.state,
        pQuestions: [...this.pendingQuestions.entries()],
        pApprovals: [...this.pendingApprovals.entries()],
      }));
    } catch {}
  }

  load() {
    try {
      const j = JSON.parse(readFileSync(this.config.stateFile, "utf8"));
      const pQuestions = j.pQuestions ?? [];
      const pApprovals = j.pApprovals ?? [];
      delete j.pQuestions;
      delete j.pApprovals;
      Object.assign(this.state, j);
      for (const [k, v] of pQuestions) this.pendingQuestions.set(k, v);
      for (const [k, v] of pApprovals) this.pendingApprovals.set(k, v);
    } catch {}
  }

  // ---------- DSH client API ----------

  async dsh(method, payload) {
    const res = await fetch(`${this.config.dshBaseUrl}/api/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-request", rpcId: randomUUID(), method, payload }),
      signal: AbortSignal.timeout(this.config.dshTimeoutMs),
    });
    const j = await res.json();
    if (!j.result?.ok) throw new Error(`${method}: ${JSON.stringify(j.result?.error ?? j)}`);
    return j.result.value;
  }

  async dshRespond(rpcId, value) {
    const res = await fetch(`${this.config.dshBaseUrl}/api/respond`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "client-response", rpcId, result: { ok: true, value } }),
      signal: AbortSignal.timeout(this.config.dshTimeoutMs),
    });
    const j = await res.json();
    if (!j.accepted) throw new Error(`respond ${rpcId}: ${j.reason}`);
    return j;
  }

  async ensureSession() {
    if (this.state.sessionId) return this.state.sessionId;
    const created = await this.dsh("session.create", { title: "Telegram Bot" });
    this.state.sessionId = created.sessionId;
    this.save();
    this.log("created session", this.state.sessionId);
    return this.state.sessionId;
  }

  // ---------- sending ----------

  // Chunk on line boundaries so ``` blocks are never split mid-way.
  splitText(s, n = MESSAGE_LIMIT) {
    if (s.length <= n) return [s];
    const out = [];
    let cur = "";
    for (const line of s.split("\n")) {
      if (cur && cur.length + line.length + 1 > n) { out.push(cur); cur = line; }
      else cur = cur ? cur + "\n" + line : line;
      while (cur.length > n) { out.push(cur.slice(0, n)); cur = cur.slice(n); }
    }
    if (cur) out.push(cur);
    return out;
  }

  async send(chat, text) {
    const chunks = this.splitText(formatForTelegram(text));
    for (const c of chunks) {
      try {
        const r = await this.tg.call("sendMessage", {
          chat_id: chat, text: c, parse_mode: "MarkdownV2", disable_web_page_preview: true,
        });
        this.log("sent md msg_id", r.message_id);
      } catch (e) {
        this.log("markdown rejected, plain fallback:", e.message);
        const r = await this.tg.call("sendMessage", {
          chat_id: chat, text: c.replace(unescapeMarkdownV2, "$1"), disable_web_page_preview: true,
        });
        this.log("sent plain msg_id", r.message_id);
      }
    }
  }

  // ---------- typing indicator ----------

  startTyping() {
    this.stopTyping();
    this.typingTimer = setInterval(async () => {
      try { await this.tg.call("sendChatAction", { chat_id: this.chat, action: "typing" }); } catch {}
    }, 4000);
  }

  stopTyping() {
    if (this.typingTimer) { clearInterval(this.typingTimer); this.typingTimer = null; }
  }

  // ---------- mux WebSocket ----------

  connectMux() {
    if (this.stopped) return;
    const ws = new WebSocket(this.config.muxUrl);
    this.mux = ws;
    ws.onopen = () => this.log("mux connected");
    ws.onmessage = (ev) => {
      try { this.handleMuxFrame(JSON.parse(ev.data)); } catch (e) { this.log("mux frame err:", e.message); }
    };
    ws.onclose = () => {
      this.log("mux closed, reconnecting in 3s");
      if (!this.stopped) setTimeout(() => this.connectMux(), 3000);
    };
    ws.onerror = () => {};
  }

  async handleMuxFrame(full) {
    if (!full || full.type !== "server-request") return;
    const p = full.payload ?? {};
    if (p.sessionId && p.sessionId !== this.state.sessionId) return;  // only our Telegram session
    try {
      switch (p.type) {
        case "approval/requested": {
          this.log("approval requested:", p.approvalId, "|", (p.reason ?? "").slice(0, 60));
          const msg = await this.tg.call("sendMessage", {
            chat_id: this.chat,
            text: `🔐 需要授权\n🛠 工具: ${p.toolName}\n📋 原因: ${p.reason ?? "无说明"}\n\n请选择：`,
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: "✅ 允许一次", callback_data: "allow" },
              { text: "❌ 拒绝", callback_data: "reject" },
            ]] }),
          });
          this.pendingApprovals.set(full.rpcId, { approvalId: p.approvalId, sessionId: p.sessionId, tgMsgId: msg.message_id });
          this.save();
          break;
        }
        case "question/requested": {
          const q = p.questions?.[0];
          if (!q) break;
          this.log("question requested:", q.question.slice(0, 60));
          const opts = (q.options ?? []).map((o, i) => ({ text: o.label, callback_data: `q:${i}` }));
          const msg = await this.tg.call("sendMessage", {
            chat_id: this.chat,
            text: `❓ ${q.question}`,
            reply_markup: JSON.stringify({ inline_keyboard: opts.length ? [opts] : [] }),
          });
          this.pendingQuestions.set(full.rpcId, { sessionId: p.sessionId, tgMsgId: msg.message_id, questions: p.questions });
          this.save();
          break;
        }
        case "session/event": {
          const ev = p.event ?? {};
          switch (ev.type) {
            case "turn/start":
              this.finalText = null; this.sentText = false;
              this.toolLog.length = 0; this.progressMsgId = null;
              this.startTyping();
              break;
            case "turn/end":
              this.stopTyping();
              this.state.lastTurnEndSeq = ev.seq ?? this.state.lastTurnEndSeq;
              this.save();
              try {
                if (!this.sentText) { this.log("no text via mux, fallback reply"); await this.fallbackReply(); }
              } finally {
                if (this.progressMsgId) {
                  try { await this.tg.call("deleteMessage", { chat_id: this.chat, message_id: this.progressMsgId }); } catch {}
                  this.progressMsgId = null;
                }
              }
              break;
            case "tool/call": {
              const name = ev.data?.name ?? "?";
              const a = ev.data?.arguments;
              let args = "";
              try { args = typeof a === "string" ? a : JSON.stringify(a ?? {}); } catch { args = String(a ?? ""); }
              args = args.replace(/\s+/g, " ").slice(0, 60);
              this.toolLog.push(`${name} ${args}`);
              if (this.toolLog.length > 3) this.toolLog.shift();
              const line = "🛠 " + this.toolLog.join("\n");
              try {
                if (this.progressMsgId) await this.tg.call("editMessageText", { chat_id: this.chat, message_id: this.progressMsgId, text: line });
                else { const m = await this.tg.call("sendMessage", { chat_id: this.chat, text: line }); this.progressMsgId = m.message_id; }
              } catch {}
              break;
            }
            case "assistant/message": {
              const c = ev.data?.message?.content ?? [];
              const txt = c.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
              if (txt) {
                this.finalText = txt;
                this.sentText = true;
                this.log("sending text via mux, len", txt.length);
                await this.send(this.chat, txt);
              }
              break;
            }
          }
          break;
        }
      }
    } catch (e) { this.log("mux handler err:", e.message); }
  }

  async fallbackReply() {
    try {
      const sid = this.state.sessionId;
      if (!sid) return;
      const { events } = await this.dsh("session.history", { sessionId: sid });
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i].event ?? events[i];
        if (ev.type === "assistant/message") {
          const c = ev.data?.message?.content ?? [];
          const hasTool = c.some((b) => b.type === "tool-call");
          const txt = c.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
          if (txt && !hasTool) { await this.send(this.chat, txt); return; }
        }
        if (ev.type === "turn/start") return;
      }
    } catch (e) { this.log("fallback reply err:", e.message); }
  }

  // ---------- session management (TG commands) ----------

  async listSessions() {
    const { items } = await this.dsh("session.list", {});
    return items ?? [];
  }

  /** Resolve a session's display label: "title (session-xxx)" or the bare id. */
  async sessionLabel(sid) {
    let title = "";
    try {
      const { items } = await this.dsh("session.list", {});
      const found = items?.find((s) => s.sessionId === sid);
      title = found?.projections?.values?.title ?? "";
    } catch {}
    return title && title !== "" ? `${title} (${sid})` : sid;
  }

  async handleSessionsCommand() {
    const items = await this.listSessions();
    if (items.length === 0) {
      await this.send(this.chat, "暂无会话。直接发消息会自动创建，或用 /use new 新建。");
      return;
    }
    // session.list already carries the title projection; no extra history
    // calls needed. Fall back to a short id when a session has no title.
    const current = this.state.sessionId;
    const lines = items.map((s, i) => {
      const mark = s.sessionId === current ? "✅" : `${i + 1}`;
      const run = s.running ? " 🔄" : "";
      const blank = s.blank ? " (空)" : "";
      const title = s.projections?.values?.title;
      const label = title && title !== "" ? title : s.sessionId.slice(0, 20);
      return `${mark}. ${label}${run}${blank}\n   ${s.sessionId}`;
    });
    await this.send(this.chat, `📋 会话列表（共 ${items.length} 个）:\n\n${lines.join("\n")}\n\n用 /use <编号或ID> 切换，/use new 新建。`);
  }

  async handleUseCommand(arg) {
    const target = String(arg ?? "").trim();
    if (target === "" || target === "new") {
      this.state.sessionId = null;
      this.save();
      const sid = await this.ensureSession();
      await this.send(this.chat, `🆕 已新建并切换到会话 ${sid}`);
      return;
    }
    const items = await this.listSessions();
    let found = null;
    if (/^\d+$/.test(target)) {
      const idx = parseInt(target, 10) - 1;
      found = items[idx] ?? null;
    } else {
      found = items.find((s) => s.sessionId === target) ?? null;
    }
    if (!found) {
      await this.send(this.chat, `❌ 找不到会话 ${target}。用 /sessions 查看列表。`);
      return;
    }
    this.state.sessionId = found.sessionId;
    this.state.lastTurnEndSeq = 0;
    this.save();
    const label = await this.sessionLabel(found.sessionId);
    await this.send(this.chat, `🔀 已切换到会话 ${label}`);
  }

  // ---------- permission management (TG commands) ----------

  async handlePermissionCommand(arg) {
    if (!this.permissionPresets) {
      await this.send(this.chat, "❌ 权限服务不可用（host 未注入 permissionPresets）。");
      return;
    }
    const names = this.permissionPresets.names;
    const raw = String(arg ?? "").trim();

    // `/permission default <name>` — switch the deployment default preset.
    if (raw.startsWith("default")) {
      const name = raw.slice("default".length).trim();
      if (!name) {
        await this.send(this.chat, `当前默认预设: ${this.permissionPresets.defaultPreset ?? "?"}\n可用: ${names.join(", ")}\n用法: /permission default <name>`);
        return;
      }
      if (!names.includes(name)) {
        await this.send(this.chat, `❌ 未知预设 ${name}（可用: ${names.join(", ")}）`);
        return;
      }
      await this.dsh("settings.update", { ns: "permission", patch: { defaultPreset: name } });
      await this.send(this.chat, `✅ 默认预设已设为 ${name}（影响新会话）`);
      return;
    }

    const sid = this.state.sessionId ?? (await this.ensureSession());
    const session = this.sessionService?.get(sid);
    if (!session) {
      await this.send(this.chat, `❌ 找不到当前会话 ${sid} 的 Session 对象，无法切换权限。`);
      return;
    }
    if (!raw) {
      const current = this.permissionPresets.current(session.events);
      const keyboard = names.map((name) => [{
        text: (name === current ? "✅ " : "") + name,
        callback_data: `perm:${name}`,
      }]);
      // Show the session title from the projection (no extra history call).
      let label = sid;
      try {
        const { items } = await this.dsh("session.list", {});
        const found = items?.find((s) => s.sessionId === sid);
        const title = found?.projections?.values?.title;
        if (title && title !== "") label = title;
      } catch {}
      await this.tg.call("sendMessage", {
        chat_id: this.chat,
        text: `🔐 当前预设: ${current}\n会话: ${label}\n\n点按钮切换权限：`,
        reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
      });
      return;
    }
    if (!names.includes(raw)) {
      await this.send(this.chat, `❌ 未知预设 ${raw}（可用: ${names.join(", ")}）`);
      return;
    }
    this.permissionPresets.set(session, raw);
    await this.send(this.chat, `✅ 已切换到预设 ${raw}`);
  }

  // ---------- model management (TG commands) ----------

  /** Flat numbered model list across every provider group, with the current selection. */
  async handleModelsCommand() {
    const sid = this.state.sessionId ?? (await this.ensureSession());
    const [catalog, sessionInfo] = await Promise.all([
      this.dsh("llm.models", {}),
      this.dsh("session.models", { sessionId: sid }).catch(() => null),
    ]);
    const groups = catalog?.groups ?? [];
    const current = sessionInfo?.current;
    let n = 0;
    const lines = ["📚 模型列表（发 /model <编号> 切换当前会话）:"];
    for (const g of groups) {
      lines.push(`\n▎${g.name ?? g.id}`);
      for (const m of g.models ?? []) {
        n++;
        const isCur = current && current.provider === g.id && current.model === m.id;
        lines.push(`${isCur ? "✅" : n}. ${m.name ?? m.id}${isCur ? "（当前）" : ""}`);
      }
    }
    const curText = current ? `${current.provider}/${current.model}` : "未知";
    const effText = current?.reasoningEffort ? `\n推理强度: ${current.reasoningEffort}（/effort 修改）` : "";
    lines.push(`\n当前: ${curText}${effText}`);
    await this.send(this.chat, lines.join("\n"));
  }

  /** Switch the current session's model by flat catalog number. */
  async handleModelCommand(arg) {
    const target = String(arg ?? "").trim();
    if (!/^\d+$/.test(target)) {
      await this.send(this.chat, "用法: /model <编号>（编号见 /models）");
      return;
    }
    const idx = parseInt(target, 10) - 1;
    const catalog = await this.dsh("llm.models", {});
    const groups = catalog?.groups ?? [];
    let n = 0;
    let hit = null;
    outer:
    for (const g of groups) {
      for (const m of g.models ?? []) {
        if (n === idx) { hit = { provider: g.id, model: m.id, name: m.name ?? m.id }; break outer; }
        n++;
      }
    }
    if (!hit) {
      await this.send(this.chat, `❌ 没有编号 ${target}。用 /models 查看。`);
      return;
    }
    const sid = this.state.sessionId ?? (await this.ensureSession());
    try {
      const current = (await this.dsh("session.models", { sessionId: sid }).catch(() => null))?.current;
      // Keep the current reasoning effort when switching models.
      const payload = { sessionId: sid, provider: hit.provider, model: hit.model };
      if (current?.reasoningEffort) payload.reasoningEffort = current.reasoningEffort;
      const res = await this.dsh("session.selectModel", payload);
      const eff = res?.selected?.reasoningEffort;
      await this.send(this.chat, `✅ 已切换到模型 ${hit.name}（${hit.provider}）${eff ? `，推理强度 ${eff}` : ""}`);
    } catch (e) {
      await this.send(this.chat, `❌ 切换失败: ${e.message}`);
    }
  }

  /** Show the current reasoning effort as buttons. */
  async handleEffortCommand() {
    const sid = this.state.sessionId ?? (await this.ensureSession());
    const sessionInfo = await this.dsh("session.models", { sessionId: sid }).catch(() => null);
    const current = sessionInfo?.current;
    if (!current) {
      await this.send(this.chat, "❌ 无法读取当前模型信息。");
      return;
    }
    // Find the model's supported efforts from the catalog.
    const catalog = await this.dsh("llm.models", {});
    const group = (catalog?.groups ?? []).find((g) => g.id === current.provider);
    const model = (group?.models ?? []).find((m) => m.id === current.model);
    const efforts = (model?.reasoning?.efforts ?? []).map((e) => e.id);

    const effText = current.reasoningEffort ?? "未设置";
    if (!efforts.length) {
      await this.send(this.chat, `🧠 当前模型: ${current.provider}/${current.model}\n推理强度: ${effText}\n\n该模型不支持推理强度调节。`);
      return;
    }
    const keyboard = efforts.map((name) => [{
      text: (name === effText ? "✅ " : "") + name,
      callback_data: `eff:${name}`,
    }]);
    await this.tg.call("sendMessage", {
      chat_id: this.chat,
      text: `🧠 当前模型: ${current.provider}/${current.model}\n当前推理强度: ${effText}\n\n点按钮修改：`,
      reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
    });
  }

  // ---------- restart (TG command) ----------

  /** Build the /status text (shared by the command and the auto notify after restart). */
  async buildStatusText() {
    const sid = this.state.sessionId ?? "未创建";
    const label = sid === "未创建" ? sid : await this.sessionLabel(sid);
    let lines = [`在线 ✅\n会话: ${label}\n负载: ${Math.round(loadavg()[0] * 100) / 100}`];
    if (sid !== "未创建") {
      try {
        const { items } = await this.dsh("session.list", {});
        const found = items?.find((s) => s.sessionId === sid);
        const v = found?.projections?.values;
        if (v) {
          const tu = v.tokenUsage;
          if (tu) {
            lines.push("");
            lines.push(`📊 Token`);
            lines.push(`输入: ${fmtTokens(tu.uncachedInputTokens)}`);
            lines.push(`输出: ${fmtTokens(tu.outputTokens)}`);
            lines.push(`缓存读: ${fmtTokens(tu.cacheReadTokens)}`);
            if (tu.cacheWriteTokens) lines.push(`缓存写: ${fmtTokens(tu.cacheWriteTokens)}`);
          }
          const cp = v.contextPressure;
          if (cp) {
            lines.push("");
            lines.push(`🧠 上下文 ${Math.round((cp.pressureTokens / cp.contextWindow) * 100)}% (${fmtTokens(cp.pressureTokens)} / ${fmtTokens(cp.contextWindow)})`);
            const cb = v.contextBreakdown;
            if (cb) lines.push(`  系统 ${fmtTokens(cb.systemTokens)} · 工具 ${fmtTokens(cb.toolsTokens)} · 消息 ${fmtTokens(cb.messageTokens)}`);
          }
          const ss = v.sessionStats;
          if (ss) {
            lines.push("");
            lines.push(`⏱ 回合 ${ss.turns} · 步 ${ss.steps}`);
            lines.push(`LLM ${fmtMs(ss.llmMs)} · 工具 ${fmtMs(ss.toolMs)} · 解码 ${fmtTokens(ss.decodeTokens)} tok`);
          }
          const perms = v.permissions;
          if (perms?.currentValue) lines.push(`\n🔐 权限: ${perms.currentValue}`);
        }
      } catch {}
    }
    return lines.join("\n");
  }

  /**
  * Restart dsh web without any external script: spawn a detached Node watchdog
  * that waits for this process to exit, then relaunches dsh from the exact
  * argv this process was started with. Zero config and cross-platform (no
  * bash dependency), shareable out of the box.
  *
  * Re-entrancy guard: the restartPending marker doubles as a lock. It is set
  * before the watchdog spawns and cleared by the fresh process after boot, so
  * a second /restart while a restart is in flight is refused — this prevents
  * two watchdog/script invocations from racing and producing an EADDRINUSE
  * double-boot window.
  */
  async handleRestartCommand() {
    if (this.state.restartPending) {
      this.log("restart refused: restart already in progress (marker set)");
      await this.send(this.chat, "⚠️ 重启已在进行中，请稍候（若长时间未恢复再试）。");
      return;
    }
    // Persist a marker so the fresh process announces itself after boot.
    this.state.restartPending = true;
    this.save();
    try {
      const argv = process.argv;
      const logTarget = stdoutTarget();
      // Watchdog body (plain Node, cross-platform): poll our pid, then relaunch
      // with the same argv, redirecting stdout/stderr to our log target.
      const body = `
        const { spawn } = require("node:child_process");
        const logTarget = ${JSON.stringify(logTarget)};
        const pid = ${process.pid};
        const argv = ${JSON.stringify(argv)};
        const wait = () => {
          try { process.kill(pid, 0); } catch { relaunch(); return; }
          setTimeout(wait, 200);
        };
        const relaunch = () => {
          const out = logTarget ? require("node:fs").openSync(logTarget, "a") : 1;
          const child = spawn(argv[0], argv.slice(1), {
            detached: true,
            stdio: out ? ["ignore", out, out] : "ignore",
            cwd: process.cwd(),
          });
          child.unref();
        };
        wait();
      `;
      const child = spawn(process.execPath, ["-e", body], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
      this.log("watchdog spawned, will relaunch:", argv.join(" "));
      // Acknowledge only after the watchdog is actually up, so a failed spawn
      // never leaves a stale marker.
      try { await this.send(this.chat, "🔄 正在重启 DSH web…（约 10 秒后自动汇报状态）"); } catch {}
      // Exit this process so the watchdog's poll loop ends and it relaunches.
      // Give the ack a moment to flush first.
      setTimeout(() => {
        try { process.exit(0); } catch {}
      }, 500);
    } catch (e) {
      this.log("restart spawn failed:", e.message);
      this.state.restartPending = false;
      this.save();
      await this.send(this.chat, `❌ 重启失败: ${e.message}`);
    }
  }

  // ---------- incoming message flow ----------

  async handleMessage(text, quoted) {
    const sid = await this.ensureSession();
    await this.send(this.chat, "🤖 收到，agent 开始干活…");
    const waitSeq = this.state.lastTurnEndSeq;
    // Embed the quoted original (TG reply) so the agent sees the context.
    const promptText = quoted ? `[引用回复]\n${quoted}\n\n[新消息]\n${text}` : text;
    await this.dsh("session.prompt", { sessionId: sid, mode: "queue", content: [{ type: "text", text: promptText }] });
    // Non-blocking timeout safety: replies arrive via mux turn/end; if the
    // turn never ends, notify once. Never blocks the poll loop.
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.lastTurnEndSeq <= waitSeq) {
        this.log("turn timeout, notifying");
        this.send(this.chat, "⏰ 10 分钟超时，agent 可能还在跑，稍后查网页端。").catch(() => {});
      }
    }, this.config.turnTimeoutMs);
  }

  // ---------- button callbacks ----------

  async handleCallback(cq) {
    const data = cq.data ?? "";
    const tgMsgId = cq.message?.message_id;
    this.log("callback received:", JSON.stringify({
      id: cq.id, data, tgMsgId,
      pendingQuestions: [...this.pendingQuestions.values()].map((x) => x.tgMsgId),
      pendingApprovals: [...this.pendingApprovals.values()].map((x) => x.tgMsgId),
    }));
    let responded = false;
    if (data === "allow" || data === "reject") {
      for (const [rpcId, app] of this.pendingApprovals) {
        if (app.tgMsgId === tgMsgId) {
          const outcome = data === "allow" ? "allowed-once" : "rejected";
          try {
            await this.dshRespond(rpcId, { sessionId: app.sessionId, approvalId: app.approvalId, outcome });
            this.log("approval answered:", outcome);
          } catch (e) { this.log("approval respond err:", e.message); }
          this.pendingApprovals.delete(rpcId);
          this.save();
          responded = true;
          break;
        }
      }
    } else if (data.startsWith("q:")) {
      const idx = parseInt(data.slice(2), 10);
      for (const [rpcId, pq] of this.pendingQuestions) {
        if (pq.tgMsgId === tgMsgId) {
          const q = pq.questions[0];
          const opt = q.options?.[idx];
          try {
            await this.dshRespond(rpcId, {
              sessionId: pq.sessionId,
              answer: { answers: [{ id: q.id, selected: opt ? [opt.label] : [] }] },
            });
            this.log("question answered:", opt?.label);
          } catch (e) { this.log("question respond err:", e.message); }
          this.pendingQuestions.delete(rpcId);
          this.save();
          responded = true;
          break;
        }
      }
    } else if (data.startsWith("eff:")) {
      const name = data.slice(4);
      const sid = this.state.sessionId ?? (await this.ensureSession());
      try {
        const info = await this.dsh("session.models", { sessionId: sid });
        const current = info?.current;
        if (!current) {
          this.log("effort switch failed: no current model");
        } else {
          const res = await this.dsh("session.selectModel", {
            sessionId: sid, provider: current.provider, model: current.model, reasoningEffort: name,
          });
          this.log("effort switched to:", name);
          this.effortReply = res?.selected?.reasoningEffort ?? name;
          responded = true;
        }
      } catch (e) {
        this.log("effort switch err:", e.message);
        this.effortReply = `❌ ${e.message}`;
        responded = true;
      }
    } else if (data.startsWith("perm:")) {
      const name = data.slice(5);
      const names = this.permissionPresets?.names ?? [];
      if (!this.permissionPresets || !names.includes(name)) {
        this.log("permission switch failed: unknown preset", name);
      } else {
        const sid = this.state.sessionId ?? (await this.ensureSession());
        const session = this.sessionService?.get(sid);
        if (!session) {
          this.log("permission switch failed: no session object for", sid);
        } else {
          try {
            this.permissionPresets.set(session, name);
            this.log("permission switched to:", name);
          } catch (e) { this.log("permission switch err:", e.message); }
          responded = true;
          this.permissionReply = name;
        }
      }
    }
    try { await this.tg.call("answerCallbackQuery", { callback_query_id: cq.id }); } catch {}
    if (responded) {
      try {
        if (this.permissionReply !== undefined) {
          await this.tg.call("editMessageText", {
            chat_id: this.chat, message_id: tgMsgId,
            text: `✅ 已切换到权限 ${this.permissionReply}`,
          });
          this.permissionReply = undefined;
        } else if (this.effortReply !== undefined) {
          await this.tg.call("editMessageText", {
            chat_id: this.chat, message_id: tgMsgId,
            text: `✅ 推理强度已设为 ${this.effortReply}`,
          });
          this.effortReply = undefined;
        } else {
          await this.tg.call("editMessageText", { chat_id: this.chat, message_id: tgMsgId, text: "✅ 已提交" });
        }
      } catch {}
    }
  }

  // ---------- update queue: polling never blocks on processing ----------

  enqueueUpdate(u) {
    this.updateQueue.push(u);
    this.drainQueue();
  }

  async drainQueue() {
    if (this.queueBusy) return;
    this.queueBusy = true;
    try {
      while (this.updateQueue.length) {
        const u = this.updateQueue.shift();
        try { await this.processUpdate(u); } catch (e) { this.log("update err:", e.message); }
      }
    } finally { this.queueBusy = false; }
  }

  async processUpdate(u) {
    this.state.offset = u.update_id + 1;
    this.save();
    if (u.callback_query) { await this.handleCallback(u.callback_query); return; }
    const msg = u.message;
    if (!msg || String(msg.chat.id) !== this.chat) return;
    const text = (msg.text ?? msg.caption ?? "").trim();
    // Extract the quoted original message (TG reply) so it reaches the agent.
    const quoted = quotedTextOf(msg);
    if (text === "/start") { await this.send(this.chat, "DSH 桥接在线 ✅ 直接发消息即可。"); return; }
    if (text === "/status") {
      await this.send(this.chat, await this.buildStatusText());
      return;
    }
    if (text === "/help") {
      await this.send(this.chat, [
        "📖 可用命令:",
        "/sessions — 列出所有会话",
        "/use <编号|ID|new> — 切换/新建会话",
        "/models — 列出模型",
        "/model <编号> — 切换当前会话模型",
        "/effort — 点按钮修改推理强度",
        "/permission — 查看权限并点按钮切换",
        "/permission default <name> — 改默认权限",
        "/status — 在线状态、token、上下文",
        "/restart — 重启 DSH web",
        "其他文本 — 发给 agent",
      ].join("\n"));
      return;
    }
    if (text.startsWith("/sessions")) { try { await this.handleSessionsCommand(); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (text.startsWith("/use")) { try { await this.handleUseCommand(text.slice(4)); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (text.startsWith("/models")) { try { await this.handleModelsCommand(); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (text.startsWith("/model")) { try { await this.handleModelCommand(text.slice(6)); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (text.startsWith("/effort")) { try { await this.handleEffortCommand(); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (text.startsWith("/restart")) { try { await this.handleRestartCommand(); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (text.startsWith("/permission")) { try { await this.handlePermissionCommand(text.slice(11)); } catch (e) { await this.send(this.chat, "❌ " + e.message); } return; }
    if (!text) return;
    try { await this.handleMessage(text, quoted); }
    catch (e) {
      this.log("handle err:", e.message);
      try { await this.send(this.chat, "❌ 出错了：" + e.message); } catch {}
    }
  }

  // ---------- lifecycle ----------

  start() {
    this.log("bridge plugin started");
    // The loader re-applies this plugin once right after boot (stop + start),
    // so a Bridge instance that starts here may be disposed within ~1s. Delay
    // polling and the mux until the instance has stabilised: a dying instance
    // must not claim Telegram updates or a mux connection, or its async
    // processUpdate would still run and duplicate replies (e.g. two identical
    // "restart refused" messages from two instances of the same update).
    setTimeout(() => {
      if (this.stopped) return;
      this.pollLoop();
    }, 1500);
    setTimeout(() => {
      if (this.stopped) return;
      this.connectMux();
    }, 1500);
    this.registerCommands();
    // If this boot was triggered by /restart, announce readiness automatically.
    // The marker is consumed lazily (not here): the loader may re-apply this
    // plugin right after boot (stop + start), which would consume the marker in
    // a dying instance. Wait until the instance has stabilised, then check.
    setTimeout(() => {
      if (this.stopped) return;
      if (this.state.restartPending) {
        this.log("restart marker found, sending auto status");
        delete this.state.restartPending;
        this.save();
        this.buildStatusText()
          .then((text) => this.send(this.chat, `🔄 重启完成\n\n${text}`))
          .catch((e) => this.log("auto status failed:", e?.message ?? e));
      }
    }, 8000);
  }

  /** Advertise the bot's command menu to Telegram (the / button next to input). */
  async registerCommands() {
    try {
      await this.tg.call("setMyCommands", {
        commands: JSON.stringify([
          { command: "start", description: "检查在线状态" },
          { command: "sessions", description: "列出所有会话" },
          { command: "use", description: "切换/新建会话" },
          { command: "models", description: "列出模型" },
          { command: "model", description: "切换模型" },
          { command: "effort", description: "点按钮修改推理强度" },
          { command: "permission", description: "查看/切换权限预设" },
          { command: "restart", description: "重启 DSH web" },
          { command: "status", description: "在线状态/token/上下文" },
          { command: "help", description: "命令列表" },
        ]),
      });
      this.log("command menu registered");
    } catch (e) {
      this.log("setMyCommands failed:", e.message);
    }
  }

  async pollLoop() {
    while (!this.stopped) {
      try {
        const updates = await this.tg.call("getUpdates", {
          offset: this.state.offset,
          timeout: this.config.pollTimeoutSeconds,
          allowed_updates: JSON.stringify(["message", "edited_message", "callback_query"]),
        });
        this.log("poll ok, updates:", updates.length);
        for (const u of updates) this.enqueueUpdate(u);
      } catch (e) {
        this.log("poll err:", e.message);
        await sleep(3000);
      }
    }
  }

  stop() {
    if (this.stopped) return;
    this.stopped = true;
    this.stopTyping();
    try { this.mux?.close(); } catch {}
    this.log("bridge plugin stopped");
  }
}
