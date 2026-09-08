# 空き日程さがし

複数人の Outlook（Microsoft 365）の予定を突き合わせて、全員が空いている候補日を
そのままメールに貼れる形で出す。

```
・9/3（木）09:00〜20:00
・9/4（金）13:00〜20:00
・9/7（月）09:00〜12:00
```

- Microsoft Graph の `getSchedule` で**空き/予定ありだけ**を読む。件名・参加者・場所は読まない。
- サインインした本人の権限で読むので、その人が見られない相手の情報は出ない。
- **バックエンド無し・シークレット無し。** ブラウザから Graph を直接呼ぶ静的サイトで、ビルドも不要。
- 外部 CDN も使わない。依存は MSAL だけで `vendor/` に同梱。社内ネットワークでも動く。

## 他社・別テナントで使う（クイックスタート）

Microsoft 365 テナントと Azure サブスクリプションがあれば、以下の3本のスクリプトで動くところまで行ける。
手元に `az`（Azure CLI）と `node`（`npx` が使えればよい）が要る。

```bash
git clone https://github.com/TimewitchJP/free-slot-finder.git
cd free-slot-finder
az login
./provision-azure.sh --name <StaticWebApp名> --rg <リソースグループ名>   # 置き場所を作る
./setup-entra.sh --url https://<上で出たホスト>/ --admin-consent          # アプリ登録 + config.js
./deploy.sh                                                                 # 配る
```

- `provision-azure.sh` は Azure Static Web Apps（Free）を作り、`deploy.sh` が使う `.deploy.env` を書く。
- `setup-entra.sh` は Entra ID にアプリを登録し（既にあれば更新）、`config.example.js` から `config.js` を作る。
  `--admin-consent` を付けると管理者の同意まで与える（グローバル管理者などの権限が要る）。
- `deploy.sh` は配布物だけを集めて Static Web Apps に配る。

Azure を使わない場合も、静的ファイルを HTTPS で配れるならどこでも動く（S3+CloudFront、社内 Web サーバなど）。
その場合は `provision-azure.sh` と `deploy.sh` は使わず、`setup-entra.sh --url` に実際の URL を渡し、
`index.html` / `auth-redirect.html` / `style.css` / `config.js` / `*.js` / `vendor/` を置く。
「配るときの注意」も参照。

### 手でやる場合の要点

`setup-entra.sh` がやっているのはこれだけ。ポータルでやるならこの通りに。

| 項目 | 値 |
|---|---|
| サポートされているアカウントの種類 | この組織ディレクトリのみ（AzureADMyOrg） |
| プラットフォーム | **シングルページ アプリケーション (SPA)** |
| リダイレクト URI | `https://<配置先>/auth-redirect.html` と `http://localhost:8080/auth-redirect.html` |
| API のアクセス許可（委任） | `User.Read`, `Calendars.Read.Shared`, `User.ReadBasic.All`, `GroupMember.Read.All` |

**リダイレクト URI はアプリ本体ではなく `auth-redirect.html`。** 末尾のスラッシュまで含めて完全一致で判定される。
そのあと `cp config.example.js config.js` してクライアント ID・テナント ID を入れる。

### 同意について

4つの許可のうち `User.Read` / `Calendars.Read.Shared` / `User.ReadBasic.All` は**本人の同意だけ**で足りる。
初回サインイン時に同意画面で許可すれば、検索も空き日程も使える。

`GroupMember.Read.All` だけは**管理者の同意が必須**で、グループ関連の機能
（`searchGroupMail` による検索範囲の限定、`listGroupMail` の一覧ボタン）にだけ使う。
サインイン時には要求せず、その機能を使うときに初めて要求するので、同意が無くても他は普通に動く。

```bash
az ad app permission admin-consent --id <クライアントID>
```

テナントの設定でユーザー自身の同意が禁止されている場合も、このコマンドで一括して同意できる。

## 設定（config.js）

テナント固有の値はすべて `config.js` に集めてあり、コードには入っていない。
`config.example.js` に全項目の説明があるので、そこを見て編集する。主な項目:

| 項目 | 意味 |
|---|---|
| `clientId` / `tenantId` | Entra ID のアプリ登録の値 |
| `redirectUri` | 空でよい（開いているページと同じ場所の `auth-redirect.html` を使う） |
| `searchGroupMail` / `searchGroupLabel` | 「メンバーを探す」の検索範囲にするグループ。空ならディレクトリ全体 |
| `listGroupMail` / `listGroupLabel` | 全員をまとめて出す一覧ボタンのグループ。空ならボタン無し |
| `defaults.businessStart` / `businessEnd` | 探す時間帯。開始は画面に出さない。終了は画面のプルダウンで選べ、ここの値は初期値 |
| `defaults.minMinutes` / `days` / `maxResults` | 最低確保時間・何日先まで・候補の最大件数 |
| `defaults.skipWeekends` / `skipHolidays` | 土日・日本の祝日を除くか |
| `defaults.onePerDay` / `tentativeIsBusy` / `includeSelf` | 1日1件・仮の予定の扱い・自分を最初から入れるか |

`config.js` は `.gitignore` に入っている。リポジトリに入っているのは `config.example.js` だけ。

## ファイル構成

