# MooView データ取得ソース最新仕様

更新日: 2026-07-09

この文書は、課金しない運用を前提に、MooView がどのデータを Moomoo OpenD から取得し、どのデータを Yahoo Finance から取得するかを固定するための仕様です。

## 結論

課金しない運用では、JP 株と JP ETF は Yahoo Finance を標準取得元として扱います。

OpenD は引き続き起動し、US / HK / Crypto など無料権限で取得できる市場に使います。Yahoo は一時的な退避ではなく、JP 銘柄のチャート・ウォッチリスト・KLine を成立させるための通常経路です。

## 現在の無料 OpenD 権限

2026-07-09 時点の OpenD 10.7.6728 実測では、無料状態の権限は以下です。

| 市場 | OpenD 権限 | MooView での扱い |
|---|---:|---|
| US Stocks | LV3 | OpenD で quote / kline を取得する |
| HK Stocks | LV1 | OpenD で quote / kline を取得する |
| Crypto | LV1 | OpenD で取得できる範囲は OpenD を使う |
| JP Stocks | No Permission | Yahoo Finance を使う |
| JP ETFs | No Permission | Yahoo Finance を使う |
| JP Futures | No Permission | 原則 N/A または別データソース待ち |
| US Options / US Futures / US OTC | No Permission | 原則 N/A または別データソース待ち |

実測例:

| シンボル | OpenD 結果 | MooView の取得元 |
|---|---|---|
| `US.VOO` | 正常取得 | OpenD |
| `HK.00700` | 正常取得 | OpenD |
| `JP.1308` | ETF quote permission なし | Yahoo Finance |
| `JP.7203` | Stocks quote permission なし | Yahoo Finance |

## Yahoo Finance で取得するもの

Yahoo Finance は `JP.` で始まる日本株・日本 ETF に使います。

内部変換:

| MooView シンボル | Yahoo シンボル |
|---|---|
| `JP.7203` | `7203.T` |
| `JP.1308` | `1308.T` |
| `JP.200A` | `200A.T` |

取得 API:

```text
https://query1.finance.yahoo.com/v8/finance/chart/{YahooSymbol}
```

Yahoo で取得する対象:

| 用途 | 対象 | 備考 |
|---|---|---|
| 単体 quote | `JP.` 銘柄 | OpenDを待たず、Yahoo quote を先に使う |
| 一括 quotes | `JP.` 銘柄 | JP銘柄をOpenD一括snapshotに混ぜず、Yahoo quote を先に使う |
| KLine | `JP.` 銘柄 | OpenDを待たず、Yahoo chart を先に使う |
| チャート描画 | `JP.` 銘柄 | Yahoo KLine の candles で描画する |
| ウォッチリスト | `JP.` 銘柄 | Yahoo quote の price / changePct を表示する |
| JP セクター / TPX | `JP.` の TOPIX-17 ETF など | Yahoo quote / Yahoo KLine を優先的に使う |

## Yahoo で取れる範囲と制約

JP 株・JP ETF の時系列チャートとウォッチリスト表示は、Yahoo で取得できます。

ただし、OpenD と完全に同じ粒度ではありません。

| MooView 足 | Yahoo interval | 備考 |
|---|---|---|
| `1m` | `1m` | 直近短期のみ |
| `3m` | `2m` | Yahoo に 3m がないため近似 |
| `5m` | `5m` | 対応 |
| `10m` | `15m` | Yahoo に 10m がないため近似 |
| `30m` | `30m` | 対応 |
| `1h` | `60m` | 対応 |
| `4h` | `60m` | 4h足ではなく60分足で代替 |
| `1d` | `1d` | 対応 |
| `1w` | `1wk` | 対応 |
| `1mo` | `1mo` | 対応 |

JP 指数や特殊シンボルは注意が必要です。現在の実装は `JP.{code}` を `{code}.T` に変換するため、通常の株・ETFには向きます。一方、`.N225` や `.TOPIX` のような指数表記は、Yahoo 側の正式シンボルと一致しない場合があります。指数を安定取得したい場合は、別途シンボル変換表を持つ必要があります。

## OpenD で取得するもの

OpenD は無料権限がある市場に使います。

