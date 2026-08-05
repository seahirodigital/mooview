#!/usr/bin/env python3
"""標準入力の企業開示DB設定をOCIの秘密設定へ原子的に保存する。"""

from __future__ import annotations

import grp
import json
import os
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlparse


ENV_PATH = Path("/etc/mooview/mooview.env")
REQUIRED_KEYS = ("EDINET_API_KEY", "EDINET_DB_API_KEY", "DISCORD_WEBHOOK_URL")


def fail(message: str) -> None:
    print(message, file=sys.stderr)
    raise SystemExit(1)


def read_settings() -> dict[str, str]:
    try:
        raw_payload = json.load(sys.stdin)
    except (json.JSONDecodeError, UnicodeDecodeError):
        fail("標準入力の設定形式が正しくありません。")
    if not isinstance(raw_payload, dict):
        fail("標準入力には設定オブジェクトが必要です。")
    settings = {key: str(raw_payload.get(key, "")).strip() for key in REQUIRED_KEYS}
    for key, value in settings.items():
        if not value or "\n" in value or "\r" in value:
            fail(f"{key} が設定されていません。")
    webhook = urlparse(settings["DISCORD_WEBHOOK_URL"])
    if (
        webhook.scheme != "https"
        or webhook.netloc not in {"discord.com", "discordapp.com"}
        or not webhook.path.startswith("/api/webhooks/")
    ):
        fail("DISCORD_WEBHOOK_URL の形式が正しくありません。")
    return settings


def update_env_text(current_text: str, replacements: dict[str, str]) -> str:
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
    if os.geteuid() != 0:
        fail("管理者権限が必要です。")
    if not ENV_PATH.is_file():
        fail(f"秘密設定ファイルがありません: {ENV_PATH}")

    settings = read_settings()
    updated_text = update_env_text(ENV_PATH.read_text(encoding="utf-8"), settings)
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

    print("企業開示DBの3設定を /etc/mooview/mooview.env へ保存しました。")
    print("秘密値は表示していません。")


if __name__ == "__main__":
    main()
