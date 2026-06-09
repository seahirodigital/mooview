# MooView

Moomoo OpenDから実際の株価とローソク足を取得する、複数チャート表示アプリです。

## 構成

ブラウザはMoomoo OpenDへ直接接続しません。

1. React画面が同一オリジンの `/api/moomoo/*` を呼び出します。
2. Node.jsまたはVercel Functionsが認証付きMoomooゲートウェイへ中継します。
3. PythonゲートウェイがOpenDの `127.0.0.1:11111` へ公式SDKで接続します。

この構成により、OpenDの接続情報と認証キーをブラウザへ公開せずに済みます。

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
