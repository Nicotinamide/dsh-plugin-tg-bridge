// Minimal Telegram Bot API client. The API base is configurable so a proxy
// (where api.telegram.org is blocked) can be used.

export function createTelegramClient({ tgApiBase, botToken, timeoutMs = 30000 }) {
  const base = `${tgApiBase}/bot${botToken}`;

  async function call(method, params = {}) {
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(`tg ${method}: ${j.description ?? JSON.stringify(j)}`);
    return j.result;
  }

  return { call, base };
}
