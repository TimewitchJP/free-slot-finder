#!/bin/sh
# Azure Static Web Apps(Free)を作り、deploy.sh が使う .deploy.env を書く。
#
#   ./provision-azure.sh --name <Static Web App 名> --rg <リソースグループ名> [--location eastasia]
#
# 事前に az login を済ませておく。すでにあれば作らずに .deploy.env だけ書く。
set -e

DIR=$(cd "$(dirname "$0")" && pwd)
NAME=""; RG=""; LOC="eastasia"

while [ $# -gt 0 ]; do
  case "$1" in
    --name) NAME="$2"; shift 2 ;;
    --rg) RG="$2"; shift 2 ;;
    --location) LOC="$2"; shift 2 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 1 ;;
  esac
done
[ -n "$NAME" ] && [ -n "$RG" ] || { echo "--name と --rg は必須です" >&2; exit 1; }

az account show -o none --only-show-errors || { echo "az login が済んでいません。" >&2; exit 1; }

if ! az group show -n "$RG" -o none --only-show-errors 2>/dev/null; then
  echo "リソースグループを作ります: $RG ($LOC)"
  az group create -n "$RG" -l "$LOC" -o none --only-show-errors
fi

if ! az staticwebapp show -n "$NAME" -g "$RG" -o none --only-show-errors 2>/dev/null; then
  echo "Static Web App を作ります: $NAME (Free)"
  az staticwebapp create -n "$NAME" -g "$RG" -l "$LOC" --sku Free -o none --only-show-errors
fi

HOST=$(az staticwebapp show -n "$NAME" -g "$RG" --query defaultHostname -o tsv --only-show-errors)
printf 'SWA_NAME=%s\nSWA_RG=%s\n' "$NAME" "$RG" > "$DIR/.deploy.env"

cat <<MSG

完了しました。
  公開 URL    : https://$HOST/
  .deploy.env : 書きました(deploy.sh がこれを読む)

次にやること:
  1. ./setup-entra.sh --url https://$HOST/     (アプリ登録と config.js)
  2. ./deploy.sh                                (配布)
MSG
