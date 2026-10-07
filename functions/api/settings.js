// GET  /api/settings  -> current board settings (public; the TV reads this)
// PUT  /api/settings  -> replace settings (requires header x-admin-pin). With header
//                        x-base-version (the updatedAt the editor started from), the save is
//                        refused with 409 if someone else has saved since.
import { json, checkPin } from "../../lib/auth.js";

const KEY = "settings";
const MAX_BYTES = 200 * 1024;

// updatedAt of the stored settings ("" when there are none, or they were never saved from admin)
async function currentVersion(env) {
  try { return JSON.parse((await env.VAKTIJA.get(KEY)) || "{}").updatedAt || ""; } catch { return ""; }
}

export async function onRequestGet({ env }) {
  const value = await env.VAKTIJA.get(KEY);
  return new Response(value || "{}", {
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequestPut({ request, env }) {
  const denied = await checkPin(request, env, request.headers.get("x-admin-pin"));
  if (denied) return denied;
  const text = await request.text();
  if (text.length > MAX_BYTES) return json({ error: "too large" }, 413);
  let data;
  try { data = JSON.parse(text); } catch { return json({ error: "invalid json" }, 400); }
  if (!data || typeof data !== "object" || Array.isArray(data)) return json({ error: "invalid settings" }, 400);
  const base = request.headers.get("x-base-version");
  if (base !== null){
    const current = await currentVersion(env);
    if (current !== base) return json({ error: "conflict", updatedAt: current }, 409);
  }
  data.updatedAt = new Date().toISOString();
  await env.VAKTIJA.put(KEY, JSON.stringify(data));
  return json({ ok: true, updatedAt: data.updatedAt });
}