| 用途 | 対象 | 取得元 |
|---|---|---|
| ヘッダー ticker | US / HK など | OpenD quote |
| ウォッチリスト quote | US / HK など | OpenD snapshot |
| チャート KLine | US / HK など | OpenD history kline / current kline |
| 検索 | OpenD が検索できる市場 | OpenD search |

OpenD から返る代表的な `source`:

| source | 意味 |
|---|---|
| `history` | OpenD の `request_history_kline` 由来 |
| `current` | OpenD の `get_cur_kline` 由来 |
| なし | OpenD snapshot quote 由来 |

## Gateway のフォールバック順序

### quote

1. `normalize_symbol()` でシンボルを正規化する。
2. `JP.` 銘柄は最初に Yahoo chart から quote を作り、成功したら `source: yahoo-chart` として返す。
3. JP以外、またはYahooが失敗したJPだけ、OpenD `get_market_snapshot()` を試す。
4. 成功した場合は OpenD quote を返す。
5. Yahoo も OpenD も失敗した場合だけ失敗として返す。

### quotes

1. 最大400銘柄を正規化する。
2. 未キャッシュの `JP.` 銘柄はOpenD一括snapshotに混ぜず、Yahoo quote を先に作る。
3. JP以外を OpenD `get_market_snapshot()` で一括取得する。
4. 一括失敗時は分割しながら再試行する。
5. 有効銘柄の成功結果は、他銘柄の失敗で破棄しない。

### kline

1. `JP.` 銘柄は最初に Yahoo chart から candles を作り、成功したら `source: yahoo-chart` として返す。
2. Yahoo が失敗した場合だけ、OpenD `request_history_kline()` を試す。
3. OpenD history が成功した場合は `source: history` として返す。
4. Yahoo も OpenD history も失敗した場合、短い日足では quote から仮想足を作る。
5. 最後に OpenD `get_cur_kline()` を試す。

この順序にする理由は、無料OpenDではJP Stocks / JP ETFsのquote権限がなく、`request_history_kline()` が権限不足や応答待ちで長く止まると、取得可能なYahoo chartへ到達できないためです。
JPセクター / TPX や `JP.408A/JP.1308` のような合成チャートは、左辺・右辺のKLineを揃える必要があるため、JP KLineはYahoo先行を必須仕様とします。

チャートのD表示ラベルとウォッチリストの変動率は、同じquote日次変化率を使います。
例えば `JP.200A/JP.1308` は、`JP.200A` と `JP.1308` のYahoo quoteから前日終値比を合成し、チャート内の最初の分足からの変化率を表示しません。

## チャートでの扱い

JP 銘柄のチャートは、Yahoo KLine の candles で描画できます。

`source: yahoo-chart` の candles は、OpenD の candles と同じ形へ変換されます。

