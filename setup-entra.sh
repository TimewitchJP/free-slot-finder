#!/bin/sh
# Entra ID(Azure AD)にこのアプリを登録し、config.js を作る。
#
#   ./setup-entra.sh --url https://<配置先のホスト>/ [--name 空き日程さがし] [--admin-consent]
#
# 事前に az login を済ませておく(アプリ登録を作れる権限が必要)。
# 同じ名前のアプリがすでにあれば作り直さず、そのアプリの設定を更新する。
set -e

DIR=$(cd "$(dirname "$0")" && pwd)
NAME="free-slot-finder"
URL=""
CONSENT=0

while [ $# -gt 0 ]; do
  case "$1" in
    --url)  URL="$2"; shift 2 ;;
    --name) NAME="$2"; shift 2 ;;
    --admin-consent) CONSENT=1; shift ;;
    -h|--help)
      sed -n '2,8p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
done

if [ -z "$URL" ]; then
  echo "--url に、このアプリを置く URL を指定してください(例: https://xxx.azurestaticapps.net/)" >&2
  exit 1
fi
case "$URL" in */) ;; *) URL="$URL/" ;; esac

TENANT=$(az account show --query tenantId -o tsv --only-show-errors) || {
  echo "az login が済んでいません。" >&2; exit 1; }

# Microsoft Graph の委任アクセス許可。ID は全テナント共通。
#   User.Read             自分のアドレス
#   Calendars.Read.Shared 他メンバーの空き時間
#   User.ReadBasic.All    名前・アドレスの検索
#   GroupMember.Read.All  グループのメンバー一覧(管理者の同意が必要)
RRA=$(mktemp)
trap 'rm -f "$RRA"' EXIT
cat > "$RRA" <<'JSON'
[{"resourceAppId":"00000003-0000-0000-c000-000000000000","resourceAccess":[
  {"id":"e1fe6dd8-ba31-4d61-89e7-88639da4683d","type":"Scope"},
  {"id":"2b9c4092-424d-4249-948d-b43879977640","type":"Scope"},
  {"id":"b340eb25-3456-403f-be2f-af7a0d370277","type":"Scope"},
  {"id":"bc024368-1153-4739-b217-4326f2e966d0","type":"Scope"}]}]
JSON

APP_ID=$(az ad app list --display-name "$NAME" --query "[0].appId" -o tsv --only-show-errors)
if [ -n "$APP_ID" ]; then
  echo "既存のアプリ登録を使います: $NAME ($APP_ID)"
  OBJ_ID=$(az ad app show --id "$APP_ID" --query id -o tsv --only-show-errors)
  az ad app update --id "$APP_ID" --required-resource-accesses "@$RRA" --only-show-errors
else
  echo "アプリ登録を作ります: $NAME"
  OUT=$(az ad app create --display-name "$NAME" --sign-in-audience AzureADMyOrg \
          --required-resource-accesses "@$RRA" --query "{appId:appId,id:id}" -o tsv --only-show-errors)
  APP_ID=$(echo "$OUT" | cut -f1)
  OBJ_ID=$(echo "$OUT" | cut -f2)
fi

# SPA のリダイレクト URI。ローカル確認用も一緒に入れておく。
az rest --method PATCH --only-show-errors \
  --uri "https://graph.microsoft.com/v1.0/applications/$OBJ_ID" \
  --headers "Content-Type=application/json" \
  --body "{\"spa\":{\"redirectUris\":[\"${URL}auth-redirect.html\",\"http://localhost:8080/auth-redirect.html\"]}}"

if [ "$CONSENT" = "1" ]; then
  echo "管理者の同意を与えます(グローバル管理者などの権限が必要)"
  az ad app permission admin-consent --id "$APP_ID" --only-show-errors
fi

# config.js を作る(あれば残しておく)
if [ -f "$DIR/config.js" ]; then
  cp "$DIR/config.js" "$DIR/config.js.bak"
  echo "既存の config.js は config.js.bak に残しました"
fi
sed -e "s/__CLIENT_ID__/$APP_ID/" -e "s/__TENANT_ID__/$TENANT/" "$DIR/config.example.js" > "$DIR/config.js"

cat <<MSG

完了しました。
  アプリ名            : $NAME
  クライアント ID     : $APP_ID
  テナント ID         : $TENANT
  リダイレクト URI    : ${URL}auth-redirect.html
  config.js           : 作成しました(検索範囲のグループなどは必要に応じて編集)

管理者の同意をまだ与えていない場合、グループ関連の機能は使えません。
必要なら次を実行してください:
  az ad app permission admin-consent --id $APP_ID
MSG
