# MooView OCIサーバー構築手順

## 目的と完成後の状態

この構成は、Windowsで稼働中のローカル版を一切置き換えず、Oracle Cloud Infrastructure上に独立したMooViewを追加します。ローカル版とOCI版は同じ共通ソースを使いますが、プロセス、認証設定、ログ、Python環境は完全に分離します。

完成後は、同じTailscaleネットワークへ参加したWindowsとMacから、専用HTTPS URLでOCI版MooViewを開けます。OpenD、Pythonゲートウェイ、MooViewはOS再起動後も自動復旧します。

OCI版のチャート一覧、配置、比較線、インジケーター、ウォッチリスト、サイドバー、
バリューチェーン／マクロ画面などの設定はサーバーへ保存されます。
`/var/lib/mooview/workspace-settings.desktop.json` を全端末共通の正本として使用し、
Windows、Mac、iPhone、Androidはすべて同じ設定を読み書きします。
`profile=mobile` でアクセスした既存クライアントも共通正本へ接続します。
旧 `/var/lib/mooview/workspace-settings.mobile.json` は移行時の保全対象として残しますが、
新しい保存先としては使用しません。
別端末では画面の再読込またはブラウザへ戻った時に最新設定を取得します。
ローカル版は従来どおりブラウザ保存を維持し、接続設定画面の
「現在の設定をOCIへコピー」から初回データを移行できます。

## 構成

```text
moomooサーバー
  ↓
OCI: Moomoo OpenD 127.0.0.1:11111
  ↓
OCI: Pythonゲートウェイ 127.0.0.1:8787
  ↓
OCI: MooView 127.0.0.1:3000
  ↓
Tailscale Serve 限定HTTPS
  ↓
Windows / Mac のブラウザ
```

`11111`、`8787`、`3000` は公開インターネットへ開放しません。MooView本体には独自ログイン機能がないため、OCIのパブリックIPへ直接公開してはいけません。

## ローカル版を守る設計

- `C:\Users\mahha\OneDrive\開発\mooview\MooViewを起動.bat` は変更しません。
- `C:\Users\mahha\OneDrive\開発\mooview\scripts\start-mooview.ps1` は変更しません。
- `C:\Users\mahha\OneDrive\開発\mooview\server.ts` と `C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py` は共通ソースとしてそのまま利用します。
- OCI専用設定は、ローカルでは `C:\Users\mahha\OneDrive\開発\mooview\oci-server`、OCIでは `/etc/mooview` と `/opt/mooview` に分離します。
- OCI側OpenDは `auto_hold_quote_right=1` で起動し、クラウド側のデータ取得を優先します。日本株セクターやTPX系ウォッチリストをOCIで安定表示するためです。
- 日本株のquote権限がOpenD側で取得できない場合でもチャート描画を維持するため、`/opt/mooview/app/moomoo_gateway.py` はJP銘柄だけYahoo Finance chart APIへフォールバックします。このため `/etc/systemd/system/moomoo-gateway.service` は外部HTTPSへ到達できる必要があります。待受は引き続き `127.0.0.1:8787` に限定します。

同じmoomooアカウントでは複数OpenDを起動できますが、最高相場権限は同時に1台だけです。OCI側を優先するため、ローカル側がBMP相当の権限へ下がる場合があります。

## OCIコンソールで作成するインスタンス

画面上部のリージョンは `Japan East (Tokyo)` のままにします。

1. OCIコンソールの「Create a VM instance」を開きます。
2. 名前は `mooview-oci` にします。
3. イメージは `Canonical Ubuntu 22.04` を選びます。
4. Shapeはx86_64の `VM.Standard.E2.1.Micro` を選び、`Always Free-eligible` 表示を必ず確認します。
5. ARMの `VM.Standard.A1.Flex` は選びません。OpenD公式Linux配布物がARM対応を明記していないためです。
6. VCNとパブリックサブネットを新規作成し、パブリックIPv4を割り当てます。
7. SSH鍵ペアを生成し、秘密鍵を `C:\Users\mahha\.ssh\oci-mooview.key` に保存します。
8. ブートボリュームは既定値の47GB以上にします。

秘密鍵はGitHub、チャット、OneDrive共有フォルダへアップロードしないでください。

Windows上で秘密鍵のアクセス権を限定するコマンド:

```powershell
icacls "C:\Users\mahha\.ssh\oci-mooview.key" /inheritance:r
icacls "C:\Users\mahha\.ssh\oci-mooview.key" /grant:r "mahha:(R)"
```

## OCIネットワーク設定

初期構築時だけ、VCNのSecurity Listで次を許可します。

