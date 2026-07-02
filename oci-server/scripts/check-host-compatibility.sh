#!/bin/bash
set -Eeuo pipefail

# このスクリプトは読み取り確認だけを行い、サーバーを変更しない。
architecture=$(/usr/bin/uname -m)
os_id=$(/usr/bin/awk -F= '$1 == "ID" {gsub(/"/, "", $2); print $2}' /etc/os-release)
os_version=$(/usr/bin/awk -F= '$1 == "VERSION_ID" {gsub(/"/, "", $2); print $2}' /etc/os-release)

echo "CPUアーキテクチャ: ${architecture}"
echo "OS: ${os_id} ${os_version}"
/usr/bin/free -h
/usr/bin/df -h /

if [[ "${architecture}" != "x86_64" ]]; then
  echo "判定: 非対応です。公式OpenD Linux配布物の互換性を優先し、x86_64のOCIインスタンスを使用してください。" >&2
  exit 1
fi

if [[ "${os_id}" != "ubuntu" || "${os_version}" != "22.04" ]]; then
  echo "判定: 未検証のOSです。Ubuntu 22.04 x86_64で作り直すことを推奨します。" >&2
  exit 1
fi

echo "判定: MooView OCI構成の前提を満たしています。"

