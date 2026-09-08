// 空き時間の計算。Graph にも DOM にも依存しない純粋な計算だけを置く。
(function () {
  "use strict";

  // availabilityView の1文字が表す長さ(分)。Graph へのリクエストでも同じ値を使う。
  var SLOT_MINUTES = 15;
  var SLOT_MS = SLOT_MINUTES * 60 * 1000;

  var WEEKDAY_JA = ["日", "月", "火", "水", "木", "金", "土"];

  // availabilityView の凡例
  //   0 = 空き / 1 = 仮の予定 / 2 = 予定あり / 3 = 外出中 / 4 = 別の場所で作業中
  function isFreeChar(ch, tentativeIsBusy) {
    if (ch === "0" || ch === "4") return true;
    if (ch === "1") return !tentativeIsBusy;
    return false; // 2, 3, 想定外の文字はすべて「埋まっている」扱い
  }

  function startOfDay(date) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }

  function addDays(date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  }

  // 探索の全期間を表す窓。startDate〜endDate は両端を含む。
  function makeWindow(startDate, endDate) {
    var windowStart = startOfDay(startDate);
    var windowEnd = addDays(startOfDay(endDate), 1);
    var slotCount = Math.round((windowEnd - windowStart) / SLOT_MS);
    return { start: windowStart, end: windowEnd, slotCount: slotCount };
  }

  function newFreeMap(win) {
    var map = new Uint8Array(win.slotCount);
    map.fill(1); // 誰の予定も反映していない状態は「全部空き」
    return map;
  }

  // 1人分の availabilityView を空きマップに掛け合わせる(全員が空いている所だけ残る)。
  // chunkStart は、その availabilityView が対応する期間の開始時刻。
  function applyAvailabilityView(map, win, chunkStart, view, tentativeIsBusy) {
    var offset = Math.round((chunkStart - win.start) / SLOT_MS);
    for (var i = 0; i < view.length; i++) {
      var idx = offset + i;
      if (idx < 0 || idx >= map.length) continue;
      if (!isFreeChar(view.charAt(i), tentativeIsBusy)) map[idx] = 0;
    }
  }

  function parseTime(hhmm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || "").trim());
    if (!m) return null;
    var h = Number(m[1]), min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return { hours: h, minutes: min };
  }

  // 空きマップから、営業時間・最低確保時間の条件を満たす候補を切り出す。
  function findCandidates(map, win, opts) {
    var bhStart = parseTime(opts.businessStart) || { hours: 10, minutes: 0 };
    var bhEnd = parseTime(opts.businessEnd) || { hours: 17, minutes: 0 };
    var minSlots = Math.max(1, Math.ceil(opts.minMinutes / SLOT_MINUTES));
    var notBefore = opts.notBefore || new Date();
    var out = [];

    for (var day = new Date(win.start); day < win.end; day = addDays(day, 1)) {
      if (opts.skipWeekends && (day.getDay() === 0 || day.getDay() === 6)) continue;
      // 祝日の判定は呼び出し側から渡す(この計算部分は祝日カレンダーに依存させない)
      if (opts.isHoliday && opts.isHoliday(day)) continue;

      var dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), bhStart.hours, bhStart.minutes);
      var dayEnd = new Date(day.getFullYear(), day.getMonth(), day.getDate(), bhEnd.hours, bhEnd.minutes);
      if (dayEnd <= dayStart) continue;
      if (dayEnd <= notBefore) continue;
      if (dayStart < notBefore) dayStart = notBefore;

      // 営業時間の外にはみ出さないよう、開始は切り上げ・終了は切り捨てる
      var from = Math.max(0, Math.ceil((dayStart - win.start) / SLOT_MS));
      var to = Math.min(map.length, Math.floor((dayEnd - win.start) / SLOT_MS));

      var runStart = -1;
      for (var i = from; i <= to; i++) {
        var free = i < to && map[i] === 1;
        if (free) {
          if (runStart < 0) runStart = i;
          continue;
        }
        if (runStart >= 0) {
          if (i - runStart >= minSlots) {
            out.push({
              start: new Date(win.start.getTime() + runStart * SLOT_MS),
              end: new Date(win.start.getTime() + i * SLOT_MS),
              minutes: (i - runStart) * SLOT_MINUTES
            });
          }
          runStart = -1;
        }
      }
    }
    return opts.onePerDay ? keepLongestPerDay(out) : out;
  }

  // 同じ日に複数の空きがあるとき、いちばん長いものだけ残す(同じ長さなら早い方)。
  function keepLongestPerDay(list) {
    var best = Object.create(null);
    var order = [];
    list.forEach(function (c) {
      var key = c.start.getFullYear() + "-" + c.start.getMonth() + "-" + c.start.getDate();
      if (!best[key]) { best[key] = c; order.push(key); return; }
      if (c.minutes > best[key].minutes) best[key] = c;
    });
    return order.map(function (key) { return best[key]; });
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  function formatCandidate(c) {
    return "・" + (c.start.getMonth() + 1) + "/" + c.start.getDate() +
      "（" + WEEKDAY_JA[c.start.getDay()] + "）" +
      pad2(c.start.getHours()) + ":" + pad2(c.start.getMinutes()) + "〜" +
      pad2(c.end.getHours()) + ":" + pad2(c.end.getMinutes());
  }

  function formatCandidates(list) {
    return list.map(formatCandidate).join("\n");
  }

  // 入力欄の文字列からメールアドレスを取り出す。重複は大文字小文字を無視して1つにまとめる。
  function parseEmails(text) {
    var seen = Object.create(null);
    var out = [];
    String(text || "").split(/[\s,;、，]+/).forEach(function (raw) {
      var v = raw.trim().replace(/^[<]|[>]$/g, "");
      if (!v) return;
      var key = v.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(v);
    });
    return out;
  }

  function isEmail(v) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
  }

  window.Slots = {
    SLOT_MINUTES: SLOT_MINUTES,
    makeWindow: makeWindow,
    newFreeMap: newFreeMap,
    applyAvailabilityView: applyAvailabilityView,
    findCandidates: findCandidates,
    keepLongestPerDay: keepLongestPerDay,
    formatCandidate: formatCandidate,
    formatCandidates: formatCandidates,
    parseEmails: parseEmails,
    parseTime: parseTime,
    isEmail: isEmail,
    startOfDay: startOfDay,
    addDays: addDays
  };
})();
