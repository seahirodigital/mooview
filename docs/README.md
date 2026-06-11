# MooView ドキュメント

MooView は、Moomoo OpenD から株価・ローソク足・銘柄情報を取得し、ウォッチリストと複数チャートで比較できるWebアプリです。

## 現在のバージョン

**V0.2 / package version `0.2.0`**

V0.2では、比較チャートの視認性を中心に改善しました。

- 比較銘柄のチャート色を拡張し、多数の銘柄を重ねても色が繰り返されにくくしました。
- 比較ラインへマウスオーバーしたとき、銘柄コードや `CRM/SPY` のような演算コードをチャート上にオーバーレイ表示します。
- 複数比較時、右軸の数値列にチャート色と同じ小さな変動率タブを表示します。
- 右軸タブは軸に密着し、銘柄名は入れず、変動率だけを1行で表示します。
- 右軸タブが縦方向に重なる場合は、順位が読み取れるように上下へずらして表示します。
- RSI/MACDなどのサブチャート右上に、表示と縮小を切り替えるボタンを追加しました。

## 主要機能

- Moomoo OpenD 経由の実データ取得
- ウォッチリスト管理
- 複数銘柄の一括追加
- 複数チャート表示
- ウォッチリストからの複数選択比較追加
- ドラッグ&ドロップによる比較チャート追加
- `CRM/SPY` のような割り算チャート
- `US10Y.BD-JP10Y.BD` のような引き算チャート
- RSI、MACD、SMA、EMA、ボリンジャーバンド、VRVPなどの指標表示

## 演算チャート

ウォッチリストの銘柄追加欄では、通常のティッカーだけでなく、`/` と `-` を使った演算式を入力できます。

```text
CRM/SPY
XLK/SPY
JP.7203/JP.1306
US10Y.BD-JP10Y.BD
```

- `CRM/SPY`: Salesforce を S&P 500 ETF で割り、相対的な強弱を表示します。
- `XLK/SPY`: 米国テクノロジーセクターの S&P 500 に対する相対推移を表示します。
- `JP.7203/JP.1306`: トヨタを TOPIX 連動ETFで割り、相対推移を表示します。
- `US10Y.BD-JP10Y.BD`: 米国10年債金利と日本10年債金利の差を表示します。

演算式チャートでは、SMA、EMA、ボリンジャーバンド、RSI、MACD、VRVPなどの指標はデフォルトで非アクティブになります。

## 複数銘柄の一括追加

銘柄追加欄では、カンマ区切りで複数銘柄をまとめて追加できます。

```text
AAPL,MSFT,NVDA,CRM/SPY
```

ウォッチリストでは、CtrlクリックまたはShiftクリックで複数銘柄を選択できます。複数選択した状態でチャート内の `+` を押すと、選択中の銘柄をまとめて比較ラインへ追加します。同じく、複数選択した銘柄をチャートへドラッグ&ドロップしても比較ラインへ追加できます。

## ローカル起動

作業フォルダ:

```powershell
Set-Location -LiteralPath "C:\Users\mahha\OneDrive\開発\mooview"
```

初期セットアップと起動:

```powershell
npm.cmd run setup:local
& "C:\Users\mahha\AppData\Local\mooview\venv\Scripts\python.exe" -m pip install -r "C:\Users\mahha\OneDrive\開発\mooview\requirements-moomoo.txt"
npm.cmd run install:local
npm.cmd run dev
```

開発サーバーは `http://127.0.0.1:3000` で起動します。

## 構成

```text
Moomoo OpenD
  -> Python gateway
  -> MooView server
  -> React app
```

主なファイル:

- `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx`
- `C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx`
- `C:\Users\mahha\OneDrive\開発\mooview\src\chartSeriesColors.ts`
- `C:\Users\mahha\OneDrive\開発\mooview\src\symbolExpression.ts`
- `C:\Users\mahha\OneDrive\開発\mooview\server.ts`
- `C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py`

## 検証

変更後は以下を実行します。

```powershell
npm.cmd run lint
npm.cmd run build:web
```

## GitHubとリリース

GitHubリポジトリ:

```text
https://github.com/seahirodigital/mooview
```

V0.2リリース:

```text
https://github.com/seahirodigital/mooview/releases/tag/v0.2
```

## Gitに入れないもの

以下は機密情報または生成物なので、GitHubへアップロードしません。

- `C:\Users\mahha\OneDrive\開発\mooview\.env`
- `C:\Users\mahha\OneDrive\開発\mooview\.vercel`
- `C:\Users\mahha\OneDrive\開発\mooview\node_modules`
- `C:\Users\mahha\OneDrive\開発\mooview\dist`
- `C:\Users\mahha\OneDrive\開発\mooview\build`
- `C:\Users\mahha\OneDrive\開発\mooview\coverage`
- `C:\Users\mahha\OneDrive\開発\mooview\*.log`
- `C:\Users\mahha\OneDrive\開発\mooview\__pycache__`
