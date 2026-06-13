import hmac
import json
import math
import os
import re
import threading
import time
import unicodedata
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import pytz
from moomoo import (
    AuType,
    KLType,
    Market,
    OpenQuoteContext,
    RET_OK,
    SecurityType,
    SubType,
)


OPEND_HOST = os.getenv("MOOMOO_OPEND_HOST", "127.0.0.1")
OPEND_PORT = int(os.getenv("MOOMOO_OPEND_PORT", "11111"))
GATEWAY_HOST = os.getenv("MOOMOO_GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = int(os.getenv("MOOMOO_GATEWAY_PORT", "8787"))
GATEWAY_KEY = os.getenv("MOOMOO_GATEWAY_KEY", "")
QUOTE_CACHE_TTL_SECONDS = 30
JP_SYMBOLS_PATH = Path(__file__).resolve().parent / "data" / "jp_symbols.json"

KLINE_TYPES = {
    "1m": (SubType.K_1M, KLType.K_1M),
    "3m": (SubType.K_3M, KLType.K_3M),
    "5m": (SubType.K_5M, KLType.K_5M),
    "10m": (SubType.K_10M, KLType.K_10M),
    "30m": (SubType.K_30M, KLType.K_30M),
    "1h": (SubType.K_60M, KLType.K_60M),
    "4h": (SubType.K_240M, KLType.K_240M),
    "1d": (SubType.K_DAY, KLType.K_DAY),
    "1w": (SubType.K_WEEK, KLType.K_WEEK),
    "1mo": (SubType.K_MON, KLType.K_MON),
}

MARKET_TIMEZONES = {
    "US": "America/New_York",
    "HK": "Asia/Hong_Kong",
    "SH": "Asia/Shanghai",
    "SZ": "Asia/Shanghai",
    "JP": "Asia/Tokyo",
    "SG": "Asia/Singapore",
    "FX": "UTC",
    "BD": "UTC",
}


def normalize_symbol_code(raw_code: str) -> str:
    code = raw_code.strip()
    if not code:
        return code
    if code.startswith("."):
        return "." + code[1:].upper()
    if code.lower().endswith("main"):
        return f"{code[:-4].upper()}main"
    return code.upper()


def normalize_symbol(raw_symbol: str) -> str:
    raw_value = raw_symbol.strip()
    if not raw_value:
        raise ValueError("銘柄コードを指定してください。")
    symbol = raw_value.upper()

    suffix_parts = raw_value.split(".")
    if len(suffix_parts) >= 2:
        suffix_market = suffix_parts[-1].upper()
        suffix_code = ".".join(suffix_parts[:-1])
        if suffix_market in MARKET_TIMEZONES and suffix_code:
            return f"{suffix_market}.{normalize_symbol_code(suffix_code)}"

    if "." in raw_value:
        prefix, code = raw_value.split(".", 1)
        market = prefix.upper()
        if market in MARKET_TIMEZONES and code:
            return f"{market}.{normalize_symbol_code(code)}"

    if symbol.endswith(".HK"):
        return f"HK.{symbol[:-3].zfill(5)}"
    if symbol.endswith(".T"):
        return f"JP.{symbol[:-2]}"
    if symbol.endswith(".JP"):
        return f"JP.{symbol[:-3]}"
    if re.fullmatch(r"\d{3}[A-Z0-9]", symbol):
        return f"JP.{symbol}"
    if symbol.isdigit() and len(symbol) == 5:
        return f"HK.{symbol}"
    return f"US.{normalize_symbol_code(raw_value)}"


def normalize_search_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"[\s\u3000・･._\-（）()株式会社]+", "", normalized)


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


def as_optional_float(value: Any) -> Optional[float]:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return None
    return result if math.isfinite(result) else None


def first_optional_float(row: Any, field_names: List[str]) -> Optional[float]:
    for field_name in field_names:
        value = as_optional_float(row.get(field_name))
        if value is not None:
            return value
    return None