```ts
{
  time: number;
  timeStr: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

そのため、通常チャート、比較チャート、ウォッチリストからの比較追加、JP セクター / TPX の比較チャートは、データが取得できる限り Yahoo で描画できます。

制約:

- Yahoo の分足履歴は取得可能期間が短い。
- `3m`、`10m`、`4h` は近似 interval になる。
- JP 指数は個別の変換表がないと失敗する可能性がある。
- Yahoo 側の遅延、欠損、アクセス制限が発生した場合は `N/A` になる。

## ウォッチリストでの扱い

JP 銘柄のウォッチリストは、Yahoo quote で表示できます。

表示に使う項目:

| MooView 項目 | Yahoo 由来 |
|---|---|
| `price` | `regularMarketPrice` または最新 candle close |
| `previousClose` | `previousClose` / `chartPreviousClose` |
| `changePct` | `(price - previousClose) / previousClose * 100` |
| `open` | `regularMarketOpen` または candle open |
| `high` | `regularMarketDayHigh` |
| `low` | `regularMarketDayLow` |
| `volume` | `regularMarketVolume` または candle volume |
| `dataDate` | Yahoo timestamp を日本時間へ変換 |
| `dataTime` | Yahoo timestamp を日本時間へ変換 |
| `source` | `yahoo-chart` |

## Macro Flow / JP セクター / TPX の優先順位

JP セクター / TPX は、課金しない運用では Yahoo を優先取得元として扱います。

優先順位:

1. JP セクター / TPX の `JP.` ETF 群。
2. JP 個別株。
3. US 銘柄。

日本時間 `09:00-22:30` は、US市場の取得を急がず、JP側の取得とキャッシュ利用を優先します。USはこの時間帯に一度取得済みの IndexedDB / localStorage キャッシュがあれば、それを表示に使います。

## キャッシュ方針

| キャッシュ | 対象 | 目的 |
|---|---|---|
| quote cache | 最新 quote | ウォッチリスト、ヘッダー、1D表示 |
| IndexedDB quote history | 日付別 quote | スライダー、1D履歴、再取得削減 |
| IndexedDB kline | KLine candles | 2D以上のチャート、期間変動率 |

OpenD由来かYahoo由来かに関係なく、MooView内部では同じ quote / candle 形式に揃えて保存します。`source` はデバッグと優先順位判断のために保持します。

## 課金しない運用の判断

課金しない場合、JP OpenD 権限の復旧を前提にしません。

今後の実装・調査では、次を前提にします。

- JP Stocks / JP ETFs は Yahoo で取得する。
- US / HK / Crypto は OpenD の無料権限を使う。
- OpenD の JP 権限エラーは障害ではなく、無料運用時の通常状態として扱う。
- Yahoo 取得が失敗した場合だけ、JP 側の表示を `N/A` とする。
- フォールバック機構は削除しない。

## 既知の注意点

- OpenD の履歴KLine枠は `Hist KL 100/100` に近づくと、US / HK の履歴取得も失敗しやすくなる。
- JPをYahooへ寄せることで、OpenDの履歴KLine枠をUS / HK向けに温存できる。
- JP銘柄のYahoo取得はOpenDの購読枠を使わない。
- Yahooへの短時間大量アクセスは失敗する可能性があるため、JPセクターを優先し、個別株は制限内で順番に取得する。

## JP Yahoo fallback のUI足種表示

MooView内部の `Timeframe` は既存互換のため `3m`、`10m`、`4h` を保持する。
ただしJP銘柄をYahoo fallbackで取得するとき、Yahooの実効intervalは次の代替になる。

| UIの通常足種 | JP銘柄選択時の表示 | Yahoo interval |
|---|---|---|
| `3m` | `2m` | `2m` |
| `10m` | `15m` | `15m` |
| `4h` | `60m` | `60m` |

そのため、メインチャート、Macro Flow、Value Chainのチャートヘッダーは、表示対象に `JP.` 銘柄が含まれる場合だけ上記の実効足種を表示する。
内部の選択値は変えないため、既存のキャッシュキー、パネル保存、OpenD向けの足種互換性は維持する。

## チャート描画でのquote fallback禁止条件

ウォッチリストや現在値表示では、KLineが未取得でもquoteから現在値を表示してよい。
ただしチャート描画では、quoteから作る2点だけの疑似ローソク足を `BASKET:` や `JP.5016/JP.1306` のような合成系列へ使わない。

理由は、比較チャートの時間軸が2点だけになり、実際には分足KLineが取得できている銘柄まで横一直線に見えるため。
比較専用チャートでは、主軸系列として最初の銘柄ではなく、取得済みローソク足本数が最も多い実KLine系列を使う。
KLineがまだ無い合成系列は、疑似直線を描かず取得待ちとして扱う。
また、`source: quote-fallback` のKLine応答はチャート用のローソク足キャッシュへ保存しない。
分足チャートでは2本以下の系列を有効KLine扱いしないため、過去に保存された疑似2点足が残っていても描画軸には使わない。

## JP Yahoo symbol aliases

JPの個別株・ETFは原則 `JP.1308` -> `1308.T` としてYahooへ問い合わせる。
指数系は `.T` を付けると失敗するため、次の明示エイリアスを使う。

| MooView symbol | Yahoo symbol |
|---|---|
| `JP..N225` / `JP.N225` / `JP.NI225` | `^N225` |
| `JP..TOPIX` / `JP.TOPIX` / `JP..TPX` / `JP.TPX` | `1308.T` |
