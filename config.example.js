// 設定ファイルの見本。これを config.js という名前でコピーして値を入れる。
//
//   cp config.example.js config.js
//
// config.js はテナント固有の値を持つので Git には入れない(.gitignore 済み)。
// ./setup-entra.sh を使えば、Entra ID のアプリ登録と config.js の生成をまとめて行える。
window.APP_CONFIG = {
  // ---- Entra ID(Azure AD)のアプリ登録 --------------------------------------
  // 「アプリケーション (クライアント) ID」
  clientId: "__CLIENT_ID__",

  // 「ディレクトリ (テナント) ID」。自社のユーザーだけがサインインできるようにする。
  tenantId: "__TENANT_ID__",

  // サインインのポップアップが戻ってくる URL。
  // 空にすると「今開いているページと同じ場所の auth-redirect.html」を使うので、
  // ローカル確認でも本番でも同じ config.js で動く。通常は空のままでよい。
  // 指定する場合は、アプリ登録の SPA リダイレクト URI と完全に一致させること。
  redirectUri: "",

  // ---- メンバーの探し方 --------------------------------------------------------
  // 「メンバーを探す」の検索範囲。このグループ(Microsoft 365 グループ/配布リスト)の
  // メンバーの中からだけ探す。空にするとディレクトリ全体(ゲスト含む)から探す。
  // ※ グループの読み取りには管理者の同意(GroupMember.Read.All)が必要。
  searchGroupMail: "",
  searchGroupLabel: "",          // 検索欄に出す名前(例: "本社")

  // 一覧ボタンで全員をまとめて出すグループ。空にするとボタンを出さない。
  listGroupMail: "",
  listGroupLabel: "",            // ボタンに出す文字(例: "営業部 一覧")

  // ---- 既定の探索条件 --------------------------------------------------------
  defaults: {
    // 探す時間帯。開始は画面に出していないので変えるならここ。
    // 終了は画面のプルダウンで選べる(ここの値は初期値。選ぶと次回からその値を覚える)。
    businessStart: "09:00",
    businessEnd: "18:00",
    minMinutes: 60,           // これより短い空きは候補にしない
    days: 14,                 // 何日先まで見るか
    startOffsetDays: 1,       // 今日から何日後を起点にするか(1 = 明日から)
    maxResults: 5,            // 出力する候補の最大行数
    skipWeekends: true,       // 土日を除く
    skipHolidays: true,       // 日本の祝日(振替休日・国民の休日を含む)を除く
    onePerDay: true,          // 1日につき候補を1件(その日でいちばん長い空き)に絞る
    tentativeIsBusy: true,    // 「仮の予定」を埋まっている扱いにする
    includeSelf: true         // サインインした本人を最初から入れておく
  }
};
