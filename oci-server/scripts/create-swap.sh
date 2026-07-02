#!/bin/bash
set -Eeuo pipefail

# 理由: Always Freeの1GBメモリでOpenD、Python、Node.jsを安定稼働させる。
# リスク: /swapfileと/etc/fstabを変更するため、実行前に個別許可が必要。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

swap_path=/swapfile

if /usr/sbin/swapon --show=NAME --noheadings | /usr/bin/grep -Fxq "${swap_path}"; then
  echo "${swap_path} はすでに有効です。"
  exit 0
fi

if [[ ! -e "${swap_path}" ]]; then
  /usr/bin/fallocate -l 2G "${swap_path}"
  /usr/bin/chmod 0600 "${swap_path}"
  /usr/sbin/mkswap "${swap_path}"
fi

/usr/sbin/swapon "${swap_path}"
if ! /usr/bin/grep -Eq '^/swapfile[[:space:]]+none[[:space:]]+swap[[:space:]]' /etc/fstab; then
  echo "/swapfile none swap sw 0 0" >> /etc/fstab
fi

/usr/sbin/swapon --show
echo "2GB swapの設定が完了しました。"

