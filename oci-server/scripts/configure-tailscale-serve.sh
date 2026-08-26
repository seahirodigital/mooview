#!/bin/bash
set -Eeuo pipefail

# 理由: MooViewを公開インターネットへ出さず、許可済みWindows/MacだけへHTTPS公開する。
# リスク: TailscaleネットワークのServe設定を変更するため、実行前に個別許可が必要。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

if ! /usr/bin/tailscale status >/dev/null 2>&1; then
  echo "Tailscaleへ未接続です。次のコマンドでログインを完了してください:" >&2
  echo "/usr/bin/tailscale up --hostname=mooview-oci --accept-dns=false" >&2
  exit 1
fi

/usr/bin/tailscale serve --bg 3000
/usr/bin/tailscale serve status

echo "表示されたhttps://で始まるURLを、同じTailscaleへ接続したWindowsまたはMacで開いてください。"

