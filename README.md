# MooView

Moomoo OpenDから実際の株価とローソク足を取得する、複数チャート表示アプリです。

## 構成

ブラウザはMoomoo OpenDへ直接接続しません。

1. React画面が同一オリジンの `/api/moomoo/*` を呼び出します。
2. Node.jsまたはVercel Functionsが認証付きMoomooゲートウェイへ中継します。
3. PythonゲートウェイがOpenDの `127.0.0.1:11111` へ公式SDKで接続します。

この構成により、OpenDの接続情報と認証キーをブラウザへ公開せずに済みます。

## 本番環境の動作フロー

本番環境では、画面表示と実データ取得が別々の役割に分かれています。

```text
ユーザーのブラウザ
  ↓
Vercelが配信するReactアプリ
  ↓ /api/moomoo/status, /api/moomoo/quote, /api/moomoo/kline, /api/moomoo/search
Vercel Functions
  ↓ MOOMOO_GATEWAY_URL + MOOMOO_GATEWAY_KEY
Cloudflare TunnelのHTTPS URL
  ↓
Windows PC上のPythonゲートウェイ
  ↓ 127.0.0.1:11111
Moomoo OpenD
  ↓
Moomoo証券側の実データ
```

### OpenDの役割

OpenDは、Moomoo公式SDKが実データへアクセスするためのローカル常駐サービスです。

- Windows PC上でMoomooへログインした状態で動かします。
- `127.0.0.1:11111` で待ち受けます。
- 株価、ローソク足、銘柄検索などの実データ取得元です。
- OpenDのポート `11111` はインターネットへ直接公開しません。

### Pythonゲートウェイの役割

`C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py` は、OpenDとWebアプリの間に立つ中継サーバーです。

- ローカルでは `http://127.0.0.1:8787` で起動します。
- `/v1/status`、`/v1/quote`、`/v1/kline`、`/v1/search` を提供します。
- `MOOMOO_GATEWAY_KEY` が設定されている場合、`Authorization: Bearer <キー>` で認証します。
- ブラウザからOpenDへ直接触らせず、Vercel Functionsからだけ実データへアクセスさせます。

### Cloudflare Tunnelの役割

Cloudflare Tunnelは、Windows PC上の `http://127.0.0.1:8787` を、Vercel FunctionsからアクセスできるHTTPS URLへ変換します。

- OpenDそのものではなく、認証付きPythonゲートウェイだけを外へ出します。
- Quick TunnelのURLは再起動で変わることがあります。
- `C:\Users\mahha\OneDrive\開発\mooview\scripts\moomoo-production-tunnel.ps1` が、新しいTunnel URLをVercelの `MOOMOO_GATEWAY_URL` へ登録します。
- 同じスクリプトが `MOOMOO_GATEWAY_KEY` もVercelへ登録し、本番再配備まで実行します。

### Vercelの役割

Vercelは、画面配信とAPI中継を担当します。

- `C:\Users\mahha\OneDrive\開発\mooview\vercel.json` により、Viteアプリとしてビルドします。
- `npm run build:web` を実行し、`C:\Users\mahha\OneDrive\開発\mooview\dist` を配信します。
- `C:\Users\mahha\OneDrive\開発\mooview\api\moomoo\*.ts` はVercel Functionsとして動きます。
- Vercel Functionsは `MOOMOO_GATEWAY_URL` と `MOOMOO_GATEWAY_KEY` を読み、Cloudflare Tunnel先のPythonゲートウェイへPOSTします。

### GitHubの役割

GitHubは、ソースコードの保存場所であり、Vercelへ変更を渡す入口です。

- リモートリポジトリは `https://github.com/seahirodigital/mooview.git` です。
- `main` ブランチへpushすると、VercelのGit連携によりProductionデプロイが作成されます。
- 現在の本番URLは `https://moomooview.vercel.app` です。
- `https://mooview.vercel.app` はVercel上で既に使用中のため、このプロジェクトのエイリアスとしては割り当てできませんでした。
- 旧URL `https://mooview-pink.vercel.app` は不要になったため、Vercelエイリアスから削除済みです。

## ローカル保存

OneDriveにはソースコードだけを置きます。重量物の実体は次の場所に保存します。

- Python仮想環境: `C:\Users\mahha\AppData\Local\mooview\venv`
- Node.js依存関係: `C:\Users\mahha\AppData\Local\mooview\node_modules`
- ビルド成果物: `C:\Users\mahha\AppData\Local\mooview\dist`
- その他生成物: `C:\Users\mahha\AppData\Local\mooview\build`、`C:\Users\mahha\AppData\Local\mooview\coverage`

プロジェクト側の `node_modules`、`dist`、`build`、`coverage` は、上記ローカル保存先へのジャンクションです。

## ローカル起動

前提条件:

- Moomoo OpenDへログイン済み
- OpenDが `127.0.0.1:11111` で待受中
- Node.js 24
- Python 3.8

PowerShellで以下を実行します。

```powershell
Set-Location -LiteralPath "C:\Users\mahha\OneDrive\開発\mooview"
npm.cmd run setup:local
& "C:\Users\mahha\AppData\Local\mooview\venv\Scripts\python.exe" -m pip install -r "C:\Users\mahha\OneDrive\開発\mooview\requirements-moomoo.txt"
npm.cmd run install:local
npm.cmd run dev
```

開発サーバーは `http://127.0.0.1:3000`、Moomooゲートウェイは `http://127.0.0.1:8787` で起動します。

## Vercel

Vercel Functions内ではMoomoo OpenDを常駐実行できません。そのため、OpenDと `C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py` を常時稼働させる別ホストが必要です。

Vercelには次の環境変数を設定します。

