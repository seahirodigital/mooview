# マクロ資金フロー画面 開発計画（上位追記）

## 0.0 再認識したプロダクト目的（2026-06-14修正）

この画面の主目的は、「現在どこに資金があるか」をランキング表示することではない。

主目的は、`NVDA Earnings` のようなイベント発生後に、資金がどの `Sector -> Theme/Basket -> Stock` へ、どの時点で波及したかを時系列で可視化することである。

分析導線は以下とする。

1. イベントを選ぶ。
2. 既存カレンダーUIと2点レンジスライダーで開始日と終了日を選ぶ。選択開始日を動的なT0相当として扱い、固定の横軸ラベルには合わせない。
3. 選択期間の `Node Volume` と `Link Weight` を再計算する。
4. 箱の縦幅で資金容量を示す。
5. 線の太さで `Flow Score` 比率による資金伝播経路を示す。
6. 最終到達銘柄を右列と右サイドパネルのチャートで確認する。

したがって、UI上の主役は3列ランキングではなく、ページ上部タイムライン直下のフロー図である。`Regional Markets`、`Sectors`、`Themes/Baskets`、`Stocks` の一覧は、フロー図を読むための補助情報として扱う。

現段階ではバックエンドDBが未整備のため、既存のバリューチェーン構成銘柄、時価総額相当値、変化率、疑似出来高倍率を使って、将来のDB値へ差し替え可能な同名ロジックで先行実装する。

## 0.1 UI再修正方針（2026-06-14追加）

初期UIに `Event Selector` は表示しない。イベント選択機能は後段開発で扱うため、メイン画面と右サイドパネルの初期導線から外す。

`Propagation Timeline` は固定の `T0 / T+3 / T+7 / T+14 / T+30` ボタンではなく、開始日と終了日の2点レンジスライダーとする。既存カレンダーUIで開始日・終了日を直接選択でき、スライダー上の2つの丸ハンドルでも期間を調整できるようにする。`Quick Range` は置かない。

フローの色はカラフルなBasket別カラーを使わない。通常経路は薄いグレー、クリック中の経路だけ既存ヒートマップに合わせた緑または赤で強調する。プラスは緑、マイナスは赤、強いほど濃くする。

フロー図内の `Sectors`、`Themes/Baskets`、`Stocks` のカードは、縦スクロールを抑えるため小さくする。カード内に表示する情報は以下に限定する。

- `Sector` と `Theme/Basket`: 名称、変動率、Vol数値。
- `Stock`: コード、銘柄名、変動率、Vol数値。

`Volume` や `Flow` のラベル文字、Alpha、Momentumなどの詳細はカード内に常時表示せず、マウスオーバーのツールチップで確認する。

Ctrl + マウスホイールなどでブラウザ表示倍率が変わっても、SVGのフロー線とHTMLカードがずれないようにする。SVGとカードを同じ固定キャンバス幅・同じ座標系で配置し、`preserveAspectRatio="none"` による伸縮ずれは使わない。

## 0.2 最新UI修正方針（2026-06-14追加）

`Event Window` 表示枠は削除し、その場所に `Propagation Timeline` を置く。`Propagation Timeline 2026-06-17 -> 2026-07-02` のような期間テキストは表示せず、バー下の両端に開始日と終了日だけを表示する。`T0`、`T+14` などの固定ラベルも表示しない。選択した両端の間には、`15D` のような選択日数だけを表示する。

`Sectors`、`Themes/Baskets`、`Stocks` の列境界はドラッグで縮小・拡大できるようにする。列幅変更に合わせて、各カードの横幅とSVGフロー線の接続座標も同じ座標系で再計算する。右サイドパネルのチャート表示領域も、左境界をドラッグして幅を変更できるようにする。

個別銘柄は、シングルクリックでは選択、ハイライト、Stock列の絞り込み、右サイドパネルの対象銘柄更新だけを行う。チャート表示は個別銘柄のダブルクリックで開く。チャート表示中は、`Esc` キーまたはチャート外クリックでチャートパネルを閉じられるようにする。

選択中のカードでは、名称、銘柄名、コード、変動率、Volなどの表示数値を白にする。未選択経路は薄いグレーに落とし、選択経路だけをヒートマップ系の緑または赤で強調する。フロー線はカードより派手にせず、グローを使わない。線の太さと濃度は `Flow Score` 比率に相関させ、弱い銘柄へ向かう線ほど細く薄くする。

フロー線はカード背景より濃くしない。カード背景は不透明にし、背面の線がカード内に透けて見えないようにする。選択中カードの背景は濃い緑または濃い赤の面として扱い、フロー線はその面より一段落とした透明度で描画する。

Stockカードは3行にしない。米国株は1行目にティッカーコード、2行目に銘柄名と時価総額を表示する。日本株は1行目に銘柄名、2行目にコードと時価総額を表示する。変動率は右側に維持する。

## 0.3 最新UI修正方針（2026-06-14追加2）

`Event Propagation Flow` の見出し行は削除する。フロー図の読み取りに必要な情報は、キャンバス内の列見出しとカード、ツールチップ、右サイドパネルへ集約する。

ヘッダー左上の `マクロ資金フロー` と `2026-06-10 - 2026-07-10` の表記は不要とし、その位置にスコープ選択プルダウンを置く。プルダウン先頭のデフォルトは `マクロ全体` とする。`マクロ全体` の下には、個別銘柄やRegional/ETFではなく、バリューチェーン画面のプルダウンに入っているサプライチェーン名を表示する。現状例は `半導体サプライチェーン`、`GLP-1サプライチェーン` などであり、今後もバリューチェーン履歴と現在チェーンから自動的に増える形にする。

`Propagation Timeline` という表示テキストは画面に出さない。代わりに同じ行へ開始日、選択日数、終了日を表示する。タイムラインUIは黒背景の裸レイアウトとし、四角いカード枠を付けない。

フロー本体は左から `Regional Markets`、`Sectors`、`Themes/Baskets`、`Stocks` の4列にする。ただし `Regional Markets -> Sectors` のフロー線は描かない。資金伝播の線は引き続き `Sectors -> Themes/Baskets -> Stocks` のみとする。

`Regional Markets` には、初期候補として `US market: VT`、`JP: EWJ`、`EU: VGK`、`米債: US10Y`、`為替: USD/JPY`、`金: GOLD/USD`、`ドル指数: DXY`、`原油: WTI`、`VIX: VIX指数` を置く。各カードは他列カードと同じ密度で、名称、コード、価格、変動率を表示する。数値は選択期間に連動して変化する。カード自体をドラッグして上下順序を変更できるようにし、専用の掴みアイコンは置かない。

列幅変更の境界は常時薄い灰色線で表示し、どこを掴めばよいか分かるようにする。`Regional Markets / Sectors`、`Sectors / Themes/Baskets`、`Themes/Baskets / Stocks` の各境界をドラッグで調整できるようにする。

右サイドパネルのチャートは、マクロ資金フロー画面では日足を基本にする。選択期間の全てを厳密に収める必要はないが、指定期間のおおむね8割程度が視界に入る前提で、左右に少し期間外のローソクが見えてもよい。
右サイドパネルのチャート内には、既存チャートと同じ `1m`、`3m`、`5m`、`10m`、`30m`、`1h`、`4h`、`day`、`Week`、`1M` の時間足切替UIを置く。個別株・Regional Marketsカードをダブルクリックして開いたチャートでも同じ操作で時系列を切り替えられるようにする。

## 0.4 実データ・日付・密度の修正方針（2026-06-15追加）
日付スライダーの右端は常に最新日程、すなわちユーザー環境の今日の日付とする。固定の未来日を初期値にしない。2026-06-15時点では、右端を2026-06-15とし、それより未来のカレンダー日は選択不可にする。

