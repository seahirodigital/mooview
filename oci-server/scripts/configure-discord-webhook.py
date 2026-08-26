#!/usr/bin/env python3
"""標準入力で受け取ったDiscord Webhook URLをOCIの秘密設定へ安全に保存する。"""

from __future__ import annotations

import argparse
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse


ENV_PATH = Path("/etc/mooview/mooview.env")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def validate_webhook_url(raw_value: str) -> str:
    value = raw_value.strip()
    parsed = urlparse(value)
    if (
        not value
        or "\n" in value
        or "\r" in value
        or parsed.scheme != "https"
        or parsed.netloc not in {"discord.com", "discordapp.com"}
        or not parsed.path.startswith("/api/webhooks/")
    ):
        fail("Discord Webhook URLの形式が正しくありません。")
    return value


def update_env_text(current_text: str, webhook_url: str, target: str) -> str:
    replacements = (
        {
            "HIGH_DIVIDEND_DISCORD_WEBHOOK_URL": webhook_url,
            "MOOVIEW_HIGH_DIVIDEND_AUTOMATION_ENABLED": "true",
        }
        if target == "high-dividend"
        else {
            "DISCORD_WEBHOOK_URL": webhook_url,
            "MOOVIEW_DISCORD_AUTOMATION_ENABLED": "true",
        }
    )
    output_lines: list[str] = []
    replaced: set[str] = set()
    for line in current_text.splitlines():
        key = line.split("=", 1)[0].strip()
        if key in replacements:
            output_lines.append(f"{key}={replacements[key]}")
            replaced.add(key)
        else:
            output_lines.append(line)
    for key, value in replacements.items():
        if key not in replaced:
            output_lines.append(f"{key}={value}")
    return "\n".join(output_lines).rstrip() + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Discord Webhook URLをOCIの秘密設定へ保存します。")
    parser.add_argument(
        "--target",
        choices=("main", "high-dividend"),
        default="main",
        help="保存先。mainは既存通知、high-dividendは高配当シミュレーター専用です。",
    )
    args = parser.parse_args()
    if os.geteuid() != 0:
        fail("管理者権限が必要です。実行許可を得た後、rootとして実行してください。")
    if not ENV_PATH.is_file():
        fail(f"秘密設定ファイルがありません: {ENV_PATH}")

    webhook_url = validate_webhook_url(sys.stdin.read())
    updated_text = update_env_text(
        ENV_PATH.read_text(encoding="utf-8"),
        webhook_url,
        args.target,
    )
    import grp

    mooview_group_id = grp.getgrnam("mooview").gr_gid
    temporary_path: Path | None = None
    try:
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=".mooview.env.",
            dir=str(ENV_PATH.parent),
            text=True,
        )
        temporary_path = Path(temporary_name)
        with os.fdopen(descriptor, "w", encoding="utf-8", newline="\n") as handle:
            handle.write(updated_text)
            handle.flush()
            os.fsync(handle.fileno())
        os.chown(temporary_path, 0, mooview_group_id)
        os.chmod(temporary_path, 0o640)
        os.replace(temporary_path, ENV_PATH)
        temporary_path = None
    finally:
        if temporary_path is not None:
            temporary_path.unlink(missing_ok=True)

    target_label = "高配当シミュレーター" if args.target == "high-dividend" else "既存通知"
    print(f"{target_label}用Discord Webhook URLを /etc/mooview/mooview.env へ保存しました。")
    print("Webhook URLの値は表示していません。")


if __name__ == "__main__":
    main()
