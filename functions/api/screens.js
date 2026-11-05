// GET /api/screens -> screens that have reported in (requires header x-admin-pin)
import { json, checkPin } from "../../lib/auth.js";
import { readScreens } from "../../lib/screens.js";

export async function onRequestGet({ request, env }) {
  const denied = await checkPin(request, env, request.headers.get("x-admin-pin"));
  if (denied) return denied;
  const { screens } = await readScreens(env);
  return json({ now: new Date().toISOString(), screens });
}
