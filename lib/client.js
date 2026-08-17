// dsh-plugin-tg-bridge persistent client half.
//
// This file is a prebuilt browser bundle in the DSH client-module format:
//   window.__ModuleLoader__.load({ id, factory })
// The factory is CJS-style: `require` resolves platform seed words (react,
// @deepseek-ai/cordis, ...) and shell-own modules. It is loaded by
// dsh-client-modules whenever this package is a live loader entry, so the GUI
// card survives restarts — no dynamic-plugin re-run needed.
//
// The card registers into settings.plugin.item (设置 → 插件 → 插件配置 /
// Settings → Plugins → Configurable) and talks to the host half over the
// /api/tg-bridge/config HTTP endpoint (webServer route in lib/index.js),
// bypassing the apiproxy allowlist.
//
// Localization follows the platform pattern: register a zh+en dictionary for
// this namespace and bind the translate function; the active locale follows
// the user's language preference live.
//
// NOTE: this bundle runs in the browser kernel, not under the dynamic cordis
// runner: `styles.insert` and `host.call` are NOT available here. Styles are
// inline; data goes through fetch().

window.__ModuleLoader__.load({
  id: "dsh-plugin-tg-bridge",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");

    var inject = ["slots", "locale"];

    var NS = "tg-bridge";

    // Field descriptors: label/placeholder keys resolve through the locale
    // dictionary, so the UI switches language with the user preference.
    var FIELDS = [
      { key: "botToken", type: "password", secret: true, labelKey: "fieldBotToken", placeholderKey: "placeholderToken" },
      { key: "allowedUsers", type: "chatlines", labelKey: "fieldAllowedUsers", placeholderKey: "placeholderUsers" },
      { key: "adminChatIds", type: "chatids", labelKey: "fieldAdminChatIds", placeholderKey: "placeholderAdmins" },
      { key: "askerRequired", type: "checkbox", labelKey: "fieldAskerRequired" },
      { key: "tgApiBase", type: "text", labelKey: "fieldTgApiBase" },
      { key: "pollTimeoutSeconds", type: "number", labelKey: "fieldPollTimeout" }
    ];

    var CONFIG_PATH = "/api/tg-bridge/config";

    // Access-list fields are edited as plain text (one entry per line) and
    // converted to/from the structured config on save/load. Empty lines and
    // unparseable lines are dropped.
    function parseChatLines(text) {
      var out = [];
      String(text || "").split("\n").forEach(function (line) {
        line = line.trim();
        if (!line) return;
        var m = line.match(/^(-?\d+)(?:\s+(.*))?$/);
        if (!m) return;
        var item = { chatId: m[1] };
        if (m[2] !== undefined && m[2].trim() !== "") item.label = m[2].trim();
        out.push(item);
      });
      return out;
    }
    function formatChatLines(users) {
      return (users || []).map(function (u) { return String(u.chatId) + (u.label ? " " + u.label : ""); }).join("\n");
    }
    function parseIdLines(text) {
      return String(text || "").split("\n").map(function (l) { return l.trim(); }).filter(function (l) { return /^-?\d+$/.test(l); });
    }
    function formatIdLines(ids) {
      return (ids || []).map(String).join("\n");
    }

    var zh = {
      title: "Telegram 遥控",
      description: "在 Telegram 里向 DSH agent 发消息触发任务，实时接收回复、工具进度和提问/审批按钮。",
      fieldBotToken: "Bot Token",
      placeholderToken: "输入 Bot Token",
      placeholderTokenSet: "••••••••（已设置，留空保持不变）",
      tokenSet: "（已设置）",
      fieldAllowedUsers: "允许的用户/群组（每行一个 chatId）",
      placeholderUsers: "123456789\n-1001234567890",
      fieldAdminChatIds: "管理员 Chat ID（每行一个）",
      placeholderAdmins: "123456789",
      fieldAskerRequired: "提问/审批按钮仅发起者可点（askerRequired）",
      fieldTgApiBase: "Telegram API 基址",
      fieldPollTimeout: "轮询超时（秒）",
      loading: "加载中…",
      readOnly: "配置只读（当前 settings provider 不可写）。",
      readFailed: "读取失败: ",
      readError: "读取异常: ",
      save: "保存",
      saving: "保存中…",
      saveFailed: "保存失败: ",
      saveError: "保存异常: ",
      saveOk: "已保存，桥接已热重载",
      discard: "放弃",
      unsaved: "未保存",
      advancedHint: "高级项（DSH 地址、状态文件、超时）通过 env 或 patch 配置。"
    };

    var en = {
      title: "Telegram Remote",
      description: "Message the DSH agent from Telegram to run tasks; receive replies, tool progress, and question/approval buttons live.",
      fieldBotToken: "Bot Token",
      placeholderToken: "Enter Bot Token",
      placeholderTokenSet: "•••••••• (set — leave blank to keep)",
      tokenSet: " (set)",
      fieldAllowedUsers: "Allowed users/groups (one chat id per line)",
      placeholderUsers: "123456789\n-1001234567890",
      fieldAdminChatIds: "Admin Chat IDs (one per line)",
      placeholderAdmins: "123456789",
      fieldAskerRequired: "Approval/question buttons clickable by the asker only",
      fieldTgApiBase: "Telegram API Base",
      fieldPollTimeout: "Poll Timeout (s)",
      loading: "Loading…",
      readOnly: "Config is read-only (the current settings provider is not writable).",
      readFailed: "Read failed: ",
      readError: "Read error: ",
      save: "Save",
      saving: "Saving…",
      saveFailed: "Save failed: ",
      saveError: "Save error: ",
      saveOk: "Saved — the bridge has hot-reloaded",
      discard: "Discard",
      unsaved: "Unsaved",
      advancedHint: "Advanced options (DSH endpoints, state file, timeouts) are configured via env or patch config."
    };

    function requestConfig(method, body) {
      return fetch(CONFIG_PATH, {
        method: method,
        headers: { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body)
      }).then(function (res) {
        return res.json().catch(function () { return { ok: false, error: "bad response" }; });
      });
    }

    var cardStyle = {
      border: "1px solid var(--dsw-alias-border-l2)",
      background: "var(--dsw-alias-bg-layer-3)",
      borderRadius: 12,
      listStyle: "none"
    };
    var cardOpenStyle = {
      background: "var(--dsw-alias-bg-layer-2)",
      borderColor: "var(--dsw-alias-label-dimmed)"
    };
    var headerStyle = {
      appearance: "none",
      width: "100%",
      font: "inherit",
      color: "inherit",
      textAlign: "left",
      cursor: "pointer",
      background: "0 0",
      border: 0,
      borderRadius: 12,
      alignItems: "center",
      gap: 12,
      padding: "14px 16px",
      display: "flex"
    };
    var headTextStyle = { flexDirection: "column", flex: 1, gap: 4, minWidth: 0, display: "flex" };
    var nameStyle = { color: "var(--dsw-alias-label-primary)", fontSize: 15, fontWeight: 600, lineHeight: 1.4 };
    var descStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: 13, lineHeight: 1.5 };
    var chevronStyle = { color: "var(--dsw-alias-label-tertiary)", flex: "none", transition: "transform .16s" };
    var chevronOpenStyle = { transform: "rotate(180deg)" };
    var bodyStyle = {
      borderTop: "1px solid var(--dsw-alias-border-l2)",
      margin: "0 16px",
      padding: "12px 0 8px",
      display: "flex",
      flexDirection: "column",
      gap: 10
    };
    var rowStyle = { display: "flex", flexDirection: "column", gap: 4 };
    var labelStyle = { fontSize: 12, fontWeight: 600, color: "var(--dsw-alias-label-secondary)" };
    var inputStyle = {
      padding: "6px 8px",
      border: "1px solid var(--dsw-alias-border-l2)",
      borderRadius: 6,
      background: "var(--dsw-alias-bg-layer-1)",
      color: "var(--dsw-alias-label-primary)",
      font: "inherit"
    };
    var footerStyle = {
      borderTop: "1px solid var(--dsw-alias-border-l2)",
      justifyContent: "flex-end",
      alignItems: "center",
      gap: 8,
      padding: "12px 0 4px",
      display: "flex"
    };
    var failedStyle = { minWidth: 0, color: "var(--dsw-alias-label-error)", flex: 1, margin: 0, fontSize: 12, lineHeight: 1.5 };
    var statusStyle = { color: "var(--dsw-alias-label-tertiary)", fontSize: 12, lineHeight: 1.5, margin: 0 };
    var pendingStyle = {
      whiteSpace: "nowrap",
      background: "var(--dsw-alias-bg-module-platform)",
      color: "var(--dsw-alias-label-secondary)",
      borderRadius: 999,
      flex: "none",
      padding: "1px 8px",
      fontSize: 11,
      fontWeight: 500,
      lineHeight: "17px"
    };
    var buttonBase = {
      appearance: "none",
      font: "inherit",
      cursor: "pointer",
      border: "1px solid transparent",
      borderRadius: 8,
      padding: "5px 14px",
      fontSize: 13,
      lineHeight: 1.5
    };
    var discardStyle = Object.assign({}, buttonBase, {
      borderColor: "var(--dsw-alias-border-l2)",
      color: "var(--dsw-alias-label-secondary)",
      background: "0 0"
    });
    var saveStyle = Object.assign({}, buttonBase, {
      background: "var(--dsw-alias-label-primary)",
      color: "var(--dsw-alias-bg-layer-3)"
    });
    var disabledStyle = { opacity: 0.4, cursor: "default" };

    // The card re-renders on locale changes through the injected translate
    // function's re-render trigger: the shell bumps the ledger when the
    // language switches, and the section owner re-renders entries.
    function TgBridgeCard(props) {
      var t = props.t;
      var state = React.useState(false);
      var open = state[0];
      var setOpen = state[1];
      var vstate = React.useState(null);
      var values = vstate[0];
      var setValues = vstate[1];
      var dstate = React.useState(false);
      var dirty = dstate[0];
      var setDirty = dstate[1];
      var sstate = React.useState(false);
      var saving = sstate[0];
      var setSaving = sstate[1];
      var fstate = React.useState("");
      var failed = fstate[0];
      var setFailed = fstate[1];
      var wstate = React.useState(true);
      var writable = wstate[0];
      var setWritable = wstate[1];
      var okstate = React.useState("");
      var savedOk = okstate[0];
      var setSavedOk = okstate[1];

      var load = React.useCallback(function () {
        requestConfig("GET").then(function (res) {
          if (res.ok) {
            setValues(res.value || {});
            setWritable(res.writable !== false);
            setFailed("");
          } else {
            setValues({});
            setFailed(t("readFailed") + res.error);
          }
        }).catch(function (e) {
          setValues({});
          setFailed(t("readError") + String(e && e.message ? e.message : e));
        });
      }, []);

      React.useEffect(function () {
        if (open && values === null) load();
      }, [open, values, load]);

      function setField(key) {
        return function (e) {
          var raw = e.target.value;
          setValues(function (prev) {
            var next = Object.assign({}, prev || {});
            var field = null;
            for (var i = 0; i < FIELDS.length; i++) if (FIELDS[i].key === key) field = FIELDS[i];
            if (field && field.type === "number") {
              next[key] = raw === "" ? undefined : Number(raw);
            } else if (field && (field.type === "chatlines" || field.type === "chatids")) {
              // Keep the raw text as typed. Parsing on every keystroke would
              // format it back and swallow the trailing newline, making the
              // textarea appear unable to break lines. Conversion to the
              // structured array happens once, on save.
              next[key] = raw;
            } else if (field && field.type === "checkbox") {
              next[key] = e.target.checked;
            } else if (field && field.type === "password") {
              if (raw === "") delete next[key];
              else next[key] = raw;
            } else {
              next[key] = raw;
            }
            return next;
          });
          setDirty(true);
          setFailed("");
          setSavedOk("");
        };
      }

      function save() {
        if (!values) return;
        setSaving(true);
        setFailed("");
        setSavedOk("");
        // Build the patch: skip the redacted token marker (keep stored token)
        // and skip empty values, so an untouched password never overwrites.
        // Chat-list fields are parsed from their raw text here (the state keeps
        // the text as typed so multi-line editing works).
        var patch = {};
        for (var i = 0; i < FIELDS.length; i++) {
          var field = FIELDS[i];
          var v = values[field.key];
          if (v === undefined || v === "" || v === "••••••••") continue;
          if (field.type === "chatlines") {
            var users = parseChatLines(v);
            if (users.length) patch[field.key] = users;
            continue;
          }
          if (field.type === "chatids") {
            var ids = parseIdLines(v);
            if (ids.length) patch[field.key] = ids;
            continue;
          }
          patch[field.key] = v;
        }
        requestConfig("POST", { patch: patch }).then(function (res) {
          if (res.ok) {
            setDirty(false);
            setValues(Object.assign({}, values));
            setSavedOk(t("saveOk"));
          } else {
            setFailed(t("saveFailed") + res.error);
          }
        }).catch(function (e) {
          setFailed(t("saveError") + String(e && e.message ? e.message : e));
        }).then(function () {
          setSaving(false);
        });
      }

      function discard() {
        setValues(null);
        setDirty(false);
        setFailed("");
        setSavedOk("");
        load();
      }

      var blocked = !dirty || saving;
      var style = open ? Object.assign({}, cardStyle, cardOpenStyle) : cardStyle;

      var rows = null;
      if (values !== null) {
        rows = FIELDS.map(function (field) {
          var current = values[field.key];
          var isPassword = field.type === "password";
          var label = t(field.labelKey) + (isPassword && current ? t("tokenSet") : "");
          if (field.type === "chatlines" || field.type === "chatids") {
            // While editing, current is the raw text; right after load it is
            // the structured value from the server, so format it for display.
            var text = typeof current === "string"
              ? current
              : (field.type === "chatlines" ? formatChatLines(current) : formatIdLines(current));
            return React.createElement("div", { style: rowStyle, key: field.key },
              React.createElement("label", { htmlFor: "tg-" + field.key, style: labelStyle }, label),
              React.createElement("textarea", {
                id: "tg-" + field.key,
                style: Object.assign({}, inputStyle, { minHeight: 58, resize: "vertical", fontFamily: "monospace", whiteSpace: "pre" }),
                rows: 2,
                value: text,
                placeholder: field.placeholderKey ? t(field.placeholderKey) : "",
                onChange: setField(field.key)
              })
            );
          }
          if (field.type === "checkbox") {
            return React.createElement("div", { style: rowStyle, key: field.key },
              React.createElement("label", {
                htmlFor: "tg-" + field.key,
                style: Object.assign({}, labelStyle, { display: "flex", alignItems: "center", gap: 8, cursor: "pointer" })
              },
                React.createElement("input", {
                  id: "tg-" + field.key,
                  type: "checkbox",
                  checked: current !== false,
                  onChange: setField(field.key)
                }),
                t(field.labelKey)
              )
            );
          }
          return React.createElement("div", { style: rowStyle, key: field.key },
            React.createElement("label", { htmlFor: "tg-" + field.key, style: labelStyle }, label),
            React.createElement("input", {
              id: "tg-" + field.key,
              type: field.type === "password" ? "password" : (field.type === "number" ? "number" : "text"),
              style: inputStyle,
              value: isPassword ? "" : (current === undefined ? "" : String(current)),
              placeholder: isPassword ? (current ? t("placeholderTokenSet") : t("placeholderToken")) : "",
              onChange: setField(field.key)
            })
          );
        });
      }

      return React.createElement("li", { style: style },
        React.createElement("button", {
          type: "button",
          style: headerStyle,
          "aria-expanded": open,
          onClick: function () { setOpen(!open); }
        },
          React.createElement("span", { style: headTextStyle },
            React.createElement("span", { style: nameStyle }, t("title")),
            React.createElement("span", { style: descStyle }, t("description"))
          ),
          dirty ? React.createElement("span", { style: pendingStyle }, t("unsaved")) : null,
          React.createElement("span", { style: open ? Object.assign({}, chevronStyle, chevronOpenStyle) : chevronStyle }, "▾")
        ),
        open ? React.createElement("div", { style: bodyStyle },
          !writable ? React.createElement("p", { style: statusStyle, role: "status" }, t("readOnly")) : null,
          values === null ? React.createElement("p", { style: statusStyle }, t("loading")) : rows,
          React.createElement("p", { style: statusStyle }, t("advancedHint")),
          React.createElement("div", { style: footerStyle },
            savedOk ? React.createElement("p", { style: statusStyle, role: "status" }, savedOk) : null,
            failed ? React.createElement("p", { style: failedStyle, role: "status" }, failed) : null,
            React.createElement("button", {
              type: "button",
              style: Object.assign({}, discardStyle, (!dirty || saving) ? disabledStyle : {}),
              disabled: !dirty || saving,
              onClick: discard
            }, t("discard")),
            React.createElement("button", {
              type: "button",
              style: Object.assign({}, saveStyle, blocked ? disabledStyle : {}),
              disabled: blocked,
              onClick: save
            }, saving ? t("saving") : t("save"))
          )
        ) : null
      );
    }

    function apply(ctx) {
      var slots = ctx.get("slots");
      if (slots === undefined) return;
      var locale = ctx.get("locale");
      if (locale !== undefined) {
        ctx.effect(function () {
          return locale.register(NS, { zh: zh, en: en });
        }, "tg-bridge: card dictionaries");
      }
      var t = locale !== undefined ? locale.bind(NS) : function (key) {
        return zh[key] !== undefined ? zh[key] : key;
      };
      slots.inject("settings.plugin.item", function () {
        return slots.register(
          {
            name: "settings.plugin.item",
            id: "tg-bridge",
            order: 30,
            locale: NS,
            label: function () { return t("title"); }
          },
          function (props) { return React.createElement(TgBridgeCard, Object.assign({}, props, { t: t })); }
        );
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
