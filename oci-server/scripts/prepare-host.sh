#!/bin/bash
set -Eeuo pipefail

# 理由: UbuntuへNode.js、Python、Tailscaleなどの実行基盤を導入する。
# リスク: パッケージとAPTリポジトリを追加するため、実行前に個別許可が必要。
if [[ "${EUID}" -ne 0 ]]; then
  echo "管理者権限が必要です。実行許可を得た後、rootとして実行してください。" >&2
  exit 1
fi

script_path=$(/usr/bin/readlink -f "${BASH_SOURCE[0]}")
script_directory=$(/usr/bin/dirname "${script_path}")
/bin/bash "${script_directory}/check-host-compatibility.sh"

if ! /usr/bin/id mooview >/dev/null 2>&1; then
  /usr/sbin/useradd \
    --system \
    --home-dir /var/lib/mooview \
    --create-home \
    --shell /usr/sbin/nologin \
    mooview
fi

/usr/bin/install -d -o root -g root -m 0755 /etc/apt/keyrings
/usr/bin/install -d -o root -g mooview -m 0750 /etc/mooview
/usr/bin/install -d -o mooview -g mooview -m 0750 /opt/mooview
/usr/bin/install -d -o mooview -g mooview -m 0750 /var/lib/mooview
/usr/bin/install -d -o root -g root -m 0755 /var/cache/mooview

/usr/bin/curl -fsSL \
  https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key \
  | /usr/bin/gpg --dearmor --yes -o /etc/apt/keyrings/nodesource.gpg
/usr/bin/chmod 0644 /etc/apt/keyrings/nodesource.gpg
echo "deb [arch=amd64 signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main" \
  > /etc/apt/sources.list.d/nodesource.list

/usr/bin/curl -fsSL \
  https://pkgs.tailscale.com/stable/ubuntu/jammy.noarmor.gpg \
  -o /usr/share/keyrings/tailscale-archive-keyring.gpg
/usr/bin/curl -fsSL \
  https://pkgs.tailscale.com/stable/ubuntu/jammy.tailscale-keyring.list \
  -o /etc/apt/sources.list.d/tailscale.list

/usr/bin/apt-get update
DEBIAN_FRONTEND=noninteractive /usr/bin/apt-get install -y \
  build-essential \
  ca-certificates \
  curl \
  file \
  git \
  gnupg \
  jq \
  netcat-openbsd \
  nodejs \
  openssl \
  python3 \
  python3-pip \
  python3-venv \
  rsync \
  tailscale \
  xz-utils

echo "Node.js: $(/usr/bin/node --version)"
echo "npm: $(/usr/bin/npm --version)"
echo "Python: $(/usr/bin/python3 --version)"
echo "Tailscale: $(/usr/bin/tailscale version | /usr/bin/head -n 1)"
echo "実行基盤の準備が完了しました。"
