// POST /api/login {pin} -> 200 if the PIN is correct, 401 if not, 429 after too many attempts
import { json, checkPin } from "../../lib/auth.js";

export async function onRequestPost({ request, env }) {
  let body = {};
  try { body = await request.json(); } catch {}
  const denied = await checkPin(request, env, body.pin);
  if (denied) return denied;
  return json({ ok: true });
}
