#!/usr/bin/env python3
"""OpenDの認証情報を対話入力し、設定ファイルへ安全に反映する。"""

from __future__ import annotations

import getpass
import hashlib
import os
import re
import shutil
import stat
import tempfile
from pathlib import Path


CONFIG_PATH = Path("/etc/mooview/OpenD.xml")
BACKUP_PATH = Path("/etc/mooview/OpenD.xml.pre-auth.bak")


def replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    updated, count = re.subn(pattern, replacement, text, count=1, flags=re.DOTALL)
    if count != 1:
        raise SystemExit(f"{label}を設定ファイル内で一意に検出できませんでした。")
    return updated


def main() -> None:
    if os.geteuid() != 0:
        raise SystemExit("このツールはsudoで実行してください。")

    account = input("moomooログインID・メールアドレス・電話番号: ").strip()
    if not account or "<" in account or ">" in account:
        raise SystemExit("ログインアカウントの形式が正しくありません。")

    password = getpass.getpass("moomooログインパスワード（画面には表示されません）: ")
    confirmation = getpass.getpass("確認のため、同じパスワードを再入力: ")
    if not password:
        raise SystemExit("パスワードが空です。")
    if password != confirmation:
        raise SystemExit("パスワードが一致しません。設定は変更していません。")

    original = CONFIG_PATH.read_text(encoding="utf-8")
    password_md5 = hashlib.md5(password.encode("utf-8")).hexdigest()

    updated = replace_once(
        original,
        r"<login_account>.*?</login_account>",
        f"<login_account>{account}</login_account>",
        "login_account",
    )
    updated = replace_once(
        updated,
        r"<!--\s*<login_pwd_md5>.*?</login_pwd_md5>\s*-->",
        f"<login_pwd_md5>{password_md5}</login_pwd_md5>",
        "login_pwd_md5",
    )
    updated = replace_once(
        updated,
        r"<login_pwd>.*?</login_pwd>",
        "<login_pwd></login_pwd>",
        "login_pwd",
    )

    if not BACKUP_PATH.exists():
        shutil.copy2(CONFIG_PATH, BACKUP_PATH)

    file_stat = CONFIG_PATH.stat()
    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=CONFIG_PATH.parent,
        prefix=".OpenD.xml.",
        delete=False,
    ) as temporary:
        temporary.write(updated)
        temporary_path = Path(temporary.name)

    os.chown(temporary_path, file_stat.st_uid, file_stat.st_gid)
    os.chmod(temporary_path, stat.S_IMODE(file_stat.st_mode))
    os.replace(temporary_path, CONFIG_PATH)
    print("OpenD認証設定を保存しました。平文パスワードは保存していません。")


if __name__ == "__main__":
    main()
