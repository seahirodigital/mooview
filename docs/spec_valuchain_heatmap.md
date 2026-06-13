## TODOplan（実装進捗）

| 区分 | 内容 | 状態 | 対象ファイル |
|---|---|---:|---|
| 今回修正 | 時価総額取得中にキャッシュ更新で取得ループが自己キャンセルされ、inFlight が戻らず未取得のまま止まる問題を修正する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実行する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | A+/A- の個別銘柄フォントサイズ変更をヒートマップ内テキストにも反映する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実行する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | ヒートマップ用の時価総額取得をヒートマップ表示時限定から全銘柄の先行取得に変更し、当日表示前に不足分を埋める | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | 時価総額未取得銘柄は symbol だけで諦めず、銘柄名/旧コード検索で実ティッカーを補完して quote を取り直す | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | BRCM/Broadcom などの旧コード・会社名を AVGO へ補正し、チャート/ヒートマップの取得漏れを減らす | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回修正 | Moomoo gateway の時価総額フィールド候補を追加し、日本株/米株の列名揺れを拾いやすくする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py` |
| 今回検証 | `python -m py_compile moomoo_gateway.py`、`npm.cmd run lint`、`npm.cmd run build` を実行する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | ヒートマップの最小タイルをCSSの最小幅で後から広げる方式をやめ、面積計算時点で最小ウェイトを与えて重なりなく敷き詰める | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | 時価総額未取得グループも小さい点を散らさず、セル内を隙間なく均等分割して表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実行する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | ヒートマップ時に各セル内のグループを上詰め固定にせず、セルの余白いっぱいまで縦方向に伸ばして表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実行する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | 銘柄マウスオーバー時のツールチップに時価総額を表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | ヒートマップ内の最小タイルを通常カード相当の大きさに底上げし、時価総額が小さい銘柄も潰れて見えなくならないようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実行する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | ヒートマップ時価総額補完を12銘柄ずつの逐次取得に変更し、取得できた分から即座に再描画する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | バッチ取得で `marketCap` が返らない銘柄は、同じバッチ内で個別 quote 取得にフォールバックする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | 指数/ETFグループは Moomoo の `marketCap` が 0 になるため、ヒートマップ時も小粒表示に落とさず通常カード表示へ戻す | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | `/api/moomoo/quotes` の 200 銘柄上限に当たるメインチェーン向けに、時価総額補完を分割取得へ変更する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | ヒートマップ用に不足している時価総額を `/api/moomoo/quotes` から補完し、面積が均等四分割に見える状態を減らす | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | 銘柄追加・編集時に `marketCap` を `0` 固定にせず、Moomoo quote から取得した値を保存する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回修正 | 取得済み時価総額をヒートマップの面積計算とソート、ツールチップに統一反映する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | ヒートマップの面積計算をライブ取得した時価総額へ切り替え、未取得時は均等四分割に見えない小タイル表示へ寄せる | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | グループ合計・工程幅・銘柄ソート・ツールチップが同じ時価総額解決値を見るよう統一する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | ヒートマップ表示時に時価総額未設定グループでもGrid行高が通常表示未満に縮まないようにし、縦横を広げて見える表示にする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | 変動率順・時価総額順の右横にヒートマップ切替ボタンを追加する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | ヒートマップ時にグループ合計時価総額で工程列幅・グループ箱高さを相対表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | ヒートマップ時にグループ内銘柄を時価総額比率のタイル面積で表示し、小型銘柄はホバーで名称確認できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | チャート内プルダウンにティッカーコードだけでなく銘柄名も幅内で併記する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | 1分類20銘柄超のグループを詳細工程列へ自動分割し、グリッド内の銘柄集中を抑える | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | 個別銘柄カードを最大5行で折り返し、20銘柄は4列 x 5行で横幅を広げて表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | インポート戻しの左側にコード/銘柄名検索を追加し、該当銘柄を中央へパンしてサイドパネルを開く | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | JSON/CSVテンプレート仕様書へ、左から右へ流れる工程順と20銘柄超分割ルールを追加する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回修正 | チャート内の銘柄プルダウンをOS標準selectから黒背景・白文字の自前メニューへ置換する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回修正 | チャートデータ取得失敗時にMoomoo検索で会社名/表示名を引き直し、候補コードでローソク足を再取得する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回修正 | 再検索後もチャートが空の場合、ティッカーコード違いの可能性をチャート内に表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx` |
| 今回修正 | バリューチェーン右サイドパネルのRSI/MACD高さを前回値として保存・復元する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 会社名が銘柄コードとして保存された場合も、INTEL→INTC、BROADCOM→AVGO、QUALCOMM→QCOM等へ補正してチャート用APIに渡す | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint`、`npm.cmd run build`、`python -m py_compile moomoo_gateway.py` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 保存済みシンボルとキャンドルキャッシュの表記ゆれを正規化し、AVGO/QCOMのような一部銘柄だけチャートが空になる問題を解消する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回検証 | `npm.cmd run lint`、`npm.cmd run build`、`python -m py_compile moomoo_gateway.py` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | ヘッダー銘柄の変動率が0%固定にならないよう、Moomooスナップショットの変動率/変動額/前日終値フィールドを補完してchangePctを算出する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\moomoo_gateway.py` |
| 今回検証 | `python -m py_compile moomoo_gateway.py`、`npm.cmd run lint`、`npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | Gridの空セルの罫線を削除し、主要境界だけを暗い線で残し、銘柄カードの余白・角丸・文字階層を調整する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する。buildはサンドボックス内でディレクトリ参照制限に当たったため外側権限で再実行し成功 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回未確認 | ユーザーのブラウザ上でビジュアル確認し、push可否を判断する | 未完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 仕様管理 | この表を仕様トップへ常設し、実装済みと未完了を明示しながら進める | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\docs\spec_valuchain_heatmap.md` |
| 今回追加修正 | カレンダーUIを黒基調の自前UIへ置換し、スライダー幅/日付チャート同期/day-Week切替/背景無しレイアウトを修正する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\IndicatorSettingsPanel.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 日付スライダー操作中は銘柄配置を固定し、変動率/色だけをその場で更新する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | ヘッダーの＋/−ポップアップを左側・グリッド上に重なる位置へ変更する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回追加修正 | 日付UIを黒基調スライダー化し、カレンダーアイコンから従来のカレンダーUIでも日付選択できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 銘柄マウスオーバーを自前黒ポップアップにし、変動率を緑/赤で統一する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 大工程/大分類を濃く、内側を薄くし、チャート背景とフォントを黒基調へ統一する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx` |
| 今回検証 | `npm.cmd run lint`、`npm.cmd run build`、HTTP 200確認を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 右固定サイドパネルのチャート/歯車アイコンでチャート表示と設定表示を切り替え、余分なチャート見出し行を削除する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | バリューチェーン上部の参照日行を削除し、銘柄数/複数選択/フォント/ズーム/リセット/日付操作を1行へ再配置する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | ヘッダー銘柄リストの追加/削除、横巡回表示、リアルタイム変化時の薄色点灯を追加する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| 今回追加修正 | チャートの初期表示をVRVP/VOL/RSI/MACD中心にし、チャート掴み移動を上下左右へ拡張する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\InteractiveCustomChart.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\types.ts` |
| 今回検証 | `npm.cmd run lint` と `npm.cmd run build` を実施する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | Ctrl+クリックで個別銘柄を複数選択できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 複数選択後の「比較パネルで表示」で、右サイドパネルの1つのチャート内に複数銘柄比較を表示する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 複数選択した銘柄を右サイドパネルへドラッグドロップし、同一チャート内比較へ追加する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 右サイドパネルのチャートで既存チャートビュー同様の設定パネルを開き、MA/Bollinger等の表示・線・色を変更できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | `npm.cmd run lint`、`npm.cmd run build`、HTTP確認を実施する | 完了（Browserプラグインの実行ツール未提供のため、HTTP 200で代替確認） | `C:\Users\mahha\OneDrive\開発\mooview` |
| Step 1 | MooViewヘッダー左の丸印をハンバーガーメニューへ変更し、画面切替オーバーレイを実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` |
| Step 1 | バリューチェーンマップ画面のベースレイアウト、横軸工程、縦軸カテゴリ、空セル維持のマトリクスを実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 1 | キャンバスのドラッグ移動とホイール拡大縮小を実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 2 | JSON/CSVエクスポート、インポート、テンプレート、テンプレート仕様書の導線を実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 2 | 銘柄コード不一致時に既存銘柄検索ロジックで自動補完する | 完了（ValueChainの銘柄追加/編集/CSVインポートで `/api/moomoo/search` 補完） | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 3 | 騰落率ヒートマップ、ホバー情報、変動率順/時価総額順ソートを実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 3 | 日付選択、日次/週次切替、前後移動ボタンを実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 3 | 日本/海外の休場日を直前営業日に補正して実データ取得する | 一部完了（週末補正のみ。JP/US祝日カレンダー連携は未完） | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 4 | グループ名編集、銘柄追加、行列追加/削除、銘柄削除などの完全CRUDを実装する | 完了（自前モーダルで名前編集/銘柄追加/銘柄編集、削除確認、グループ削除、横軸列追加/削除、工程追加、縦軸行追加/削除、分類追加を実装） | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| Step 5 | ダブルクリック詳細サイドパネルと複数銘柄比較を既存チャート/ウォッチリストへ連携する | 一部完了（右端固定チャートアイコン、幅リサイズ、既存チャートコンポーネント埋め込み、時間足/VOL/RSI/MACD/比較/リセット操作は完了。TradingViewエンジン切替の移植は未完） | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 追加修正 | サイドパネル位置をヘッダー下へ変更し、日付ピッカー、実データAPI取得同期、不要な銘柄情報カード削除を行う | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 追加修正 | 右クリック名前編集を自前モーダルへ統一し、工程大分類も右クリック編集できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 追加修正 | 右固定アイコン列へチャート、インポート、統合エクスポートメニューを配置し、ヘッダー操作と重ならない余白を確保する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 追加修正 | 不要説明テキスト削除、ハンバーガーメニューの「チャートビュー」表記、現在時計と最終更新の二段表示、単独工程ヘッダー結合を実装する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\App.tsx` / `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証・push | lint/build、HTTP 200確認、差分確認、コミット、push | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | エクスポート1アイコン化、Step 4行列追加/削除、CRUD整理、銘柄名補完、lint/build、push | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 工程の左右追加、分類の上下追加、個別銘柄/グループ削除分離、銘柄カード表示簡略化、エクスポートメニュー表示修正、lint/build | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 検証・push | 型チェック、ビルド、HTTP疎通、コミット、push | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 縦ホイールを上下移動、Ctrl+縦ホイールを拡大縮小に変更し、キャンバス上のブラウザ拡大縮小を抑止 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | グループ表示密度、個別銘柄フォント、A+/A-フォントサイズ操作を追加 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 左上交点を「指数」グリッドへ統合し、QQQ/SPY/SOX/日経225/200A/213Aを初期登録 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | CSV/JSONインポートで工程・分類を復元し、インポート取り消しを追加 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | lint/build検証 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 大工程+中工程ヘッダー高さを結合ヘッダーと揃える | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | サイドパネル表示中にグリッド側クリックでサイドパネルを閉じる | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | `.txt` 等でも中身がJSONならJSONインポートとして認識し、`segments[].parentId` を補完する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | グループ右クリックメニューに「個別銘柄の削除」を追加し、選択中銘柄を削除できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回検証 | lint/build/HTTP 200確認 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |
| 今回追加修正 | 複数選択を銘柄右クリック/グループ右クリックから確実に開始できるようにする | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 「半導体バリューチェーン」表示箇所を履歴プルダウン化し、インポート日時と履歴削除を追加する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | インポート前に現在表示へ上書き/履歴へ新設を確認する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 今回追加修正 | 指数グループが6銘柄超のとき中分類ヘッダー側を拡張する | 完了 | `C:\Users\mahha\OneDrive\開発\mooview\src\components\ValueChainMap.tsx` |
| 未実装分析 | JP/US祝日カレンダー連携、押し続け日付移動、複数選択銘柄の新規ウォッチリスト欄追加は未実装/一部未実装として整理。TradingView公式/カスタム切替は不要指定のため除外 | 分析完了 | `C:\Users\mahha\OneDrive\開発\mooview\docs\spec_valuchain_heatmap.md` |
| 今回検証 | lint/build/HTTP 200確認 | 完了 | `C:\Users\mahha\OneDrive\開発\mooview` |

世界屈指のプロエンジニアとして、ご指摘の事項を完全に統合し、機能要件の漏れを一切許さない最終版の「プロダクト要件定義書（PRD）」を作成しました。
開発チームが「土台（Step 1）」から順に構築できるよう、依存関係を整理した実装ステップとなっています。

# プロダクト要件定義書（PRD）：バリューチェーンマップ機能 (最終版)

## 1. プロジェクト概要・目的
*   **目的**: 投資銀行や機関投資家のバスケット投資動向をいち早く掴むための可視化ツール。特定セクターへの資金流入だけでなく、サプライチェーン・バリューチェーン上の「どのカテゴリ・どの分野に」資金が流入する傾向があるのかを可視化・分析し、投資判断を迅速化する。
*   **コアUI**: 縦軸（カテゴリ）と横軸（工程）のマトリクスで銘柄を配置し、価格変動をヒートマップで表現するダッシュボード。

---

## 2. 開発フェーズ（Step分割実装プラン）

### 【Step 1】UI基盤とルーティング・レイアウト構築（土台）
**概要:** 既存システムへの干渉を最小限に、新規画面への導線と、マトリクスUIのキャンバスとなるベースレイアウトを構築する。

1.  **グローバルナビゲーションの改修**
    *   既存チャート画面のヘッダー`MooView`左横にある丸印を「ハンバーガーメニュー」に変更。
    *   クリック時、ポップアップのオーバーレイを表示し、以下のメニューで画面を切り替え可能にする。
        *   `既存のチャート画面`
        *   `バリューチェーンマップ（新設）`
        *   `今後の予定`（非活性/カミングスーン等で配置）
2.  **キャンバスのベースレイアウト（ズーム＆パン対応）**
    *   **ズーム＆パン機能**: 銘柄増加に耐えうるよう、FigmaやGoogleマップのように、マウスドラッグによるキャンバスの移動（パン）と、ホイール操作による拡大・縮小（ズーム）機能を標準実装する。
3.  **マトリクスUIグリッド構造（縦軸・横軸の定義）**
    *   **横軸（工程）**: 左から右へ上流→下流となるよう配置。大分類 > 中分類 > 小分類の構成。
        *   *例外対応*: 金融セクター（銀行・保険・証券など）のように上流・下流の概念がない並列構造も可視化できる柔軟性を持たせる。
        *   *結合表示*: 中分類や小分類がない場合は、上位の分類（大分類など）の四角を大きくし、下位階層分を包含（Colspan）する形で図示する。
    *   **縦軸（カテゴリ）**: 大カテゴリ（例: 半導体メーカー、素材メーカー等）。各カテゴリ内に属性（例: US / JP 等）を縦にネストして羅列する。
    *   **内部グルーピング（セル）**: 縦軸と横軸の交差する領域を1つの「グループ」とする。
        *   命名規則: 基本は「中分類(なければ大分類) × カテゴリ名 × 日本/海外」（例: `設計・開発×半導体メーカー×日本=垂直統合型`）。
        *   **銘柄0件時の振る舞い**: 該当銘柄が0件の場合でも、**絶対に列や行を詰めず、空白枠（空のセル）として表示を維持**し、バリューチェーンのマトリクス構造を担保する。
    *   **個別銘柄の配置レイアウト**: グループ内の銘柄は、既存実装済みのマトリクスUIを流用。デフォルトは横「2列」とし、行数は銘柄数に応じて下に長く伸びる仕様とする。

### 【Step 2】データスキーマ設計とI/O（インポート/エクスポート基盤）
**概要:** AIでも生成・解析が容易で、半導体以外の全セクターに流用可能なデータ構造と入出力機能を実装する。

1.  **データフォーマット定義（JSON / CSV対応）**
    *   AIの調査・出力に耐えうる汎用的な型を定義。テキスト編集だけで縦横のバリューチェーン可視化構造が構築できるようにする。
    *   `横軸データ`、`縦軸データ`、`グループ定義`、`銘柄データ(Ticker, Name)` を含む構造。
2.  **I/O機能（画面右上アイコン）**
    *   クリックでメニュー展開: `[エクスポート]`, `[インポート]`, `[テンプレートダウンロード], ` `[テンプレート仕様書], `。
    *   拡張子選択: `CSV` または `JSON`。
    *   *テンプレート仕様*: 現在アクティブなバリューチェーンの軸、分類、カテゴリ、グループで整理された状態のコードと銘柄名が出力されること。これを修正してインポート可能にする。テンプレート仕様書には、AIで作成する際に、テンプレートの仕様を記載しAIがバリューチェーン構造を作りやすいようなmdファイルをダウンロードできるようにする。
    *   *工程順ルール*: JSON/CSVテンプレート仕様書では、横軸工程を左から右へバリューチェーンが流れる順に並べることを明記する。上流工程を左、下流工程・顧客側を右に置き、前後関係が逆転しないようにする。
    *   *20銘柄超の分割ルール*: 1つの個別銘柄分類に20銘柄を超えて入れない。20銘柄を超える場合は、同じGridセルへ詰め込まず、工程をより詳細なsegmentへ分けて右側へ追加し、groupも分割する。画面上のカードは最大5行で表示し、20銘柄は4列 x 5行で横幅を広げて表示する。
3.  **インポート時の銘柄マッチングロジック**
    *   「銘柄コード（Ticker）」を正として登録。
    *   コードで見つからない場合、CSV/JSON内の「銘柄社名」を用いて、既存の銘柄検索機能のロジックで自動検索・補完を試みる。

### 【Step 3】データ描画・基本インタラクション・時間軸機能（Read機能）
**概要:** 取り込んだデータをヒートマップとして可視化し、日付や条件で動的に変化させる。

1.  **ヒートマップ描画とソート**
    *   **色付け**: 前日比（または指定期間比）を `-5%`（赤・濃） 〜 `0%`（無色/黒） 〜 `+5%`（緑・濃）のグラデーションで表現。
    *   **ソート機能**: グループ内の銘柄順序切り替えボタンを設置。`[変動率順 (デフォルト)]` / `[時価総額順]`。
2.  **ホバー（マウスオーバー）アクション**
    *   グループ名ホバー時: 該当する「大分類/中分類」を表示。
    *   個別銘柄ホバー時: 「大分類/中分類」「銘柄名」「対象期間の変動率」を表示。
3.  **日付・時間軸コントロールUI（画面右上）**
    *   **カレンダーUI**: クリックで日付を選択可能。日本・海外ともに指定した同一日付のデータを表示。時間は日次ベース（時間指定なし）。当日を選択した場合のみ最新情報が更新され続ける。
    *   **休場日（カレンダー休日）の非同期対応**: 選択した日付が日本または海外のいずれかで休場日だった場合、エラーや空表示にせず、**必ず「休場日の直前の営業日（休日前）」の値を取得・表示**する。
    *   **期間表示切替**: `[日毎]` / `[週ごと (今週/先週などの5日間変動率)]`。
    *   **タイムトラベルアニメーション**: カレンダーUIの左右矢印ボタン（前日/翌日、前週/次週）を連打・押し続けることで、表示データが次々と切り替わり、個別銘柄の色の濃淡の移り変わりが視覚的に追えるようにする。

### 【Step 4】CRUD・直接編集アクション（Write機能）
**概要:** UI上から直感的にバリューチェーン構造と銘柄を編集する機能。

1.  **グループのタップ（左クリック）動作**
    *   グループ名の編集機能。
    *   当該グループ内への「銘柄追加」UIの呼び出し。
2.  **右クリックコンテキストメニュー**
    *   **縦軸・横軸のヘッダー上**: `[名前の編集]`, `[列/行の追加]`, `[列/行の削除]`。
    *   **銘柄上（またはグループ四角の範囲内）**:
        *   `[銘柄追加]`, `[銘柄削除]`。
        *   `[複数選択]`（クリック後、チェックボックス等で複数銘柄を選択可能な状態にする）。
        *   `[別ページの既存チャートで表示]`。

### 【Step 5】高度な比較・連携機能（サイドパネル統合）
**概要:** 既存のチャートシステムと連携し、詳細分析をシームレスに行う機能。

1.  **単一銘柄の詳細表示（ダブルクリック動作）**
    *   個別銘柄上でダブルクリックすると、画面右側からサイドパネルがスライドイン。
    *   既存チャート画面と同一の銘柄チャートを描画（画面遷移させない）。
    *   サイドパネル内の「閉じる」ボタン、またはパネル外（他の画面）クリックでパネルを閉じる。
2.  **複数銘柄の一括比較（複数選択モードからの連携）**
    *   Step 4の「複数選択」モードで銘柄が複数選択されている状態において、再度右クリックを実行。
    *   メニューからアクションを実行すると、以下の処理が走る：
        1. 選択された全銘柄を、裏側で「既存の新規ウォッチリスト欄」に追加登録する。
        2. 画面右側からサイドパネルがスライドインする。
        3. サイドパネル内で、選択された全銘柄のラインが「1つのチャート内」に重ねて表示され、比較分析ができる（既存画面のウォッチリスト比較機能を流用）。

---


## 【別紙】ユーザー要望生データ（元プロンプトであり上記の整形前）

```text
君は世界屈指のプロエンジニアだ。
これから喋る以下のことをプロダクトデザインの仕様に変えてください 
AIがわかりやすいようにしろ。

