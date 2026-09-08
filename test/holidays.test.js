// holidays.js の単体テスト。node test/holidays.test.js で実行する。
"use strict";

const assert = require("assert");
const path = require("path");

global.window = {};
require(path.join(__dirname, "..", "holidays.js"));
const H = global.window.JapaneseHolidays;

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

const fmt = (list) => list.map((h) => h.month + "/" + h.day + " " + h.name);

test("2026年の祝日が内閣府の暦どおりに出る", () => {
  assert.deepStrictEqual(fmt(H.listForYear(2026)), [
    "1/1 元日",
    "1/12 成人の日",
    "2/11 建国記念の日",
    "2/23 天皇誕生日",
    "3/20 春分の日",
    "4/29 昭和の日",
    "5/3 憲法記念日",
    "5/4 みどりの日",
    "5/5 こどもの日",
    "5/6 振替休日",       // 5/3 が日曜なので、祝日でない最初の日に振り替わる
    "7/20 海の日",
    "8/11 山の日",
    "9/21 敬老の日",
    "9/22 国民の休日",    // 敬老の日と秋分の日に挟まれている
    "9/23 秋分の日",
    "10/12 スポーツの日",
    "11/3 文化の日",
    "11/23 勤労感謝の日"
  ]);
});

test("2027年の祝日", () => {
  assert.deepStrictEqual(fmt(H.listForYear(2027)), [
    "1/1 元日",
    "1/11 成人の日",
    "2/11 建国記念の日",
    "2/23 天皇誕生日",
    "3/21 春分の日",
    "3/22 振替休日",      // 春分の日が日曜
    "4/29 昭和の日",
    "5/3 憲法記念日",
    "5/4 みどりの日",
    "5/5 こどもの日",
    "7/19 海の日",
    "8/11 山の日",
    "9/20 敬老の日",
    "9/23 秋分の日",      // 間が2日あくので国民の休日にはならない
    "10/11 スポーツの日",
    "11/3 文化の日",
    "11/23 勤労感謝の日"
  ]);
});

test("2025年の振替休日", () => {
  const names = fmt(H.listForYear(2025));
  assert.ok(names.includes("2/24 振替休日"), "2/23(日) 天皇誕生日の振替");
  assert.ok(names.includes("11/24 振替休日"), "11/23(日) 勤労感謝の日の振替");
  assert.ok(names.includes("3/20 春分の日"));
  assert.ok(names.includes("9/23 秋分の日"));
});

test("isHoliday / nameOf", () => {
  assert.strictEqual(H.isHoliday(new Date(2026, 8, 22)), true);   // 9/22 国民の休日
  assert.strictEqual(H.nameOf(new Date(2026, 8, 22)), "国民の休日");
  assert.strictEqual(H.isHoliday(new Date(2026, 8, 24)), false);  // 9/24 は平日
  assert.strictEqual(H.nameOf(new Date(2026, 8, 24)), null);
  assert.strictEqual(H.nameOf(new Date(2026, 0, 1)), "元日");
});

console.log(failures === 0 ? "\nすべて通過" : "\n" + failures + " 件失敗");
process.exit(failures === 0 ? 0 : 1);
