// GET /api/screens -> screens that have reported in, and whether the offline alert is connected
//                     (requires header x-admin-pin)
import { json, checkPin } from "../../lib/auth.js";
import { readScreens } from "../../lib/screens.js";

export async function onRequestGet({ request, env }) {
  const denied = await checkPin(request, env, request.headers.get("x-admin-pin"));
  if (denied) return denied;
  const { screens } = await readScreens(env);
  // set by the offline-alert worker on its first run, so admin can show that alerts are connected
  let alertsSince = "";
  try { alertsSince = JSON.parse((await env.VAKTIJA.get("alert-state")) || "{}").startedAt || ""; } catch {}
  return json({ now: new Date().toISOString(), screens, alertsSince });
}
