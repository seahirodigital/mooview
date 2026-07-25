#!/bin/bash
set -Eeuo pipefail

# 理由: リポジトリが固定しているMoomoo API 10.7.6708と同じOpenDを導入する。
# リスク: 約450MBの公式配布物をダウンロードし、/opt/mooviewへ展開する。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

opend_version=10.7.6708
archive_name=moomoo_OpenD_10.7.6708_Ubuntu18.04.tar.gz
archive_url=https://softwaredownload.futustatic.com/moomoo_OpenD_10.7.6708_Ubuntu18.04.tar.gz
archive_path="/var/cache/mooview/${archive_name}"
release_root="/opt/mooview/opend/releases/${opend_version}"
current_link=/opt/mooview/opend/current

if [[ -e "${release_root}" || -L "${current_link}" || -e "${current_link}" ]]; then
  echo "既存OpenDを上書きしないため停止しました: ${release_root} または ${current_link}" >&2
  exit 1
fi

/usr/bin/install -d -o mooview -g mooview -m 0750 /opt/mooview/opend/releases
/usr/bin/install -d -o mooview -g mooview -m 0750 "${release_root}"

if [[ ! -f "${archive_path}" ]]; then
  /usr/bin/curl \
    --fail \
    --location \
    --proto '=https' \
    --tlsv1.2 \
    --output "${archive_path}" \
    "${archive_url}"
fi

/usr/bin/tar -xzf "${archive_path}" -C "${release_root}"

opend_binary=$(
  /usr/bin/find "${release_root}" -type f \
    \( -name OpenD -o -name FutuOpenD -o -name 'moomoo OpenD' \) \
    -perm /111 -print -quit
)

if [[ -z "${opend_binary}" ]]; then
  echo "OpenD実行ファイルを検出できませんでした: ${release_root}" >&2
  exit 1
fi

binary_info=$(/usr/bin/file "${opend_binary}")
echo "${binary_info}"
if [[ "${binary_info}" != *"x86-64"* ]]; then
  echo "x86-64版ではないため停止しました。OCIインスタンス形状を再確認してください。" >&2
  exit 1
fi

missing_libraries=$(/usr/bin/ldd "${opend_binary}" 2>/dev/null | /usr/bin/grep 'not found' || true)
if [[ -n "${missing_libraries}" ]]; then
  echo "不足ライブラリがあるため停止しました:" >&2
  echo "${missing_libraries}" >&2
  exit 1
fi

binary_directory=$(/usr/bin/dirname "${opend_binary}")
packaged_config=$(/usr/bin/find "${binary_directory}" -maxdepth 2 -type f -name OpenD.xml -print -quit)

if [[ -z "${packaged_config}" ]]; then
  echo "公式OpenD.xmlを検出できませんでした: ${binary_directory}" >&2
  exit 1
fi

if [[ "${opend_binary}" != "${binary_directory}/OpenD" ]]; then
  /usr/bin/ln -s "${opend_binary}" "${binary_directory}/OpenD"
fi

/usr/bin/chown -R mooview:mooview "${release_root}"
/usr/bin/ln -s "${binary_directory}" "${current_link}"
/usr/bin/install -o root -g mooview -m 0640 "${packaged_config}" /etc/mooview/OpenD.xml

echo "OpenD ${opend_version} を ${current_link} に配置しました。"
echo "次に /etc/mooview/OpenD.xml の認証設定を行ってください。"
echo "OpenDはまだ起動していません。"