- `MOOMOO_GATEWAY_URL`: HTTPS化した外部ゲートウェイURL
- `MOOMOO_GATEWAY_KEY`: 外部ゲートウェイと同じ長いランダム認証キー

外部ゲートウェイを公開する場合は、TLS終端、ファイアウォール、IP制限を必ず設定してください。OpenDのポート `11111` はインターネットへ直接公開しません。

## 本番実データトンネル

Windowsへのログイン時に、認証付きMoomooゲートウェイとCloudflare Tunnelを自動起動できます。

```powershell
Set-Location -LiteralPath "C:\Users\mahha\OneDrive\開発\mooview"
npm.cmd run tunnel:register
```

登録後は以下が自動実行されます。

1. DPAPIで暗号化した認証キーを `C:\Users\mahha\AppData\Local\mooview\production-tunnel\gateway-key.dpapi` に保存
2. `127.0.0.1:8787` で認証付きMoomooゲートウェイを起動
3. Cloudflare Quick TunnelでHTTPS URLを発行
4. Vercelの `MOOMOO_GATEWAY_URL` と `MOOMOO_GATEWAY_KEY` を更新
5. Vercel本番を再配備
6. `US.VOO` の実株価取得を自動確認

OpenDとWindows PCが停止している間は、本番サイトから実データを取得できません。Cloudflare Quick TunnelのURLは再起動時に変わりますが、監督スクリプトがVercel設定と本番配備を自動更新します。

| 名前 | 発行元 | 使う場所 | 目的 |
|------|--------|----------|------|
| `MOOMOO_GATEWAY_URL` | Cloudflare Tunnel | Vercel | Windows PC上のPythonゲートウェイへ届くURL |
| `MOOMOO_GATEWAY_KEY` | このプロジェクトのスクリプト | Vercel / Pythonゲートウェイ | 不正アクセス防止の合言葉 |
| OpenD `127.0.0.1:11111` | Moomoo OpenD | Windows PC内 | Moomoo実データ取得 |

## コード修正をGitHubとVercelへ反映する手順

次回以降、画面やAPIを修正した場合は、以下の順で進めます。

### 1. 作業場所へ移動

```powershell
Set-Location -LiteralPath "C:\Users\mahha\OneDrive\開発\mooview"
```

### 2. 変更状態を確認

```powershell
git status --short
```

### 3. 型チェックとVercel用ビルドを確認

Vercelは `C:\Users\mahha\OneDrive\開発\mooview\vercel.json` の `buildCommand` に従い、`npm run build:web` を実行します。ローカルでも同じコマンドで確認します。

```powershell
npm.cmd run lint
npm.cmd run build:web
```

### 4. 変更をステージする

対象ファイルだけを `git add` します。例:

```powershell
git add "C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx"
git add "C:\Users\mahha\OneDrive\開発\mooview\src\components\IndicatorSettingsPanel.tsx"
git add "C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx"
git add "C:\Users\mahha\OneDrive\開発\mooview\src\types.ts"
git add "C:\Users\mahha\OneDrive\開発\mooview\README.md"
```

### 5. コミットする

```powershell
git commit -m "変更内容を短く英語または日本語で記載"
```

例:

```powershell
git commit -m "Improve dashboard layout controls"
```

### 6. GitHubへpushする

```powershell
git push origin main
```

これにより、GitHubの `main` ブランチへ変更が反映されます。VercelのGit連携が自動でProductionデプロイを開始します。

### 7. Vercelデプロイを確認する

Vercel CLIを使う場合、Windowsの証明書設定により `NODE_OPTIONS=--use-system-ca` が必要なことがあります。

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npx.cmd vercel ls mooview --yes
```

最新デプロイの詳細確認:

```powershell
$env:NODE_OPTIONS="--use-system-ca"
npx.cmd vercel inspect <最新のVercelデプロイURL>
```

`Status` が `Ready` なら、Vercelへの反映は完了しています。

## 実データが動かない時の確認順

本番サイトでチャートやウォッチリストの実データが動かない場合は、以下の順で確認します。

1. Windows PCが起動しているか。
2. Moomooアプリへログイン済みか。
3. OpenDが `127.0.0.1:11111` で待ち受けているか。
4. `C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py` が `127.0.0.1:8787` で起動しているか。
5. Cloudflare Tunnelが起動し、HTTPS URLを発行しているか。
6. Vercelの `MOOMOO_GATEWAY_URL` が現在のCloudflare Tunnel URLになっているか。
7. Vercelの `MOOMOO_GATEWAY_KEY` がPythonゲートウェイ側のキーと一致しているか。
8. Vercelの最新Productionデプロイが `Ready` になっているか。

手動で本番実データトンネルを再登録する場合:

```powershell
Set-Location -LiteralPath "C:\Users\mahha\OneDrive\開発\mooview"
npm.cmd run tunnel:register
```

このコマンドは、認証キーの保存、Pythonゲートウェイ起動、Cloudflare Tunnel起動、Vercel環境変数更新、Vercel本番再配備、実株価取得確認までをまとめて行います。

## Gitに入れないもの

以下は機密情報または生成物なので、GitHubへアップしません。

- `C:\Users\mahha\OneDrive\開発\mooview\.env`
- `C:\Users\mahha\OneDrive\開発\mooview\.vercel`
- `C:\Users\mahha\OneDrive\開発\mooview\node_modules`
- `C:\Users\mahha\OneDrive\開発\mooview\dist`
- `C:\Users\mahha\OneDrive\開発\mooview\build`
- `C:\Users\mahha\OneDrive\開発\mooview\coverage`
- `C:\Users\mahha\OneDrive\開発\mooview\*.log`