個別株、Regional Markets、セクター、バスケットの表示値は、取得できる限り `Moomoo OpenAPI` の `/api/moomoo/quotes` の最新値を優先する。取得できていない銘柄やマクロ指標は、疑似の変動率を生成して `+0.00%` のように見せず、`N/A` またはニュートラル表示にする。単日指定では当日のquote変動率をそのまま表示する。

カードと列の余白は、フロー図を主役にするため最小限にする。左端の余白、列間隔、カード内paddingを詰め、カード幅を列境界に近いところまで広げる。列境界は薄い灰色線で常時表示し、ドラッグ可能な場所が分かるようにする。

## 0. この追記の目的

この計画は、`C:\Users\mahha\OneDrive\開発\mooview\docs\spec_macro_flow.md` に記載済みの資金フロー可視化システム仕様を、現在のMooView実装と矛盾なく新規ページへ落とし込むための上位開発計画である。

目的は、JPEG参考デザインの見た目をそのまま孤立実装することではなく、既存のMooViewヘッダー、検索、日付UI、右サイドパネル、チャート表示、設定パネル、バリューチェーンデータを流用し、画面全体の操作感を統一することである。

完了後のベネフィットは、ユーザーが既存のチャートビューやバリューチェーンマップと同じ感覚で、イベント後の `Sector -> Theme/Basket -> Stock` の資金伝播を時系列で追えることである。個別株はシングルクリックでフロー選択、ダブルクリックで既存チャートを右サイドパネルに表示できる。

## 1. 今回の前提と優先順位

- `winmacsync` は今回の作業では実行しない。
- 新規ページ名は `マクロ資金フロー` とする。
- ハンバーガーメニュー内の既存 `今後の予定` の場所を、`マクロ資金フロー` へ置き換える。
- 既存の `チャートビュー` と `バリューチェーンマップ` は維持し、既存導線を壊さない。
- JPEG参考デザインのうち、MooView既存UIと重複する機能は既存UIフォーマットを優先して流用する。
- 初回実装では、すでに存在する個別株、セクター、バスケット相当のバリューチェーンデータがある前提で開始する。
- バスケット構成データベースの追加、編集、削除、インポート、エクスポートは重要だが、開発ステップの最後尾で実装する。
- JPEG左上のイベントセレクターは初期UIに入れない。イベント比較が必要になる後段で、別途仕様化する。

## 2. 既存実装から流用する対象

主要な流用元は以下とする。

- `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx`
  - ハンバーガーメニューと画面切替
  - 既存ヘッダー
  - ヘッダー銘柄表示
  - 既存チャート描画関数
  - インジケーター設定パネル呼び出し
- `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx`
  - 右固定サイドパネル
  - 右サイドパネルのチャート表示アイコン
  - 右サイドパネルの歯車設定アイコン
  - 日付スライダー
  - カレンダーUI
  - バリューチェーンデータ構造
  - CSV/JSONインポート、エクスポート導線
  - 銘柄ダブルクリック時のチャート表示導線
- `C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx`
  - 個別株チャート表示
  - 複数銘柄比較チャート表示
- `C:\Users\mahha\OneDrive\開発\mooview\src\components\IndicatorSettingsPanel.tsx`
  - チャート設定UI
  - 歯車アイコンから開く設定パネル

## 3. 新設ページの全体レイアウト方針

`マクロ資金フロー` ページは、MooView全体の統一感を優先し、以下の構成にする。

- 上部は既存のMooViewヘッダーをそのまま使う。
- ヘッダー下のプルダウン、検索フォーム、フォント、カレンダーUI、日付操作行は既存ページのUIを流用する。
- JPEG参考デザイン右上の独自アイコン、通知、検索は不要とする。
- JPEG参考デザイン左のサイドパネルは不要とする。
- JPEG参考デザインの `Macro Drivers` 行は不要とし、行ごと実装対象外にする。
- `Regional Markets` はフロー本体の左端列として表示する。ただし `Regional Markets -> Sectors` の線は描かない。
- 資金フローの中心は `Sectors -> Themes/Baskets -> Stocks` の3列構造とし、その左に独立した `Regional Markets` 列を置く。
- `Sectors`、`Themes/Baskets`、`Stocks` は横並びの順位テーブル兼フロー接続レイヤーとして扱う。
- 下部または中央のフローチャートは、日付スライダーの操作に合わせて動的に再描画する。

## 4. 右サイドパネルの統合仕様

右サイドパネルは、バリューチェーンマップの右固定サイドパネルを流用する。

必須アイコンは以下の順序で配置する。

1. チャート表示
2. 歯車設定
3. TOP Flow Summary
4. Event Annotation
5. Data Sources
6. Basket Database

上位2つの `チャート表示` と `歯車設定` は既存の見た目と動作をそのまま維持する。個別株をダブルクリックした場合、右サイドパネルのチャート表示で既存チャートを表示できるようにする。シングルクリックはフロー選択とハイライトに限定する。

`TOP Flow Summary`、`Event Annotation`、`Data Sources` は、JPEG参考デザイン内のパネル表示を画面中央に置かず、右サイドパネル内のアイコンクリックで切り替える。これにより、メインの資金フロー可視化領域を広く保つ。

`Basket Database` は、バスケット構成銘柄の可視化、追加、編集、削除、インポート、エクスポートを扱う。実装は開発ステップ最後尾でよい。

`Event Selector` は初期UIには置かない。イベント比較機能が必要になった段階で、現在の画面密度と右サイドパネル構成を崩さない形で再設計する。

## 5. ソート仕様

`Sectors`、`Themes/Baskets`、`Stocks` の各ヘッダーは、ダブルクリックで以下を循環する。

1. 昇順
2. 降順
3. 元に戻す

それぞれ独立して動作する。

`Themes/Baskets` のソートが変更された場合は、中央列だけを並び替えるのではなく、両サイドの `Sectors` と `Stocks` の順位も再計算し、フロー接続と順位表示が動的に整合するようにする。

既存のウォッチリストやバリューチェーンで使われているソート循環の考え方を流用し、UI表現も既存の矢印表示や状態管理に合わせる。

## 6. 色設定仕様

各流入の色味は変更可能にする。

操作は以下とする。

1. ユーザーがフロー行、セクター行、テーマ/バスケット行、または個別株行をダブルクリックする。
2. 右サイドパネルを開く。
3. 歯車設定アイコンをアクティブにする。
4. 対象の流入色、強調色、マイナス色、透明度、リンク線の太さ補正を変更できるようにする。

チャート指標の設定UIと混同しないように、マクロ資金フロー専用の色設定セクションを歯車パネル内へ追加する。

## 7. バスケットデータ仕様

初期の `Themes/Baskets` は、すでにバリューチェーンで作り上げられているグルーピングを使う。

開発中は現在のバリューチェーンデータのみで開始してよい。ただし、将来的にデータベースを規定形式で追加、更新できる構造にする。

右サイドパネルの `Basket Database` では、各バスケットがどの構成銘柄を持つかを可視化する。

後半実装で必要な操作は以下とする。

- バスケット一覧表示
- 構成銘柄表示
- 構成銘柄追加
- 構成銘柄編集
- 構成銘柄削除
- CSV/JSONインポート
- CSV/JSONエクスポート

インポートとエクスポートは、`C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` の既存機能を流用する。

## 8. 日付スライダーと動的フロー仕様

日付スライダーで期間内の推移を動かせるようにする。

初期例は `2026/06/03` から `2026/07/03` とする。この期間で、どのように資金フローが動いたかを下部または中央のフローチャートで動的に示す。

スライダー操作時に同期して更新する対象は以下とする。

