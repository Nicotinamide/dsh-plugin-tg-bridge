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
/** Settings namespace shared with the GUI card (must match lib/index.js). */
const SETTINGS_NS = "tg-bridge";

/** Local-time log stamp: 2026-08-16 13:00:23 (server-local, no UTC Z). */
function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Load average, or "—" on platforms without it (Windows returns [0,0,0]). */
function loadLabel() {
  try {
    if (process.platform === "win32") return "—";
    const v = loadavg()[0];
    return Math.round(v * 100) / 100;
  } catch {
    return "—";
  }
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
  // /proc is Linux-only; Windows/macOS fall straight to the DSH home log.
  if (process.platform !== "linux") return dshHomeLogPath;
  try {
    const target = readlinkSync("/proc/self/fd/1");
    if (target.startsWith("/") && target !== "/dev/null") return target;
  } catch {}
  return dshHomeLogPath;
}

export class Bridge {
  constructor(config) {
    this.config = config;
    // Multi-user: one bot serves many chats. Each allowed chat maps to its own
    // sessions. Legacy single-chat config (allowedChat) is one user.
    this.chats = new Set([...(config.allowedUsers ?? []).map((u) => String(u.chatId))]);
    if (config.allowedChat && config.allowedChat !== "") this.chats.add(String(config.allowedChat));
    this.adminChats = new Set((config.adminChatIds ?? []).map((c) => String(c)));
    this.chatToLabel = new Map((config.allowedUsers ?? []).map((u) => [String(u.chatId), u.label ?? String(u.chatId)]));
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

    // Per-chat session ownership: chatId -> { sessions: [id...], current: id }.
    // sessionId (legacy single-chat) migrates into perUserSessions at load().
    this.state = {
      offset: 0,
      sessionId: null,             // legacy field, kept for migration
      lastTurnEndSeq: 0,
      perUserSessions: {},         // chatId -> { sessions, current }
    };
    this.pendingApprovals = new Map();   // rpcId -> {approvalId, sessionId, tgMsgId, chatId, askerId}
    this.pendingQuestions = new Map();   // rpcId -> {sessionId, tgMsgId, questions, chatId, askerId}

    this.updateQueue = [];
    this.queueBusy = false;

    this.mux = null;
    this.pollAbort = new AbortController();  // aborted on stop() to end a long-poll instantly
    // Per-chat runtime state (typing, progress message, tool log, turn text).
    this.chatState = new Map();  // chatId -> { typingTimer, finalText, sentText, progressMsgId, toolLog, lastTurnEndSeq, askerId }
    // Sessions whose current turn was initiated FROM Telegram: only these turns
    // are forwarded back to TG. Turns started from the web UI on the same
    // session stay silent here.
    this.pendingReplies = new Set();  // sessionId
    this.permissionReply = undefined;
    this.effortReply = undefined;

    this.stopped = false;
    this.load();
    // Migrate a legacy single sessionId into a per-chat entry (the owner chat).
    if (this.state.sessionId) {
      const legacyChat = [...this.chats][0];
      if (legacyChat && !this.state.perUserSessions[legacyChat]) {
        this.state.perUserSessions[legacyChat] = { sessions: [this.state.sessionId], current: this.state.sessionId };
        this.save();
        this.log("migrated legacy session", this.state.sessionId, "to chat", legacyChat);
      }
    }
  }

  /** Attach host services (permission presets + session store) from the plugin entry. */
  attachHost({ permissionPresets, sessionService, settingsService } = {}) {
    if (permissionPresets !== undefined) this.permissionPresets = permissionPresets;
    if (sessionService !== undefined) this.sessionService = sessionService;
    // settingsService persists access config (allowedUsers/adminChatIds) to the
    // same settings namespace the GUI edits — one source of truth. `!= null`
    // so a not-yet-resolved service (null) never overwrites an attached one.
    if (settingsService != null) this.settingsService = settingsService;
  }