添付画面で
他にも漏れていることがあれば補足として、最後に記載しろ。付け加えるかはこちらで選ぶ
・また一気にできるとも思えないが、Stepごとに分けて、基盤となりそうな場所から実装するようにしろ。枝葉の機能は後回しにして、土台から作れ。ただし機能の漏れは絶対にゆるされない仕様としろ都市と


現状のmooviewの投資チャートのヘッダーMooViewの左横の丸印をハンバーガーメニューにし、ハンバーガーメニューを推すと、ポップアップアップのオーバーレイで、既存画面と以下の画面を切り替えられるようにしろ

## ポップアップでの切り替え
・既存のチャート画面
・バリューチェーンマップ（新設）以下仕様
・（今後の予定）

## バリューチェーンマップ：目的
・投資銀行や機関投資家のバスケット投資をいち早く掴むための可視化
あるセクターへの資金流入だけでなく更にカテゴリ分けしたどの分野に資金流入する傾向があるのかを可視化するためのものである。バリューチェーンごとの可視化をし、以降バリューチェーンをインポートや手入力していくことで、サプライチェーンやバリューチェーンのどこに資金が集まるのかを可視化しいち早く投資対象とするための分析ツール

## バリューチェーンマップ：新規画面のレイアウト
・添付の例のような横に工程、縦にカテゴリを図解したバリューチェーンで銘柄を可視化
・各単語を定義すると、
ー横軸：工程（工程１，工程２，工程３、、）
工程の構成要素が、大分類、中分類、小分類