| ファイル | 役割 |
|---|---|
| `index.html` | 画面 |
| `config.example.js` | 設定の見本。コピーして `config.js` にする |
| `auth.js` | Entra ID へのサインイン（MSAL / 委任フロー・PKCE） |
| `graph.js` | Graph の呼び出し（空き時間・メンバー検索・グループのメンバー） |
| `slots.js` | 空き時間の計算（Graph にも DOM にも依存しない） |
| `holidays.js` | 日本の祝日の計算（振替休日・国民の休日を含む） |
| `app.js` | 画面の組み立て・プリセットの保存 |
| `auth-redirect.html` | サインインのポップアップが戻ってくるページ（応答を本体へ中継して自分を閉じる） |
| `style.css` | スタイル |
| `vendor/msal-browser.min.js` | MSAL（`@azure/msal-browser` v5.20.0） |
| `vendor/msal-redirect-bridge.min.js` | 同上。`auth-redirect.html` が応答を本体へ返すのに使う |
| `setup-entra.sh` | Entra ID のアプリ登録と `config.js` の生成 |
| `provision-azure.sh` | Azure Static Web Apps の作成と `.deploy.env` の生成 |
| `deploy.sh` | Static Web Apps への配布 |
| `serve.sh` | ローカルで開く（起動済みならブラウザを開くだけ） |
| `staticwebapp.config.json` | Static Web Apps の設定（ヘッダー・フォールバック） |
| `test/` | 単体テスト |

## ローカルで動かす

```bash
./serve.sh
```

`http://localhost:8080/` を開き、右上の「サインイン」を押す。
起動していなければ立ち上げ、すでに起動していればブラウザを開くだけなので `Address already in use` を踏まない。
`file://` で直接開くと Entra ID のリダイレクトが成立しないので、必ず HTTP 経由で開くこと。

## 使い方

1. サインインすると、**自分は最初から入っている**。外したいときは「自分を含める」のチェックを外す。
2. **メンバーを探す**に名前かアドレスの一部を入れると候補が出る。クリックすると「選んだ人」に入る。
   一覧ボタン（`listGroupMail` を設定した場合）を押すと、そのグループの全員を一覧してまとめて追加できる。
   外すときは各行の × 、まとめて消すときは「全部消す」。
   **アドレスの直接入力はできない**ので、ディレクトリに居ない相手（社外など）は選べない。
3. よく使う組み合わせは「名前をつけて保存」でプリセットにできる。
   「起動時にこれを開く」を付けたプリセットは、次回から自動で読み込まれる。
   保存先は**そのブラウザの localStorage** なので、人ごとに別々の既定を持てる。
4. 期間・探す時間帯（終了時刻）・最低確保時間を決めて「空き日程を出す」。
   終了時刻は開始の30分後から22:00まで30分刻みで選べ、選んだ値はそのブラウザが覚える。
5. 出た候補を「コピー」でそのまま貼り付ける。

## 配るときの注意

- `index.html` は自前の css / js を `?v=dev` 付きで読んでいる。`deploy.sh` が配るときに
  これを日時の数字へ書き換えるので、ブラウザが古いファイルを使い続けることがない。
  **手で配る場合はこの置き換えを忘れないこと**（忘れると、見た目だけ古いままという分かりにくい壊れ方をする）。
- 別の URL に置くときは、その URL の `auth-redirect.html` を Entra のリダイレクト URI に足すこと
  （`setup-entra.sh --url` をもう一度実行すればよい）。

## サインインについて

Graph を呼ぶ操作（メンバー検索・一覧・自分を含める・空き日程を出す）は**サインインするまで押せない**。
ポップアップが開くのは右上の「サインイン」を押したときだけ。

`interaction_in_progress` というエラーは、サインインのポップアップを途中で閉じたり二重に押したときに
MSAL 側の印が残ると出る。**ページを読み込み直せば消える**（起動時にこの印を捨てる）。
それでも出る場合はブラウザのサイトデータを消す。
この印を捨てる処理はポップアップの中では動かない（保存先が呼び出し元と共有なので、進行中のサインインを壊すため）。

`auth-redirect.html` は**空ページではいけない**。MSAL v5 はポップアップの URL を覗きに行くのではなく、
戻ってきたページから BroadcastChannel で応答を送り返してもらう作り（`waitForBridgeResponse`）なので、
`msalRedirectBridge.broadcastResponseToMainFrame()` を呼んでいる。ここを削るとポップアップが開いたまま止まる。

## 仕様上の注意

- **日本の祝日は既定で除外する。** 振替休日・国民の休日も含めて `holidays.js` が計算するので、
  毎年リストを更新する必要はない（春分・秋分は近似式で 2099 年まで有効）。
  **年末年始や創立記念日などの会社独自の休業日は入っていない**。日本以外で使うなら `skipHolidays: false`。
- 「仮の予定」は既定で埋まっている扱い。チェックを外すと空きとみなす。
- 「別の場所で作業中（Working elsewhere）」は空き扱い。
- 相手の Exchange 側で空き時間の公開が絞られている場合、その人の予定は取得できず、結果の上に警告を出す。
- 1回の `getSchedule` は 20 アドレスまで。超える人数は自動で分割して呼ぶ。期間は最大 62 日。
- メンバー検索は、`searchGroupMail` のメンバーが読めているときは手元の絞り込みだけで Graph を呼ばない。
  読めていないとき（未設定・同意なし）は `$search` でディレクトリ全体を引き、空振りしたら前方一致で引き直す。
  その場合はゲストユーザー（社外のアドレス）も候補に出る。

## 動作確認

`slots.js` と `holidays.js` は Graph にも DOM にも依存しないので、単体で動かせる。

```bash
node test/slots.test.js && node test/holidays.test.js
```

`holidays.test.js` は 2025〜2027 年の祝日を内閣府の暦と突き合わせている。
