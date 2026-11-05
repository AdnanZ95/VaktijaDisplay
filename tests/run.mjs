// Tests for the prayer-time rules in public/shared.js. No installs needed:
//   node tests/run.mjs
// Runs in the masjid's time zone, the same as the TV.
process.env.TZ = "Europe/Sarajevo";

import { readFileSync } from "node:fs";
import vm from "node:vm";

const code = readFileSync(new URL("../public/shared.js", import.meta.url), "utf8");
const ctx = { console, Intl };
vm.createContext(ctx);
vm.runInContext(code + "\n;this.S = {normalize, dayTimes, prayerName, euDst, noteActive, hijri, colorWarnings, minToHHMM, DEFAULTS, NAMES};", ctx);
const S = ctx.S;

let passed = 0, failed = 0;
function test(name, fn){
  try{ fn(); passed++; }
  catch(e){ failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
function eq(actual, expected, what = ""){
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if (a !== b) throw new Error(`${what} expected ${b}, got ${a}`);
}
const day = (y, m, d) => new Date(y, m - 1, d);
const shown = (cfg, date) => { const t = S.dayTimes(date, cfg); return Object.fromEntries(Object.keys(t).map(k => [k, S.minToHHMM(t[k].min)])); };
const cfg = (extra = {}) => S.normalize(Object.assign({city:"Mostar", cityIndex:61}, extra));

/* ---------- official takvim ---------- */
test("Mostar, 5 Nov 2026 (winter time) matches the official takvim", () => {
  eq(shown(cfg({jumuah:{on:false}}), day(2026, 11, 5)),
    {fajr:"04:54", sunrise:"06:25", dhuhr:"11:33", asr:"14:09", maghrib:"16:40", isha:"18:00"});
});
test("summer dates are shifted by an hour", () => {
  eq(shown(cfg({jumuah:{on:false}}), day(2026, 7, 3)).dhuhr, "12:53");
});
test("times are marked as official", () => {
  eq(S.dayTimes(day(2026, 11, 5), cfg()).dhuhr.official, true);
});

/* ---------- summer / winter time ---------- */
test("EU summer time starts on the last Sunday of March and ends on the last Sunday of October", () => {
  eq([S.euDst(2027, 2, 27), S.euDst(2027, 2, 28), S.euDst(2026, 9, 24), S.euDst(2026, 9, 25)], [false, true, true, false]);
});
for (const [y, m, d] of [[2027, 3, 28], [2026, 10, 25]]){
  test(`on the clock-change day ${y}-${m}-${d} the countdown targets match the shown times`, () => {
    const t = S.dayTimes(day(y, m, d), cfg());
    for (const k of Object.keys(t)){
      const at = t[k].date, clock = String(at.getHours()).padStart(2, "0") + ":" + String(at.getMinutes()).padStart(2, "0");
      eq(clock, S.minToHHMM(t[k].min), k);
    }
  });
}

/* ---------- Džuma ---------- */
test("Friday in winter: Džuma at 12:00", () => {
  const c = cfg(), t = S.dayTimes(day(2026, 11, 6), c);
  eq([S.minToHHMM(t.dhuhr.min), t.dhuhr.jumuah, S.prayerName("dhuhr", day(2026, 11, 6), c).bs], ["12:00", true, "Džuma"]);
});
test("Friday in summer: Džuma at 13:00", () => {
  eq(shown(cfg(), day(2026, 7, 3)).dhuhr, "13:00");
});
test("Fridays around the March clock change: 12:00 then 13:00", () => {
  eq([shown(cfg(), day(2027, 3, 26)).dhuhr, shown(cfg(), day(2027, 4, 2)).dhuhr], ["12:00", "13:00"]);
});
test("switched off: Friday is an ordinary day", () => {
  const c = cfg({jumuah:{on:false}});
  eq([shown(c, day(2026, 11, 6)).dhuhr, S.prayerName("dhuhr", day(2026, 11, 6), c).bs], ["11:33", "Podne"]);
});
test("Thursday is not affected", () => {
  eq([shown(cfg(), day(2026, 11, 5)).dhuhr, S.prayerName("dhuhr", day(2026, 11, 5), cfg()).bs], ["11:33", "Podne"]);
});
test("on Friday the podne offset is not applied", () => {
  eq(shown(cfg({offsets:{dhuhr:5}}), day(2026, 11, 6)).dhuhr, "12:00");
});
test("a manual time for that Friday wins", () => {
  eq(shown(cfg({overrides:{"2026-11-06":{dhuhr:"12:15"}}}), day(2026, 11, 6)).dhuhr, "12:15");
});
test("other prayers on Friday are unchanged", () => {
  const a = shown(cfg(), day(2026, 11, 6)), b = shown(cfg({jumuah:{on:false}}), day(2026, 11, 6));
  for (const k of ["fajr", "sunrise", "asr", "maghrib", "isha"]) eq(a[k], b[k], k);
});

/* ---------- offsets and manual times ---------- */
test("an offset moves the time every day", () => {
  eq([shown(cfg({offsets:{asr:3}}), day(2026, 11, 5)).asr, shown(cfg({offsets:{asr:-2}}), day(2026, 11, 7)).asr], ["14:12", "14:05"]);
});
test("a manual time applies only on its own date", () => {
  const c = cfg({overrides:{"2026-11-05":{isha:"18:30"}}});
  eq([shown(c, day(2026, 11, 5)).isha, S.dayTimes(day(2026, 11, 5), c).isha.manual, shown(c, day(2026, 11, 4)).isha], ["18:30", true, "18:01"]);
});

/* ---------- astronomical calculation ---------- */
test("calculated times are close to the official ones", () => {
  const off = S.dayTimes(day(2026, 11, 5), cfg()), calc = S.dayTimes(day(2026, 11, 5), cfg({source:"calc"}));
  eq(calc.dhuhr.official, false);
  for (const k of ["sunrise", "dhuhr", "maghrib"]) if (Math.abs(off[k].raw - calc[k].raw) > 10) throw new Error(`${k} differs by ${off[k].raw - calc[k].raw} min`);
});

/* ---------- scheduled notes ---------- */
test("notes follow their dates and weekdays", () => {
  const thu = day(2026, 11, 5), n = (o) => S.noteActive(Object.assign({text:"x", from:"", to:"", days:[]}, o), thu);
  eq([n({}), n({text:"  "}), n({from:"2026-11-06"}), n({to:"2026-11-04"}), n({from:"2026-11-05", to:"2026-11-05"}), n({days:[4]}), n({days:[5]})],
     [true, false, false, false, true, true, false]);
});

/* ---------- settings ---------- */
test("empty or broken settings fall back to the defaults", () => {
  eq(S.normalize(null), S.DEFAULTS); eq(S.normalize("x"), S.DEFAULTS); eq(S.normalize([1]), S.DEFAULTS);
});
test("grouped settings are merged key by key", () => {
  const c = S.normalize({night:{on:true}, offsets:{asr:2}});
  eq([c.night.on, c.night.level, c.offsets.asr, c.offsets.fajr], [true, 70, 2, 0]);
});
test("wrong types are ignored instead of breaking the board", () => {
  const c = S.normalize({offsets:"abc", notes:{}, overrides:[], colors:{main:"red", secondary:"#123456"}});
  eq([c.offsets, c.notes, c.overrides, c.colors], [S.DEFAULTS.offsets, [], {}, {main:S.DEFAULTS.colors.main, secondary:"#123456"}]);
});
test("old settings without the džuma switch get it switched on", () => {
  eq(S.normalize({city:"Mostar"}).jumuah.on, true);
});

/* ---------- dates and colors ---------- */
test("hijri date is available", () => {
  const h = S.hijri(day(2026, 11, 6), 0);
  if (!h || h.yr < 1440) throw new Error("no hijri date: " + JSON.stringify(h));
});
test("default colors pass the readability check, a very light background does not", () => {
  eq([S.colorWarnings(S.DEFAULTS.colors).length > 0, S.colorWarnings({main:"#EEEEEE", secondary:"#D4AF5F"}).length > 0], [false, true]);
});

/* ---------- screen status (server) ---------- */
async function atest(name, fn){
  try{ await fn(); passed++; }
  catch(e){ failed++; console.log(`FAIL  ${name}\n      ${e.message}`); }
}
const { recordPing, readScreens, MIN_WRITE_GAP_MS, MAX_SCREENS } = await import("../lib/screens.js");
const ping = await import("../functions/api/ping.js");
const screensApi = await import("../functions/api/screens.js");
function fakeEnv(pin = "1234"){
  const kv = new Map(); let writes = 0;
  return { ADMIN_PIN: pin, writes: () => writes, VAKTIJA: {
    get: async k => kv.has(k) ? kv.get(k) : null,
    put: async (k, v) => { writes++; kv.set(k, v); },
    delete: async k => { kv.delete(k); } } };
}
const T0 = Date.parse("2026-11-05T12:00:00Z");
const report = (id, extra = {}) => Object.assign({id, version:"v1", since:"2026-11-05T03:30:00Z", layout:"horizontalno", w:1920, h:1080}, extra);

await atest("a screen report is stored with its details", async () => {
  const env = fakeEnv();
  eq(await recordPing(env, report("screen0001"), T0), true);
  const s = (await readScreens(env)).screens.screen0001;
  eq([s.version, s.layout, s.w, s.h, s.at], ["v1", "horizontalno", 1920, 1080, "2026-11-05T12:00:00.000Z"]);
});
await atest("reports are written at most once per 3 minutes, however many arrive", async () => {
  const env = fakeEnv();
  for (let i = 0; i < 100; i++) await recordPing(env, report("screen" + String(i).padStart(4, "0")), T0 + i * 1000);
  eq(env.writes(), 1);
  await recordPing(env, report("screen0001"), T0 + MIN_WRITE_GAP_MS);
  eq(env.writes(), 2);
});
await atest("at most 5 screens are kept, and silent ones are forgotten after a week", async () => {
  const env = fakeEnv();
  for (let i = 0; i < 8; i++) await recordPing(env, report("screen000" + i), T0 + i * MIN_WRITE_GAP_MS);
  eq(Object.keys((await readScreens(env)).screens).length, MAX_SCREENS);
  await recordPing(env, report("screenlate"), T0 + 8 * 24 * 3600e3);
  eq(Object.keys((await readScreens(env)).screens), ["screenlate"]);
});
await atest("bad ids and oversized fields are rejected or trimmed", async () => {
  const env = fakeEnv();
  eq([await recordPing(env, {id:"../x"}, T0), await recordPing(env, {}, T0), await recordPing(env, null, T0)], [false, false, false]);
  await recordPing(env, report("screen0001", {layout:"x".repeat(500), w:"abc", version:{}}), T0);
  const s = (await readScreens(env)).screens.screen0001;
  eq([s.layout.length, s.w, s.version], [16, 0, ""]);
});
await atest("the first-seen time stays when a screen reports again", async () => {
  const env = fakeEnv();
  await recordPing(env, report("screen0001"), T0);
  await recordPing(env, report("screen0001"), T0 + MIN_WRITE_GAP_MS);
  const s = (await readScreens(env)).screens.screen0001;
  eq([s.first, s.at], ["2026-11-05T12:00:00.000Z", "2026-11-05T12:03:00.000Z"]);
});
await atest("POST /api/ping works without a PIN; GET /api/screens needs it", async () => {
  const env = fakeEnv();
  const req = (method, body, headers = {}) => new Request("https://x/api", {method, headers, body});
  const r1 = await ping.onRequestPost({request:req("POST", JSON.stringify(report("screen0001"))), env});
  eq([r1.status, (await r1.json()).recorded], [200, true]);
  const big = await ping.onRequestPost({request:req("POST", "x".repeat(5000)), env});
  eq(big.status, 413);
  eq((await screensApi.onRequestGet({request:req("GET", undefined, {"x-admin-pin":"0000"}), env})).status, 401);
  const ok = await screensApi.onRequestGet({request:req("GET", undefined, {"x-admin-pin":"1234"}), env});
  eq([ok.status, Object.keys((await ok.json()).screens)], [200, ["screen0001"]]);
});

/* ---------- offline alert (worker/alert.js) ---------- */
const W = await import("../worker/alert.js");
const at = (iso) => Date.parse(iso);
const scr = (lastIso, first = "2026-11-01T00:00:00Z") => ({ at: lastIso, first });
const SET = { masjidName: "Džemat Livač", alerts: { on: true, afterMin: 30, quietFrom: "", quietTo: "" } };
const started = { startedAt: "2026-11-01T00:00:00.000Z", offline: {} };

await atest("first run sends a 'connected' message with the current status", async () => {
  const r = W.decide(null, { a: scr("2026-11-05T13:55:00Z") }, SET, at("2026-11-05T14:00:00Z"));
  eq([r.messages.length, r.messages[0].title, /uživo/.test(r.messages[0].message), !!r.state.startedAt], [1, "Džemat Livač: obavještenja su uključena", true, true]);
});
await atest("a screen silent for longer than the limit triggers one alert, not repeated", async () => {
  const s = { a: scr("2026-11-05T13:20:00Z") };
  const r1 = W.decide(started, s, SET, at("2026-11-05T14:00:00Z"));
  eq([r1.messages.length, r1.messages[0].priority, /14:20/.test(r1.messages[0].message), /40 min/.test(r1.messages[0].message)], [1, 4, true, true]);
  const r2 = W.decide(r1.state, s, SET, at("2026-11-05T14:10:00Z"));
  eq(r2.messages.length, 0);
});
await atest("no alert before the limit", async () => {
  eq(W.decide(started, { a: scr("2026-11-05T13:40:00Z") }, SET, at("2026-11-05T14:00:00Z")).messages.length, 0);
});
await atest("back online sends a message and clears the alert", async () => {
  const off = { startedAt: started.startedAt, offline: { a: true } };
  const r = W.decide(off, { a: scr("2026-11-05T14:08:00Z") }, SET, at("2026-11-05T14:10:00Z"));
  eq([r.messages.length, r.messages[0].title, r.state.offline], [1, "Džemat Livač: ekran je ponovo uključen", {}]);
});
await atest("quiet hours (across midnight) hold the alert until they end", async () => {
  const q = { ...SET, alerts: { ...SET.alerts, quietFrom: "23:00", quietTo: "05:00" } };
  const s = { a: scr("2026-11-05T21:00:00Z") }; // 22:00 local
  eq(W.decide(started, s, q, at("2026-11-05T23:00:00Z")).messages.length, 0);      // 00:00 local, quiet
  const r = W.decide(started, s, q, at("2026-11-06T04:10:00Z"));                     // 05:10 local
  eq([r.messages.length, /5\.11\./.test(r.messages[0].message)], [1, true]);
  eq([W.inQuiet(q.alerts, at("2026-11-05T21:59:00Z")), W.inQuiet(q.alerts, at("2026-11-05T22:00:00Z")), W.inQuiet(q.alerts, at("2026-11-06T03:59:00Z")), W.inQuiet(q.alerts, at("2026-11-06T04:00:00Z"))], [false, true, true, false]);
});
await atest("switched off in admin: nothing is sent", async () => {
  const off = { ...SET, alerts: { ...SET.alerts, on: false } };
  eq(W.decide(started, { a: scr("2026-11-05T12:00:00Z") }, off, at("2026-11-05T14:00:00Z")).messages.length, 0);
});
await atest("with two screens each is named and handled on its own", async () => {
  const s = { a: scr("2026-11-05T13:58:00Z", "2026-11-01T00:00:00Z"), b: scr("2026-11-05T12:00:00Z", "2026-11-02T00:00:00Z") };
  const r = W.decide(started, s, SET, at("2026-11-05T14:00:00Z"));
  eq([r.messages.length, r.messages[0].title, Object.keys(r.state.offline)], [1, "Džemat Livač: ekran 2 se ne javlja", ["b"]]);
});
await atest("the worker sends through ntfy, and retries next time if sending fails", async () => {
  const env = fakeEnv(); env.NTFY_TOPIC = "vaktija-test"; env.ADMIN_URL = "https://x/admin/#ekran";
  await env.VAKTIJA.put("settings", JSON.stringify(SET));
  await env.VAKTIJA.put("screens", JSON.stringify({ screens: { a: scr("2026-11-05T13:00:00Z") } }));
  await env.VAKTIJA.put("alert-state", JSON.stringify(started));
  const sent = [];
  const fail = await W.runCheck(env, at("2026-11-05T14:00:00Z"), async () => ({ ok: false, status: 500 }));
  eq([fail.error, JSON.parse(await env.VAKTIJA.get("alert-state")).offline], ["ntfy 500", {}]);
  const ok = await W.runCheck(env, at("2026-11-05T14:10:00Z"), async (url, o) => { sent.push([url, JSON.parse(o.body)]); return { ok: true }; });
  eq([ok.sent, sent[0][0], sent[0][1].topic, sent[0][1].click, JSON.parse(await env.VAKTIJA.get("alert-state")).offline], [1, "https://ntfy.sh", "vaktija-test", "https://x/admin/#ekran", { a: true }]);
  const writes = env.writes();
  await W.runCheck(env, at("2026-11-05T14:20:00Z"), async () => ({ ok: true }));
  eq(env.writes(), writes); // nothing changed, nothing written
});
await atest("admin can see that the alert worker is connected", async () => {
  const env = fakeEnv();
  await env.VAKTIJA.put("alert-state", JSON.stringify(started));
  const r = await screensApi.onRequestGet({ request: new Request("https://x/api/screens", { headers: { "x-admin-pin": "1234" } }), env });
  eq((await r.json()).alertsSince, started.startedAt);
});
test("new settings have alerts on (30 min, no night pause) and an empty archive", () => {
  const c = S.normalize({});
  eq([c.alerts, c.archive], [{ on: true, afterMin: 30, quietFrom: "", quietTo: "" }, []]);
});

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
