// Minimal Telegram Bot API client. The API base is configurable so a proxy
// (where api.telegram.org is blocked) can be used.

export function createTelegramClient({ tgApiBase, botToken, timeoutMs = 30000 }) {
  const base = `${tgApiBase}/bot${botToken}`;

  async function call(method, params = {}, opts = {}) {
    // opts.signal lets the caller abort a long-poll early (e.g. bridge.stop()
    // tearing down the poller before a hot rebuild starts a new one, avoiding
    // Telegram's one-poller-per-token 409 Conflict).
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = opts.signal ? AbortSignal.any([timeout, opts.signal]) : timeout;
    const res = await fetch(`${base}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
      signal,
    });
    const j = await res.json();
    if (!j.ok) throw new Error(`tg ${method}: ${j.description ?? JSON.stringify(j)}`);
    return j.result;
  }

  return { call, base };
}
