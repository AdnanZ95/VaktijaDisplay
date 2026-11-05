// Vaktija — offline alert. A small Cloudflare Worker that runs every 10 minutes, reads the
// screen reports the board sends (see lib/screens.js) and sends a push notification through
// ntfy (https://ntfy.sh) when a screen stops reporting, and again when it is back.
//
// One file, no build step: paste it into the Cloudflare Worker editor. Setup is in README.md
// ("Offline alert"). Needs:
//   VAKTIJA     KV binding, the same namespace the Pages project uses (vaktija-settings)
//   NTFY_TOPIC  secret, the private topic name you subscribe to in the ntfy app
//   ADMIN_URL   optional, link opened when tapping a notification
//   NTFY_SERVER optional, defaults to https://ntfy.sh
// Cron trigger: */10 * * * *
//
// Settings from admin (settings.alerts): on, afterMin, quietFrom, quietTo ("HH:MM" or "").
// KV writes happen only when something changes (an alert or "back online" is sent).

const STATE_KEY = "alert-state";
const TZ = "Europe/Sarajevo";

const pad = (n) => String(n).padStart(2, "0");
function localParts(ms) {
  const f = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit", day: "numeric", month: "numeric", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return { min: +p.hour * 60 + +p.minute, hhmm: `${p.hour}:${p.minute}`, day: `${p.day}.${p.month}.` };
}
const toMin = (s) => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ""); return m ? +m[1] * 60 + +m[2] : null; };
// quiet hours may run past midnight (e.g. 23:00–05:00)
export function inQuiet(alerts, ms) {
  const a = toMin(alerts.quietFrom), b = toMin(alerts.quietTo);
  if (a === null || b === null || a === b) return false;
  const m = localParts(ms).min;
  return a < b ? m >= a && m < b : m >= a || m < b;
}
function duration(ms) {
  const m = Math.max(1, Math.round(ms / 60000));
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`;
}
export function alertSettings(settings) {
  const a = (settings && typeof settings.alerts === "object" && settings.alerts) || {};
  return { on: a.on !== false, afterMin: Math.max(10, +a.afterMin || 30), quietFrom: a.quietFrom || "", quietTo: a.quietTo || "" };
}

// Pure decision: what to send now, and the new state. state = {startedAt, offline: {id: true}}
export function decide(prevState, screens, settings, now) {
  const alerts = alertSettings(settings), name = ((settings && settings.masjidName) || "").trim();
  const prefix = name ? `${name}: ` : "";
  const list = Object.entries(screens || {}).filter(([, s]) => s && Date.parse(s.at))
    .sort((a, b) => Date.parse(a[1].first || a[1].at) - Date.parse(b[1].first || b[1].at));
  const label = (i) => (list.length > 1 ? `Ekran ${i + 1}` : "Ekran");
  const state = { startedAt: prevState?.startedAt || "", offline: { ...(prevState?.offline || {}) } };
  const messages = [];
  const quiet = inQuiet(alerts, now);
  const isOff = (s) => now - Date.parse(s.at) > alerts.afterMin * 60000;

  // forget screens that are no longer reported
  for (const id of Object.keys(state.offline)) if (!list.some(([k]) => k === id)) delete state.offline[id];

  if (!state.startedAt) {
    state.startedAt = new Date(now).toISOString();
    const status = !list.length ? "Ekran se još nije javio."
      : list.map(([, s], i) => `${label(i)}: ${isOff(s) ? `ne javlja se od ${localParts(Date.parse(s.at)).hhmm}` : "uživo"}`).join("\n");
    messages.push({ title: `${prefix}obavještenja su uključena`, message: `Javit ću se ako se ekran ne javi duže od ${alerts.afterMin} min.\n${status}`, priority: 3, tags: ["bell"] });
    for (const [id, s] of list) if (isOff(s)) state.offline[id] = true; // already known, don't alert again
    return { messages, state };
  }

  list.forEach(([id, s], i) => {
    const at = Date.parse(s.at), was = !!state.offline[id];
    if (isOff(s) && !was) {
      if (!alerts.on || quiet) return; // not marked, so it alerts once allowed (if still off)
      state.offline[id] = true;
      const p = localParts(at), today = localParts(now).day === p.day;
      messages.push({ title: `${prefix}${label(i).toLowerCase()} se ne javlja`,
        message: `Zadnji put se javio ${today ? "" : p.day + " "}u ${p.hhmm} (prije ${duration(now - at)}). Provjerite da li su TV i internet u džamiji uključeni.`,
        priority: 4, tags: ["warning"] });
    } else if (!isOff(s) && was) {
      delete state.offline[id];
      if (!alerts.on) return;
      messages.push({ title: `${prefix}${label(i).toLowerCase()} je ponovo uključen`,
        message: `Javio se u ${localParts(at).hhmm}.`, priority: quiet ? 2 : 3, tags: ["white_check_mark"] });
    }
  });
  return { messages, state };
}

async function readJson(env, key) {
  try { return JSON.parse((await env.VAKTIJA.get(key)) || "null"); } catch { return null; }
}

export async function runCheck(env, now = Date.now(), send = fetch) {
  if (!env.NTFY_TOPIC) return { error: "NTFY_TOPIC is not set" };
  const [settings, screensData, prev] = await Promise.all([readJson(env, "settings"), readJson(env, "screens"), readJson(env, STATE_KEY)]);
  const { messages, state } = decide(prev, screensData && screensData.screens, settings, now);
  const server = (env.NTFY_SERVER || "https://ntfy.sh").replace(/\/$/, "");
  for (const m of messages) {
    const r = await send(server, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ topic: env.NTFY_TOPIC, ...m, ...(env.ADMIN_URL ? { click: env.ADMIN_URL } : {}) }) });
    if (!r.ok) return { error: `ntfy ${r.status}`, sent: messages.indexOf(m) }; // state unchanged: retried next run
  }
  if (JSON.stringify(state) !== JSON.stringify(prev)) await env.VAKTIJA.put(STATE_KEY, JSON.stringify(state));
  return { sent: messages.length };
}

export default {
  async scheduled(event, env, ctx) { ctx.waitUntil(runCheck(env)); },
  // opening the worker's address shows whether it is set up (it never sends anything from here)
  async fetch(request, env) {
    const ok = !!env.NTFY_TOPIC && !!env.VAKTIJA;
    return new Response(ok ? "Vaktija obavještenja: podešeno. Provjera se radi svakih 10 minuta."
      : `Vaktija obavještenja: nedostaje ${!env.VAKTIJA ? "KV veza VAKTIJA" : "tajna NTFY_TOPIC"}.`,
      { headers: { "content-type": "text/plain; charset=utf-8" } });
  },
};