ー縦軸：大カテゴリ（大カテゴリ１，大カテゴリ２，大カテゴリ３、、）
各カテゴリには、上からUS、JPを縦に羅列し名柄を分類

ー内部グルーピング：グループ名
縦軸、横軸にて配置された銘柄をくくったグループを、グループ名とする

図の事例の場合
### 横軸
工程１：大分類：設計・開発
工程２：大分類：前工程、中分類、準備（ウェーハ製造）、準備（フォトマスク製造）、、
工程３：大分類：後工程、中分類、準備（基板等）、ダイシング
この用に、工程の中身で中分類がない場合は大工程で大きく分類する可視化とする。横軸の四角が大きく中分類にまで抱合する用に可視化

### 縦軸
大カテゴリ１：半導体メーカー ×日本/海外で２分類
大カテゴリ２：分素材メーカー・材料供給×日本/海外
大カテゴリ３：検査・製造装置×日本/海外

### 図示される分類の銘柄
グループ名：(設計・開発×半導体メーカー×日本/海外）1=垂直統合型
グループ名：グループ(設計・開発×半導体メーカー×日本/海外）2=ファブレス
グループ名：グループ(前工程/準備（ウエーハ製造）×半導体メーカー×JP or US）=ファウンドリ
など、各グループに名称をつける。基本的に、中分類（なければ大分類）×カテゴリ名×日本/海外

## 以上の縦軸・横軸のレイアウトで銘柄を整理
・各個別銘柄を上記のように定義して分類
・各バリューチェーン上で、上記を入力できるCSVの型を作成し、そのインポート機能を持たせる。コード名で銘柄は登録採用するが、見つからない場合は、名画の社名で既存の銘柄検索機能で検索する。だめなら
・現状の事例では、半導体のバリューチェーンだが、CSVは他のセクターでも通用するようなCSVの書き方にしろ。CSVの型も作り、ユーザーが手軽二編集しエクスポート・インポートで反映されるようにしたい（同様にJSONにも対応しろ：テキスト編集だけで縦軸横軸のバリューチェーン可視化構造を作れるようにしたい）
・そのJSONやCSVの型を基礎として、AIに調べさせても耐えうる型にしろ
・基本的には左から上流工程になるように定義しろ。ただ、バリューチェーンのように上流から下流まで流れるような構造出ない場合も可視化しタイ。例えば、金融セクターで、大分類１、銀行、中分類：大手銀行、地銀、大分類２：保険、大分類３：証券、などのばあいがあるということだ。
・整理される銘柄は、時価総額順で整理と、変動率順で整理できるボタンを配置しろ、分類された情報の個別銘柄の順序が切り替わるためだ。デフォルトは変動率順で整理しろ
・個別銘柄は何×何で整理するかを選択できるマトリクスUIを配置しろ、既存ですでに実装済のため流用しろ。整理銘柄はデフォルトでは２列にしろ、行はあるだけ長くなる
## 機能
・画面右上に、エクスポート/インポートアイコンを設置し、クリック後にエクスポート/インポート/テンプレートダウンロードを選択、その後CSVかJSONを双方選択し、動作する機能をつけろ。テンプレートは現在アクティブなバリューチェーン可視化の軸と、銘柄が分類、カテゴリ等で整理され、コードと銘柄名で出力される。それを修正し、インポートができるようにしたい

・グループや個別銘柄のマウスオーバーで、大分類/中分類、銘柄名、前日の変動率を表示
・個別銘柄は-5%から+5%で添付のように赤から緑で色付けし濃いほどに変動が大きいヒートマップ形式とする
・グループ名のタップで、グループ名編集、そのグループ内への銘柄追加
・右クリック動作
-各縦軸、横軸名のの右クリックで、名前の編集、その行列の追加、削除機能
-各銘柄上（or 銘柄場所、つまり縦軸横軸が示す四角の範囲内）の右クリックで銘柄追加、銘柄削除、複数選択（ボタンを押した後銘柄を選択可能にする）、別ページの既存チャートで表示、
-複数選択された銘柄がある状態で更に右クリックすると、既存の新規ウォッチリスト欄二追加し、右から出てくるサイドパネルで、選択された銘柄を１つのチャート内で比較するようにしたい。（既存ページ側でもウォッチリスト登録されているので同じ銘柄の比較がみれるようになる）

・各個別銘柄上でのダブルクリック時は、右側のサイドパネルを作りから既存チャート画面と同じ銘柄チャートが表示され、画面遷移すること無くチャートの表示。開閉ボタンで閉じるや、他の画面クリックでサイドパネルは閉じる

・この図の右上に、日付メニューを用意し、クリックでカレンダーUIでいつの日付化選択できるようにする。その表示された日付の値が表示されるようにする。日本・海外ともに同じ日付での表示となる。時間設定はない。当日の場合のみ、最新情報が更新され続けることになる。
・カレンダーUIには、週ごと表示にも対応し今週、先週と、５日間での変動率での表示も対応しろ。カレンダーでは、日毎、週ごとの左右ボタンで可視化チャートが変わるボタンを配置し、それをクリックし続けると、個別銘柄の色の濃淡が日付・週ごとに代わり、移り変わりを見やすくすること。

=== 追加指示 ===
以下を入れ込み最終的な仕様にしろ。以上の漏れは許されない

ズーム＆パン（キャンバス移動）機能の導入：を仕様に入れろ
カレンダー休日（休場日）の非同期問題；休日前の値を入れるようにしろ

「グループ」に該当する銘柄が0件の場合のUI：空白枠である。詰めたりしたら、チェーンで分けてる意味がないだろ

自分の最初の要望も生データとして最後尾に加えて出力しろ
```
