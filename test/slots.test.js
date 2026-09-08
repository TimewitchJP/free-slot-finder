// slots.js の単体テスト。node test/slots.test.js で実行する。
"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.join(__dirname, "..", "slots.js"));
require(path.join(__dirname, "..", "holidays.js"));
const Slots = global.window.Slots;
const Holidays = global.window.JapaneseHolidays;

const PAST = new Date(2026, 0, 1); // 「過去は候補にしない」判定を効かせないための基準時刻

// 2026-09-03(木) 〜 2026-09-07(月)
const WIN = Slots.makeWindow(new Date(2026, 8, 3), new Date(2026, 8, 7));
const SLOTS_PER_DAY = (24 * 60) / Slots.SLOT_MINUTES;

// 指定した時間帯を埋めた availabilityView を作る。
// busy: [{ day: 窓の開始からの日数, from: "12:00", to: "13:00", ch: "2" }]
function view(busy) {
  const chars = new Array(WIN.slotCount).fill("0");
  for (const b of busy) {
    const t = (hhmm) => {
      const [h, m] = hhmm.split(":").map(Number);
      return b.day * SLOTS_PER_DAY + (h * 60 + m) / Slots.SLOT_MINUTES;
    };
    for (let i = t(b.from); i < t(b.to); i++) chars[i] = b.ch || "2";
  }
  return chars.join("");
}

function run(views, opts) {
  const map = Slots.newFreeMap(WIN);
  for (const v of views) {
    Slots.applyAvailabilityView(map, WIN, WIN.start, v, opts.tentativeIsBusy !== false);
  }
  return Slots.findCandidates(map, WIN, Object.assign({
    businessStart: "10:00",
    businessEnd: "17:00",
    minMinutes: 60,
    skipWeekends: true,
    notBefore: PAST
  }, opts));
}

let failures = 0;
function test(name, fn) {
  try {
    fn();
    console.log("  ok   " + name);
  } catch (e) {
    failures++;
    console.log("  FAIL " + name + "\n       " + e.message);
  }
}

test("窓の大きさが日数どおりになる", () => {
  assert.strictEqual(WIN.slotCount, 5 * SLOTS_PER_DAY);
});

test("誰も予定がなければ平日の営業時間がまるごと候補になる(土日は落ちる)", () => {
  const got = run([view([])], {});
  assert.deepStrictEqual(got.map(Slots.formatCandidate), [
    "・9/3（木）10:00〜17:00",
    "・9/4（金）10:00〜17:00",
    "・9/7（月）10:00〜17:00"
  ]);
});

test("予定を挟むと前後に割れる", () => {
  const got = run([view([{ day: 0, from: "12:00", to: "13:00" }])], {});
  assert.strictEqual(Slots.formatCandidate(got[0]), "・9/3（木）10:00〜12:00");
  assert.strictEqual(Slots.formatCandidate(got[1]), "・9/3（木）13:00〜17:00");
});

test("最低確保時間より短い空きは捨てる", () => {
  const busy = view([{ day: 0, from: "10:45", to: "17:00" }]);
  assert.strictEqual(run([busy], { minMinutes: 60 }).length, 2);   // 9/3 の 45 分は落ち、9/4 と 9/7 だけ残る
  assert.strictEqual(run([busy], { minMinutes: 30 })[0].minutes, 45); // 10:00〜10:45 が残る
});

test("15分単位で境界が出る", () => {
  const got = run([view([{ day: 0, from: "10:00", to: "11:15" }])], {});
  assert.strictEqual(Slots.formatCandidate(got[0]), "・9/3（木）11:15〜17:00");
});

test("全員が空いている時間だけが残る", () => {
  const a = view([{ day: 0, from: "10:00", to: "12:00" }]);
  const b = view([{ day: 0, from: "15:00", to: "17:00" }]);
  const got = run([a, b], {});
  assert.strictEqual(Slots.formatCandidate(got[0]), "・9/3（木）12:00〜15:00");
});

test("営業時間の外の予定は候補に影響しない", () => {
  const got = run([view([{ day: 0, from: "08:00", to: "10:00" }, { day: 0, from: "17:00", to: "19:00" }])], {});
  assert.strictEqual(Slots.formatCandidate(got[0]), "・9/3（木）10:00〜17:00");
});

test("仮の予定(1)は既定で埋まっている扱い、外すと空き扱い", () => {
  const tentative = view([{ day: 0, from: "12:00", to: "13:00", ch: "1" }]);
  assert.strictEqual(Slots.formatCandidate(run([tentative], {})[0]), "・9/3（木）10:00〜12:00");
  assert.strictEqual(
    Slots.formatCandidate(run([tentative], { tentativeIsBusy: false })[0]),
    "・9/3（木）10:00〜17:00"
  );
});

