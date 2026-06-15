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