- `Regional Markets` の数値
- `Sectors` の順位と流入値
- `Themes/Baskets` の順位と流入値
- `Stocks` の順位と流入値
- フロー線の太さ
- フロー線の色
- ノードサイズ
- TOP Flow Summary

スライダー操作中は、過度なレイアウトジャンプを避ける。バリューチェーンマップの日付スライダーで実装済みの「操作中は配置を固定し、数値と色を更新する」考え方を参考にする。

## 9. 開発ステップ

### Step 1: ルーティングとページ枠

- `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` の画面種別に `マクロ資金フロー` を追加する。
- ハンバーガーメニューの `今後の予定` を `マクロ資金フロー` に置き換える。
- 新規コンポーネント `C:\Users\mahha\OneDrive\開発\mooview\src\components\MacroFlowMap.tsx` を追加する。
- 既存ヘッダー下に、既存ページと同じプルダウン、検索フォーム、日付操作行を配置できる枠を作る。

### Step 2: メイン3列とRegional表示

- `Sectors`、`Themes/Baskets`、`Stocks` の3列を作る。
- `Regional Markets` を `Sectors` の左隣に独立列として表示する。
- `Macro Drivers` 行は作らない。
- JPEG参考デザインの左サイドパネルと右上アイコン群は作らない。
- 初期データは既存バリューチェーンのグルーピングから変換する。

### Step 3: 右サイドパネル流用

- バリューチェーンマップの右固定サイドパネル構成を流用する。
- チャート表示アイコンと歯車設定アイコンを上位2つとして維持する。
- 個別株はシングルクリックで選択・ハイライトし、ダブルクリックで右サイドパネルに既存チャートを表示する。
- `TOP Flow Summary`、`Event Annotation`、`Data Sources` をアイコン切替パネルとして追加する。
- Step 7の `Basket Database` は、追加、編集、削除、インポート、エクスポートなどの中身は後段実装でよい。ただし、右サイドパネル内のアイコン、パネル枠、基本フォーム、一覧の受け皿はStep 3で先に準備しておく。`Event Selector` は初期UIから除外する。

### Step 4: 日付スライダー連動

- 既存の日付スライダーとカレンダーUIを流用する。
- `2026/06/03` から `2026/07/03` のような期間を動かせる状態にする。
- スライダー操作に応じて、Regional、Sector、Basket、Stock、フロー線、サマリーを再計算する。
- マクロ資金フロー画面で開くチャートは日足を基本にし、選択期間が概ね視界に入るようにする。
- 初期はモック計算でもよいが、型と計算入口は実データ接続を前提に分離する。

### Step 5: ソートと順位再計算

- `Sectors`、`Themes/Baskets`、`Stocks` の各ヘッダーでダブルクリック循環ソートを実装する。
- 昇順、降順、元に戻すを独立して保持する。
- `Themes/Baskets` の順位変更時に、左右の順位とフロー接続を動的に再計算する。

### Step 6: 色設定

- 行またはフロー要素のダブルクリックで右サイドパネルの歯車設定を開く。
- マクロ資金フロー専用の色設定UIを追加する。
- 流入色、流出色、リンク色、強調色、透明度を変更できるようにする。

### Step 7: Basket DatabaseとI/O

- 右サイドパネルに `Basket Database` を追加する。
- バスケット構成銘柄を可視化する。
- 追加、編集、削除を実装する。
- CSV/JSONインポート、エクスポートは既存バリューチェーン機能を流用する。

### Step 8: イベント比較の後段仕様

- 初回実装では `Event Selector` を表示しない。
- イベント比較が必要になった段階で、期間、注釈、フロー計算対象を切り替える仕様を別途設計する。
- その際も、メイン画面のフロー図を狭める左サイドパネル型UIには戻さない。

## 10. 検証項目

変更後は最低限、以下を確認する。

```powershell
Set-Location -LiteralPath "C:\Users\mahha\OneDrive\開発\mooview"
npm.cmd run lint
npm.cmd run build:web
git diff --check
```

ブラウザ確認では以下を見る。

- ハンバーガーメニューに `マクロ資金フロー` が表示される。
- `マクロ資金フロー` へ画面遷移できる。
- 既存の `チャートビュー` と `バリューチェーンマップ` が壊れていない。
- 右サイドパネルのチャート表示と歯車設定が既存と同じ感覚で使える。
- 個別株からチャートを表示できる。
- 2点レンジスライダーとカレンダー操作で、数値、ノード高さ、リンク幅が同期する。
- `Event Propagation Flow` の見出し行が表示されない。
- ヘッダー左上は `マクロ全体` を先頭にしたプルダウンになっている。
- `Regional Markets` が `Sectors` の左列に表示され、`Regional Markets -> Sectors` の線が描かれていない。
- `Regional Markets` のカードをドラッグして上下順序を変更できる。
- 列境界が薄い灰色線として常時見える。
- マクロ資金フロー画面で右サイドチャートが日足表示になる。
- `Sectors`、`Themes/Baskets`、`Stocks` のソートが独立して循環する。
- `Themes/Baskets` のソート変更時に両サイドの順位が動的に変わる。

## 11. イベント伝播フロー再実装計画（2026-06-14修正）

`C:\Users\mahha\OneDrive\開発\mooview\docs\macro_view.png` のように、資金伝播は単なる横棒リストではなく、`Sector -> Theme/Basket -> Stock` を接続するリボン配線として可視化する。

UI上の主役は、ページ下部の補助フローではなく、上部タイムライン直下に配置するメインフロー図である。

### 修正理由

前回実装は、ランキング表示と横棒リストの延長であり、イベント後に資金がどの経路を通って波及したかを読む画面になっていなかった。

そのため、固定の `T0 / T+3 / T+7 / T+14 / T+30` マイルストーンをUI上に並べるのではなく、開始日と終了日の2点レンジで選択期間を決め、その期間の `Node Volume` と `Link Weight` に基づくメインSankey図へ再設計する。

### 実装方針

- `FlowNode` と `FlowLink` を追加し、ノードとリンクを別データとして扱う。
- `Sector -> Basket` と `Basket -> Stock` の2段階リンクを生成する。
- 3列カードの背面にSVGレイヤーを敷き、ベジェ曲線のリボンでリンクを描画する。
- ノードの縦幅は `Node Volume` の列内相対値で決める。
- リンク幅は `Flow Score` によって配分された `flowValue` の比率で決める。
- リンク色は固定パレットから割り当て、自由なカラーピッカーは使わない。
- タイムライン操作時は、ノード順位、ノード高さ、リンク幅、TOP Flow Summaryを同じ計算結果から更新する。

### 計算ロジック

- `Node Volume = 期首時点の時価総額またはAUM x (1 + 期間中の純資金流入率)`
- `Sector -> Theme/Basket Flow Score = Relative Return x Volume Expansion x Market Cap Weight`
- `Theme/Basket -> Stock Flow Score = Alpha x Volume x Momentum`
- 線の太さは、親ノードから子ノードへの `Flow Score` 比率で配分する。

現段階ではバックエンドDBが未整備のため、既存バリューチェーンの構成銘柄、時価総額相当値、変化率、疑似出来高倍率を使う。後続フェーズでFRED、Polygon.io、JPX等のDB値に差し替える。

### クリック連動

- `Sector` カードクリック時は、そのセクター配下の `Theme/Basket` と個別銘柄を強調し、`Stocks` 列にはそのセクター内の銘柄だけを表示する。
- `Theme/Basket` カードクリック時は、`Stocks` 列にそのバスケットの構成銘柄だけを表示する。
- 未選択時は全体のFlow Score順で表示する。
- リセット操作で選択状態を解除し、全体フロー表示へ戻す。

### カラーパレット制限

