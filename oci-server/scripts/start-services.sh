#!/bin/bash
set -Eeuo pipefail

# 理由: 依存順にサービスを起動し、各ローカルポートの応答を確認する。
# リスク: OpenDがmoomooへログインするため、初回は本人確認が要求される場合がある。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

wait_for_port() {
  local port=$1
  local service_name=$2
  local attempt

  for attempt in $(/usr/bin/seq 1 90); do
    if /usr/bin/nc -z 127.0.0.1 "${port}"; then
      echo "${service_name}: 127.0.0.1:${port} 正常"
      return 0
    fi
    /usr/bin/sleep 1
  done

  echo "${service_name}が起動しませんでした。ログを確認してください。" >&2
  /usr/bin/journalctl -u "${service_name}" -n 80 --no-pager >&2
  return 1
}

/usr/bin/systemctl restart moomoo-opend.service
wait_for_port 11111 moomoo-opend.service

/usr/bin/systemctl restart moomoo-gateway.service
wait_for_port 8787 moomoo-gateway.service

/usr/bin/systemctl restart mooview.service
wait_for_port 3000 mooview.service

/bin/bash /opt/mooview/app/oci-server/scripts/health-check.sh