| 用途 | プロトコル | 宛先ポート | Source |
|---|---:|---:|---|
| SSH | TCP | 22 | 現在利用中のグローバルIPv4アドレス `/32` |

`0.0.0.0/0` からのSSHは避けます。TCP `11111`、`8787`、`3000`、`443` は開放しません。Tailscale確認後はTCP `22` の受信ルールも削除できます。

## SSH接続

OCI画面に表示されたパブリックIPv4へ接続します。

```powershell
ssh -i "C:\Users\mahha\.ssh\oci-mooview.key" ubuntu@OCI画面に表示されたパブリックIPv4
```

## 共通ソースの配置

サーバー上の共通ソース配置先は `/opt/mooview/app` です。`C:\Users\mahha\OneDrive\開発\mooview` の変更をGitHubへ反映した後、OCIで次を実行します。最初のコマンドは配置先の親ディレクトリを作成するため、管理者権限を使います。

```bash
/usr/bin/sudo /usr/bin/install -d -o ubuntu -g ubuntu -m 0750 /opt/mooview
/usr/bin/git clone https://github.com/seahirodigital/mooview.git /opt/mooview/app
```

既存の `/opt/mooview/app` を更新する場合は、稼働中ファイルを無条件で上書きせず、Gitの差分と対象ブランチを確認してから更新します。

## 実行順序と権限確認

以下のスクリプトはサーバーを書き換えます。Codexが代理実行する場合は、各段階で理由とリスクを提示し、個別に `y/n` 確認を取ります。

### 1. 読み取り互換性確認

変更は発生しません。

```bash
/bin/bash /opt/mooview/app/oci-server/scripts/check-host-compatibility.sh
```

### 2. Ubuntu実行基盤の導入

APTリポジトリとパッケージを追加します。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/prepare-host.sh
```

### 3. 2GB swapの作成

`/swapfile` と `/etc/fstab` を変更します。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/create-swap.sh
```

### 4. OpenDの導入

公式配布元からOpenD 10.7.6708を約450MBダウンロードし、`/opt/mooview/opend` へ展開します。実行ファイルがx86-64であることと、不足ライブラリがないことを起動前に検査します。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/install-opend.sh
```

### 5. OpenD認証設定

OpenDの公式設定ファイルは `/etc/mooview/OpenD.xml` です。次の項目を編集します。

| 設定名 | 値 |
|---|---|
| `login_account` | moomoo ID、メールアドレス、または国番号付き電話番号 |
| `login_pwd_md5` | 32桁のMD5値 |
| `login_pwd` | `login_pwd_md5`を使う場合は空欄 |
| `ip` | `127.0.0.1` |
| `api_port` | `11111` |
| `lang` | `en` |
| `log_level` | `info` |
| `auto_hold_quote_right` | `1` |
| `telnet_port` | 空欄 |
| `websocket_port` | 空欄 |

パスワードを保存せずに `login_pwd_md5` を生成するコマンド:

```bash
/bin/bash /opt/mooview/app/oci-server/scripts/generate-opend-password-md5.sh
```

設定ファイルを編集するときは、認証情報を画面共有やログへ表示しないでください。編集後の権限は次の状態を維持します。

```bash
/usr/bin/sudo /usr/bin/chown root:mooview /etc/mooview/OpenD.xml
/usr/bin/sudo /usr/bin/chmod 0640 /etc/mooview/OpenD.xml
```

### 6. OpenD初回ログイン

初回は端末上でOpenDを対話起動し、APIアンケート、規約同意、端末認証を完了します。

```bash
/usr/bin/sudo -u mooview /opt/mooview/opend/current/OpenD -cfg_file=/etc/mooview/OpenD.xml -console=1 -api_ip=127.0.0.1 -api_port=11111 -lang=en -log_level=info -auto_hold_quote_right=1
```

電話認証が要求された場合、OpenDコンソールで `req_phone_verify_code` を実行し、受信したコードを `input_phone_verify_code -code=受信コード` で入力します。認証完了と `11111` の起動を確認したら、`exit` で終了します。

### 7. MooViewの本番ビルド

Python仮想環境、Node.js依存関係、本番ビルド、ランダムなゲートウェイ鍵を作成します。秘密鍵は `/etc/mooview/mooview.env` にのみ保存されます。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/install-mooview.sh
```

### 8. 自動起動設定

systemdへ3サービスを登録します。この段階では起動しません。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/install-services.sh
```

登録されるサービス:

- `/etc/systemd/system/moomoo-opend.service`
- `/etc/systemd/system/moomoo-gateway.service`
- `/etc/systemd/system/mooview.service`

### 9. 全サービス起動と実データ確認

OpenD、Pythonゲートウェイ、MooViewを依存順に起動し、`US.VOO` の実価格と日足を確認します。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/start-services.sh
```