基本背景、パネル、罫線、文字色は現在の黒基調を維持する。フロー線、配線、バスケット色、強調色、チャート連動色だけを指定パレット内に制限する。

指定パレットは白、グレー、黒、赤、黄、緑、青緑、シアン、青、紫、マゼンタ、ピンク系のスウォッチとし、右サイドパネルの色設定はスウォッチ選択式にする。

---

# **資金フロー可視化システム 最終プロダクト仕様書 Ver 4.0**

# **Event Driven Capital Flow Intelligence Platform**

# **1. プロダクト目的**

本システムは、

「現在どこに資金があるか」

ではなく、

**あるイベント発生後に、どのセクター・テーマ・銘柄へ資金が波及したかを時系列で可視化する分析プラットフォーム**

である。

# **分析例**

**NVDA決算**

2026/06/10

NVDA Earnings

↓

T+3日

Semiconductors

↓

T+7日

AI Infrastructure

↓

T+14日

Liquid Cooling

↓

T+30日

VRT

MOD

Daikin

**分析対象**

イベント

↓

期間指定

↓

資金伝播経路

↓

最終到達銘柄

# **2. UIコンセプト**

Bloomberg

- ●

Palantir

- ●

Modern Sankey Visualization

# **レイアウト**

┌─────────────────────────────────────────────────────────────┐

│ Event Timeline                                              │

├─────────────────────────────────────────────────────────────┤

│ Macro Drivers                                               │

├─────────────────────────────────────────────────────────────┤

│ Regional Markets                                            │

├─────────────────────────────────────────────────────────────┤

│ Sector → Theme → Stock Flow                                │

└─────────────────────────────────────────────────────────────┘

# **3. デザインルール**

# **採用**

ダークテーマ

ガラス風パネル

ネオンブルーアクセント

Sankey Flow

リアルタイムアニメーション

# **不採用**

Analysis Status

AI Status

System Status

表示しない

# **不採用**

🚀

📈

💰

🔥

⚡

絵文字表示禁止

# **不採用**

個別株アイコン

企業ロゴ

国旗

セクターアイコン

表示はすべてテキストのみ

# **4. Event Timeline（最重要）**

画面上部固定

# **期間指定**

START DATE

2026/06/10

END DATE

2026/07/10

# **スライダー**

JUN

|----|----|----|----|

JUL

|----|----|----|----|

# **イベントマーカー**

T0

NVDA Earnings

T1

+3 Days

T2

+1 Week

T3

+2 Weeks

T4

+1 Month

# **動作**

ユーザーが期間変更

↓

全データ再集計

↓

フロー再描画

↓

ノードサイズ更新

↓

リンク太さ更新

# **5. Macro Drivers Layer**

# **役割**

説明レイヤー

# **フローなし**

線を描かない

# **表示対象**

Fed Balance Sheet

US10Y

DXY

VIX

WTI

CPI

PPI

BOJ

ECB

# **表示内容**

Fed Balance Sheet

+2.4%

VIX

- 11.8%

US10Y

+42bp

目的

なぜ起きたか

を説明するだけ

# **6. Regional Markets Layer**

# **UI変更（最重要）**

従来案

Regional Market

↓

Sector

を廃止

# **新仕様**

Regional Market は

Sector Layer の左側に独立配置

**構造**

Regional Markets

US Market

JP Market

EU Market

China Market

EM Market

**表示項目**

Market Cap Change

Volume Change

Relative Strength

**表示例**

US MARKET

+12.4%

Market Size

$65.2T

JP MARKET

+4.2%

Market Size

$8.1T

# **フロー禁止**

以下は描画しない

US Market

↓

Technology

理由

観測不能なため

# **7. Flow Visualization Layer**

ここからSankey開始

Sector

↓

Theme

↓

Stock

のみ

# **8. Sector Layer**

# **米国セクター**

従来の4〜5個では不足

**GICSベース**

Information Technology

Communication Services

Consumer Discretionary

Consumer Staples

Financials

Industrials

Health Care

Energy

Materials

Utilities

Real Estate

# **日本セクター**

TOPIX17

東証33業種

# **MVP**

まずは以下を実装

Information Technology

Communication Services

Industrials

Financials

Health Care

Energy

Consumer Discretionary

Materials

# **ノードサイズ**

Market Cap

Volume Expansion

Relative Strength

から算出

# **9. Theme Layer**

システムの中心

# **固定テーマ**

AI Infrastructure

Semiconductors

Memory

Power Semiconductors

Data Center

Liquid Cooling

Optical Components

MLCC

Cloud Infrastructure

Cyber Security

Industrial Automation

Robotics

Power Grid

Energy Storage

Renewable Energy

# **動的テーマ**

毎日再生成

**ロジック**

構成銘柄上昇率

＋

出来高急増

＋

相関分析

＋

クラスタリング

生成例

Murata

TDK

Taiyo Yuden

↓

MLCC

VRT

MOD

Daikin

↓

Cooling Infrastructure

# **10. Stock Layer**

# **MVP対象**

全銘柄取得は実施しない

**米国**

S&P500

+

NASDAQ100

対象

**日本**

TOPIX100

+

Nikkei225

対象

# **理由**

約1000〜1200銘柄

で十分市場の主流テーマを捕捉可能

処理負荷も大幅削減

# **11. Stock表示項目**

Ticker

Company Name

Price Change

Volume Change

Relative Strength

Flow Score

表示例

NVDA

+24.3%

Volume +128%

VRT

+37.2%

Volume +214%

# **12. フロー計算**

# **Sector → Theme**

Flow Score

=

Relative Strength

×

Volume Expansion

×

Market Cap Weight

# **Theme → Stock**

Flow Score

=

Alpha

×

Volume Expansion

×

Momentum

# **線の太さ**

Flow Score比率

で決定

# **13. データ取得範囲**

# **株価**

Polygon

# **出来高**

Polygon

JPX

# **構成銘柄**

S&P500

NASDAQ100

TOPIX100

Nikkei225

# **財務データ**

Financial Modeling Prep

# **ETF**

XLK

XLF

XLI

XLV

XLE

XLB

XLY

XLC

XLU

VNQ

# **14. MVP開発範囲**

# **実装対象**

Event Timeline

Macro Drivers

Regional Markets

Sector Layer

Theme Layer

Stock Layer

Sankey Flow

期間変更

イベント比較

# **実装対象外**

Macro → Market

Market → Sector

MMFフロー推定

Fed資金流入推定

ヘッジファンド推定ポジション

# **15. 最終UI構造**

┌─────────────────────────────────────────────────────────────┐

│ EVENT TIMELINE                                              │

│ START DATE ───────────────────── END DATE                   │

│ NVDA Earnings → T+3 → T+7 → T+14 → T+30                    │

└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐

│ MACRO DRIVERS                                               │

│ Fed | US10Y | DXY | VIX | WTI | CPI | BOJ | ECB            │

└─────────────────────────────────────────────────────────────┘

┌──────────────┬──────────────────────────────────────────────┐

│ REGIONAL     │                                              │

│ MARKETS      │              FLOW VISUALIZATION              │

│              │                                              │

│ US MARKET    │ Information Technology                       │

│ JP MARKET    │      ↓                                       │

│ EU MARKET    │ AI Infrastructure                            │

│ CHINA        │      ↓                                       │

│ EM           │ NVDA                                          │

│              │                                              │

│ サイズ変化   │ Industrials                                  │

│ のみ表示     │      ↓                                       │

│              │ Liquid Cooling                               │

│              │      ↓                                       │

│              │ VRT                                           │

└──────────────┴──────────────────────────────────────────────┘

