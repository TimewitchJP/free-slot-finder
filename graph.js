// Microsoft Graph の呼び出し。getSchedule は「空き/予定あり」だけを返すので、
// 相手の予定の件名や参加者はこのアプリからは見えない。
(function () {
  "use strict";

  var BASE = "https://graph.microsoft.com/v1.0";
  var MAX_SCHEDULES_PER_REQUEST = 20; // getSchedule の上限
  var MAX_DAYS_PER_REQUEST = 7;       // 1回のリクエストで見る日数(長すぎると弾かれるため分割)

  function timeZone() {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Tokyo";
    } catch (e) {
      return "Asia/Tokyo";
    }
  }

  function pad2(n) { return n < 10 ? "0" + n : String(n); }

  // Graph には「タイムゾーン名 + オフセット無しのローカル時刻」で渡す
  function toGraphTime(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate()) +
      "T" + pad2(date.getHours()) + ":" + pad2(date.getMinutes()) + ":00";
  }

  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, ms); });
  }

  async function call(token, path, init) {
    var options = Object.assign({}, init, {
      headers: Object.assign({
        Authorization: "Bearer " + token,
        "Content-Type": "application/json"
      }, (init && init.headers) || {})
    });

    var url = path.indexOf("https://") === 0 ? path : BASE + path;

    for (var attempt = 0; attempt < 3; attempt++) {
      var res = await fetch(url, options);
      if (res.status === 429 || res.status === 503) {
        var wait = Number(res.headers.get("Retry-After") || 2);
        await sleep(Math.min(wait, 10) * 1000);
        continue;
      }
      var body = await res.json().catch(function () { return null; });
      if (!res.ok) {
        var msg = (body && body.error && body.error.message) || ("HTTP " + res.status);
        var err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      return body;
    }
    throw new Error("Graph が混み合っています。少し待ってからもう一度試してください。");
  }

  function getMe(token) {
    return call(token, "/me?$select=displayName,mail,userPrincipalName", { method: "GET" });
  }

  function getSchedule(token, emails, start, end, intervalMinutes) {
    return call(token, "/me/calendar/getSchedule", {
      method: "POST",
      headers: { Prefer: 'outlook.timezone="' + timeZone() + '"' },
      body: JSON.stringify({
        schedules: emails,
        startTime: { dateTime: toGraphTime(start), timeZone: timeZone() },
        endTime: { dateTime: toGraphTime(end), timeZone: timeZone() },
        availabilityViewInterval: intervalMinutes
      })
    });
  }

  // ---- ディレクトリの検索 -----------------------------------------------

  function toPerson(u) {
    return {
      name: u.displayName || "",
      email: u.mail || u.userPrincipalName || ""
    };
  }

  function withEmail(list) {
    return list.map(toPerson).filter(function (p) { return p.email; });
  }

  // $search は語の途中でも当たるが使える条件が細かい。空振りしたら startswith で引き直す。
  async function searchPeople(token, query) {
    var q = String(query || "").trim();
    if (!q) return [];

    var quoted = q.replace(/["\\]/g, "");
    var searchPath = "/users?$select=displayName,mail,userPrincipalName&$top=15&$count=true&$search=" +
      encodeURIComponent('"displayName:' + quoted + '" OR "mail:' + quoted + '" OR "userPrincipalName:' + quoted + '"');

    var found = [];
    try {
      var res = await call(token, searchPath, {
        method: "GET",
        headers: { ConsistencyLevel: "eventual" }
      });
      found = withEmail((res && res.value) || []);
    } catch (e) {
      if (e.status && e.status !== 400) throw e; // 権限不足などはそのまま伝える
    }
    if (found.length > 0) return found;

    var escaped = q.replace(/'/g, "''");
    var filterPath = "/users?$select=displayName,mail,userPrincipalName&$top=15&$filter=" +
      encodeURIComponent("startswith(displayName,'" + escaped + "') or startswith(mail,'" + escaped +
        "') or startswith(userPrincipalName,'" + escaped + "')");
    var res2 = await call(token, filterPath, { method: "GET" });
    return withEmail((res2 && res2.value) || []);
  }

  // メーリスのアドレスからグループを引き、メンバーを返す
  async function getGroupMembers(token, groupMail) {
    var mail = String(groupMail || "").trim().replace(/'/g, "''");
    var found = await call(token, "/groups?$select=id,displayName&$filter=" +
      encodeURIComponent("mail eq '" + mail + "'"), { method: "GET" });
    var group = ((found && found.value) || [])[0];
    if (!group) throw new Error(groupMail + " というグループが見つかりませんでした。");

    var members = [];
    var path = "/groups/" + group.id + "/members?$select=displayName,mail,userPrincipalName&$top=999";
    for (var page = 0; page < 10 && path; page++) {
      var res = await call(token, path, { method: "GET" });
      members = members.concat(withEmail((res && res.value) || []));
      path = res && res["@odata.nextLink"];
    }
    return { name: group.displayName, members: members };
  }

  function chunk(list, size) {
    var out = [];
    for (var i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
  }

  // 期間・人数ともに上限を超えないよう分割して呼び、結果を1枚の空きマップにまとめる。
  // 戻り値の problems には、宛先が解決できなかったなどの警告を入れる。
  async function buildFreeMap(token, emails, win, opts) {
    var map = window.Slots.newFreeMap(win);
    var problems = [];
    var seenProblem = Object.create(null);

    var periods = [];
    for (var t = new Date(win.start); t < win.end; t = window.Slots.addDays(t, MAX_DAYS_PER_REQUEST)) {
      var next = window.Slots.addDays(t, MAX_DAYS_PER_REQUEST);
      periods.push({ start: new Date(t), end: next < win.end ? next : new Date(win.end) });
    }

    var groups = chunk(emails, MAX_SCHEDULES_PER_REQUEST);

    for (var p = 0; p < periods.length; p++) {
      for (var g = 0; g < groups.length; g++) {
        if (opts.onProgress) {
          opts.onProgress(p * groups.length + g + 1, periods.length * groups.length);
        }
        var res = await getSchedule(token, groups[g], periods[p].start, periods[p].end, window.Slots.SLOT_MINUTES);
        var items = (res && res.value) || [];
        for (var i = 0; i < items.length; i++) {
          var item = items[i];
          if (item.error) {
            var key = item.scheduleId + ":" + (item.error.message || "");
            if (!seenProblem[key]) {
              seenProblem[key] = true;
              problems.push(item.scheduleId + " の予定を取得できませんでした（" + (item.error.message || "理由不明") + "）");
            }
            continue;
          }
          if (typeof item.availabilityView !== "string" || item.availabilityView.length === 0) {
            continue;
          }
          window.Slots.applyAvailabilityView(map, win, periods[p].start, item.availabilityView, opts.tentativeIsBusy);
        }
      }
    }

    return { map: map, problems: problems };
  }

  window.GraphApi = {
    getMe: getMe,
    searchPeople: searchPeople,
    getGroupMembers: getGroupMembers,
    getSchedule: getSchedule,
    buildFreeMap: buildFreeMap
  };
})();
