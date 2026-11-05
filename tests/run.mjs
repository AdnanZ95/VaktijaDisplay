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

console.log(`${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