このVer 4.0を最終MVP仕様とし、リージョナルマーケットは独立表示、資金フローは **Sector → Theme → Stock** のみを可視化する。分析の中心は「イベント発生後の指定期間における資金伝播」であり、現在値表示ではなく時系列比較を主目的とする。
# 2026-06-15 追記: ボトムアップ型セクター集計への設計変更

## 最上位方針

マクロ資金フロー画面の `Sectors` は、外部の米国セクターETFや国別ETFを親にした分類ではない。`Sectors` は、個別株の合計から作られるテーマバスケット群をさらに合計した、国籍フリーの独自親グループとして扱う。

画面上の見た目は `Sectors -> Themes/Baskets -> Stocks` の左から右のフローを維持する。ただし、計算方向は逆であり、実態データは `Stocks -> Themes/Baskets -> Sectors` の順に右から左へロールアップする。

## DB構造

バスケット定義には、従来の `categoryId`, `laneId`, `segmentId` に加えて、以下を持てるようにする。

- `parentSectorId`: 独自親セクターID。例: `GRP_SEMI_HARDWARE`
- `parentSectorNameJa`: 画面表示用の日本語名。例: `半導体製造装置・インフラ`
- `parentSectorNameEn`: 英語名。例: `Semiconductor Hardware & Equipment`
- `market`: バスケットの主対象市場。例: `JP`, `US`, `GLOBAL`

旧データに `parentSectorId` が存在しない場合は、既存の `categoryName` を独自セクター名として扱い、安定ハッシュから `GRP_*` のIDを自動生成する。米国ETFの `XLK`, `XLI`, `SPY` などへ自動変換してはならない。

## 計算ロジック

1. `Stock_Score = 期間中の株価騰落率 * (期間中の平均出来高 / 過去25日移動平均出来高)`
2. `Basket_Return = Σ(Stock_Return * Stock_Market_Value) / Σ(Stock_Market_Value)`
3. `Basket_Volume = Σ(Stock_Node_Volume)`
4. `Sector_Return = Σ(Basket_Return * Basket_Volume) / Σ(Basket_Volume)`
5. `Sector_Volume = Σ(Basket_Volume)`

フロー線は `parentSectorId -> basketId -> stockSymbol` で接続する。これにより、1つの独自セクターから日本バスケットと米国バスケットへ分岐する表示を可能にする。

## UI変更

- `Sectors` カードにはETFコードやETF価格を表示しない。
- `Sectors` の変動率は、所属バスケットのボトムアップ集計値だけを表示する。
- `Sectors` のミニチャートは、所属銘柄の時系列を100基準に正規化した合成チャートとする。
- `Macro` 補助列にETFセクター一覧を表示して、資金フローの親ノードのように見せてはならない。

---

## 2026-06-18 追記: OpenD取得方式と銘柄取得設計

### 結論

MooViewでは、OpenDの取得方式を次のように分けて扱う。

- 主要な日本株はリアルタイム購読で継続更新する。
- その他の日本株、米株、ETF、指数代替銘柄はスナップショットで定期取得する。
- 期間スライダーを動かした時だけ、必要な銘柄に対して履歴K線を取得して計算する。

重要なのは、`subscribe` の100枠と `get_market_snapshot` の400件は、同じ種類の上限ではないという点である。`100 + 400 = 500銘柄をリアルタイム取得できる` という意味ではない。

### 取得方式一覧

| 取得方式 | 代表API | 上限の意味 | 取得できるデータ | 取得の性質 | MooViewでの用途 |
|---|---|---:|---|---|---|
| リアルタイム購読 | `subscribe` + `get_stock_quote` / `get_cur_kline` など | subscription quota。例: 100枠 | リアルタイム株価、リアルタイムK線、板、tickerなど | 継続的に更新されるライブ取得 | 日経225/TOPIX Coreなど、日本株の主要銘柄を最大100銘柄まで常時更新する |
| スナップショット取得 | `get_market_snapshot` | 1リクエストの `code_list` 最大400銘柄 | 現在値、前日比、騰落率、出来高、時価総額などの瞬間値 | その時点の写真。継続配信ではない | リアルタイム購読しない日本株、米株、ETF、指数代替銘柄をまとめて定期取得する |
| 履歴K線取得 | `request_history_kline` | subscription quotaとは別管理 | 過去の日足、分足、週足、月足など | 過去データを必要時に取得 | スライダー期間を1D以外へ動かした時、個別銘柄とTheme/Sector計算に使う |
| quote fallback | `get_market_snapshot` または単体quote相当 | snapshot側の取得結果に依存 | 最新価格、前日比、前日終値相当 | K線が取れない時の表示補完 | `N/A` や `0.00%` のままにせず、まず表示可能な値を埋める |

### 100枠と400件の関係

`100` はリアルタイム購読枠である。これはライブ中継の枠に近い。購読した銘柄は継続的に更新できるが、枠を消費する。

`400` はスナップショットの1回あたり取得件数である。これは写真撮影に近い。400銘柄までまとめて現在値を取りに行けるが、リアルタイムに流れ続けるわけではない。

したがって、以下のような役割分担は可能である。

| グループ | 例 | 取得方式 | 表示上の意味 |
|---|---|---|---|
| リアルタイム対象 | 日経225またはTOPIX Coreから選んだ主要100銘柄 | `subscribe` | 常時更新される主要日本株として扱う |
| スナップショット対象 | その他の日本株、米株、ETF、指数代替銘柄など最大400銘柄/回 | `get_market_snapshot` | 30秒などの周期で更新される一覧表示用データとして扱う |
| 期間計算対象 | ユーザーがスライダーを動かした時に必要な銘柄 | `request_history_kline` | 選択期間の騰落率、Theme、Sectorの再計算に使う |

ただし、これは `合計500銘柄をリアルタイム取得できる` という意味ではない。画面上に500銘柄分の値を表示することはできるが、データの鮮度と取得方式は異なる。

### 排他的な銘柄管理

リアルタイム購読対象とスナップショット対象は、原則として排他的に管理する。

```ts
const realtimeSymbols = topJapaneseSymbols.slice(0, 100);
const snapshotSymbols = allSymbols.filter(
  (symbol) => !realtimeSymbols.includes(symbol),
);
```

同じ銘柄を `subscribe` と `get_market_snapshot` の両方に入れることは技術的には可能だが、MooViewでは原則として避ける。リアルタイムで持っている銘柄をsnapshotでも繰り返し取得すると、API負荷、表示更新競合、原因調査の複雑化が増えるためである。

### 表示優先順位

銘柄カードやTheme/Sector計算では、価格データの優先順位を次のようにする。

| 優先順位 | データ源 | 用途 |
|---:|---|---|
| 1 | `realtimeQuoteCache` | リアルタイム購読中の主要日本株。最も優先する |
| 2 | `snapshotQuoteCache` | その他銘柄の一覧表示、N/A防止、初期表示 |
| 3 | `historyKlineCache` | スライダー期間が1D以外の時の期間騰落率計算 |
| 4 | quote fallback | K線が不足している時の暫定表示 |
| 5 | `N/A` | どの取得経路でも値が取れない場合のみ |

### 初期表示とスライダー操作の設計

初期表示では、スライダー両端を最新日にして1D扱いにする。最初から全銘柄の長期K線を取りに行かない。

| タイミング | 実行する取得 | 理由 |
|---|---|---|
| 初回表示 | 主要日本株はリアルタイム購読、その他はsnapshot、1D K線は必要最小限 | `N/A`を減らし、表示開始を速くする |
| 30秒ごとの更新 | snapshot対象だけ定期更新 | リアルタイム枠を消費せず、一覧の鮮度を保つ |
| ユーザーが期間スライダーを変更 | 必要銘柄だけ `request_history_kline` | Theme/Sector計算に必要な期間データだけ取得する |
| 個別銘柄チャートを開く | その銘柄を優先取得、必要なら一時的に購読 | ユーザーが見ている銘柄を最優先する |