  /**
  * Apply access-related config to a running bridge in place: authorized chats,
  * admin chats, labels, and the askerRequired switch. No rebuild, so there is
  * no getUpdates 409 window and no loss of in-flight turn state. Called by the
  * entry when a settings change touches only these fields, and by the TG admin
  * commands right after they persist to settings. Missing fields fall back to
  * the current config, so partial updates (e.g. only allowedUsers from a TG
  * command) can never wipe the admin list.
  */
  applyAccessConfig(cfg) {
    this.config = { ...this.config, ...cfg };
    const allowedUsers = cfg.allowedUsers ?? this.config.allowedUsers ?? [];
    const allowedChat = cfg.allowedChat ?? this.config.allowedChat ?? "";
    const adminChatIds = cfg.adminChatIds ?? this.config.adminChatIds ?? [];
    const chats = new Set(allowedUsers.map((u) => String(u.chatId)));
    if (allowedChat && allowedChat !== "") chats.add(String(allowedChat));
    this.chats = chats;
    this.adminChats = new Set(adminChatIds.map((c) => String(c)));
    this.chatToLabel = new Map(allowedUsers.map((u) => [String(u.chatId), u.label ?? String(u.chatId)]));
    this.log("access config applied: chats=", [...chats], "admins=", [...this.adminChats]);
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

  /** Whether a chat is allowed to talk to this bot. */
  isAllowed(chat) {
    return this.chats.has(String(chat));
  }

  /** Whether a chat is an administrator (sees/uses every user's sessions). */
  isAdmin(chat) {
    return this.adminChats.has(String(chat));
  }

  /**
  * Whether a message in this chat should be acted on. Private chats: always.
  * Groups/supergroups (negative chat id): only when the bot is mentioned
  * (@bot) or the message replies to the bot's own message — never the bot's
  * own echoes.
  */
  shouldHandleMessage(msg) {
    if (!msg) return false;
    if (msg.from?.is_bot) return false;                    // ignore bot echoes
    const chatType = msg.chat?.type;
    const isGroup = chatType === "group" || chatType === "supergroup" || String(msg.chat?.id).startsWith("-");
    if (!isGroup) return true;                             // private chat
    // Group: require an explicit mention of this bot, or a reply to it.
    const myId = this.tg?.myId;
    if (msg.reply_to_message?.from?.is_bot) return true;   // replying to the bot
    const entities = msg.entities ?? [];
    for (const e of entities) {
      if (e.type === "mention" && e.offset === 0) return true;   // starts with @bot
      if (e.type === "bot_command" && e.offset === 0) return true;
    }
    // A plain @username anywhere in the text also counts.
    if (myId && msg.text?.includes(`@${myId}`)) return true;
    return false;
  }

  /** Get (or create) the per-chat session bookkeeping entry. */
  chatEntry(chat) {
    const key = String(chat);
    if (!this.state.perUserSessions[key]) this.state.perUserSessions[key] = { sessions: [], current: null };
    return this.state.perUserSessions[key];
  }

  /** Resolve the session id a chat should use (its own current, or fresh). */
  async ensureSession(chat) {
    const entry = this.chatEntry(chat);
    if (entry.current) return entry.current;
    const display = (await this.chatDisplayName(String(chat))) ?? this.chatToLabel.get(String(chat)) ?? chat;
    const created = await this.dsh("session.create", { title: `TG ${display}` });
    entry.current = created.sessionId;
    if (!entry.sessions.includes(created.sessionId)) entry.sessions.push(created.sessionId);
    this.runtime(chat).lastTurnEndSeq = 0;
    this.save();
    this.log("created session", created.sessionId, "for chat", chat);
    return created.sessionId;
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

  /** Per-chat runtime state bag. */
  runtime(chat) {
    const key = String(chat);
    let r = this.chatState.get(key);
    if (!r) {
      r = { typingTimer: null, finalText: null, sentText: false, progressMsgId: null, toolLog: [], lastTurnEndSeq: 0 };
      this.chatState.set(key, r);
    }
    return r;
  }

  startTyping(chat) {
    const r = this.runtime(chat);
    this.stopTyping(chat);
    r.typingTimer = setInterval(async () => {
      try { await this.tg.call("sendChatAction", { chat_id: chat, action: "typing" }); } catch {}
    }, 4000);
  }

  stopTyping(chat) {
    const r = this.runtime(chat);
    if (r.typingTimer) { clearInterval(r.typingTimer); r.typingTimer = null; }
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

  /** Resolve which chat owns a session id (reverse of perUserSessions). */
  chatForSession(sid) {
    if (!sid) return null;
    for (const [chat, entry] of Object.entries(this.state.perUserSessions ?? {})) {
      if (entry.sessions?.includes(sid) || entry.current === sid) return chat;
    }
    return null;
  }

  async handleMuxFrame(full) {
    if (!full || full.type !== "server-request") return;
    const p = full.payload ?? {};
    const sid = p.sessionId;
    if (sid && this.chatForSession(sid) === null) return;  // not one of our chats' sessions
    const chat = sid ? this.chatForSession(sid) : [...this.chats][0];
    if (!chat) return;
    const r = this.runtime(chat);
    try {
      switch (p.type) {
        case "approval/requested": {
          // Only forward approvals for turns Telegram initiated.
          if (sid === undefined || !this.pendingReplies.has(sid)) break;
          this.log("approval requested:", p.approvalId, "|", (p.reason ?? "").slice(0, 60));
          const msg = await this.tg.call("sendMessage", {
            chat_id: chat,
            text: `🔐 需要授权\n🛠 工具: ${p.toolName}\n📋 原因: ${p.reason ?? "无说明"}\n\n请选择：`,
            reply_markup: JSON.stringify({ inline_keyboard: [[
              { text: "✅ 允许一次", callback_data: "allow" },
              { text: "❌ 拒绝", callback_data: "reject" },
            ]] }),
          });
          this.pendingApprovals.set(full.rpcId, { approvalId: p.approvalId, sessionId: p.sessionId, tgMsgId: msg.message_id, chatId: chat, askerId: r.askerId });
          this.save();
          break;
        }
        case "question/requested": {
          if (sid === undefined || !this.pendingReplies.has(sid)) break;
          const q = p.questions?.[0];
          if (!q) break;
          this.log("question requested:", q.question.slice(0, 60));
          const opts = (q.options ?? []).map((o, i) => ({ text: o.label, callback_data: `q:${i}` }));
          const msg = await this.tg.call("sendMessage", {
            chat_id: chat,
            text: `❓ ${q.question}`,
            reply_markup: JSON.stringify({ inline_keyboard: opts.length ? [opts] : [] }),
          });
          this.pendingQuestions.set(full.rpcId, { sessionId: p.sessionId, tgMsgId: msg.message_id, questions: p.questions, chatId: chat, askerId: r.askerId });
          this.save();
          break;
        }
        case "session/event": {
          const ev = p.event ?? {};
          const ours = sid !== undefined && this.pendingReplies.has(sid);
          switch (ev.type) {
            case "turn/start":
              // Only forward the turn if this session owes TG a reply (the
              // prompt came from Telegram). Web-started turns stay silent.
              if (ours) {
                r.finalText = null; r.sentText = false;
                r.toolLog.length = 0; r.progressMsgId = null;
                this.startTyping(chat);
              }
              break;
            case "turn/end":
              this.stopTyping(chat);
              this.state.lastTurnEndSeq = ev.seq ?? this.state.lastTurnEndSeq;
              // Per-chat runtime copy: the turn-timeout check in handleMessage
              // reads r.lastTurnEndSeq, so it must advance here too — otherwise
              // it stays 0 and every message spuriously "times out" after
              // turnTimeoutMs regardless of whether the turn finished.
              r.lastTurnEndSeq = ev.seq ?? r.lastTurnEndSeq;
              // Consume the marker regardless: this turn (TG or web) is done.
              if (sid !== undefined) this.pendingReplies.delete(sid);
              this.save();
              if (!ours) break;
              try {
                if (!r.sentText) { this.log("no text via mux, fallback reply"); await this.fallbackReply(chat); }
              } finally {
                if (r.progressMsgId) {
                  try { await this.tg.call("deleteMessage", { chat_id: chat, message_id: r.progressMsgId }); } catch {}
                  r.progressMsgId = null;
                }
              }
              break;
            case "tool/call": {
              if (!ours) break;
              const name = ev.data?.name ?? "?";
              const a = ev.data?.arguments;
              let args = "";
              try { args = typeof a === "string" ? a : JSON.stringify(a ?? {}); } catch { args = String(a ?? ""); }
              args = args.replace(/\s+/g, " ").slice(0, 60);
              r.toolLog.push(`${name} ${args}`);
              if (r.toolLog.length > 3) r.toolLog.shift();
              const line = "🛠 " + r.toolLog.join("\n");
              try {
                if (r.progressMsgId) await this.tg.call("editMessageText", { chat_id: chat, message_id: r.progressMsgId, text: line });
                else { const m = await this.tg.call("sendMessage", { chat_id: chat, text: line }); r.progressMsgId = m.message_id; }
              } catch {}
              break;
            }
            case "assistant/message": {
              if (!ours) break;
              const c = ev.data?.message?.content ?? [];
              const txt = c.filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();
              if (txt) {
                r.finalText = txt;
                r.sentText = true;
                this.log("sending text via mux, len", txt.length);
                await this.send(chat, txt);
              }
              break;
            }
          }
          break;
        }
      }
    } catch (e) { this.log("mux handler err:", e.message); }
  }

  async fallbackReply(chat) {
    try {
      const entry = this.chatEntry(chat);
      const sid = entry.current;
      if (!sid) return;
      const { events } = await this.dsh("session.history", { sessionId: sid });
      for (let i = events.length - 1; i >= 0; i--) {
        const ev = events[i].event ?? events[i];
        if (ev.type === "assistant/message") {
          const c = ev.data?.message?.content ?? [];
          const hasTool = c.some((b) => b.type === "tool-call");
          const txt = c.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
          if (txt && !hasTool) { await this.send(chat, txt); return; }
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

  /** Sessions a chat may see: its own, or all when admin. */
  visibleSessionsFor(chat) {
    const entry = this.chatEntry(chat);
    const own = entry.sessions ?? [];
    if (!this.isAdmin(chat)) return { ids: own, all: false };
    const all = new Set();
    for (const e of Object.values(this.state.perUserSessions ?? {})) for (const s of e.sessions ?? []) all.add(s);
    for (const s of own) all.add(s);
    return { ids: [...all], all: true };
  }

  async handleSessionsCommand(chat) {
    const { ids, all } = this.visibleSessionsFor(chat);
    const items = await this.listSessions();
    const visible = items.filter((s) => ids.includes(s.sessionId));
    if (visible.length === 0) {
      await this.send(chat, "暂无会话。直接发消息会自动创建，或用 /use new 新建。");
      return;
    }
    const entry = this.chatEntry(chat);
    const current = entry.current;
    const lines = visible.map((s, i) => {
      const mark = s.sessionId === current ? "✅" : `${i + 1}`;
      const run = s.running ? " 🔄" : "";
      const blank = s.blank ? " (空)" : "";
      const title = s.projections?.values?.title;
      const label = title && title !== "" ? title : s.sessionId.slice(0, 20);
      return `${mark}. ${label}${run}${blank}\n   ${s.sessionId}`;
    });
    const owner = all ? "\n（管理员视图：所有用户的会话）" : "";
    await this.send(chat, `📋 会话列表（共 ${visible.length} 个）:${owner}\n\n${lines.join("\n")}\n\n用 /use <编号|ID|标题> 切换，/use new 新建。`);
  }

  async handleUseCommand(chat, arg) {
    const target = String(arg ?? "").trim();
    const entry = this.chatEntry(chat);
    if (target === "" || target === "new") {
      entry.current = null;
      this.save();
      const sid = await this.ensureSession(chat);
      await this.send(chat, `🆕 已新建并切换到会话 ${sid}`);
      return;
    }
    const { ids } = this.visibleSessionsFor(chat);
    const items = await this.listSessions();
    const visible = items.filter((s) => ids.includes(s.sessionId));
    let found = null;
    if (/^\d+$/.test(target)) {
      const idx = parseInt(target, 10) - 1;
      found = visible[idx] ?? null;
    } else {
      // Accept an exact session id, a session-id prefix, or a title keyword
      // (case-insensitive substring). Multiple matches list candidates by
      // their /sessions number instead of guessing.
      const t = target.toLowerCase();
      const matches = visible.filter((s) => {
        const title = (s.projections?.values?.title ?? "").toLowerCase();
        return s.sessionId === target
          || s.sessionId.toLowerCase().startsWith(t)
          || (title !== "" && title.includes(t));
      });
      if (matches.length === 1) found = matches[0];
      else if (matches.length > 1) {
        const lines = matches.map((s) => {
          const i = visible.indexOf(s) + 1;
          const title = s.projections?.values?.title;
          const label = title && title !== "" ? title : s.sessionId.slice(0, 20);
          return `${i}. ${label}\n   ${s.sessionId}`;
        });
        await this.send(chat, `🤔 “${target}” 匹配到 ${matches.length} 个会话，用编号选一个：\n\n${lines.join("\n")}`);
        return;
      }
    }
    if (!found) {
      await this.send(chat, `❌ 找不到会话 “${target}”。支持：编号（/sessions 里的序号）、完整/开头部分 ID、标题关键字。`);
      return;
    }
    entry.current = found.sessionId;
    this.state.lastTurnEndSeq = 0;
    this.runtime(chat).lastTurnEndSeq = 0;
    this.save();
    const label = await this.sessionLabel(found.sessionId);
    await this.send(chat, `🔀 已切换到会话 ${label}`);
  }

  // ---------- permission management (TG commands) ----------

  async handlePermissionCommand(chat, arg) {
    if (!this.permissionPresets) {
      await this.send(chat, "❌ 权限服务不可用（host 未注入 permissionPresets）。");
      return;
    }
    const names = this.permissionPresets.names;
    const raw = String(arg ?? "").trim();

    // `/permission default <name>` — switch the deployment default preset.
    if (raw.startsWith("default")) {
      const name = raw.slice("default".length).trim();
      if (!name) {
        await this.send(chat, `当前默认预设: ${this.permissionPresets.defaultPreset ?? "?"}\n可用: ${names.join(", ")}\n用法: /permission default <name>`);
        return;
      }
      if (!names.includes(name)) {
        await this.send(chat, `❌ 未知预设 ${name}（可用: ${names.join(", ")}）`);
        return;
      }
      await this.dsh("settings.update", { ns: "permission", patch: { defaultPreset: name } });
      await this.send(chat, `✅ 默认预设已设为 ${name}（影响新会话）`);
      return;
    }

    const entry = this.chatEntry(chat);
    const sid = entry.current ?? (await this.ensureSession(chat));
    const session = this.sessionService?.get(sid);
    if (!session) {
      await this.send(chat, `❌ 找不到当前会话 ${sid} 的 Session 对象，无法切换权限。`);
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
        chat_id: chat,
        text: `🔐 当前预设: ${current}\n会话: ${label}\n\n点按钮切换权限：`,
        reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
      });
      return;
    }
    if (!names.includes(raw)) {
      await this.send(chat, `❌ 未知预设 ${raw}（可用: ${names.join(", ")}）`);
      return;
    }
    this.permissionPresets.set(session, raw);
    await this.send(chat, `✅ 已切换到预设 ${raw}`);
  }

  // ---------- model management (TG commands) ----------

  /** Flat numbered model list across every provider group, with the current selection. */
  async handleModelsCommand(chat) {
    const sid = this.chatEntry(chat).current ?? (await this.ensureSession(chat));
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
    await this.send(chat, lines.join("\n"));
  }

  /** Switch the current session's model by flat catalog number. */
  async handleModelCommand(chat, arg) {
    const target = String(arg ?? "").trim();
    if (!/^\d+$/.test(target)) {
      await this.send(chat, "用法: /model <编号>（编号见 /models）");
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
      await this.send(chat, `❌ 没有编号 ${target}。用 /models 查看。`);
      return;
    }
    const sid = this.chatEntry(chat).current ?? (await this.ensureSession(chat));
    try {
      const current = (await this.dsh("session.models", { sessionId: sid }).catch(() => null))?.current;
      // Keep the current reasoning effort when switching models.
      const payload = { sessionId: sid, provider: hit.provider, model: hit.model };
      if (current?.reasoningEffort) payload.reasoningEffort = current.reasoningEffort;
      const res = await this.dsh("session.selectModel", payload);
      const eff = res?.selected?.reasoningEffort;
      await this.send(chat, `✅ 已切换到模型 ${hit.name}（${hit.provider}）${eff ? `，推理强度 ${eff}` : ""}`);
    } catch (e) {
      await this.send(chat, `❌ 切换失败: ${e.message}`);
    }
  }

  /** Show the current reasoning effort as buttons. */
  async handleEffortCommand(chat) {
    const sid = this.chatEntry(chat).current ?? (await this.ensureSession(chat));
    const sessionInfo = await this.dsh("session.models", { sessionId: sid }).catch(() => null);
    const current = sessionInfo?.current;
    if (!current) {
      await this.send(chat, "❌ 无法读取当前模型信息。");
      return;
    }
    // Find the model's supported efforts from the catalog.
    const catalog = await this.dsh("llm.models", {});
    const group = (catalog?.groups ?? []).find((g) => g.id === current.provider);
    const model = (group?.models ?? []).find((m) => m.id === current.model);
    const efforts = (model?.reasoning?.efforts ?? []).map((e) => e.id);

    const effText = current.reasoningEffort ?? "未设置";
    if (!efforts.length) {
      await this.send(chat, `🧠 当前模型: ${current.provider}/${current.model}\n推理强度: ${effText}\n\n该模型不支持推理强度调节。`);
      return;
    }
    const keyboard = efforts.map((name) => [{
      text: (name === effText ? "✅ " : "") + name,
      callback_data: `eff:${name}`,
    }]);
    await this.tg.call("sendMessage", {
      chat_id: chat,
      text: `🧠 当前模型: ${current.provider}/${current.model}\n当前推理强度: ${effText}\n\n点按钮修改：`,
      reply_markup: JSON.stringify({ inline_keyboard: keyboard }),
    });
  }

  // ---------- restart (TG command) ----------

  /** Build the /status text for one chat (its own current session). */
  async buildStatusText(chat) {
    const entry = this.chatEntry(chat);
    const sid = entry.current ?? "未创建";
    const label = sid === "未创建" ? sid : await this.sessionLabel(sid);
    let lines = [`在线 ✅\n会话: ${label}\n负载: ${loadLabel()}`];
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
  async handleRestartCommand(chat) {
    // Restart is an administrative action: only configured admin chats may
    // trigger it, and the auto status after boot goes back to the requester.
    if (!this.isAdmin(chat)) {
      await this.send(chat, "⛔ 仅管理员可执行 /restart。");
      return;
    }
    if (this.state.restartPending) {
      this.log("restart refused: restart already in progress (marker set)");
      await this.send(chat, "⚠️ 重启已在进行中，请稍候（若长时间未恢复再试）。");
      return;
    }
    // Persist a marker so the fresh process announces itself after boot.
    this.state.restartPending = true;
    this.state.restartChat = String(chat);
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
      try { await this.send(chat, "🔄 正在重启 DSH web…（约 10 秒后自动汇报状态）"); } catch {}
      // Exit this process so the watchdog's poll loop ends and it relaunches.
      // Give the ack a moment to flush first.
      setTimeout(() => {
        try { process.exit(0); } catch {}
      }, 500);
    } catch (e) {
      this.log("restart spawn failed:", e.message);
      this.state.restartPending = false;
      this.save();
      await this.send(chat, `❌ 重启失败: ${e.message}`);
    }
  }

  // ---------- access management (admin TG commands) ----------

  /** Persist the access config to the settings namespace (same source the GUI edits). */
  async persistAccess(chat, nextAllowedUsers, nextAdminChatIds) {
    const patch = { allowedUsers: nextAllowedUsers, adminChatIds: nextAdminChatIds };
    // Prefer the in-process settings service; fall back to the loopback HTTP
    // API (settings.update lives in the privileged configuration plane and the
    // bridge always talks to loopback). Either path lands in the same document
    // the GUI edits and triggers the plugin watch -> build() -> applyAccessConfig.
    if (this.settingsService) {
      try {
        await this.settingsService.update(SETTINGS_NS, patch);
        return true;
      } catch (e) {
        this.log("persistAccess: in-process settings.update failed, falling back to HTTP:", e.message);
      }
    }
    try {
      await this.dsh("settings.update", { ns: SETTINGS_NS, patch });
      return true;
    } catch (e) {
      this.log("persistAccess: HTTP settings.update failed:", e.message);
      await this.send(chat, `❌ 保存授权失败（配置只读？）: ${e.message}`);
      return false;
    }
  }

  /** Real Telegram display name for a chat: private -> @username or first name, group -> title. Null when unavailable. */
  async chatDisplayName(id) {
    try {
      const info = await this.tg.call("getChat", { chat_id: id });
      if (info.type === "private") return info.username ? `@${info.username}` : (info.first_name ?? null);
      return info.title ?? null;
    } catch { return null; }
  }

  /** Admin: list authorized chats/groups with their admin status. */
  async handleUsersCommand(chat) {
    if (!this.isAdmin(chat)) { await this.send(chat, "⛔ 仅管理员可执行 /users。"); return; }
    const map = new Map();
    for (const u of this.config.allowedUsers ?? []) map.set(String(u.chatId), { label: u.label, admin: false });
    if (this.config.allowedChat) {
      const id = String(this.config.allowedChat);
      if (!map.has(id)) map.set(id, { label: undefined, admin: false });
    }
    for (const id of this.adminChats) {
      const e = map.get(id) ?? { label: undefined, admin: true };
      e.admin = true;
      map.set(id, e);
    }
    // Display names default to the real Telegram name (private: @username or
    // first name; group: title). The configured label is only a fallback when
    // getChat fails (e.g. the bot is no longer in that group).
    const rows = await Promise.all([...map.entries()].map(async ([id, e]) => {
      const name = (await this.chatDisplayName(id)) ?? e.label ?? id;
      return `${e.admin ? "🛡" : "👤"} ${id}  ${name}`;
    }));
    await this.send(chat, `📋 授权列表（${rows.length}）:\n\n${rows.join("\n") || "（空）"}\n\n/grant <chatId> 添加\n/revoke <chatId> 移除\n/admin [off] <chatId> 设置/取消管理员`);
  }

  /** Admin: authorize a chat/group (or the current group with no args). */
  async handleGrantCommand(chat, arg) {
    if (!this.isAdmin(chat)) { await this.send(chat, "⛔ 仅管理员可执行 /grant。"); return; }
    let target = String(arg ?? "").trim();
    if (!target) {
      if (String(chat).startsWith("-")) target = chat;
      else { await this.send(chat, "用法: /grant <chatId>（群里直接 /grant 授权当前群）"); return; }
    }
    if (!/^-?\d+$/.test(target)) { await this.send(chat, `❌ 无法解析 chatId: ${target}`); return; }
    const id = target;
    // Groups get their title recorded as an internal remark (session title /
    // fallback display); private chats need nothing — /users shows the real
    // @username via getChat anyway.
    let label;
    if (String(id).startsWith("-")) {
      try { const info = await this.tg.call("getChat", { chat_id: id }); label = info.title ?? undefined; } catch {}
    }
    const users = [...(this.config.allowedUsers ?? [])];
    if (users.some((u) => String(u.chatId) === id)) {
      await this.send(chat, `ℹ️ ${id} 已在授权列表。`);
      return;
    }
    users.push({ chatId: Number(id), label });
    if (!await this.persistAccess(chat, users, [...this.adminChats])) return;
    this.applyAccessConfig({ ...this.config, allowedUsers: users });
    await this.send(chat, `✅ 已授权 ${id}${label ? "（" + label + "）" : ""}，现在可以正常使用。`);
  }

  /** Admin: remove a chat/group. Never removes the caller or the last admin. */
  async handleRevokeCommand(chat, arg) {
    if (!this.isAdmin(chat)) { await this.send(chat, "⛔ 仅管理员可执行 /revoke。"); return; }
    const target = String(arg ?? "").trim();
    if (!/^-?\d+$/.test(target)) { await this.send(chat, "用法: /revoke <chatId>"); return; }
    const id = String(target);
    if (id === String(chat)) { await this.send(chat, "⛔ 不能移除你自己（会失去管理权限）。"); return; }
    const old = this.config.allowedUsers ?? [];
    if (!old.some((u) => String(u.chatId) === id)) { await this.send(chat, `ℹ️ ${id} 不在授权列表。`); return; }
    if (this.isAdmin(id) && this.adminChats.size <= 1) { await this.send(chat, "⛔ 不能移除最后一个管理员。"); return; }
    const users = old.filter((u) => String(u.chatId) !== id);
    const admins = [...this.adminChats].filter((a) => a !== id);
    if (!await this.persistAccess(chat, users, admins)) return;
    this.applyAccessConfig({ ...this.config, allowedUsers: users, adminChatIds: admins });
    await this.send(chat, `✅ 已移除 ${id}。`);
  }

  /** Admin: add/remove an admin (grant implies authorization). */
  async handleAdminCommand(chat, arg) {
    if (!this.isAdmin(chat)) { await this.send(chat, "⛔ 仅管理员可执行 /admin。"); return; }
    const m = String(arg ?? "").trim().match(/^(off\s+)?(-?\d+)(?:\s+.*)?$/);
    if (!m) { await this.send(chat, "用法: /admin <chatId> 或 /admin off <chatId>"); return; }
    const off = !!m[1];
    const id = m[2];
    if (off && id === String(chat)) { await this.send(chat, "⛔ 不能取消自己的管理员。"); return; }
    const admins = new Set([...this.adminChats]);
    const users = [...(this.config.allowedUsers ?? [])];
    if (off) {
      if (!admins.has(id)) { await this.send(chat, `ℹ️ ${id} 不是管理员。`); return; }
      if (admins.size <= 1) { await this.send(chat, "⛔ 不能移除最后一个管理员。"); return; }
      admins.delete(id);
    } else {
      if (admins.has(id)) { await this.send(chat, `ℹ️ ${id} 已是管理员。`); return; }
      admins.add(id);
      if (!users.some((u) => String(u.chatId) === id)) users.push({ chatId: Number(id), label: undefined });
    }
    if (!await this.persistAccess(chat, users, [...admins])) return;
    this.applyAccessConfig({ ...this.config, allowedUsers: users, adminChatIds: [...admins] });
    await this.send(chat, off ? `✅ 已取消 ${id} 的管理员。` : `✅ ${id} 现在是管理员（已自动授权）。`);
  }

  // ---------- incoming message flow ----------

  async handleMessage(chat, text, quoted, fromId) {
    const sid = await this.ensureSession(chat);
    await this.send(chat, "🤖 收到，agent 开始干活…");
    const r = this.runtime(chat);
    // Record who asked this turn — but only when no TG turn is already in
    // flight on this session, so a queued follow-up cannot overwrite the
    // asker of the active turn. The asker owns the approval/question buttons
    // rendered for this turn.
    if (fromId !== undefined && !this.pendingReplies.has(sid)) r.askerId = fromId;
    const waitSeq = r.lastTurnEndSeq;
    const promptText = quoted ? `[引用回复]\n${quoted}\n\n[新消息]\n${text}` : text;
    await this.dsh("session.prompt", { sessionId: sid, mode: "queue", content: [{ type: "text", text: promptText }] });
    // This session now owes Telegram a reply: the next turn on it is OURS, so
    // mux forwards it back. Turns started elsewhere (web UI) stay silent.
    this.pendingReplies.add(sid);
    this.save();
    // Non-blocking timeout safety: replies arrive via mux turn/end; if the
    // turn never ends, notify once. Never blocks the poll loop.
    setTimeout(() => {
      if (this.stopped) return;
      if (r.lastTurnEndSeq <= waitSeq) {
        this.log("turn timeout, notifying");
        this.send(chat, "⏰ 10 分钟超时，agent 可能还在跑，稍后查网页端。").catch(() => {});
      }
    }, this.config.turnTimeoutMs);
  }

  // ---------- button callbacks ----------

  /**
  * Whether a pending entry belongs to the chat that produced the click. Entries
  * persisted before chat tracking (chatId undefined) match any chat, so
  * questions/approvals that survived an upgrade still resolve.
  */
  entryForChat(entry, chat) {
    return entry.chatId === undefined || String(entry.chatId) === String(chat);
  }

  /**
  * Whether the clicker may act on a pending approval/question. The asker owns
  * their buttons; other group members get a denial toast instead of an answer.
  * When the asker was never recorded (entry persisted from before this feature,
  * or a restart in the middle of a turn), a private chat is single-user so the
  * clicker is trusted, while multi-user groups refuse. askerRequired=false
  * restores the old "first clicker wins" behavior.
  */
  denyAsker(entry, chat, clickerId) {
    if (this.config.askerRequired === false) return false;
    if (clickerId === undefined || clickerId === null) return true;
    if (entry.askerId === undefined || entry.askerId === null) return String(chat).startsWith("-");
    return String(entry.askerId) !== String(clickerId);
  }

  async handleCallback(cq) {
    const data = cq.data ?? "";
    const tgMsgId = cq.message?.message_id;
    const chat = String(cq.message?.chat?.id ?? "");
    const clickerId = cq.from?.id;
    this.log("callback received:", JSON.stringify({
      id: cq.id, data, tgMsgId, chat, clickerId,
      pendingQuestions: [...this.pendingQuestions.values()].map((x) => x.tgMsgId),
      pendingApprovals: [...this.pendingApprovals.values()].map((x) => x.tgMsgId),
    }));
    let responded = false;
    let denied = false;
    let alertText = null;
    if (data === "allow" || data === "reject") {
      for (const [rpcId, app] of this.pendingApprovals) {
        if (app.tgMsgId !== tgMsgId || !this.entryForChat(app, chat)) continue;
        if (this.denyAsker(app, chat, clickerId)) {
          this.log("approval button denied:", clickerId, "chat", chat, "asker", app.askerId);
          denied = true;
          responded = true;
          alertText = "⚠️ 只有发起该授权的用户才能操作";
          break;
        }
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
    } else if (data.startsWith("q:")) {
      const idx = parseInt(data.slice(2), 10);
      for (const [rpcId, pq] of this.pendingQuestions) {
        if (pq.tgMsgId !== tgMsgId || !this.entryForChat(pq, chat)) continue;
        if (this.denyAsker(pq, chat, clickerId)) {
          this.log("question button denied:", clickerId, "chat", chat, "asker", pq.askerId);
          denied = true;
          responded = true;
          alertText = "⚠️ 只有提问者可以回答本题";
          break;
        }
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
    } else if (data.startsWith("eff:")) {
      const name = data.slice(4);
      const chat = String(cq.message?.chat?.id ?? "");
      const sid = this.chatEntry(chat).current ?? (chat ? await this.ensureSession(chat) : null);
      if (!sid) {
        this.log("effort switch failed: no chat/session");
      } else {
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
      }
    } else if (data.startsWith("perm:")) {
      const name = data.slice(5);
      const names = this.permissionPresets?.names ?? [];
      if (!this.permissionPresets || !names.includes(name)) {
        this.log("permission switch failed: unknown preset", name);
      } else {
        const chat = String(cq.message?.chat?.id ?? "");
        const sid = this.chatEntry(chat).current ?? (chat ? await this.ensureSession(chat) : null);
        const session = sid ? this.sessionService?.get(sid) : null;
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
    try { await this.tg.call("answerCallbackQuery", { callback_query_id: cq.id, text: alertText ?? "", show_alert: !!alertText }); } catch {}
    const replyChat = String(cq.message?.chat?.id ?? this.chats.values().next().value ?? "");
    if (responded && !denied) {
      try {
        if (this.permissionReply !== undefined) {
          await this.tg.call("editMessageText", {
            chat_id: replyChat, message_id: tgMsgId,
            text: `✅ 已切换到权限 ${this.permissionReply}`,
          });
          this.permissionReply = undefined;
        } else if (this.effortReply !== undefined) {
          await this.tg.call("editMessageText", {
            chat_id: replyChat, message_id: tgMsgId,
            text: `✅ 推理强度已设为 ${this.effortReply}`,
          });
          this.effortReply = undefined;
        } else {
          await this.tg.call("editMessageText", { chat_id: replyChat, message_id: tgMsgId, text: "✅ 已提交" });
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
    if (!msg) return;
    const chat = String(msg.chat.id);
    if (!this.isAllowed(chat)) {
      // Onboarding: an unauthorized user who /start's in a private chat learns
      // their own chat id so they can ask an admin to grant it. Everything else
      // from unauthorized chats stays ignored (diagnostic log only).
      const isPrivateStart = msg.text?.trim() === "/start" && msg.from && !msg.from.is_bot && !String(chat).startsWith("-");
      if (isPrivateStart) {
        const admins = [...this.adminChats];
        const hint = admins.length
          ? `把 Chat ID 发给管理员（${admins[0]}）即可开通。`
          : "当前部署未配置管理员，需要管理员在配置文件里授权。";
        try { await this.send(chat, `⛔ 未授权，暂时无法使用。\n你的 Chat ID：${chat}\n${hint}`); } catch {}
      } else {
        // Diagnostic: report ignored chats (useful while onboarding a group).
        if (msg.from && !msg.from.is_bot) this.log("ignored message from chat", chat, "type", msg.chat?.type, "text", (msg.text ?? "").slice(0, 40));
      }
      return;
    }
    if (!this.shouldHandleMessage(msg)) return;   // group: only @mention/reply-to-bot; ignore own echoes
    const text = (msg.text ?? msg.caption ?? "").trim();
    // Groups deliver commands prefixed with the bot mention ("@Yike_claw_bot
    // /status") or suffixed ("/status@Yike_claw_bot" when picked from the
    // command menu). Normalize both back to a plain "/cmd" so command matching
    // works exactly like a private chat; other mentions stay in the text.
    let cmd = text;
    if (this.tg?.myId) {
      const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const mine = esc(this.tg.myId);
      cmd = cmd.replace(new RegExp(`^@${mine}(?:[ \\t]+|$)`, "i"), "");
      if (cmd.startsWith("/")) cmd = cmd.replace(new RegExp(`^(\\S+)@${mine}(?=[ \\t]|$)`, "i"), "$1");
      cmd = cmd.trim();
    }
    // Extract the quoted original message (TG reply) so it reaches the agent.
    const quoted = quotedTextOf(msg);
    const err = (e) => { try { this.send(chat, "❌ " + e.message); } catch {} };
    if (cmd === "/start") { await this.send(chat, "DSH 桥接在线 ✅ 直接发消息即可。"); return; }
    if (cmd === "/status") {
      await this.send(chat, await this.buildStatusText(chat));
      return;
    }
    if (cmd === "/help") {
      const admin = this.isAdmin(chat);
      const lines = [
        "📖 可用命令:",
        "/sessions — 列出所有会话",
        "/use <编号|ID|标题|new> — 切换/新建会话",
        "/models — 列出模型",
        "/model <编号> — 切换当前会话模型",
        "/effort — 点按钮修改推理强度",
        "/permission — 查看权限并点按钮切换",
        "/status — 在线状态、token、上下文",
      ];
      if (admin) lines.push(
        "/users — 授权列表",
        "/grant <chatId> — 添加用户/群组（群里直接 /grant 授权当前群）",
        "/revoke <chatId> — 移除授权",
        "/admin [off] <chatId> — 设置/取消管理员",
        "/restart — 重启 DSH web",
      );
      lines.push("其他文本 — 发给 agent");
      if (String(chat).startsWith("-")) lines.push("群组里请 @我 或回复我的消息来使用。");
      await this.send(chat, lines.join("\n"));
      return;
    }
    if (cmd.startsWith("/sessions")) { try { await this.handleSessionsCommand(chat); } catch (e) { err(e); } return; }
    // /users must come before /use: "/users" starts with "/use", so a bare
    // startsWith on /use would swallow the users command as "/use rs".
    if (cmd.startsWith("/users")) { try { await this.handleUsersCommand(chat); } catch (e) { err(e); } return; }
    if (/^\/use(?:\s|$)/.test(cmd)) { try { await this.handleUseCommand(chat, cmd.slice(4)); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/models")) { try { await this.handleModelsCommand(chat); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/model")) { try { await this.handleModelCommand(chat, cmd.slice(6)); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/effort")) { try { await this.handleEffortCommand(chat); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/users")) { try { await this.handleUsersCommand(chat); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/grant")) { try { await this.handleGrantCommand(chat, cmd.slice(6)); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/revoke")) { try { await this.handleRevokeCommand(chat, cmd.slice(7)); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/admin")) { try { await this.handleAdminCommand(chat, cmd.slice(6)); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/restart")) { try { await this.handleRestartCommand(chat); } catch (e) { err(e); } return; }
    if (cmd.startsWith("/permission")) { try { await this.handlePermissionCommand(chat, cmd.slice(11)); } catch (e) { err(e); } return; }
    if (!cmd) return;
    try { await this.handleMessage(chat, cmd, quoted, msg.from?.id); }
    catch (e) {
      this.log("handle err:", e.message);
      try { await this.send(chat, "❌ 出错了：" + e.message); } catch {}
    }
  }

  // ---------- lifecycle ----------

  start() {
    this.stopped = false;
    this.pollAbort = new AbortController();
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
        const chat = this.state.restartChat ?? [...this.chats][0];
        delete this.state.restartPending;
        delete this.state.restartChat;
        this.save();
        this.buildStatusText(chat)
          .then((text) => this.send(chat, `🔄 重启完成\n\n${text}`))
          .catch((e) => this.log("auto status failed:", e?.message ?? e));
      }
    }, 8000);
  }

  /** Advertise the bot's command menu to Telegram (the / button next to input). */
  async registerCommands() {
    try {
      // Cache the bot's own username for group @mention detection.
      try {
        const me = await this.tg.call("getMe", {});
        this.tg.myId = me.username;
        this.log("bot username:", me.username);
      } catch {}
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
        }, { signal: this.pollAbort.signal });
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
    // Abort any in-flight getUpdates long-poll immediately so a following
    // rebuild cannot overlap two pollers on the same bot token (409 Conflict).
    try { this.pollAbort?.abort(); } catch {}
    for (const chat of this.chatState.keys()) this.stopTyping(chat);
    try { this.mux?.close(); } catch {}
    this.log("bridge plugin stopped");
  }
}