再確認だけを行う場合:

```bash
/bin/bash /opt/mooview/app/oci-server/scripts/health-check.sh
```

### 10. Tailscale限定HTTPS

OCIをTailscaleへ追加します。

```bash
/usr/bin/sudo /usr/bin/tailscale up --hostname=mooview-oci --accept-dns=false
```

表示された認証URLを自分のブラウザで開き、Tailscaleアカウントへ追加します。その後、MooViewを限定HTTPSで公開します。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/configure-tailscale-serve.sh
```

出力された `https://mooview-oci` で始まるURLを使用します。WindowsとMacにもTailscaleを導入し、同じTailscaleネットワークへログインしてください。

## Gemini APIキーの保存

Gemini APIキーはブラウザ、Git、OneDrive、MooViewのLocalStorageへ保存しません。MooViewのNode.jsサーバーだけが、OCI上の `/etc/mooview/mooview.env` から読み取ります。

Macでユーザーが一度だけ行う作業は、APIキーの値だけを次のローカルファイルへ保存することです。このファイルはGit管理フォルダとOneDriveの外に置きます。

```text
/Users/user/.config/mooview/gemini-api-key
```

ファイルには `GEMINI_API_KEY=` を付けず、Google AI Studioで発行したキーだけを1行で保存します。保存後は所有者以外が読めない権限 `0600` にします。APIキーをチャットへ貼り付けないでください。

Codexはユーザーの個別許可を得た後、ローカルファイルを標準入力として次のOCI用スクリプトへ渡します。キーはコマンド引数、標準出力、journalログへ出ません。

```text
/opt/mooview/app/oci-server/scripts/configure-gemini-key.py
```

OCI上では、スクリプトが次の値を `/etc/mooview/mooview.env` へ原子的に保存し、所有者 `root:mooview`、権限 `0640` を維持します。

```dotenv
GEMINI_API_KEY=保存された値
GEMINI_MODEL=gemini-2.5-flash
```

より厳格なローテーション、失効期限、監査が必要になった場合は、OCI Vaultを秘密情報の原本とし、インスタンス・プリンシパルで起動時に取得する構成へ移行します。個人用のTailscale限定MooViewでは、現在の `/etc/mooview/mooview.env` 方式が依存サービスを増やさず安全性と運用性を両立します。

Geminiへの外向きHTTPS通信を許可する代わりに、MooView本体の待受は `/etc/systemd/system/mooview.service` の `HOST=127.0.0.1` でlocalhostへ限定します。外部からの閲覧経路は引き続きTailscale Serveだけです。

## 企業開示DBのAPI設定

企業開示DBは `/var/lib/mooview/disclosures.sqlite` にEDINET、EDINET DB、TDNETのメタデータ、設定、要約を保存します。PDF本体は保存せず、画面で表示、個別ダウンロード、Gemini要約を要求した時だけ配信元から取得します。14MBを超える要約対象はGemini Files APIへ一時アップロードし、処理後に直ちに削除します。PDF上限は50MBです。TDNET WEB APIはAPIキー不要です。

初回取得範囲は既定100日です。設定画面で日数を変更すると次回同期で過去分を再走査し、手動同期の完了後に新規件数、確認件数、更新なし、配信元エラー、期限切れ削除件数を表示します。既存の30日設定は起動時に100日へ移行します。新規取得があった手動同期後は絞り込みを解除し、一覧を取得日時の新しい順で1ページ目から再読込します。

大企業リストに登録されていないEDINET・EDINET DB開示は取得日時から2日後に削除します。TDNET開示は削除せずメタデータを保持します。企業マスターは削除しないため、画面の検索欄から企業名、証券コード、ティッカーコード、EDINETコードを確定すると、該当企業だけを選択中のTDNETまたはEDINET DBから再取得できます。

EDINETとEDINET DBの登録が完了したら、秘密値を `/etc/mooview/mooview.env` にだけ設定します。どちらか一方が未設定でもMooViewは正常起動し、未設定の配信元だけ同期しません。

```dotenv
EDINET_API_KEY=登録後に設定
EDINET_DB_API_KEY=登録後に設定
MOOVIEW_PUBLIC_URL=https://MooViewのTailscale限定URL
```

`GEMINI_API_KEY` と `DISCORD_WEBHOOK_URL` は既存設定を共用します。チャットへ掲載されたWebhook URLは漏えい済みとして扱い、Discord側でローテーションしてから新しい値を `/etc/mooview/mooview.env` へ保存してください。新着開示通知とGemini要約通知は初期状態でOFFなので、APIキー登録後も設定画面で明示的にONにするまで外部送信されません。