def market_timestamp(symbol: str, time_key: str) -> int:
    market = symbol.split(".", 1)[0]
    timezone = pytz.timezone(MARKET_TIMEZONES.get(market, "UTC"))
    naive = datetime.strptime(time_key, "%Y-%m-%d %H:%M:%S")
    try:
        localized = timezone.localize(naive, is_dst=None)
    except pytz.AmbiguousTimeError:
        localized = timezone.localize(naive, is_dst=False)
    return int(localized.timestamp())


class MoomooQuoteService:
    def __init__(self) -> None:
        self._context: Optional[OpenQuoteContext] = None
        self._subscriptions = set()
        self._lock = threading.RLock()
        self._jp_symbols: Optional[List[Dict[str, str]]] = None
        self._jp_english_names: Optional[Dict[str, str]] = None
        self._quote_cache: Dict[str, Tuple[float, Dict[str, Any]]] = {}

    def _get_context(self) -> OpenQuoteContext:
        if self._context is None:
            self._context = OpenQuoteContext(host=OPEND_HOST, port=OPEND_PORT)
        return self._context

    def _reset_context(self) -> None:
        if self._context is not None:
            try:
                self._context.close()
            finally:
                self._context = None
                self._subscriptions.clear()

    def _reset_context_on_connection_error(self, error: Exception) -> None:
        message = str(error).lower()
        connection_markers = (
            "connect",
            "disconnect",
            "socket",
            "network",
            "broken pipe",
            "connection reset",
            "connection closed",
        )
        if any(marker in message for marker in connection_markers):
            self._reset_context()

    def _subscribe(self, symbol: str, subtype: Any) -> None:
        subscription = (symbol, str(subtype))
        if subscription in self._subscriptions:
            return

        context = self._get_context()
        ret, message = context.subscribe(
            [symbol],
            [subtype],
            subscribe_push=False,
        )
        if ret != RET_OK:
            raise RuntimeError(str(message))
        self._subscriptions.add(subscription)

    def _quote_from_row(self, row: Any) -> Dict[str, Any]:
        symbol = str(row.get("code", ""))
        last_price = as_float(row.get("last_price"))
        previous_close = first_optional_float(
            row,
            [
                "prev_close_price",
                "previous_close",
                "previous_close_price",
                "pre_close",
                "pre_close_price",
            ],
        )
        net_change = first_optional_float(
            row,
            ["net_change", "price_change", "change", "change_value"],
        )
        if (previous_close is None or previous_close == 0.0) and net_change is not None:
            previous_close = last_price - net_change

        direct_change_pct = first_optional_float(
            row,
            [
                "change_rate",
                "change_ratio",
                "change_pct",
                "changePct",
                "pct_chg",
                "percent_change",
            ],
        )
        calculated_change_pct = (
            ((last_price - previous_close) / previous_close) * 100
            if previous_close
            else None
        )
        change_pct = (
            calculated_change_pct
            if calculated_change_pct is not None and (direct_change_pct is None or direct_change_pct == 0.0)
            else direct_change_pct
        )
        direct_market_cap = first_optional_float(
            row,
            [
                "market_val",
                "market_value",
                "market_cap",
                "marketCapital",
                "total_market_val",
                "stock_market_val",
                "stock_market_value",
                "capitalization",
                "total_mv",
            ],
        )
        share_count = first_optional_float(
            row,
            [
                "total_share",
                "total_shares",
                "outstanding_shares",
                "issued_shares",
                "share_total",
                "float_share",
                "float_shares",
            ],
        )
        calculated_market_cap = (
            last_price * share_count
            if last_price > 0 and share_count is not None and share_count > 0
            else None
        )
        market_cap = direct_market_cap or calculated_market_cap or 0.0
        return {
            "success": True,
            "symbol": symbol,
            "name": str(row.get("name", symbol)),
            "price": last_price,
            "open": as_float(row.get("open_price")),
            "high": as_float(row.get("high_price")),
            "low": as_float(row.get("low_price")),
            "previousClose": previous_close or 0.0,
            "volume": int(as_float(row.get("volume"))),
            "changePct": change_pct or 0.0,
            "marketCap": market_cap,
            "dataDate": str(row.get("update_time", "")).split(" ", 1)[0],
            "dataTime": (
                str(row.get("update_time", "")).split(" ", 1)[1]
                if " " in str(row.get("update_time", ""))
                else ""
            ),
        }

    def _quote_locked(self, symbol: str) -> Dict[str, Any]:
        cached = self._quote_cache.get(symbol)
        if cached and time.monotonic() - cached[0] < QUOTE_CACHE_TTL_SECONDS:
            result = cached[1]
            if result.get("success"):
                return result
            raise RuntimeError(str(result.get("error", "価格を取得できません。")))

        ret, data = self._get_context().get_market_snapshot([symbol])
        if ret != RET_OK:
            self._quote_cache[symbol] = (
                time.monotonic(),
                {
                    "success": False,
                    "symbol": symbol,
                    "error": str(data),
                },
            )
            raise RuntimeError(str(data))
        result = self._quote_from_row(data.iloc[0])
        self._quote_cache[symbol] = (time.monotonic(), result)
        return result

    def _snapshot_quotes_locked(
        self,
        symbols: List[str],
        results: Dict[str, Dict[str, Any]],
    ) -> None:
        if not symbols:
            return

        unresolved = []
        now = time.monotonic()
        for symbol in symbols:
            cached = self._quote_cache.get(symbol)
            if cached and now - cached[0] < QUOTE_CACHE_TTL_SECONDS:
                results[symbol] = cached[1]
            else:
                unresolved.append(symbol)

        if not unresolved:
            return

        ret, data = self._get_context().get_market_snapshot(unresolved)
        if ret == RET_OK:
            for _, row in data.iterrows():
                quote = self._quote_from_row(row)
                symbol = str(quote["symbol"])
                self._quote_cache[symbol] = (time.monotonic(), quote)
                results[symbol] = quote
            return

        error_message = str(data)
        if len(unresolved) > 1 and "high frequency" not in error_message.lower():
            midpoint = len(unresolved) // 2
            self._snapshot_quotes_locked(unresolved[:midpoint], results)
            self._snapshot_quotes_locked(unresolved[midpoint:], results)
            return

        for symbol in unresolved:
            failure = {
                "success": False,
                "symbol": symbol,
                "error": error_message,
            }
            self._quote_cache[symbol] = (time.monotonic(), failure)
            results[symbol] = failure

    def _load_jp_symbols(self) -> List[Dict[str, str]]:
        if self._jp_symbols is None:
            if not JP_SYMBOLS_PATH.exists():
                raise RuntimeError(
                    f"日本株検索データが見つかりません: {JP_SYMBOLS_PATH}"
                )
            with JP_SYMBOLS_PATH.open("r", encoding="utf-8") as file:
                self._jp_symbols = json.load(file)
        return self._jp_symbols

    def _load_jp_english_names(self) -> Dict[str, str]:
        if self._jp_english_names is None:
            ret, data = self._get_context().get_stock_basicinfo(
                Market.JP,
                SecurityType.STOCK,
            )
            if ret != RET_OK:
                raise RuntimeError(str(data))
            self._jp_english_names = {
                str(row.get("code", "")): str(row.get("name", ""))
                for _, row in data.iterrows()
            }
        return self._jp_english_names

    def search(self, raw_query: str, limit: int = 8) -> Dict[str, Any]:
        query = raw_query.strip()
        if not query:
            raise ValueError("銘柄名または証券コードを入力してください。")

        normalized_query = normalize_search_text(query)
        result_limit = max(1, min(int(limit), 20))

        with self._lock:
            jp_symbols = self._load_jp_symbols()
            english_names = self._load_jp_english_names()
            candidates = []

            if re.fullmatch(r"[A-Za-z][A-Za-z0-9._-]*", query):
                symbol = normalize_symbol(query)
                candidates.append(
                    {
                        "score": -1,
                        "symbol": symbol,
                        "code": symbol.split(".", 1)[1],
                        "name": query.upper(),
                        "nameEn": query.upper(),
                        "market": symbol.split(".", 1)[0],
                        "category": "DIRECT",
                    }
                )

            for item in jp_symbols:
                code = str(item["code"])
                symbol = f"JP.{code}"
                japanese_name = str(item["name"])
                english_name = english_names.get(symbol, "")
                searchable_values = [
                    normalize_search_text(code),
                    normalize_search_text(symbol),
                    normalize_search_text(japanese_name),
                    normalize_search_text(english_name),
                ]

                score = None
                if normalized_query in searchable_values:
                    score = 0
                elif any(
                    value.startswith(normalized_query)
                    for value in searchable_values
                ):
                    score = 1
                elif any(normalized_query in value for value in searchable_values):
                    score = 2

                if score is not None:
                    candidates.append(
                        {
                            "score": score,
                            "symbol": symbol,
                            "code": code,
                            "name": japanese_name,
                            "nameEn": english_name,
                            "market": "JP",
                            "category": str(item.get("category", "")),
                        }
                    )

            candidates.sort(
                key=lambda item: (
                    item["score"],
                    len(item["name"]),
                    item["code"],
                )
            )

            if not candidates and re.fullmatch(
                r"[A-Za-z][A-Za-z0-9._-]*",
                query,
            ):
                symbol = normalize_symbol(query)
                candidates.append(
                    {
                        "score": 0,
                        "symbol": symbol,
                        "code": symbol.split(".", 1)[1],
                        "name": query.upper(),
                        "nameEn": query.upper(),
                        "market": symbol.split(".", 1)[0],
                        "category": "",
                    }
                )

            trimmed = candidates[:result_limit]
            for item in trimmed:
                item.pop("score", None)

            return {
                "success": True,
                "query": query,
                "candidates": trimmed,
            }

    def status(self) -> Dict[str, Any]:
        with self._lock:
            try:
                context = self._get_context()
                ret, data = context.get_global_state()
                if ret != RET_OK:
                    raise RuntimeError(str(data))
                return {
                    "connected": True,
                    "opendHost": OPEND_HOST,
                    "opendPort": OPEND_PORT,
                }
            except Exception:
                self._reset_context()
                raise

    def quote(self, raw_symbol: str) -> Dict[str, Any]:
        symbol = normalize_symbol(raw_symbol)
        with self._lock:
            try:
                return self._quote_locked(symbol)
            except Exception as error:
                self._reset_context_on_connection_error(error)
                raise

    def quotes(self, raw_symbols: Any) -> Dict[str, Any]:
        if not isinstance(raw_symbols, list):
            raise ValueError("symbolsは配列で指定してください。")

        symbols = []
        seen = set()
        for raw_symbol in raw_symbols[:200]:
            try:
                symbol = normalize_symbol(str(raw_symbol))
            except Exception:
                continue
            if symbol not in seen:
                seen.add(symbol)
                symbols.append(symbol)

        if not symbols:
            raise ValueError("有効な銘柄が指定されていません。")

        results: Dict[str, Dict[str, Any]] = {}
        with self._lock:
            self._snapshot_quotes_locked(symbols, results)

        return {
            "success": True,
            "quotes": results,
        }

    def kline(
        self,
        raw_symbol: str,
        timeframe: str,
        requested_count: int,
    ) -> Dict[str, Any]:
        symbol = normalize_symbol(raw_symbol)
        if timeframe not in KLINE_TYPES:
            raise ValueError(f"未対応の時間足です: {timeframe}")

        subtype, kline_type = KLINE_TYPES[timeframe]
        count = max(1, min(int(requested_count), 1000))

        with self._lock:
            try:
                self._subscribe(symbol, subtype)
                ret, data = self._get_context().get_cur_kline(
                    symbol,
                    count,
                    kline_type,
                    AuType.QFQ,
                )
                if ret != RET_OK:
                    raise RuntimeError(str(data))

                candles = []
                for _, row in data.iterrows():
                    time_key = str(row.get("time_key", ""))
                    candles.append(
                        {
                            "time": market_timestamp(symbol, time_key),
                            "timeStr": time_key,
                            "open": as_float(row.get("open")),
                            "high": as_float(row.get("high")),
                            "low": as_float(row.get("low")),
                            "close": as_float(row.get("close")),
                            "volume": int(as_float(row.get("volume"))),
                        }
                    )

                return {
                    "success": True,
                    "symbol": symbol,
                    "timeframe": timeframe,
                    "candles": candles,
                }
            except Exception as error:
                self._reset_context_on_connection_error(error)
                raise

    def close(self) -> None:
        with self._lock:
            self._reset_context()


