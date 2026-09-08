// Entra ID へのサインイン。委任フロー(PKCE)なので、このアプリはシークレットを持たない。
(function () {
  "use strict";

  var cfg = window.APP_CONFIG || {};
  // サインイン時に求めるもの。いずれも本人の同意だけで足りる。
  //   User.Read            = 自分のアドレスの取得
  //   Calendars.Read.Shared = 他メンバーの空き時間の参照
  //   User.ReadBasic.All    = Entra ID の名前・アドレスの検索
  var SCOPES = ["User.Read", "Calendars.Read.Shared", "User.ReadBasic.All"];

  // グループのメンバー一覧だけは管理者の同意が要るので、使うときに初めて要求する。
  var GROUP_SCOPES = ["GroupMember.Read.All"];

  var pca = null;
  var setupError = null;
  var ready = null; // MSAL v3 以降は initialize() の完了を待ってから使う

  // 今開いているページと同じディレクトリの auth-redirect.html
  function defaultRedirectUri() {
    var dir = window.location.pathname.replace(/[^\/]*$/, "");
    return window.location.origin + dir + "auth-redirect.html";
  }

  function init() {
    if (!window.msal) {
      setupError = "MSAL の読み込みに失敗しました。vendor/msal-browser.min.js があるか確認してください。";
      ready = Promise.resolve();
      return;
    }
    if (!cfg.clientId) {
      setupError = "config.js の clientId が空です。Entra ID のアプリ登録で得たクライアントIDを設定してください。";
      ready = Promise.resolve();
      return;
    }

    pca = new msal.PublicClientApplication({
      auth: {
        clientId: cfg.clientId,
        authority: "https://login.microsoftonline.com/" + (cfg.tenantId || "organizations"),
        redirectUri: cfg.redirectUri || defaultRedirectUri()
      },
      cache: {
        // ブラウザを閉じてもサインイン状態を保つ(共用PCで使うなら sessionStorage に変える)
        cacheLocation: "localStorage",
        storeAuthStateInCookie: false
      }
    });

    ready = pca.initialize().then(function () {
      // ページを読み込んだ直後に進行中のポップアップは有り得ないので、
      // 前回の中断(ポップアップを閉じた・二重に押した)で残ったフラグをここで捨てる。
      clearStaleInteraction();
      var accounts = pca.getAllAccounts();
      if (accounts.length > 0) pca.setActiveAccount(accounts[0]);
    }).catch(function (e) {
      setupError = "サインインの初期化に失敗しました: " + (e.message || String(e));
      pca = null;
    });
  }

  // interaction_in_progress のもとになる印を消す。
  // MSAL には公開APIが無いので、保存先から直接消す。
  function clearStaleInteraction() {
    // ポップアップやiframeの中では絶対に消さない。
    // 保存先(localStorage)は呼び出し元と共有なので、消すと進行中のサインインが壊れる。
    if (window.opener || window !== window.top) return;
    // 認可コードを持って戻ってきた画面でも触らない
    if (/[#?&](code|state|error)=/.test(window.location.hash + window.location.search)) return;

    [window.sessionStorage, window.localStorage].forEach(function (store) {
      try {
        Object.keys(store).forEach(function (k) {
          if (k.indexOf("interaction.status") >= 0) store.removeItem(k);
        });
      } catch (e) {
        // ストレージが使えない環境では何もしない
      }
    });
  }

  // ポップアップを二重に開かないための見張り。
  // 同時に呼ばれたら、先に走っている方の結果を共有する。
  var pending = null;
  function once(fn) {
    if (pending) return pending;
    pending = (async function () {
      try {
        return await fn();
      } catch (e) {
        // 前回の中断が残っていただけなら、消して一度だけやり直す
        if (e && e.errorCode === "interaction_in_progress") {
          clearStaleInteraction();
          return await fn();
        }
        throw e;
      } finally {
        pending = null;
      }
    })();
    return pending;
  }

  async function ensureReady() {
    await ready;
    if (!pca) throw new Error(setupError || "サインインを初期化できませんでした。");
  }

  function getAccount() {
    if (!pca) return null;
    return pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
  }

  async function signIn() {
    await ensureReady();
    return once(async function () {
      var res = await pca.loginPopup({ scopes: SCOPES, prompt: "select_account" });
      if (res && res.account) pca.setActiveAccount(res.account);
      return getAccount();
    });
  }

  async function signOut() {
    await ensureReady();
    await once(function () { return pca.logoutPopup({ account: getAccount() }); });
  }

  function needsInteraction(e) {
    return (window.msal && e instanceof msal.InteractionRequiredAuthError) ||
      e.errorCode === "consent_required" ||
      e.errorCode === "interaction_required" ||
      e.errorCode === "login_required";
  }

  // 画面を開いたままでも期限切れにならないよう、まず無音で取り直す。
  async function getToken(extraScopes) {
    await ensureReady();
    var scopes = SCOPES.concat(extraScopes || []);
    var account = getAccount();
    if (!account) account = await signIn();

    try {
      var res = await pca.acquireTokenSilent({ scopes: scopes, account: account });
      return res.accessToken;
    } catch (e) {
      if (needsInteraction(e)) {
        var popup = await once(function () {
          return pca.acquireTokenPopup({ scopes: scopes, account: account });
        });
        return popup.accessToken;
      }
      throw e;
    }
  }

  init();

  window.Auth = {
    ready: function () { return ready || Promise.resolve(); },
    setupError: function () { return setupError; },
    getAccount: getAccount,
    isSignedIn: function () { return getAccount() !== null; },
    signIn: signIn,
    signOut: signOut,
    getToken: getToken,
    getGroupToken: function () { return getToken(GROUP_SCOPES); },
    // 管理者の同意が済んでいれば取れる。済んでいなければ null(ポップアップは開かない)。
    getGroupTokenSilent: async function () {
      await ensureReady();
      var account = getAccount();
      if (!account) return null;
      try {
        var res = await pca.acquireTokenSilent({ scopes: SCOPES.concat(GROUP_SCOPES), account: account });
        return res.accessToken;
      } catch (e) {
        return null;
      }
    }
  };
})();
