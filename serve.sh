#!/bin/sh
# 空き日程さがしを開く。
# すでに起動していればブラウザを開くだけ。起動していなければ立ち上げてから開く。
PORT=8080
DIR=$(cd "$(dirname "$0")" && pwd)

if curl -s -o /dev/null -m 2 "http://localhost:$PORT/"; then
  echo "すでに起動しています: http://localhost:$PORT/"
  open "http://localhost:$PORT/"
  exit 0
fi

echo "http://localhost:$PORT/ で起動します（止めるときは Ctrl-C）"
( sleep 1; open "http://localhost:$PORT/" ) &
exec python3 -m http.server "$PORT" --directory "$DIR"