## Discord自動通知

AIボタンを右クリックし、「Discord自動通知の設定」を開くと、サーバーで実行する通知時刻を設定できます。設定画面の最上段にある「Discord通知」は既定でONです。ONの設定だけが、OCI上で日本時間に従い実行されます。

初期設定は次のとおりです。

| 通知設定 | 実行日 | 時刻 | 内容 |
|---|---|---|---|
| 日本市場フロー（11:30） | 平日 | 11:30 | 設定したGemini指示、動画、画像 |
| 日本市場フロー（15:30） | 平日 | 15:30 | 設定したGemini指示、動画、画像 |
| 米国市場セクター | 平日 | 07:00 | 設定したGemini指示、動画、画像 |

各通知設定では、平日、土日、毎日、個別曜日、複数時刻、Geminiモデル、画像対象チャート、動画対象チャート、動画時間、FPS、解像度を変更できます。選択モデルでGemini処理に失敗した場合は、自動的に `gemini-2.5-flash` へ切り替えます。

サーバー側は各実行で、チャート更新処理を開始してから必ず60秒待機します。その後、Gemini本文、MP4動画、PNG画像を作成し、Discordへ「Gemini本文 → 動画 → 画像」の順で通知します。Discord本文が2,000文字を超える場合だけ、本文を変更せず連続メッセージへ分割します。

Webhook URLは、Git、ブラウザのLocalStorage、共有設定ファイルへ保存してはいけません。OCI上の `/etc/mooview/mooview.env` にだけ保存します。値をコマンド履歴へ残さないため、次のコマンドを実行してからWebhook URLだけを標準入力へ貼り付け、最後に `Ctrl-D` を入力してください。

```bash
/usr/bin/sudo /usr/bin/python3 /opt/mooview/app/oci-server/scripts/configure-discord-webhook.py
```

この機能はPlaywrightのChromiumを使い、画面と同じチャート出力処理をOCI上で実行します。初回または更新時は、明示的な許可の後で次のインストールスクリプトを実行してください。Chromium本体と依存ライブラリを追加するため、数百MB程度のディスク容量が必要です。

```bash
/usr/bin/sudo /bin/bash /opt/mooview/app/oci-server/scripts/install-mooview.sh
/usr/bin/sudo /usr/bin/systemctl restart mooview.service
```

設定画面の「今すぐ実行」は実際のDiscord通知を開始します。実行結果は同じ画面の「直近のサーバー実行履歴」と次のログで確認できます。

```bash
/usr/bin/journalctl -u mooview.service -n 150 --no-pager
```

## 運用コマンド

状態確認:

```bash
/usr/bin/systemctl status moomoo-opend.service --no-pager
/usr/bin/systemctl status moomoo-gateway.service --no-pager
/usr/bin/systemctl status mooview.service --no-pager
```

直近ログ:

```bash
/usr/bin/journalctl -u moomoo-opend.service -n 100 --no-pager
/usr/bin/journalctl -u moomoo-gateway.service -n 100 --no-pager
/usr/bin/journalctl -u mooview.service -n 100 --no-pager
```

再起動:

```bash
/usr/bin/sudo /usr/bin/systemctl restart moomoo-opend.service
/usr/bin/sudo /usr/bin/systemctl restart moomoo-gateway.service
/usr/bin/sudo /usr/bin/systemctl restart mooview.service
```

Tailscale Serve確認:

```bash
/usr/bin/sudo /usr/bin/tailscale serve status
```

## セキュリティ上の禁止事項

- `/etc/mooview/OpenD.xml` と `/etc/mooview/mooview.env` をGitへ追加しない。
- OCI Security ListでTCP `11111`、`8787`、`3000` を公開しない。
- Tailscale Funnelを使わない。Funnelは公開インターネット向けです。
- パブリックIPのMooViewへ直接アクセスできる構成にしない。
- SSH秘密鍵やmoomooパスワードをチャットへ貼らない。
- OpenD認証ファイルを一般ユーザーから読める権限にしない。

## 公式資料

- Moomoo OpenDコマンドライン版: https://openapi.moomoo.com/moomoo-api-doc/jp/opend/opend-cmd.html
- Moomoo OpenD運用コマンド: https://openapi.moomoo.com/moomoo-api-doc/en/opend/opend-operate.html
- OCI Always Free: https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm
- Tailscale OCI: https://tailscale.com/kb/1149/cloud-oracle
- Tailscale Serve: https://tailscale.com/docs/reference/tailscale-cli/serve