test("別の場所で作業中(4)は空き扱い、外出中(3)は埋まっている扱い", () => {
  const elsewhere = view([{ day: 0, from: "12:00", to: "13:00", ch: "4" }]);
  assert.strictEqual(Slots.formatCandidate(run([elsewhere], {})[0]), "・9/3（木）10:00〜17:00");
  const oof = view([{ day: 0, from: "10:00", to: "17:00", ch: "3" }]);
  assert.strictEqual(run([oof], {}).length, 2);
});

test("土日を含めることもできる", () => {
  const got = run([view([])], { skipWeekends: false });
  assert.strictEqual(got.length, 5);
  assert.strictEqual(Slots.formatCandidate(got[2]), "・9/5（土）10:00〜17:00");
});

test("過ぎた時間は候補にしない", () => {
  const got = run([view([])], { notBefore: new Date(2026, 8, 3, 14, 0) });
  assert.strictEqual(Slots.formatCandidate(got[0]), "・9/3（木）14:00〜17:00");
});

test("分割して受け取った availabilityView をつなげられる", () => {
  const map = Slots.newFreeMap(WIN);
  const day2 = WIN.start.getTime() + 2 * SLOTS_PER_DAY * Slots.SLOT_MINUTES * 60000;
  // 3日目以降だけを対象にした短い availabilityView(9/5 の 10:00〜17:00 を埋める)
  const partial = new Array(3 * SLOTS_PER_DAY).fill("0");
  for (let i = 40; i < 68; i++) partial[i] = "2";
  Slots.applyAvailabilityView(map, WIN, new Date(day2), partial.join(""), true);
  const got = Slots.findCandidates(map, WIN, {
    businessStart: "10:00", businessEnd: "17:00", minMinutes: 60,
    skipWeekends: false, notBefore: PAST
  });
  assert.strictEqual(got.length, 4);
  assert.ok(!got.some((c) => c.start.getDate() === 5));
});

test("1日1件に絞ると、その日のいちばん長い空きが残る", () => {
  const busy = view([{ day: 0, from: "12:00", to: "13:00" }, { day: 3, from: "10:00", to: "16:00" }]);
  const all = run([busy], { skipWeekends: false });
  const one = run([busy], { skipWeekends: false, onePerDay: true });
  assert.strictEqual(all.filter((c) => c.start.getDate() === 3).length, 2); // 9/3 は前後に割れている
  assert.deepStrictEqual(one.map(Slots.formatCandidate), [
    "・9/3（木）13:00〜17:00",  // 10:00〜12:00 より長い方が残る
    "・9/4（金）10:00〜17:00",
    "・9/5（土）10:00〜17:00",
    "・9/6（日）16:00〜17:00",  // 予定の後ろの 60 分ちょうどだけが残る
    "・9/7（月）10:00〜17:00"
  ]);
});

test("祝日を除ける(2026/9/21〜23 の3連休が落ちる)", () => {
  const win = Slots.makeWindow(new Date(2026, 8, 18), new Date(2026, 8, 24)); // 金〜木
  const opts = {
    businessStart: "10:00", businessEnd: "17:00", minMinutes: 60,
    skipWeekends: true, notBefore: PAST
  };
  const withHolidays = Slots.findCandidates(Slots.newFreeMap(win), win, opts);
  const without = Slots.findCandidates(Slots.newFreeMap(win), win,
    Object.assign({}, opts, { isHoliday: Holidays.isHoliday }));

  assert.deepStrictEqual(withHolidays.map(Slots.formatCandidate), [
    "・9/18（金）10:00〜17:00",
    "・9/21（月）10:00〜17:00",  // 敬老の日
    "・9/22（火）10:00〜17:00",  // 国民の休日
    "・9/23（水）10:00〜17:00",  // 秋分の日
    "・9/24（木）10:00〜17:00"
  ]);
  assert.deepStrictEqual(without.map(Slots.formatCandidate), [
    "・9/18（金）10:00〜17:00",
    "・9/24（木）10:00〜17:00"
  ]);
});

test("メールアドレスの取り出しと重複除去", () => {
  assert.deepStrictEqual(
    Slots.parseEmails("a@x.com, b@x.com\n A@X.com;c@x.com 、d@x.com"),
    ["a@x.com", "b@x.com", "c@x.com", "d@x.com"]
  );
  assert.strictEqual(Slots.isEmail("a@x.com"), true);
  assert.strictEqual(Slots.isEmail("a@x"), false);
});

console.log(failures === 0 ? "\nすべて通過" : "\n" + failures + " 件失敗");
process.exit(failures === 0 ? 0 : 1);