### 実装上の注意

- 一覧画面の大量銘柄に対して、安易に `subscribe` を使わない。
- `get_cur_kline` は内部的に購読が必要になるため、大量銘柄の初期表示には使わない。
- 初回1D表示では、`get_market_snapshot` と `request_history_kline` を優先し、購読枠を使う処理は主要銘柄に限定する。
- スナップショットは最大400銘柄/回であって、リアルタイム配信ではない。
- リアルタイム購読の100枠は、選択中銘柄や主要日本株など、表示価値が高い対象に限定する。
- `N/A` や `0.00%` が多発した場合は、まず `snapshotQuoteCache` に値が入っているか、次に `historyKlineCache` に期間データがあるか、最後に購読枠不足で `subscribe` が失敗していないかを確認する。

### SnapshotとKLineの違い

`snapshot` と `KLine` は、同じ価格データでも役割が違う。

| 種類 | 日本語での意味 | 何を表すか | 期間指定 | 主な用途 | チャート描画への使い方 |
|---|---|---|---|---|---|
| snapshot | 現在値の写真 | その瞬間の現在値、前日比、騰落率、出来高、時価総額など | できない | 一覧カードの価格、騰落率、N/A防止、30秒ごとの更新 | 単体では時系列チャートを描けない。点の値としては使える |
| KLine | ローソク足、時系列足 | 時刻ごとの open / high / low / close / volume | できる | 1D以外の期間騰落率、ミニチャート、個別チャート、Theme/Sector集計 | チャート線やローソク足の主材料になる |
| realtime quote | 購読中の現在値 | リアルタイム更新される現在値、前日比など | できない | 主要銘柄のライブ表示 | 最新点の上書き、チャート右端の補完に使える |
| realtime KLine | 購読中のリアルタイム足 | 現在進行中の足を含む open / high / low / close / volume | 足種別で決まる | 選択中銘柄のリアルタイムチャート | 選択中銘柄など少数だけに使う |

KLineの `K` は株式APIでよく使われる `K線` の意味で、実質的にはローソク足データである。1本のKLineには通常、以下の値が入る。

| 項目 | 意味 |
|---|---|
| `time` / `timeStr` | その足の日時 |
| `open` | 始値 |
| `high` | 高値 |
| `low` | 安値 |
| `close` | 終値 |
| `volume` | 出来高 |

### スライダー変更時の取得仕様

スライダーで開始日または終了日を変更した時は、snapshotとKLineを混同しない。

| 操作 | snapshotで行うこと | KLineで行うこと | 理由 |
|---|---|---|---|
| 初回表示で1D | 最新値をまとめて取得する | 必要最小限の1D足だけ取得する | 画面を速く表示し、N/Aを減らす |
| 開始日だけ変更 | 最新値の再確認としてsnapshotを再取得してよい | 変更後の期間に必要な履歴KLineを取得する | 期間騰落率はsnapshotだけでは計算できない |
| 終了日だけ変更 | 最新値の再確認としてsnapshotを再取得してよい | 終了日に対応する履歴KLineを取得する | 過去日を終点にする場合、現在値ではなく過去足が必要になる |
| 3日間、5日間などに拡張 | snapshot件数は銘柄数で数える | KLineは必要な日数分の足を返す | snapshotの400件上限は日数ではなく銘柄コード数の上限 |

### 400件snapshotの数え方

`get_market_snapshot` の400件は、日数ではなく銘柄数で数える。

| 例 | snapshot上のカウント | 説明 |
|---|---:|---|
| `AAPL` を1回取得 | 1 | 1銘柄なので1カウント |
| `AAPL`, `MSFT`, `NVDA` を1回取得 | 3 | 3銘柄なので3カウント |
| `AAPL` の3日間を知りたい | snapshotでは1銘柄扱い。ただし3日間の計算はできない | 期間計算にはKLineが必要 |
| `AAPL` の日足3本を取得 | snapshot枠では数えない | `request_history_kline` 側の取得であり、snapshotの400件上限とは別 |

したがって、スライダーを3日間にした場合に `AAPL` の2日分または3日分の足を取っても、snapshotの400件枠を2件、3件と消費するわけではない。snapshotでは `AAPL` はあくまで1銘柄である。日数分の足はKLine側の話であり、snapshotとは別の取得方式として扱う。

### チャート描画に使っているデータ

チャートに線やローソク足として描画している主材料はKLineである。

| 表示箇所 | 主に使うデータ | 補足 |
|---|---|---|
| 個別銘柄チャート | KLine | 期間に応じた時系列データを描画する |
| ミニチャート、sparkline | KLine | `close` の時系列から線を描く |
| 右端の最新点 | snapshotまたはrealtime quoteで補完可能 | 当日足がまだKLineに反映されない場合、最新値で右端を補う |
| 銘柄カードの価格、騰落率 | snapshotまたはrealtime quote | 数値表示はKLineだけでなくsnapshotでも埋める |
| Theme/Sectorの期間騰落率 | KLine | 各銘柄の期間足を集計して算出する |

つまり、数値カードはsnapshotでも表示できるが、チャートの線そのものは基本的にKLineが必要である。snapshotは現在の1点しか持たないため、単独では時系列の線を描けない。ただし、チャート右端の最新価格を補完する用途ではsnapshotを使える。

### Snapshotで計算できるもの、KLineが必要なもの

この画面では、`snapshot`、`履歴KLine`、`リアルタイムKLine` を同じものとして扱わない。特に、KLineには `snapshotの400銘柄まで` という上限は適用されない。

| 取得方式 | 400銘柄まで取れるか | 件数の数え方 | 期間データを持つか | 使える計算 | 使えない計算 | MooViewでの判断 |
|---|---:|---|---|---|---|---|
| snapshot / `get_market_snapshot` | できる。1リクエスト最大400銘柄 | 銘柄数で数える。`AAPL` は1件 | 持たない。現在の1点だけ | 現在値、前日比、当日騰落率、時価総額、出来高、バスケットの当日概算リターン | 3日、5日、1か月などの任意期間リターン、チャート線、期間出来高倍率 | 初期表示、N/A防止、1Dの当日表示、当日ベースの簡易集計に使う |
| 履歴KLine / `request_history_kline` | snapshotの400件制限とは無関係 | 基本は1銘柄ごとの履歴取得。頻度上限は最大60リクエスト/30秒。履歴KLine quotaは別管理 | 持つ。日足、分足などの時系列 | 任意期間リターン、チャート、ミニチャート、期間出来高、Theme/Sectorの期間集計 | 現在の瞬間値だけを大量銘柄で軽く取る用途 | スライダー期間が1D以外、またはチャート描画に必要な時に使う |
| リアルタイムKLine / `get_cur_kline` | snapshotの400件制限とは無関係 | 1銘柄につき購読枠を消費する。取得本数は最大1000本 | 持つ。購読中銘柄の直近足 | 選択中銘柄のリアルタイムチャート、当日足の更新 | 大量銘柄一覧の初期取得 | 主要銘柄や開いている個別チャートなど少数に限定する |
| リアルタイムquote / `get_stock_quote` | snapshotの400件制限とは無関係 | 事前購読が必要。1銘柄1データ種別で購読枠を消費 | 持たない。現在値中心 | ライブ価格、ライブ騰落率 | 期間リターン、チャート線 | 主要100銘柄など、購読枠を使う価値が高い対象に限定する |

### KLineは400銘柄まで取得できるのか

結論として、`KLineも400銘柄まで取得できる` という理解は誤りである。

