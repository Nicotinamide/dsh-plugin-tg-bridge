// Telegram MarkdownV2 formatting for agent replies.
//
// Telegram has no markdown tables, headers, or hyphen bullets, and its
// MarkdownV2 parser rejects any unescaped reserved character. This module
// converts GFM-ish markdown into valid MarkdownV2: fenced code blocks and
// tables become monospace code blocks, headers become bold, lists become
// bullets, and every reserved character is escaped outside of code spans.
// The escape set mirrors Telegram's MarkdownV2 reserved characters plus the
// backslash.

const MDV2_SPECIAL = /([_*[\]()~`>#+\-=|{}.!\\])/g;
const UNESCAPE = /\\([_*[\]()~`>#+\-=|{}.!\\])/g;

export function escMarkdownV2(s) {
  return s.replace(MDV2_SPECIAL, "\\$1");
}

// Escape everything, then restore the constructs Telegram can render:
// **bold**, *italic*, and [text](url).
function plainToTg(s) {
  let out = s.replace(MDV2_SPECIAL, "\\$1");
  out = out.replace(/\\\*\\\*([^*]+?)\\\*\\\*/g, "**$1**");
  out = out.replace(/(^|[^\\])\\\*([^*\\]+?)\\\*/g, "$1*$2*");
  out = out.replace(/\\\[([^\]\\]+?)\\\]\(\\\(([^)\\]+?)\\\)/g, "[$1]($2)");
  return out;
}

// Inline markdown: protect `code` spans, convert the rest.
function inlineToTg(s) {
  const tokens = [];
  const codeRe = /(`+)([\s\S]*?)\1/g;
  let last = 0, m;
  while ((m = codeRe.exec(s))) {
    tokens.push({ t: "plain", s: s.slice(last, m.index) });
    tokens.push({ t: "code", s: m[2] });
    last = m.index + m[0].length;
  }
  tokens.push({ t: "plain", s: s.slice(last) });
  let out = "";
  for (const tk of tokens) {
    if (tk.t === "code") out += "`" + tk.s.replace(/\\/g, "\\\\").replace(/`/g, "\\`") + "`";
    else out += plainToTg(tk.s);
  }
  return out;
}

function isTableRow(line) {
  const t = line.trim();
  return t.startsWith("|") && t.endsWith("|") && t.length > 2;
}

function isTableSep(line) {
  return /^\s*\|?[\s:|-]+\|?\s*$/.test(line) && /-/.test(line);
}

// Markdown table block -> monospace code block with padded columns.
function tableToPre(rows) {
  const parsed = rows.map((r) => {
    let s = r.trim();
    if (s.startsWith("|")) s = s.slice(1);
    if (s.endsWith("|")) s = s.slice(0, -1);
    return s.split("|").map((c) => c.trim());
  });
  const nCols = Math.max(1, ...parsed.map((r) => r.length));
  const widths = [];
  for (let c = 0; c < nCols; c++) widths[c] = Math.max(3, ...parsed.map((r) => (r[c] ?? "").length));
  const fmt = (cells) => "| " + cells.map((c, i) => (c ?? "").padEnd(widths[i])).join(" | ") + " |";
  const lines = parsed.map((r) =>
    r.every((c) => /^:?-+:?$/.test(c)) ? "| " + widths.map((w) => "-".repeat(w)).join(" | ") + " |" : fmt(r));
  return "```\n" + lines.join("\n") + "\n```";
}

// Whole-message conversion: fenced blocks, tables, headers, lists, inline.
export function formatForTelegram(text) {
  const lines = text.split("\n");
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {                        // fenced code block
      const buf = [line.replace(/^(\s*)```.*$/, "$1```")];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) {
        buf.push(lines[i].replace(/\\/g, "\\\\").replace(/`/g, "\\`"));
        i++;
      }
      if (i < lines.length) buf.push(lines[i].replace(/^(\s*)```.*$/, "$1```"));
      i++;
      out.push(buf.join("\n"));
      continue;
    }
    if (isTableRow(line) && i + 1 < lines.length && isTableSep(lines[i + 1])) {  // table block
      const rows = [line];
      i++; rows.push(lines[i]); i++;
      while (i < lines.length && isTableRow(lines[i])) { rows.push(lines[i]); i++; }
      out.push(tableToPre(rows));
      continue;
    }
    let m = line.match(/^\s*(#{1,6})\s+(.*)$/);        // headers -> bold
    if (m) { out.push("*" + escMarkdownV2(m[2]) + "*"); i++; continue; }
    if (/^\s*([-*_])\1{2,}\s*$/.test(line)) { out.push("―".repeat(24)); i++; continue; }  // hr
    m = line.match(/^\s*[-*+]\s+(.*)$/);               // bullets
    if (m) { out.push("• " + inlineToTg(m[1])); i++; continue; }
    m = line.match(/^\s*(\d+)[.)]\s+(.*)$/);           // numbered list
    if (m) { out.push(escMarkdownV2(m[1]) + "\\. " + inlineToTg(m[2])); i++; continue; }
    out.push(inlineToTg(line));
    i++;
  }
  return out.join("\n");
}

// Strip the escaping added above (used as the plain-text fallback when
// Telegram rejects a MarkdownV2 payload for an unexpected reason).
export function unescapeMarkdownV2(s) {
  return s.replace(UNESCAPE, "$1");
}
