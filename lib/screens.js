// Screen status: each board sends a small signal ("ping") every few minutes, and admin reads
// the list. All screens share one KV value. Cloudflare's free plan allows ~1,000 KV writes a
// day, so the value is written at most once per MIN_WRITE_GAP_MS whatever arrives (at most
// ~480 writes a day), which keeps room for admin saves even if someone floods the endpoint.
export const SCREENS_KEY = "screens";
export const MIN_WRITE_GAP_MS = 3 * 60 * 1000;
export const MAX_SCREENS = 5;
export const FORGET_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // screens silent for a week drop off

const str = (v, max) => (typeof v === "string" ? v.slice(0, max) : "");
const int = (v) => (Number.isFinite(+v) ? Math.max(0, Math.min(20000, Math.round(+v))) : 0);

export async function readScreens(env) {
  try {
    const d = JSON.parse((await env.VAKTIJA.get(SCREENS_KEY)) || "{}");
    return { writtenAt: +d.writtenAt || 0, screens: d.screens && typeof d.screens === "object" ? d.screens : {} };
  } catch { return { writtenAt: 0, screens: {} }; }
}

// Records a ping. Returns false when it was skipped (written too recently, or a bad id).
export async function recordPing(env, body, now = Date.now()) {
  const id = typeof body?.id === "string" && /^[a-z0-9]{8,24}$/.test(body.id) ? body.id : null;
  if (!id) return false;
  const data = await readScreens(env);
  if (now - data.writtenAt < MIN_WRITE_GAP_MS) return false;
  const screens = {};
  for (const [k, s] of Object.entries(data.screens)) {
    if (s && now - Date.parse(s.at) < FORGET_AFTER_MS) screens[k] = s;
  }
  screens[id] = {
    at: new Date(now).toISOString(),
    first: screens[id]?.first || new Date(now).toISOString(),
    version: str(body.version, 40),   // updatedAt of the settings the screen is showing
    since: str(body.since, 40),       // when the board page was last loaded
    layout: str(body.layout, 16),     // horizontalno | vertikalno | rotirano
    w: int(body.w), h: int(body.h),
    device: str(body.device, 40),     // e.g. "Android TV · Chrome"
  };
  // keep the most recently seen screens
  const kept = Object.entries(screens).sort((a, b) => Date.parse(b[1].at) - Date.parse(a[1].at)).slice(0, MAX_SCREENS);
  await env.VAKTIJA.put(SCREENS_KEY, JSON.stringify({ writtenAt: now, screens: Object.fromEntries(kept) }));
  return true;
}
