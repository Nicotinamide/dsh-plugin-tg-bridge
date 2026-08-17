// dsh-plugin-tg-bridge: DSH <-> Telegram bridge as a Cordis profile plugin.
//
// Official template shape (mirrors the shipped @deepseek-ai/dsh-* plugins):
//   - package.json declares "dsh": { "bundle": { "patch": "./cordis.patch.yml" } }
//   - cordis.patch.yml inserts a row with id/name/config
//   - lib/index.js exports { name, apply }; name equals the row id
//   - settings: installSettingsSection() registers the "tg-bridge" namespace
//     with the composition entry as base, so the GUI can edit it live and the
//     bridge reconfigures on change.
//
// Configuration priority (highest wins):
//   env vars (TG_*) > settings namespace user layer > patch config > defaults.
//
// Mount in a profile's cordis.patch.yml:
//
//   - id: tg-bridge
//     name: 'dsh-plugin-tg-bridge'
//     config:
//       botToken: '<BOT_TOKEN>'
//       allowedChat: '<CHAT_ID>'
//
// The GUI 插件配置 (plugin config) page shows an editable tg-bridge card:
// the persistent client half (lib/client.js) reads/writes this plugin's
// settings through the /api/tg-bridge/config HTTP endpoint registered below
// (webServer), which bypasses the apiproxy namespace allowlist. Changes apply
// live through the settings watch.

import z from "@deepseek-ai/schemastery";
// Vendored local copies: dsh-settings pulls in @deepseek-ai/cordis and
// home-paths would too, but the distributed plugin is a single self-contained
// bundle (dist/index.js) that must never carry a second cordis instance.
import { installSettingsSection, settingsNamespace } from "./settings-local.js";
import { dshHomePath } from "./home-local.js";
import { Bridge } from "./bridge.js";

const name = "tg-bridge";
const SETTINGS_NS = "tg-bridge";
const CONFIG_PATH = "/api/tg-bridge/config";

/** Local-time log stamp (server-local, no UTC Z suffix). */
function ts() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Read the request body as a UTF-8 string. */
async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

/** True when the request authority is loopback. */
function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

/**
* Mirror of dsh-client-connection's trust fence: only loopback or explicitly
* trusted authorities may reach the endpoint, and a cross-site browser request
* is refused (Origin, when present, must match the Host).
*/
function isTrustedRequest(req, trustedHosts) {
  const host = req.headers.host;
  if (host === undefined) return false;
  let hostUrl;
  try { hostUrl = new URL(`http://${host}`); } catch { return false; }
  if (!isLoopbackHostname(hostUrl.hostname)) {
    const ok = (trustedHosts ?? []).some((entry) => {
      try { return new URL(`http://${entry}`).host === hostUrl.host; } catch { return entry === host; }
    });
    if (!ok) return false;
  }
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  try { return new URL(origin).host === hostUrl.host; } catch { return false; }
}

function json(res, status, body) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

const DEFAULTS = {
  tgApiBase: "https://api.telegram.org",
  dshBaseUrl: "http://127.0.0.1:3080",
  muxUrl: "ws://127.0.0.1:3080/api/events.mux",
  stateFile: dshHomePath("tg-bridge-state.json"),
  pollTimeoutSeconds: 25,
  turnTimeoutMs: 10 * 60 * 1000,
  tgTimeoutMs: 30000,
  dshTimeoutMs: 15000,
  askerRequired: true,
};

/** Read one env var; empty string counts as unset. */
function fromEnv(name) {
  const v = process.env[name];
  return v !== undefined && v !== "" ? v : undefined;
}

/** Env overrides win over every other source (tokens never need to enter files). */
function envOverrides() {
  const o = {};
  const s = (env, key) => { const v = fromEnv(env); if (v !== undefined) o[key] = v; };
  const n = (env, key) => { const v = fromEnv(env); if (v !== undefined && Number.isFinite(Number(v))) o[key] = Number(v); };
  s("TG_BOT_TOKEN", "botToken");
  s("TG_ALLOWED_CHAT", "allowedChat");
  s("TG_API_BASE", "tgApiBase");
  n("TG_POLL_TIMEOUT_SECONDS", "pollTimeoutSeconds");
  s("TG_STATE_FILE", "stateFile");
  n("TG_TURN_TIMEOUT_MS", "turnTimeoutMs");
  n("TG_TG_TIMEOUT_MS", "tgTimeoutMs");
  n("TG_DSH_TIMEOUT_MS", "dshTimeoutMs");
  s("TG_DSH_BASE_URL", "dshBaseUrl");
  s("TG_MUX_URL", "muxUrl");
  return o;
}

function stripUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj ?? {})) if (v !== undefined) out[k] = v;
  return out;
}

/** Settings schema: defaults double as the config fallback layer. */
const ConfigSchema = z.object({
  botToken: z.string().role("secret"),
  allowedChat: z.string(),
  allowedUsers: z.array(z.object({
    chatId: z.union([z.string(), z.number()]),
    label: z.string().required(false),
  })).default([]),
  adminChatIds: z.array(z.union([z.string(), z.number()])).default([]),
  tgApiBase: z.string().default(DEFAULTS.tgApiBase),
  dshBaseUrl: z.string().default(DEFAULTS.dshBaseUrl),
  muxUrl: z.string().default(DEFAULTS.muxUrl),
  pollTimeoutSeconds: z.number().default(DEFAULTS.pollTimeoutSeconds),
  stateFile: z.string().default(DEFAULTS.stateFile),
  turnTimeoutMs: z.number().default(DEFAULTS.turnTimeoutMs),
  tgTimeoutMs: z.number().default(DEFAULTS.tgTimeoutMs),
  dshTimeoutMs: z.number().default(DEFAULTS.dshTimeoutMs),
  askerRequired: z.boolean().default(DEFAULTS.askerRequired),
});

function apply(ctx, config = {}) {
  const entry = stripUndefined(config);
  let bridge = null;
  let built = false;
  let source = () => entry;
  let permissionPresets = null;
  let sessionService = null;
  let settingsService = null;
  const log = (...a) => console.log(ts(), "[tg-bridge]", ...a);

  // Attach host services when they exist: permissionPresets + sessions power
  // the TG /permission command (switching the current session's preset).
  ctx.inject(["permissionPresets", "sessions"], (hostCtx) => {
    permissionPresets = hostCtx.permissionPresets;
    sessionService = hostCtx.sessions;
    try { bridge?.attachHost({ permissionPresets, sessionService }); } catch {}
  });

  // Resolve the settings service as soon as it is mounted (independent of
  // webServer timing): TG admin commands (/grant /revoke /admin) persist the
  // access config through it — the same document the GUI edits. The apiproxy
  // HTTP path cannot be used instead: non-product namespaces like "tg-bridge"
  // are refused with settings-not-exposed.
  ctx.inject(["settings"], (sctx) => {
    settingsService = sctx.settings;
    try { bridge?.attachHost({ permissionPresets, sessionService, settingsService }); } catch {}
  });

  // The webServer service knows the ACTUAL loopback port dsh is listening on
  // (it changes between boots). When dshBaseUrl/muxUrl are not explicitly
  // configured (i.e. still equal to DEFAULTS), derive them from this port so
  // the bridge always reaches the same process it runs inside.
  let webServerPort = null;

  // Fields whose change must recreate the bridge (token, endpoints, polling,
  // timeouts, state file). Everything else — authorized chats, admins, the
  // askerRequired switch — applies to the running bridge in place, so hot
  // config changes and TG admin commands never trigger a rebuild (no getUpdates
  // 409 window, no loss of in-flight turn state).
  const CORE_KEYS = ["botToken", "tgApiBase", "dshBaseUrl", "muxUrl", "pollTimeoutSeconds", "stateFile", "turnTimeoutMs", "tgTimeoutMs", "dshTimeoutMs"];

  const build = () => {
    // source() resolves schema defaults + patch base + settings user layer;
    // DEFAULTS stays as the floor for the no-settings entry path.
    const merged = { ...DEFAULTS, ...source(), ...envOverrides() };
    // Auto-derive the DSH endpoints from the live port unless explicitly set
    // (env/settings/patch with a non-default value wins).
    if (webServerPort && merged.dshBaseUrl === DEFAULTS.dshBaseUrl) merged.dshBaseUrl = `http://127.0.0.1:${webServerPort}`;
    if (webServerPort && merged.muxUrl === DEFAULTS.muxUrl) merged.muxUrl = `ws://127.0.0.1:${webServerPort}/api/events.mux`;
    merged.allowedChat = String(merged.allowedChat ?? "");
    // At least one authorized chat is required: either the legacy single-chat
    // allowedChat or any entry in allowedUsers. New deployments can ignore
    // allowedChat entirely and manage users in the GUI or via TG /grant.
    const hasAnyChat = !!merged.allowedChat || (merged.allowedUsers ?? []).length > 0;
    if (!merged.botToken || !hasAnyChat) {
      if (built) log("botToken/授权 chat 缺失 — bridge stopped; configure in GUI 插件配置 or env");
      try { bridge?.stop(); } catch {}
      bridge = null;
      return;
    }
    if (bridge && CORE_KEYS.every((k) => bridge.config[k] === merged[k])) {
      bridge.applyAccessConfig(merged);
      built = true;
      return;
    }
    try { bridge?.stop(); } catch {}
    // Ensure the settings service is resolved even if the injects have not
    // fired yet on this boot order (they can run after the first build).
    // `== null` covers both null and undefined (an early webServer get can
    // yield undefined before the service is mounted).
    if (settingsService == null) { try { settingsService = ctx.get("settings") ?? null; } catch {} }
    bridge = new Bridge(merged);
    try { bridge.attachHost({ permissionPresets, sessionService, settingsService }); } catch {}
    bridge.start();
    built = true;
    log("bridge running (chat=", merged.allowedChat, "api=", merged.tgApiBase, "poll=", merged.pollTimeoutSeconds, "s)");
  };

  // Official settings wiring: register the namespace with the composition
  // entry as base; when the settings service is absent the source falls back
  // to the entry, so the plugin keeps working exactly as composed.
  installSettingsSection(ctx, settingsNamespace(SETTINGS_NS), ConfigSchema, entry, {
    setSource: (current) => { source = current; },
    onChange: () => { try { build(); } catch (e) { log("reconfigure failed:", e.message); } },
  });

  // The settings service is mounted by dsh-base, but if it is ever absent the
  // installSettingsSection callback never fires; start from the entry alone.
  if (ctx.get("settings") === undefined) {
    try { build(); } catch (e) { log("initial build failed:", e.message); }
  }

  // HTTP config endpoint for the persistent client half (bypasses the
  // apiproxy namespace allowlist). GET returns the resolved section; POST
  // merges a patch into the user layer, which hot-reloads the bridge.
  ctx.inject(["webServer"], (webCtx) => {
    // Capture the live loopback port for endpoint auto-derivation, then rebuild
    // (idempotent): if the bridge was built before the port was known, this
    // points it at the real port instead of the 3080 default.
    try { webServerPort = webCtx.webServer?.port ?? null; } catch { webServerPort = null; }
    if (webServerPort) { try { build(); } catch (e) { log("reconfigure after port resolve failed:", e.message); } }
    // Hand the settings service to the bridge so TG admin commands
    // (/grant /revoke /admin) persist access config to the same namespace
    // the GUI edits — one source of truth. Guard against an early undefined
    // (the service may mount just after webServer appears).
    const svc = webCtx.get("settings");
    if (svc !== undefined) settingsService = svc;
    try { bridge?.attachHost({ permissionPresets, sessionService, settingsService }); } catch {}
    webCtx.effect(() => webCtx.webServer.register({
      kind: "exact",
      path: CONFIG_PATH,
      handler: async (req, res) => {
        const settings = webCtx.get("settings");
        if (settings === undefined) return json(res, 503, { ok: false, error: "settings unavailable" });
        if (!isTrustedRequest(req, webCtx.get("webRuntime")?.trustedHosts)) return json(res, 403, { ok: false, error: "forbidden" });
        try {
          if (req.method === "GET") {
            const value = settings.get(SETTINGS_NS);
            // Redact secrets on the wire: the client only needs to know the
            // token is set, never its value (mirrors apiproxy redactSecrets).
            // settings.get() returns a deep-frozen object, so clone it.
            const wire = value === null || value === undefined ? null : { ...value };
            if (wire && wire.botToken) wire.botToken = "••••••••";
            return json(res, 200, { ok: true, value: wire, writable: settings.writable });
          }
          if (req.method === "POST") {
            const raw = await readBody(req);
            let patch;
            try { patch = JSON.parse(raw || "{}").patch; } catch { return json(res, 400, { ok: false, error: "invalid JSON" }); }
            if (patch === undefined || typeof patch !== "object" || patch === null) return json(res, 400, { ok: false, error: "patch object required" });
            // A redacted marker on the wire means "leave the stored token alone".
            if (patch.botToken === "••••••••") delete patch.botToken;
            await settings.update(SETTINGS_NS, patch);
            return json(res, 200, { ok: true });
          }
          return json(res, 405, { ok: false, error: "method not allowed" });
        } catch (error) {
          return json(res, 400, { ok: false, error: error?.message ?? String(error) });
        }
      },
    }), "tg-bridge: config endpoint");
  });

  return () => { try { bridge?.stop(); } catch {} };
}

export { apply, name };
