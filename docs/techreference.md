# Tech Reference

更新日: 2026-06-16

このメモは、`C:\Users\mahha\OneDrive\開発\mooview\src\components\MacroFlowMap.tsx` の現行実装を前提に、以降の引き継ぎで再現できるように残す。

## 1. データ取得方法

### 1-1. 価格・変動率の取得

基本の取得元はローカルAPIの `moomoo` 系エンドポイント。

- 一括取得: `POST /api/moomoo/quotes`
- 個別取得: `POST /api/moomoo/quote`
- 日足取得: `POST /api/moomoo/kline`

実装上の流れは以下。

1. `macroQuoteSymbols` を作る。
2. `normalizeSymbol()` で記号を正規化する。
3. `POST /api/moomoo/quotes` を 40 件ずつ投げる。
4. バッチ失敗時のみ `POST /api/moomoo/quote` に単体フォールバックする。
5. 日足・期間変動用のローソク足は `POST /api/moomoo/kline` を 6 件ずつ並列取得する。
6. 取得成功分から順に `sparklineCache` を更新する。

### 1-2. シンボル正規化

`normalizeSymbol()` のルール。

- `US.xxx` はプレフィックスを外す
- `xxx.US` も US 扱いでプレフィックスを外す
- `JP.xxx` は `JP.xxx` に統一
- `xxx.JP` / `xxx.T` / 数字のみ 3-5 桁は `JP.xxx` に寄せる
- `__UNSUPPORTED_` で始まる記号は意図的に除外

### 1-3. quote を現在値に使う方法

`parseMacroQuoteResult()` で `price` / `changePct` / `marketCap` / `volume` / `dataDate` を読む。

`changePct` の優先順位:

1. `quote.changePct`
2. `previousClose` があるなら `(price / previousClose - 1) * 100`
3. `open` があるなら `(price / open - 1) * 100`
4. それ以外は `0`

`getCandlesWithLatestQuote()` は、終端日が `FLOW_END_DATE` のときだけ quote を 1 本の仮想足として K 線へ差し込む。

## 2. 変動率の計算

### 2-1. 期間変動率

`getRangeChangePctFromCandles()` が期間変動率の本体。

計算ロジック:

- 終端足は `endDate` 以下で一番新しい足を採用
- 開始足は `startDate` より前にある直近の足を採用
- そのうえで

`(endClose / baseClose - 1) * 100`

を使う

これで、例として

- 2026-06-09 close = 3555
- 2026-06-16 close = 4466

なら 5D は `25.63%` になる。

### 2-2. 1日変動率

`startDate === endDate` のときは日次変動を返す。

優先順は以下。

1. K 線の終端足と 1 本前の足で計算
2. 1 本前が無ければ quote の `previousClose` で計算
3. それでも無理なら `open` で計算

### 2-3. ボリューム倍率

`getVolumeMultiplierFromCandles()` は、対象期間の平均出来高 ÷ 直前 25 営業日平均出来高。

## 3. 画面更新の実装メモ

- `POST /api/moomoo/quotes` は失敗時に `POST /api/moomoo/quote` へ逃がす
- `POST /api/moomoo/kline` は 2 回まで再試行する
- 失敗した銘柄を空配列で固定キャッシュしない
- `sparklineCache` はバッチ単位で即更新する

## 4. 今の時点で意図的に N/A にしているもの

これらは仕様上、今は取得しない扱い。

- `US10Y` -> `__UNSUPPORTED_US10Y__`
- `USD/JPY` -> `__UNSUPPORTED_USDJPY__`
- `GOLD/USD` -> `__UNSUPPORTED_XAUUSD__`
- `DXY` -> `__UNSUPPORTED_DXY__`

## 5. まだ潰し切れていない N/A

スクリーンショット時点で残っていた要確認項目。

### 5-1. Macro 列

意図的 N/A を除くと、実装上は再取得対象。

- `US10Y`
- `USD/JPY`
- `GOLD/USD`
- `DXY`

### 5-2. Stocks 列で N/A が見えていた銘柄

スクリーンショット上で未解消に見えたもの。

- `MARUWA`
- `日本電気硝子`
- `味の素`
- `太陽HD`
- `日本特殊陶業`
- `エノモト`
- `三井ハイテック`
- `古河電気工業`

### 5-3. 補足

上の Stocks は、API 側では quote / kline が取れている銘柄もあるため、次に疑うのは以下。

1. `normalizeSymbol()` でのキー不一致
2. `macroQuoteCache` への格納順序
3. `sparklineCache` が空配列で固定される経路
4. `hasUsableRangeCandles()` の判定で再取得されない経路

## 6. デバッグ用の実測例

`JP.5016` の実測値:

- 2026-06-09 close = `3555`
- 2026-06-15 close = `3766`
- 2026-06-16 close = `4466`
- 5D = `25.63%`
- 0D = `18.59%`

`POST /api/moomoo/quotes` では、少なくとも以下が実測で返っている。

- `JP.5016`
- `JP.6723`
- `JP.285A`
- `JP.3436`
- `JP.4063`
- `JP.5713`

## 7. 参照先

- `C:\Users\mahha\OneDrive\開発\mooview\src\components\MacroFlowMap.tsx`
- `C:\Users\mahha\OneDrive\開発\mooview\docs\techreference.md`
