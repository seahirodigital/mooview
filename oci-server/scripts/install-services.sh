#!/bin/bash
set -Eeuo pipefail

# 理由: OpenD、Pythonゲートウェイ、MooViewをOS再起動後も自動復旧させる。
# リスク: systemdのサービス定義と自動起動設定を変更する。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

unit_source=/opt/mooview/app/oci-server/systemd

for unit_name in moomoo-opend.service moomoo-gateway.service mooview.service; do
  /usr/bin/test -f "${unit_source}/${unit_name}"
  /usr/bin/install \
    -o root \
    -g root \
    -m 0644 \
    "${unit_source}/${unit_name}" \
    "/etc/systemd/system/${unit_name}"
done

/usr/bin/systemctl daemon-reload
/usr/bin/systemctl enable moomoo-opend.service
/usr/bin/systemctl enable moomoo-gateway.service
/usr/bin/systemctl enable mooview.service

echo "systemd設定を導入しました。"
echo "認証確認前に誤起動しないよう、サービスはまだ開始していません。"

