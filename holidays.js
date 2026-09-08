// 日本の国民の祝日。祝日法の規則をそのまま計算するので、表の更新は要らない。
//
//   - 春分・秋分は近似式で求める。有効なのは 1980〜2099 年。
//   - 2020・2021 年に五輪向けに行われた一時的な移動には対応していない(未来の日程を
//     見るためのアプリなので割り切っている)。
//   - 会社独自の休業日(年末年始・創立記念日など)はここには入っていない。
(function () {
  "use strict";

  var cache = Object.create(null);

  function key(year, month, day) {
    return year * 10000 + month * 100 + day;
  }

  // その月の n 番目の月曜日(ハッピーマンデー)
  function nthMonday(year, month, nth) {
    var first = new Date(year, month - 1, 1);
    return 1 + ((1 - first.getDay() + 7) % 7) + (nth - 1) * 7;
  }

  function vernalEquinoxDay(year) {
    return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  function autumnalEquinoxDay(year) {
    return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
  }

  // 振替休日・国民の休日を足す前の、法律に書かれている祝日そのもの
  function baseHolidays(year) {
    var list = [
      { month: 1, day: 1, name: "元日" },
      { month: 1, day: nthMonday(year, 1, 2), name: "成人の日" },
      { month: 2, day: 11, name: "建国記念の日" },
      { month: 3, day: vernalEquinoxDay(year), name: "春分の日" },
      { month: 4, day: 29, name: "昭和の日" },
      { month: 5, day: 3, name: "憲法記念日" },
      { month: 5, day: 4, name: "みどりの日" },
      { month: 5, day: 5, name: "こどもの日" },
      { month: 7, day: nthMonday(year, 7, 3), name: "海の日" },
      { month: 9, day: nthMonday(year, 9, 3), name: "敬老の日" },
      { month: 9, day: autumnalEquinoxDay(year), name: "秋分の日" },
      { month: 10, day: nthMonday(year, 10, 2), name: "スポーツの日" },
      { month: 11, day: 3, name: "文化の日" },
      { month: 11, day: 23, name: "勤労感謝の日" }
    ];
    if (year >= 2016) list.push({ month: 8, day: 11, name: "山の日" });
    if (year >= 2020) list.push({ month: 2, day: 23, name: "天皇誕生日" });
    else if (year <= 2018) list.push({ month: 12, day: 23, name: "天皇誕生日" });
    return list;
  }

  function build(year) {
    var map = Object.create(null);
    var base = Object.create(null);

    baseHolidays(year).forEach(function (h) {
      map[key(year, h.month, h.day)] = h.name;
      base[key(year, h.month, h.day)] = h.name;
    });

    function isBase(date) {
      return !!base[key(date.getFullYear(), date.getMonth() + 1, date.getDate())];
    }

    // 振替休日: 日曜と重なった祝日は、その後の「祝日でない日」に振り替わる
    Object.keys(base).forEach(function (k) {
      var n = Number(k);
      var date = new Date(Math.floor(n / 10000), (Math.floor(n / 100) % 100) - 1, n % 100);
      if (date.getDay() !== 0) return;
      var next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
      while (isBase(next)) {
        next = new Date(next.getFullYear(), next.getMonth(), next.getDate() + 1);
      }
      map[key(next.getFullYear(), next.getMonth() + 1, next.getDate())] = "振替休日";
    });

    // 国民の休日: 前日と翌日がどちらも祝日の平日(例: 敬老の日と秋分の日に挟まれた日)
    for (var m = 1; m <= 12; m++) {
      var last = new Date(year, m, 0).getDate();
      for (var d = 1; d <= last; d++) {
        if (map[key(year, m, d)]) continue;
        var day = new Date(year, m - 1, d);
        if (day.getDay() === 0) continue;
        var prev = new Date(year, m - 1, d - 1);
        var next2 = new Date(year, m - 1, d + 1);
        if (isBase(prev) && isBase(next2)) map[key(year, m, d)] = "国民の休日";
      }
    }

    return map;
  }

  function mapFor(year) {
    if (!cache[year]) cache[year] = build(year);
    return cache[year];
  }

  function nameOf(date) {
    var year = date.getFullYear();
    // 年をまたぐ振替休日(元日が日曜のときの 1/2 など)は、その年の計算に含まれている
    return mapFor(year)[key(year, date.getMonth() + 1, date.getDate())] || null;
  }

  function isHoliday(date) {
    return nameOf(date) !== null;
  }

  function listForYear(year) {
    var map = mapFor(year);
    return Object.keys(map).map(Number).sort(function (a, b) { return a - b; })
      .map(function (n) {
        return {
          month: Math.floor(n / 100) % 100,
          day: n % 100,
          name: map[n]
        };
      });
  }

  window.JapaneseHolidays = {
    isHoliday: isHoliday,
    nameOf: nameOf,
    listForYear: listForYear
  };
})();
