// POST /api/ping {id, version, since, layout, w, h} -> the board reports that it is running.
// Public (the TV has no PIN); writes are throttled in lib/screens.js.
import { json } from "../../lib/auth.js";
import { recordPing } from "../../lib/screens.js";

export async function onRequestPost({ request, env }) {
  const text = await request.text();
  if (text.length > 2048) return json({ error: "too large" }, 413);
  let body = {};
  try { body = JSON.parse(text); } catch {}
  const recorded = await recordPing(env, body);
  return json({ ok: true, recorded });
}
