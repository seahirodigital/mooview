import hmac
import json
import math
import os
import threading
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Dict, Optional, Tuple

import pytz
from moomoo import AuType, KLType, OpenQuoteContext, RET_OK, SubType


OPEND_HOST = os.getenv("MOOMOO_OPEND_HOST", "127.0.0.1")
OPEND_PORT = int(os.getenv("MOOMOO_OPEND_PORT", "11111"))
GATEWAY_HOST = os.getenv("MOOMOO_GATEWAY_HOST", "127.0.0.1")
GATEWAY_PORT = int(os.getenv("MOOMOO_GATEWAY_PORT", "8787"))
GATEWAY_KEY = os.getenv("MOOMOO_GATEWAY_KEY", "")

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
}


def normalize_symbol(raw_symbol: str) -> str:
    symbol = raw_symbol.strip().upper()
    if not symbol:
        raise ValueError("銘柄コードを指定してください。")

    if "." in symbol:
        prefix, code = symbol.split(".", 1)
        if prefix in MARKET_TIMEZONES and code:
            return f"{prefix}.{code}"

    if symbol.endswith(".HK"):
        return f"HK.{symbol[:-3].zfill(5)}"
    if symbol.endswith(".T"):
        return f"JP.{symbol[:-2]}"
    if symbol.endswith(".JP"):
        return f"JP.{symbol[:-3]}"
    if symbol.isdigit() and len(symbol) == 5:
        return f"HK.{symbol}"
    return f"US.{symbol}"


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        result = float(value)
    except (TypeError, ValueError):
        return default
    return result if math.isfinite(result) else default


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
                self._subscribe(symbol, SubType.QUOTE)
                ret, data = self._get_context().get_stock_quote([symbol])
                if ret != RET_OK:
                    raise RuntimeError(str(data))

                row = data.iloc[0]
                last_price = as_float(row.get("last_price"))
                previous_close = as_float(row.get("prev_close_price"))
                change_pct = (
                    ((last_price - previous_close) / previous_close) * 100
                    if previous_close
                    else 0.0
                )
                return {
                    "success": True,
                    "symbol": symbol,
                    "name": str(row.get("name", symbol)),
                    "price": last_price,
                    "open": as_float(row.get("open_price")),
                    "high": as_float(row.get("high_price")),
                    "low": as_float(row.get("low_price")),
                    "previousClose": previous_close,
                    "volume": int(as_float(row.get("volume"))),
                    "changePct": change_pct,
                    "dataDate": str(row.get("data_date", "")),
                    "dataTime": str(row.get("data_time", "")),
                }
            except Exception:
                self._reset_context()
                raise

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
            except Exception:
                self._reset_context()
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
            if self.path == "/v1/kline":
                result = SERVICE.kline(
                    str(payload.get("symbol", "")),
                    str(payload.get("timeframe", "5m")),
                    int(payload.get("reqNum", 200)),
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