| API | 公式上の主な制限 | 意味 |
|---|---|---|
| `get_market_snapshot` | 1リクエスト最大400銘柄、30秒以内に最大60回 | 400はsnapshotの銘柄数上限 |
| `request_history_kline` | 最大60リクエスト/30秒。履歴KLine quotaは口座状況により付与され、使用分は7日後に解放 | 400銘柄上限ではなく、履歴足取得の頻度とquotaの制限 |
| `get_cur_kline` | 事前購読が必要。`num` は最大1000本 | 400銘柄上限ではなく、1銘柄について何本の足を取るかの上限 |

したがって、500銘柄の3日間チャートを一度に作る場合、snapshotの400件制限とは別に、履歴KLineを多数銘柄へ順番に投げる必要がある。これは `1リクエストで400銘柄分のKLineを取る` という動きではない。

### バスケット計算にsnapshotだけで足りるか

バスケットやTheme/Sectorの計算は、目的によってsnapshotだけで足りる場合と、KLineが必要な場合がある。

| 計算したい値 | snapshotだけで可能か | KLineが必要か | 理由 | MooViewでの扱い |
|---|---|---|---|---|
| 現在値表示 | 可能 | 不要 | snapshotに現在値がある | snapshot優先でよい |
| 当日騰落率、前日比 | 可能 | 原則不要 | snapshotに前日比や騰落率がある | 1D表示ではsnapshotを優先してよい |
| 当日ベースのバスケット概算リターン | 可能 | 原則不要 | 各銘柄の当日騰落率を時価総額などで加重平均できる | 初期表示のTheme/Basket概算に使える |
| 3日リターン、5日リターン、1か月リターン | 不可能 | 必要 | snapshotは現在の1点しかなく、開始日の価格を持たない | スライダー期間変更時はKLineで計算する |
| 期間出来高倍率 | 不可能 | 必要 | 選択期間と過去平均の出来高が必要 | KLineから計算する |
| ミニチャート、sparkline | 不可能 | 必要 | 線を描くには複数時点のcloseが必要 | KLineを使う |
| 個別銘柄チャート | 不可能 | 必要 | ローソク足または時系列線が必要 | KLineを使う |
| Sector/Themeの期間チャート | 不可能 | 必要 | 構成銘柄の時系列を合成する必要がある | KLineを使う |

### 実装判断ルール

| 状況 | 優先する取得 | 理由 |
|---|---|---|
| 初回表示、スライダー両端が最新日で1D | snapshot | 速く、400銘柄までまとめて取れ、当日騰落率を埋められる |
| 1Dの個別銘柄カード | snapshotまたはrealtime quote | 現在値と当日騰落率が主目的だから |
| 1Dのバスケット概算 | snapshot | 各銘柄の当日騰落率を加重平均すれば概算できる |
| スライダーで3D、5D、1Mなどに変更 | 履歴KLine | 開始日と終了日の価格が必要だから |
| チャートを描く | KLine | 複数時点の価格列が必要だから |
| 主要100銘柄を常時動かす | realtime quoteまたはrealtime KLine | subscription quotaを使う価値がある対象だから |
| 大量銘柄をまとめて表示する | snapshot | subscribe枠を消費しないから |

### 最終方針

MooViewでは、`snapshotで計算できるところはsnapshotを使い、期間とチャートが必要なところだけKLineを使う` 方針にする。

- 1Dの数値表示と当日バスケット概算はsnapshotでよい。
- 3D以上、任意期間、チャート、ミニチャート、期間出来高倍率はKLineが必要。
- KLineは400銘柄一括取得ではないため、大量銘柄へ同時に投げない。
- スライダー変更時は、まず個別銘柄のKLine取得を優先し、その後にTheme/Sectorを再計算する。
- 主要100銘柄以外にリアルタイムKLineを広げすぎない。

---

## 2026-06-19 追記: 現行データ取得仕様一覧

この章は、`C:\Users\mahha\OneDrive\開発\mooview\src\components\MacroFlowMap.tsx` の現行実装に合わせた、マクロ資金フロー画面のデータ取得・保存・再取得仕様である。

### 取得対象一覧

| 対象 | 主な銘柄ソース | 取得対象に含める条件 | 除外条件 | 備考 |
|---|---|---|---|---|
| 個別株 | 選択中バリューチェーンの `groups[].stocks[]` | `symbol` が正規化できる | `__UNSUPPORTED_` で始まる内部代替不可シンボル | JP/US/ALLフィルター後の表示対象に連動する |
| セクターETF | `MACRO_SECTOR_ETF_DEFS` または `SEMICONDUCTOR_SECTOR_ETF_DEFS` | 現在スコープが半導体系なら半導体ETF定義を使う | 内部代替不可シンボル | 左列の補助ETFとして扱う |
| Regional Markets | `REGIONAL_MARKET_DEFS` | 表示用の市場代表銘柄として常に候補に入る | 内部代替不可シンボル | `US10Y`, `USD/JPY`, `GOLD/USD`, `DXY` などは代替ETFまたは未対応扱い |
| チャート表示銘柄 | ダブルクリックまたは右サイドパネル選択銘柄 | ユーザーが表示対象にした銘柄 | 空文字、正規化不能 | 既存チャート側の取得処理も併用する |

### 取得方式一覧

| 取得方式 | API/処理 | 実行タイミング | 取得単位 | 保存先 | 表示・計算用途 |
|---|---|---|---|---|---|
| 1D snapshot | `/api/moomoo/quotes` | 起動後、F5後、30秒周期、対象銘柄変更時 | 最大200銘柄ずつフロントから送信。ゲートウェイ側は最大400銘柄まで受ける | `localStorage` の最新quote、IndexedDB `quotes/latest`、IndexedDB `quote_history/<今日>` | 1D表示、当日騰落率、現在値、N/A防止 |
| 単体snapshot fallback | `/api/moomoo/quote` | `/api/moomoo/quotes` で返らなかった銘柄の再試行 | 8銘柄並列程度で単体取得 | 成功時はsnapshotと同じ保存先 | 一括snapshotで落ちた銘柄の補完 |
| 履歴KLine | `/api/moomoo/kline` | スライダーが2D以上、または期間データが不足した時 | 60銘柄ずつ、次バッチは30秒待機 | IndexedDB `kline` | 期間騰落率、ミニチャート、チャート、期間出来高倍率 |
| 表示期間履歴一括取得 | JP左横のカレンダーアイコンボタン | ユーザーが押した時 | 現在スライダー範囲の営業日と不足銘柄だけ | IndexedDB `quote_history/<日付>` と IndexedDB `kline` | 過去日別snapshot履歴のバックフィル、別PC移行後の高速表示 |
| キャッシュimport/export | Basket DatabaseのJSON操作 | ユーザー操作時 | JSONファイル単位 | IndexedDB `quote_history`, `kline`, localStorageのバリューチェーン | 別PC移行、バックアップ、復元 |

### 保存先一覧

| 保存先 | キー/DB | 保存内容 | 永続性 | 主な読み出しタイミング |
|---|---|---|---|---|
| `localStorage` | `mooview_macro_flow_quote_cache_v1` | 今日の最新snapshot quote | ブラウザ単位 | 起動直後の軽い復元 |
| IndexedDB | `mooview_macro_flow_quote_cache_v1` / store `quotes` / key `latest` | 今日の最新snapshot quote | ブラウザ単位 | F5後、起動後 |
| IndexedDB | `mooview_macro_flow_quote_cache_v1` / store `quote_history` / key `YYYY-MM-DD` | 日付別のquote履歴 | ブラウザ単位。export/import可能 | スライダー計算、1D不足判定、履歴一括取得 |
| IndexedDB | `mooview_macro_flow_kline_cache_v1` / store `kline` | `symbol:1d:reqNum` 単位のKLine | ブラウザ単位。export/import可能 | 2D以上のスライダー計算、履歴一括取得 |
| `localStorage` | `mooview_value_chain_map_v1` など | バリューチェーン定義、履歴、選択中ID | ブラウザ単位。export/import可能 | スコープ選択、バスケット構成 |

