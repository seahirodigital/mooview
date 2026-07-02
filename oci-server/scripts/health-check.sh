#!/bin/bash
set -Eeuo pipefail

# OpenDからブラウザAPIまでの全経路を、実価格と日足を含めて確認する。
api_root=http://127.0.0.1:3000/api/moomoo

validate_json() {
  local probe_name=$1
  /usr/bin/python3 -c '
import json
import sys

probe = sys.argv[1]
payload = json.load(sys.stdin)

if probe == "status":
    if payload.get("connected") is not True:
        raise SystemExit(f"OpenD未接続: {payload}")
elif probe == "quote":
    if payload.get("success") is not True or payload.get("price") is None:
        raise SystemExit(f"実価格取得失敗: {payload}")
elif probe == "kline":
    candles = payload.get("candles")
    if payload.get("success") is not True or not isinstance(candles, list) or len(candles) < 1:
        raise SystemExit(f"日足取得失敗: {payload}")
else:
    raise SystemExit(f"未知の確認種別: {probe}")

print(json.dumps(payload, ensure_ascii=False))
' "${probe_name}"
}

status_response=$(
  /usr/bin/curl \
    --fail \
    --silent \
    --show-error \
    --max-time 20 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{}' \
    "${api_root}/status"
)
echo "接続確認:"
echo "${status_response}" | validate_json status

quote_response=$(
  /usr/bin/curl \
    --fail \
    --silent \
    --show-error \
    --max-time 35 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{"symbol":"US.VOO"}' \
    "${api_root}/quote"
)
echo "実価格確認:"
echo "${quote_response}" | validate_json quote

kline_response=$(
  /usr/bin/curl \
    --fail \
    --silent \
    --show-error \
    --max-time 50 \
    --request POST \
    --header 'Content-Type: application/json' \
    --data '{"symbol":"US.VOO","timeframe":"1d","reqNum":2}' \
    "${api_root}/kline"
)
echo "日足確認:"
echo "${kline_response}" | validate_json kline

echo "OpenD → Pythonゲートウェイ → MooView API の全経路が正常です。"