SERVICE = MoomooQuoteService()


class GatewayHandler(BaseHTTPRequestHandler):
    server_version = "MooViewMoomooGateway/1.0"

    def _send_json(self, status: int, payload: Dict[str, Any]) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self) -> bool:
        if not GATEWAY_KEY:
            return True
        expected = f"Bearer {GATEWAY_KEY}"
        provided = self.headers.get("Authorization", "")
        return hmac.compare_digest(provided, expected)

    def _read_json(self) -> Dict[str, Any]:
        content_length = int(self.headers.get("Content-Length", "0"))
        if content_length <= 0 or content_length > 65536:
            return {}
        return json.loads(self.rfile.read(content_length).decode("utf-8"))

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(200, {"ok": True})
            return
        self._send_json(404, {"success": False, "error": "Not found"})

    def do_POST(self) -> None:
        if not self._authorized():
            self._send_json(401, {"success": False, "error": "Unauthorized"})
            return

        try:
            payload = self._read_json()
            if self.path == "/v1/status":
                self._send_json(200, SERVICE.status())
                return
            if self.path == "/v1/quote":
                self._send_json(200, SERVICE.quote(str(payload.get("symbol", ""))))
                return
            if self.path == "/v1/quotes":
                self._send_json(200, SERVICE.quotes(payload.get("symbols", [])))
                return
            if self.path == "/v1/kline":
                result = SERVICE.kline(
                    str(payload.get("symbol", "")),
                    str(payload.get("timeframe", "5m")),
                    int(payload.get("reqNum", 200)),
                )
                self._send_json(200, result)
                return
            if self.path == "/v1/search":
                result = SERVICE.search(
                    str(payload.get("query", "")),
                    int(payload.get("limit", 8)),
                )
                self._send_json(200, result)
                return
            self._send_json(404, {"success": False, "error": "Not found"})
        except (ValueError, json.JSONDecodeError) as error:
            self._send_json(400, {"success": False, "error": str(error)})
        except Exception as error:
            self._send_json(
                502,
                {
                    "success": False,
                    "connected": False,
                    "error": str(error),
                },
            )

    def log_message(self, message_format: str, *args: Any) -> None:
        print(
            f"{self.client_address[0]} - "
            f"{self.log_date_time_string()} - "
            f"{message_format % args}"
        )


def validate_bind_settings() -> None:
    local_hosts = {"127.0.0.1", "localhost", "::1"}
    if GATEWAY_HOST not in local_hosts and not GATEWAY_KEY:
        raise RuntimeError(
            "外部公開する場合はMOOMOO_GATEWAY_KEYの設定が必須です。"
        )


def main() -> None:
    validate_bind_settings()
    server = ThreadingHTTPServer((GATEWAY_HOST, GATEWAY_PORT), GatewayHandler)
    print(
        f"Moomoo gateway listening on "
        f"http://{GATEWAY_HOST}:{GATEWAY_PORT}"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        SERVICE.close()
        server.server_close()


if __name__ == "__main__":
    main()
