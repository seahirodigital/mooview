# MooView ドキュメント

MooView は、Moomoo OpenD から株価・ローソク足・銘柄情報を取得し、ウォッチリストと複数チャートで比較できるWebアプリです。

## 現在のバージョン

**V0.3 / package version `0.3.0`**

V0.3は「バリューチェーンマップ実装前の記録」です。既存チャート機能を保ったまま、次に実装するバリューチェーンマップ機能のPRDを `C:\Users\mahha\OneDrive\開発\mooview\docs\valuchain_heatmap_spec.md` に保存しました。

- バリューチェーンマップの目的、画面構成、ズーム&パン、CSV/JSON入出力、ヒートマップ、日付操作、編集操作、既存チャート連携を仕様化しました。
- 実装前の基準点として、`v0.3` タグでGitHubに記録します。
- V0.3時点ではバリューチェーン画面の実装はまだ行わず、実装前PRDの保存を主目的とします。

## V0.2

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

## 企業開示DB

左メニューの「マクロ資金フロー」の直下にある「企業開示DB」では、EDINETとEDINET DBから取得した企業開示をSQLiteへ蓄積し、PDF本体を常時保存せず一覧表示します。APIキー未登録の間も画面とDBは空状態で正常起動します。

- 初期表示は「大企業のみ」がONです。`C:\Users\mahha\OneDrive\開発\mooview\TOPIX 100.csv` と `C:\Users\mahha\OneDrive\開発\mooview\日経225.csv` のうち、市場列が日本株で、指数・ETF・債券・FXではない個別銘柄を統合します。
- 社名の部分一致、証券コード、`7203.JP` 形式のティッカー、開示タイトルで検索できます。検索欄右端の再取得アイコンまたはEnterキーで、企業マスターのEDINETコードに一致する企業だけをEDINET DBから再取得します。
- 各見出しは、クリックするたびにデフォルト、昇順、降順を切り替えます。
- 各見出しはドラッグで列順を変更でき、右端の境界ドラッグで列幅を変更できます。列順と列幅はブラウザへ保存します。
- 1ページの表示件数は50、100、200、300、全てから選択できます。
- PDFは表示またはダウンロードを要求した時だけ取得します。複数選択時もZIPを作らず、選択したPDFを1件ずつ個別ダウンロードします。
- 資料URL、IR / EDINET DB、バフェット・コード列は、横幅を抑えるためリンクアイコンだけを表示します。バフェット・コードは `https://www.buffett-code.com/company/7203/` のように証券コードから生成します。
- EDINETコードは一覧のコード列へ表示せず、`https://edinetdb.jp/company/E02513` のようなEDINET DB企業ページの生成にだけ使用します。行の右クリックは会社名見出しを置かず、EDINET DB、バフェット・コード、PDF表示、個別ダウンロード、Gemini要約、企業別Discord通知から始まります。
- 選択した開示は既存のGemini処理で順番に要約し、設定がONの場合だけDiscordへ通知します。14MBを超えるPDFはGemini Files APIへ一時アップロードし、要約処理後に直ちに削除します。上限は50MBです。
- TDNET WEB APIの適時開示も同じ一覧へ保存し、証券コードは配信値末尾の不要な0を除いた4桁で扱います。TDNET、EDINET、ノイズ除去、大企業のみを個別に絞り込めます。
- 歯車の下にある通知設定から、EDINET新着通知、TDNET新着通知、Gemini要約通知、配信元別要約プロンプト、大企業ごとのEDINET・TDNET通知対象を編集できます。3種類のDiscord通知は初期状態でOFFです。
- 初回取得範囲は既定100日です。取得日数を変更すると次回同期で過去分を再走査し、手動同期は新規件数、確認件数、更新なし、配信元エラーを完了後に表示します。新規取得があった手動同期後は絞り込みを解除して1ページ目を再取得し、今回追加された情報を取得日時の新しい順で上段へ反映します。
- 大企業リストに登録されていないEDINET・EDINET DB開示は、取得日時から2日後に自動削除します。TDNETはPDF本体を持たず、開示メタデータを期間制限なく保持します。企業マスターは残すため、必要になった企業だけ検索欄から選択中の配信元を再取得できます。

ローカルの秘密値は `C:\Users\mahha\OneDrive\開発\mooview\.env` にだけ保存します。値をGit、ブラウザのLocalStorage、共有設定へ保存してはいけません。

```dotenv
EDINET_API_KEY=登録後に設定
EDINET_DB_API_KEY=登録後に設定
GEMINI_API_KEY=登録済みの値
DISCORD_WEBHOOK_URL=ローテーション後の新しいWebhook URL
MOOVIEW_PUBLIC_URL=通知に載せるMooViewのURL
```

ローカルDBの既定保存先は `C:\Users\mahha\.local\share\mooview\disclosures.sqlite` です。`MOOVIEW_DATA_DIR` を指定した場合は、その絶対パス直下の `disclosures.sqlite` を使用します。

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

V0.3リリース:

```text
https://github.com/seahirodigital/mooview/releases/tag/v0.3
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
