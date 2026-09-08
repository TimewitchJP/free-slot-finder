// 画面まわり。プリセットの保存先はこのブラウザの localStorage。
(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};
  var D = (cfg.defaults || {});
  var PRESET_KEY = "freeSlotFinder.presets";
  var END_KEY = "freeSlotFinder.businessEnd"; // 前回選んだ終了時刻
  var MAX_RANGE_DAYS = 62;

  var el = {};
  ["setup-error", "signin-hint", "account-name", "signin", "signout", "preset", "preset-save", "preset-delete",
   "preset-default", "selected", "selected-count", "clear-all", "include-self",
   "people-search", "people-results", "people-status",
   "load-group", "date-start", "date-end", "business-start-text", "business-end",
   "min-minutes", "max-results", "skip-weekends", "skip-holidays", "one-per-day", "tentative-busy",
   "search", "status",
   "result-card", "result", "result-warnings", "result-note", "copy", "copy-status"
  ].forEach(function (id) { el[id] = document.getElementById(id); });

  // ---- プリセット -------------------------------------------------------

  function loadPresets() {
    try {
      var raw = localStorage.getItem(PRESET_KEY);
      var data = raw ? JSON.parse(raw) : null;
      if (!data || typeof data !== "object") throw new Error("empty");
      if (!data.items || typeof data.items !== "object") data.items = {};
      return data;
    } catch (e) {
      return { version: 1, defaultName: "", items: {} };
    }
  }

  function savePresets(data) {
    try {
      localStorage.setItem(PRESET_KEY, JSON.stringify(data));
    } catch (e) {
      setStatus("プリセットを保存できませんでした（ブラウザの保存領域が使えません）", true);
    }
  }

  function renderPresetOptions(selectedName) {
    var data = loadPresets();
    var names = Object.keys(data.items).sort();
    el.preset.innerHTML = "";
    var blank = document.createElement("option");
    blank.value = "";
    blank.textContent = "（選択しない）";
    el.preset.appendChild(blank);
    names.forEach(function (name) {
      var opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name + (data.defaultName === name ? "（既定）" : "");
      el.preset.appendChild(opt);
    });
    el.preset.value = selectedName || "";
    el["preset-default"].checked = !!selectedName && data.defaultName === selectedName;
  }

  function applyPreset(name) {
    if (!name) return;
    var data = loadPresets();
    var item = data.items[name];
    if (!item) return;
    setSelected(item.people || item.emails || []);
  }

  // ---- 探す時間帯 -------------------------------------------------------

  // 開始は config.js 固定。終了だけ画面で選べる。
  function businessStart() {
    return (D.businessStart && window.Slots.parseTime(D.businessStart)) ? D.businessStart : "09:00";
  }

  function hourLabel(hhmm) {
    var t = window.Slots.parseTime(hhmm);
    return t.hours + ":" + (t.minutes < 10 ? "0" + t.minutes : t.minutes);
  }

  function toMinutes(hhmm) {
    var t = window.Slots.parseTime(hhmm);
    return t.hours * 60 + t.minutes;
  }

  // 開始の30分後から22:00まで、30分刻み。config の既定値が刻みに乗らなくても必ず入れる。
  function buildEndOptions() {
    var from = toMinutes(businessStart()) + 30;
    var values = [];
    for (var m = Math.ceil(from / 30) * 30; m <= 22 * 60; m += 30) values.push(m);

    var configured = D.businessEnd && window.Slots.parseTime(D.businessEnd) ? toMinutes(D.businessEnd) : null;
    if (configured !== null && configured > toMinutes(businessStart()) && values.indexOf(configured) < 0) {
      values.push(configured);
      values.sort(function (a, b) { return a - b; });
    }

    el["business-end"].innerHTML = "";
    values.forEach(function (m) {
      var hhmm = (m / 60 | 0) + ":" + (m % 60 === 0 ? "00" : m % 60);
      var pad = ((m / 60 | 0) < 10 ? "0" : "") + hhmm;
      var opt = document.createElement("option");
      opt.value = pad;
      opt.textContent = hhmm;
      el["business-end"].appendChild(opt);
    });
  }

  function savedEnd() {
    try {
      var v = localStorage.getItem(END_KEY);
      return v && window.Slots.parseTime(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  // ---- 入力の初期値 -----------------------------------------------------

  function toDateInput(date) {
    var m = date.getMonth() + 1, d = date.getDate();
    return date.getFullYear() + "-" + (m < 10 ? "0" + m : m) + "-" + (d < 10 ? "0" + d : d);
  }

  function fromDateInput(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }

  function setSelect(select, value) {
    var v = String(value);
    for (var i = 0; i < select.options.length; i++) {
      if (select.options[i].value === v) { select.value = v; return; }
    }
  }

  function initForm() {
    var today = window.Slots.startOfDay(new Date());
    var start = window.Slots.addDays(today, D.startOffsetDays == null ? 1 : D.startOffsetDays);
    var end = window.Slots.addDays(start, (D.days || 14) - 1);

    el["date-start"].value = toDateInput(start);
    el["date-end"].value = toDateInput(end);
    el["business-start-text"].textContent = hourLabel(businessStart());
    buildEndOptions();
    // 前回選んだ終了時刻があればそれを、無ければ config.js の既定を使う
    setSelect(el["business-end"], savedEnd() || D.businessEnd || "18:00");
    if (!el["business-end"].value) setSelect(el["business-end"], "18:00");

    setSelect(el["min-minutes"], D.minMinutes || 60);
    setSelect(el["max-results"], D.maxResults == null ? 5 : D.maxResults);
    el["skip-weekends"].checked = D.skipWeekends !== false;
    el["skip-holidays"].checked = D.skipHolidays !== false;
    el["one-per-day"].checked = D.onePerDay !== false;
    el["tentative-busy"].checked = D.tentativeIsBusy !== false;
    el["include-self"].checked = D.includeSelf !== false;

    if (cfg.listGroupMail) {
      el["load-group"].textContent = cfg.listGroupLabel || (cfg.listGroupMail.split("@")[0] + " の一覧");
      el["load-group"].hidden = false;
    }
    if (cfg.searchGroupMail) {
      el["people-search"].placeholder = (cfg.searchGroupLabel || cfg.searchGroupMail) + "から探す（名前かアドレスの一部）";
    }

    var data = loadPresets();
    renderPresetOptions(data.defaultName);
    applyPreset(data.defaultName);
    renderSelected();
  }

  // ---- 表示 -------------------------------------------------------------

  function setStatus(text, isError) {
    el.status.textContent = text || "";
    el.status.classList.toggle("error", !!isError);
  }

  function renderAccount() {
    var account = window.Auth.getAccount();
    var signedIn = !!account;

    el["account-name"].textContent = signedIn ? (account.username || account.name || "") : "";
    el.signin.hidden = signedIn;
    el.signout.hidden = !signedIn;

    // サインインするまでは Graph を呼ぶ操作を止めておく。
    // 押せてしまうと、意図しないところでサインインのポップアップが開く。
    if (!window.Auth.setupError()) {
      ["people-search", "load-group", "include-self", "search"].forEach(function (id) {
        el[id].disabled = !signedIn;
      });
      el["signin-hint"].hidden = signedIn;
    }

    if (signedIn) prepareSearchScope(false);
  }

  function renderWarnings(problems) {
    el["result-warnings"].innerHTML = "";
    problems.forEach(function (text) {
      var div = document.createElement("div");
      div.className = "notice notice-warn";
      div.textContent = text;
      el["result-warnings"].appendChild(div);
    });
  }

  // ---- メンバー検索 -----------------------------------------------------

  var searchTimer = null;
  var searchSeq = 0; // 打鍵が速いとき、古い結果で上書きしないための通し番号
  var searchScope = null;   // 検索範囲のグループ {name, members}。読めていないときは null
  var searchScopeTried = false;
  var listGroupCache = null; // 一覧ボタンで読んだグループ(押すたびに読み直さない)

  // 検索範囲のグループを、サインイン直後に裏で読んでおく。
  // 管理者の同意が済んでいなければ黙って諦め、検索はディレクトリ全体に切り替わる。
  async function prepareSearchScope(force) {
    if (!cfg.searchGroupMail || !window.Auth.isSignedIn()) return;
    if (searchScope || (searchScopeTried && !force)) return;
    searchScopeTried = true;
    try {
      var token = await window.Auth.getGroupTokenSilent();
      if (!token) return;
      searchScope = await window.GraphApi.getGroupMembers(token, cfg.searchGroupMail);
      el["people-search"].placeholder = searchScope.name + "から探す（名前かアドレスの一部）";
    } catch (e) {
      searchScope = null;
    }
  }

  function filterScope(query) {
    var q = query.toLowerCase();
    return searchScope.members.filter(function (p) {
      return p.name.toLowerCase().indexOf(q) >= 0 || p.email.toLowerCase().indexOf(q) >= 0;
    });
  }

  // 選んだ人。[{ name, email }] の並び順のまま画面に出す。
  var selected = [];

  function currentEmails() {
    return selected.map(function (p) { return p.email.toLowerCase(); });
  }

  function hasEmail(address) {
    var key = String(address).toLowerCase();
    return selected.some(function (p) { return p.email.toLowerCase() === key; });
  }

  function addPerson(person) {
    if (!person || !person.email || hasEmail(person.email)) return;
    selected.push({ name: person.name || "", email: person.email });
    renderSelected();
  }

  function addEmail(address) {
    addPerson({ name: "", email: address });
  }

  function removeEmail(address) {
    var key = String(address).toLowerCase();
    selected = selected.filter(function (p) { return p.email.toLowerCase() !== key; });
    renderSelected();
  }

  function setSelected(people) {
    selected = [];
    (people || []).forEach(function (p) {
      // 古いプリセットはメールアドレスの文字列だけを持っている
      var person = typeof p === "string" ? { name: "", email: p } : p;
      if (person && person.email && !hasEmail(person.email)) {
        selected.push({ name: person.name || "", email: person.email });
      }
    });
    renderSelected();
  }

  function renderSelected() {
    el.selected.innerHTML = "";

    if (selected.length === 0) {
      var empty = document.createElement("p");
      empty.className = "selected-empty";
      empty.textContent = "まだ誰も選んでいません。上の「メンバーを探す」から追加してください。";
      el.selected.appendChild(empty);
    } else {
      selected.forEach(function (person) {
        var row = document.createElement("div");
        row.className = "chosen";

        var name = document.createElement("span");
        name.className = "chosen-name";
        name.textContent = person.name || person.email;
        name.title = person.email;

        var drop = document.createElement("button");
        drop.type = "button";
        drop.className = "chosen-drop";
        drop.title = person.email + " を外す";
        drop.setAttribute("aria-label", person.email + " を外す");
        drop.textContent = "×";
        drop.addEventListener("click", function () {
          // 自分を手で外したときは、チェックも外して勝手に戻らないようにする
          if (myEmail && person.email.toLowerCase() === myEmail.toLowerCase()) {
            el["include-self"].checked = false;
          }
          removeEmail(person.email);
        });

        row.appendChild(name);
        row.appendChild(drop);
        el.selected.appendChild(row);
      });
    }

    el["selected-count"].textContent = selected.length > 0 ? selected.length + "名" : "";
    el["clear-all"].hidden = selected.length === 0;

    // 候補一覧の「追加済み」表示を合わせる
    if (lastRendered) renderPeople(lastRendered.people, lastRendered.options);
  }

  // 自分のアドレス。まずサインイン情報の値をそのまま使い、
  // Graph が答えられたらそちら(mail)で上書きする。
  var myEmail = null;
  var myName = "";
  async function resolveMyEmail() {
    var account = window.Auth.getAccount();
    if (!account) return null;
    if (myEmail) return myEmail;

    myEmail = account.username || null;
    myName = account.name || "";
    try {
      var token = await window.Auth.getToken();
      var me = await window.GraphApi.getMe(token);
      myEmail = me.mail || me.userPrincipalName || myEmail;
      myName = me.displayName || myName;
    } catch (e) {
      // 取れなくてもサインイン情報の値で用は足りる
    }
    return myEmail;
  }

  // チェックの状態に合わせて、自分を入れる/外す
  async function syncSelf() {
    if (!window.Auth.isSignedIn()) return;
    var address = await resolveMyEmail();
    if (!address) return;
    if (el["include-self"].checked) addPerson({ name: myName, email: address });
    else removeEmail(address);
  }

  function setPeopleStatus(text, isError) {
    el["people-status"].textContent = text || "";
    el["people-status"].classList.toggle("error", !!isError);
  }

  var lastRendered = null; // 「追加済み」の表示を選択と揃えるために覚えておく

  function renderPeople(people, options) {
    var opts = options || {};
    lastRendered = people.length > 0 ? { people: people, options: opts } : null;
    el["people-results"].innerHTML = "";
    if (people.length === 0) {
      el["people-results"].hidden = true;
      return;
    }

    if (opts.showAddAll) {
      var head = document.createElement("div");
      head.className = "people-head";
      var all = document.createElement("button");
      all.type = "button";
      all.className = "linkbtn";
      all.textContent = people.length + "名すべて追加";
      all.addEventListener("click", function () {
        people.forEach(addPerson);
      });
      head.appendChild(all);
      el["people-results"].appendChild(head);
    }

    var added = currentEmails();
    people.forEach(function (p) {
      var isAdded = added.indexOf(p.email.toLowerCase()) >= 0;
      var row = document.createElement("button");
      row.type = "button";
      row.className = "person" + (isAdded ? " person-added" : "");
      row.disabled = isAdded;
      row.innerHTML = "";

      var name = document.createElement("span");
      name.className = "person-name";
      name.textContent = p.name || p.email;
      var mail = document.createElement("span");
      mail.className = "person-mail";
      mail.textContent = p.email;
      var mark = document.createElement("span");
      mark.className = "person-mark";
      mark.textContent = isAdded ? "追加済み" : "＋";

      row.appendChild(name);
      row.appendChild(mail);
      row.appendChild(mark);
      row.addEventListener("click", function () {
        addPerson(p); // renderSelected 側で候補一覧の「追加済み」も描き直す
      });
      el["people-results"].appendChild(row);
    });
    el["people-results"].hidden = false;
  }

  function describeGraphError(e) {
    var msg = e.message || String(e);
    if (e.status === 403 || e.errorCode === "consent_required" ||
        /AADSTS65001|consent|permission|Authorization_RequestDenied/i.test(msg)) {
      return "この操作には管理者の同意が要ります。README の「メンバー一覧に必要な同意」を参照してください。";
    }
    return msg;
  }

  async function runSearch(query) {
    if (!window.Auth.isSignedIn()) return;
    var seq = ++searchSeq;

    // 検索範囲のグループが読めていれば、その中だけを手元で絞る(Graph は呼ばない)
    if (cfg.searchGroupMail && !searchScope) await prepareSearchScope(false);
    if (seq !== searchSeq) return;
    if (searchScope) {
      var hits = filterScope(query);
      setPeopleStatus(hits.length === 0
        ? searchScope.name + "には見つかりませんでした。"
        : searchScope.name + "から " + hits.length + "件");
      renderPeople(hits, {});
      return;
    }

    setPeopleStatus("検索しています…");
    try {
      var token = await window.Auth.getToken();
      var people = await window.GraphApi.searchPeople(token, query);
      if (seq !== searchSeq) return; // もっと新しい検索が走っている
      renderAccount();
      var note = cfg.searchGroupMail
        ? "（管理者の同意が済むまでは、ディレクトリ全体から探しています）"
        : "";
      setPeopleStatus((people.length === 0 ? "見つかりませんでした。" : people.length + "件") + note);
      renderPeople(people, {});
    } catch (e) {
      if (seq !== searchSeq) return;
      setPeopleStatus(describeGraphError(e), true);
    }
  }

  async function loadGroup() {
    if (!window.Auth.isSignedIn()) return;
    searchSeq++; // 検索結果の遅れて来る上書きを止める
    setPeopleStatus("メンバーを読み込んでいます…");
    el["load-group"].disabled = true;
    try {
      if (!listGroupCache) {
        // GroupMember.Read.All が要る。未同意ならここで同意画面が出る(クリック操作なので可)
        var token = await window.Auth.getGroupToken();
        listGroupCache = await window.GraphApi.getGroupMembers(token, cfg.listGroupMail);
        renderAccount();
        prepareSearchScope(true); // 同意が通ったなら、検索範囲も読めるようになっている
      }
      var group = listGroupCache;
      setPeopleStatus(group.name + "：" + group.members.length + "名");
      renderPeople(group.members, { showAddAll: true });
    } catch (e) {
      setPeopleStatus(describeGraphError(e), true);
    } finally {
      el["load-group"].disabled = false;
    }
  }

  el["people-search"].addEventListener("input", function () {
    var query = el["people-search"].value.trim();
    if (searchTimer) clearTimeout(searchTimer);
    if (query.length === 0) {
      searchSeq++;
      setPeopleStatus("");
      renderPeople([], {});
      return;
    }
    // 打つたびに投げないよう少し待つ
    searchTimer = setTimeout(function () { runSearch(query); }, 350);
  });

  el["people-search"].addEventListener("keydown", function (event) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (searchTimer) clearTimeout(searchTimer);
    var query = el["people-search"].value.trim();
    if (query) runSearch(query);
  });

  el["load-group"].addEventListener("click", loadGroup);

  // ---- 検索 -------------------------------------------------------------

  function readOptions() {
    var start = fromDateInput(el["date-start"].value);
    var end = fromDateInput(el["date-end"].value);
    if (!start || !end) throw new Error("開始日と終了日を入れてください。");
    if (end < start) throw new Error("終了日が開始日より前になっています。");
    var days = Math.round((end - start) / 86400000) + 1;
    if (days > MAX_RANGE_DAYS) throw new Error("期間が長すぎます（" + MAX_RANGE_DAYS + "日まで）。");

    var bStart = businessStart();
    var bEnd = el["business-end"].value;
    if (!window.Slots.parseTime(bEnd)) throw new Error("探す時間帯の終了時刻を選んでください。");
    if (toMinutes(bEnd) <= toMinutes(bStart)) {
      throw new Error("終了時刻は " + hourLabel(bStart) + " より後にしてください。");
    }

    var emails = selected.map(function (p) { return p.email; });
    if (emails.length === 0) throw new Error("「メンバーを探す」から1人以上選んでください。");
    var invalid = emails.filter(function (e) { return !window.Slots.isEmail(e); });
    if (invalid.length > 0) throw new Error("メールアドレスの形式が正しくありません: " + invalid.join(", "));

    return {
      emails: emails,
      start: start,
      end: end,
      businessStart: bStart,
      businessEnd: bEnd,
      minMinutes: Number(el["min-minutes"].value),
      maxResults: Number(el["max-results"].value),
      skipWeekends: el["skip-weekends"].checked,
      skipHolidays: el["skip-holidays"].checked,
      onePerDay: el["one-per-day"].checked,
      tentativeIsBusy: el["tentative-busy"].checked
    };
  }

  async function search() {
    var opts;
    try {
      opts = readOptions();
    } catch (e) {
      setStatus(e.message, true);
      return;
    }

    el.search.disabled = true;
    setStatus("予定を取得しています…");
    try {
      var token = await window.Auth.getToken();
      renderAccount();

      var win = window.Slots.makeWindow(opts.start, opts.end);
      var result = await window.GraphApi.buildFreeMap(token, opts.emails, win, {
        tentativeIsBusy: opts.tentativeIsBusy,
        onProgress: function (done, total) {
          if (total > 1) setStatus("予定を取得しています… (" + done + "/" + total + ")");
        }
      });

      var candidates = window.Slots.findCandidates(result.map, win, {
        businessStart: opts.businessStart,
        businessEnd: opts.businessEnd,
        minMinutes: opts.minMinutes,
        skipWeekends: opts.skipWeekends,
        isHoliday: opts.skipHolidays ? window.JapaneseHolidays.isHoliday : null,
        onePerDay: opts.onePerDay,
        notBefore: new Date()
      });

      var shown = opts.maxResults > 0 ? candidates.slice(0, opts.maxResults) : candidates;

      el["result-card"].hidden = false;
      renderWarnings(result.problems);
      el.result.textContent = shown.length > 0
        ? window.Slots.formatCandidates(shown)
        : "条件に合う空きが見つかりませんでした。期間を延ばす、最低確保時間を短くする、などで再度お試しください。";

      var note = opts.emails.length + "名 / " +
        (opts.start.getMonth() + 1) + "/" + opts.start.getDate() + "〜" +
        (opts.end.getMonth() + 1) + "/" + opts.end.getDate() + " / " +
        opts.businessStart + "〜" + opts.businessEnd + " / " + opts.minMinutes + "分以上";
      if (opts.maxResults > 0 && candidates.length > shown.length) {
        note += "（該当 " + candidates.length + " 件のうち上位 " + shown.length + " 件を表示）";
      }
      el["result-note"].textContent = note;

      setStatus("");
      el.copy.focus();
    } catch (e) {
      setStatus(e.message || String(e), true);
    } finally {
      el.search.disabled = false;
    }
  }

  // ---- イベント ---------------------------------------------------------

  el.signin.addEventListener("click", async function () {
    try {
      await window.Auth.signIn();
      renderAccount();
      setStatus("");
      syncSelf();
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  });

  el.signout.addEventListener("click", async function () {
    try {
      await window.Auth.signOut();
    } catch (e) {
      // ポップアップを閉じただけの場合もあるので、表示だけ更新して先へ進む
    }
    renderAccount();
  });

  el["include-self"].addEventListener("change", function () {
    syncSelf();
  });

  el["clear-all"].addEventListener("click", function () {
    setSelected([]);
    el["include-self"].checked = false; // 消した直後に自分が戻ってこないように
  });

  el.preset.addEventListener("change", function () {
    applyPreset(el.preset.value);
    syncSelf();
    var data = loadPresets();
    el["preset-default"].checked = !!el.preset.value && data.defaultName === el.preset.value;
  });

  el["preset-save"].addEventListener("click", function () {
    if (selected.length === 0) { setStatus("保存する人がいません。", true); return; }
    var suggested = el.preset.value || "";
    var name = window.prompt("プリセット名（例: 自分＋佐藤さん）", suggested);
    if (name === null) return;
    name = name.trim();
    if (!name) { setStatus("プリセット名を入れてください。", true); return; }

    var data = loadPresets();
    data.items[name] = { people: selected.slice() };
    savePresets(data);
    renderPresetOptions(name);
    setStatus("「" + name + "」を保存しました。");
  });

  el["preset-delete"].addEventListener("click", function () {
    var name = el.preset.value;
    if (!name) { setStatus("削除するプリセットを選んでください。", true); return; }
    if (!window.confirm("プリセット「" + name + "」を削除しますか？")) return;
    var data = loadPresets();
    delete data.items[name];
    if (data.defaultName === name) data.defaultName = "";
    savePresets(data);
    renderPresetOptions("");
    setStatus("「" + name + "」を削除しました。");
  });

  el["preset-default"].addEventListener("change", function () {
    var name = el.preset.value;
    if (!name) {
      el["preset-default"].checked = false;
      setStatus("先にプリセットを選んでください。", true);
      return;
    }
    var data = loadPresets();
    data.defaultName = el["preset-default"].checked ? name : "";
    savePresets(data);
    renderPresetOptions(name);
  });

  el["business-end"].addEventListener("change", function () {
    try {
      localStorage.setItem(END_KEY, el["business-end"].value);
    } catch (e) {
      // 保存できなくても、その回の検索には使える
    }
  });

  el.search.addEventListener("click", search);

  el.copy.addEventListener("click", async function () {
    try {
      await navigator.clipboard.writeText(el.result.textContent);
      el["copy-status"].textContent = "コピーしました";
    } catch (e) {
      el["copy-status"].textContent = "コピーできませんでした（手動で選択してください）";
    }
    setTimeout(function () { el["copy-status"].textContent = ""; }, 2500);
  });

  // ---- 起動 -------------------------------------------------------------

  initForm();
  window.Auth.ready().then(function () {
    var setupError = window.Auth.setupError();
    if (setupError) {
      el["setup-error"].textContent = setupError;
      el["setup-error"].hidden = false;
      ["signin", "people-search", "load-group", "include-self", "search"].forEach(function (id) {
        el[id].disabled = true;
      });
    }
    renderAccount();
    // 前回のサインインが残っていれば、この時点で自分を入れておく
    syncSelf();
  });
})();
