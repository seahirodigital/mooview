#!/bin/bash
set -Eeuo pipefail

# 理由: 共通ソースから本番ビルドとPython仮想環境を作成する。
# リスク: /opt/mooview/appの依存関係、Chromium実行環境、/etc/mooview/mooview.envを変更する。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

app_root=/opt/mooview/app
venv_root=/opt/mooview/venv
env_path=/etc/mooview/mooview.env
env_example=/opt/mooview/app/oci-server/config/mooview.env.example

for required_path in \
  "${app_root}/package.json" \
  "${app_root}/package-lock.json" \
  "${app_root}/requirements-moomoo.txt" \
  "${app_root}/moomoo_gateway.py" \
  "${env_example}"; do
  if [[ ! -f "${required_path}" ]]; then
    echo "必要ファイルがありません: ${required_path}" >&2
    exit 1
  fi
done

if ! /usr/bin/id mooview >/dev/null 2>&1; then
  echo "mooview実行ユーザーがありません。/opt/mooview/app/oci-server/scripts/prepare-host.shを先に実行してください。" >&2
  exit 1
fi

/usr/bin/chown -R mooview:mooview "${app_root}"

if [[ ! -x "${venv_root}/bin/python" ]]; then
  /usr/bin/python3 -m venv "${venv_root}"
  /usr/bin/chown -R mooview:mooview "${venv_root}"
fi

/usr/sbin/runuser -u mooview -- \
  "${venv_root}/bin/python" -m pip install --upgrade pip
/usr/sbin/runuser -u mooview -- \
  "${venv_root}/bin/python" -m pip install -r "${app_root}/requirements-moomoo.txt"

/usr/sbin/runuser -u mooview -- \
  /usr/bin/npm --prefix "${app_root}" ci
/usr/bin/npx --prefix "${app_root}" playwright install-deps chromium
/usr/sbin/runuser -u mooview -- \
  /usr/bin/env PLAYWRIGHT_BROWSERS_PATH=/var/lib/mooview/ms-playwright \
  /usr/bin/npx --prefix "${app_root}" playwright install chromium
/usr/sbin/runuser -u mooview -- \
  /usr/bin/npm --prefix "${app_root}" run build

if [[ ! -f "${env_path}" ]]; then
  gateway_key=$(/usr/bin/openssl rand -hex 32)
  /usr/bin/install -o root -g mooview -m 0640 "${env_example}" "${env_path}"
  /usr/bin/sed -i \
    "s/^MOOMOO_GATEWAY_KEY=.*/MOOMOO_GATEWAY_KEY=${gateway_key}/" \
    "${env_path}"
fi

/usr/bin/test -f "${app_root}/dist/server.cjs"
echo "MooViewの本番ビルドとPython環境を準備しました。"
echo "秘密設定: ${env_path}"
echo "MooViewはまだ起動していません。"
