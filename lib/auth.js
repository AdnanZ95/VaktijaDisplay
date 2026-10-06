// Shared helpers for the Pages Functions.

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

// Compares two strings without leaking timing information.
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const MAX_FAILS = 10;        // wrong PINs allowed per address...
const BLOCK_SECONDS = 900;   // ...within 15 minutes

function failKey(request) {
  return "fails:" + (request.headers.get("cf-connecting-ip") || "unknown");
}

// Returns null when the PIN is accepted, otherwise a Response to send back.
export async function checkPin(request, env, pin) {
  if (!env.ADMIN_PIN) return json({ error: "ADMIN_PIN is not configured" }, 500);
  const key = failKey(request);
  const fails = parseInt((await env.VAKTIJA.get(key)) || "0", 10);
  if (fails >= MAX_FAILS) return json({ error: "too many attempts" }, 429);
  if (typeof pin === "string" && safeEqual(pin, String(env.ADMIN_PIN))) {
    if (fails) await env.VAKTIJA.delete(key);
    return null;
  }
  await env.VAKTIJA.put(key, String(fails + 1), { expirationTtl: BLOCK_SECONDS });
  return json({ error: "wrong pin" }, 401);
}