### quote履歴メタ情報

| 項目 | 意味 | snapshot保存時 | KLine保存時 | 再取得判定への影響 |
|---|---|---|---|---|
| `dataDate` | quoteが属する日付 | OpenDの `update_time` 日付または今日 | KLine足の日付 | 日付別保存の基準 |
| `dataTime` | snapshotの更新時刻 | OpenDの `update_time` 時刻があれば保存 | 原則なし | 将来の市場終了判定に利用可能 |
| `source` | データ元 | `snapshot` | `kline` | `kline` は確定データとして優先 |
| `finalized` | 終値確定扱いか | `false` | 過去日は `true`、今日以降は `false` | `false` の過去日snapshotはKLineで上書き対象 |
| `savedAt` | 保存実行時刻 | IndexedDBレコード単位で保存 | IndexedDBレコード単位で保存 | export/importや調査用 |

### 1D snapshot取得仕様

| 状況 | 取得対象 | 取得後の表示 | 未取得銘柄の扱い | 次回再取得 |
|---|---|---|---|---|
| 初回起動/F5直後 | IndexedDB読み込み完了後、今日の履歴または最新quoteに無い銘柄だけ | `1D取得中 x/y 残n` | `failedSymbols` に保持し、titleで先頭20件を表示 | 未取得分だけ再試行 |
| 既に今日のquoteがある | 取得対象から除外 | 取得済み件数に含める | なし | 原則再取得しない |
| 一括snapshotで一部欠落 | 欠落銘柄だけ単体 `/api/moomoo/quote` で再試行 | 成功分だけ即反映 | 失敗分を `failedSymbols` に保持 | 次回は失敗分だけ対象 |
| 全銘柄取得済み | APIを投げない | `1D完了 y/y 残0` | なし | 対象銘柄が増えた時だけ追加分を取得 |
| 新銘柄追加 | 今日の履歴に無い新銘柄だけ | 成功すればカード反映 | 失敗時は残数とtitleに表示 | 新銘柄の未取得分だけ再試行 |

### 2D以上のKLine取得仕様

| 状況 | 取得対象 | 取得本数 | バッチ制御 | 保存先 | 再利用条件 |
|---|---|---:|---|---|---|
| スライダーを2D以上へ変更 | 期間を満たすKLineが無い銘柄だけ | `reqNum = 260` を基本 | 60銘柄ごと、次バッチは30秒待機 | IndexedDB `kline` | 指定開始日と終了日をカバーできれば再取得しない |
| 同じ期間へ戻る | 既存KLineを利用 | 追加取得なし | なし | メモリまたはIndexedDB | `hasCandlesForRequestedRange` がtrue |
| 期間を広げる | 広げた期間を満たせない銘柄だけ | `reqNum = 260` | 60銘柄ごと | IndexedDB `kline` | カバーできる銘柄はスキップ |
| 新銘柄追加 | 新銘柄など不足分だけ | `reqNum = 260` | 60銘柄ごと | IndexedDB `kline` | 既存銘柄は取り直さない |
| KLineが取れない銘柄 | 失敗扱い | なし | 次回以降再試行 | 保存しない | `N/A` またはsnapshot履歴で補完 |

### 表示期間履歴一括取得仕様

| 項目 | 仕様 |
|---|---|
| UI位置 | `JP / US / ALL` のJP左横のカレンダーアイコン |
| 目的 | 1日ずつ手動で開かなくても、現在スライダー範囲の過去日別履歴をIndexedDBへバックフィルする |
| 対象日 | 現在のスライダー開始日から終了日までの営業日 |
| 処理順 | 新しい日付側を優先して保存する |
| 対象銘柄 | 現在表示スコープ、JP/US/ALLフィルター、Regional/ETFを含む取得対象のうち、日付別履歴が不足または未確定の銘柄 |
| 取得方式 | KLine日足を取得し、各日の `close` と前日足から日付別quoteを作る |
| 保存方式 | 日付ごとに IndexedDB `quote_history/YYYY-MM-DD` へmerge保存する |
| 確定扱い | 過去日のKLine由来quoteは `source: kline`, `finalized: true` とする |
| 今日の扱い | 今日分は市場中の可能性があるため、KLine由来でも `finalized: false` とする |
| 再実行時 | 既に `source: kline` または `finalized: true` の過去日データはスキップする |
| 新銘柄追加時 | 既存銘柄はスキップし、新銘柄の不足日だけ遡って取得できる |
| 進捗表示 | スライダー中央に `履歴取得中`, `履歴待機`, `履歴一部取得`, `履歴取得完了` と残件数を表示 |

### 未確定snapshotの再取得仕様

| 例 | 保存状態 | 後日の処理 | 期待結果 |
|---|---|---|---|
| 2026-06-18 14:00にsnapshot保存 | `source: snapshot`, `finalized: false` | 2026-06-19以降に履歴一括取得 | 2026-06-18のKLine終値で上書き |
| 2026-06-18の日足KLine保存済み | `source: kline`, `finalized: true` | 再度履歴一括取得 | スキップし、再取得しない |
| 今日のsnapshot保存 | `source: snapshot`, `finalized: false` | 当日中に再表示 | 1D最新値として利用 |
| 今日のKLineが取れた | `source: kline`, `finalized: false` | 当日中に再表示 | 確定扱いにはせず、後日再取得対象にできる |

### 進捗表示と未取得銘柄確認

| 表示 | 意味 | マウスオーバー内容 |
|---|---|---|
| `1D取得中 184/187 残3` | 今日のquote履歴または最新quoteで184銘柄取得済み、3銘柄未取得 | `未取得: SYMBOL1, SYMBOL2, SYMBOL3` のように未取得銘柄を表示 |
| `1D一部取得 184/187 残3` | 今回の取得が終わったが3銘柄が未取得 | 未取得銘柄の先頭20件 |
| `KLine取得中 1/4 残3` | KLineの現在バッチと残りバッチ | 取得銘柄数、cache件数 |
| `履歴取得中 60/187 残1200` | 表示期間履歴のバックフィル中 | 表示期間、営業日数、追加保存件数、失敗銘柄 |

### export/import仕様

| 操作 | 対象データ | ファイル | import後の効果 |
|---|---|---|---|
| キャッシュJSON export | `quote_history`, `latestQuotes`, `klineRecords`, バリューチェーン | `mooview-macroflow-cache-YYYY-MM-DD.json` | 別PCへ移行できる |
| キャッシュJSON import | 同上 | 同上 | 日付別snapshot履歴、KLine、バリューチェーンをmerge復元 |
| Basket JSON/CSV export | バリューチェーン定義 | template JSON/CSV | 銘柄構成だけ移行 |
| Basket JSON/CSV import | バリューチェーン定義 | template JSON/CSV | 新規DBまたは現在DBへ取り込み |

### 表示計算の優先順位

| 優先順位 | データ | 用途 | 補足 |
|---:|---|---|---|
| 1 | 今日の最新snapshot/realtime quote | 1Dの現在値、当日騰落率 | `FLOW_END_DATE` の表示で優先 |
| 2 | 日付別quote履歴 | スライダー範囲の高速計算 | 開始日・終了日の価格が揃えばKLineを待たずに計算 |
| 3 | KLineキャッシュ | 期間騰落率、出来高倍率、ミニチャート | 2D以上の本計算 |
| 4 | KLine取得結果 | 不足分の補完 | 成功後IndexedDBへ保存 |
| 5 | `N/A` | どの経路でも取れない場合 | `0.00%` と誤表示しない |
