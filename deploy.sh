#!/bin/sh
# 配布物だけを集めて Azure Static Web Apps に配る。
#
#   ./deploy.sh                       (.deploy.env の SWA_NAME / SWA_RG を使う)
#   ./deploy.sh -n <SWA名> -g <RG名>   (指定する)
#
# .deploy.env は provision-azure.sh が書く。事前に az login と config.js が必要。
set -e
DIR=$(cd "$(dirname "$0")" && pwd)

[ -f "$DIR/.deploy.env" ] && . "$DIR/.deploy.env"
while [ $# -gt 0 ]; do
  case "$1" in
    -n) SWA_NAME="$2"; shift 2 ;;
    -g) SWA_RG="$2"; shift 2 ;;
    -h|--help) sed -n '2,7p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
done
if [ -z "$SWA_NAME" ] || [ -z "$SWA_RG" ]; then
  echo "配布先が分かりません。./provision-azure.sh を先に実行するか、-n と -g で指定してください。" >&2
  exit 1
fi
if [ ! -f "$DIR/config.js" ]; then
  echo "config.js がありません。./setup-entra.sh を先に実行してください。" >&2
  exit 1
fi
OUT=$(mktemp -d)
trap 'rm -rf "$OUT"' EXIT

mkdir -p "$OUT/vendor"
cp "$DIR"/index.html "$DIR"/auth-redirect.html "$DIR"/style.css "$DIR"/config.js \
   "$DIR"/app.js "$DIR"/auth.js "$DIR"/graph.js "$DIR"/slots.js "$DIR"/holidays.js "$OUT/"
cp "$DIR"/vendor/msal-browser.min.js "$DIR"/vendor/msal-redirect-bridge.min.js \
   "$DIR"/vendor/msal-browser.LICENSE "$OUT/vendor/"
cp "$DIR"/staticwebapp.config.json "$OUT/"

# ブラウザが古い css / js を使い続けないよう、配るたびに違う番号を振る
STAMP=$(date +%Y%m%d%H%M%S)
sed -i '' "s/?v=dev/?v=$STAMP/g" "$OUT/index.html"

TOKEN=$(az staticwebapp secrets list -n "$SWA_NAME" -g "$SWA_RG" \
          --query "properties.apiKey" -o tsv --only-show-errors)
if [ -z "$TOKEN" ]; then
  echo "デプロイトークンを取得できませんでした。az login を確認してください。" >&2
  exit 1
fi

SWA_CLI_DEPLOYMENT_TOKEN="$TOKEN" \
  npx -y @azure/static-web-apps-cli@latest deploy "$OUT" --env production --no-use-keychain
