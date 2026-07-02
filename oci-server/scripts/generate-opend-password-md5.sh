#!/bin/bash
set -Eeuo pipefail

# OpenDが公式対応するlogin_pwd_md5値を、パスワードを保存せずに生成する。
# MD5は強い暗号化ではないため、生成値を公開したりGitへ保存したりしない。
/usr/bin/python3 -c '
import getpass
import hashlib

password = getpass.getpass("moomooログインパスワード: ")
print(hashlib.md5(password.encode("utf-8")).hexdigest())
'

