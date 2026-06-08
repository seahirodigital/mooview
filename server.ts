import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import WebSocket from "ws";

const app = express();
const PORT = 3000;

app.use(express.json());

// Market mappings from Symbol to Futu/Moomoo standards:
// Markets: US (1), HK (2), CN (3), SG (4), JP (5).
function getMarketCode(symbol: string): { market: number; code: string } {
  const clean = symbol.toUpperCase().trim();
  // Simple check
  if (clean.endsWith(".HK") || clean === "00700" || clean === "09988") {
    return { market: 2, code: clean.replace(".HK", "") };
  }
  if (clean.endsWith(".JP") || clean.endsWith(".T")) {
    return { market: 5, code: clean.replace(".JP", "").replace(".T", "") };
  }
  if (clean.includes("BTC") || clean.includes("USD") && !clean.match(/^[A-Z]{3,4}$/)) {
    // Crypto (Typically US Crypto or other)
    return { market: 1, code: clean };
  }
  // Default to US stock market (1)
  return { market: 1, code: clean };
}

// Convert timeframe string to Futu/Moomoo KLType enum value:
// 1m (1), 5m (2), 15m (3), 30m (4), 1h (5), 1d (6), 1w (7), 1mo (8), 3m (9)
function getKlType(timeframe: string): number {
  switch (timeframe) {
    case "1m": return 1;
    case "3m": return 9;
    case "5m": return 2;
    case "10m": return 2; // OpenD doesn't have native 10m sometimes, fall back to 5m/15m
    case "15m": return 3;
    case "30m": return 4;
    case "1h": return 5;
    case "1d": return 6;
    case "1w": return 7;
    case "1mo": return 8;
    default: return 6;
  }
}

// Helper to query FutuOpenD over WebSocket JSON interface with a promise
function queryFutuOpenD(opUrl: string, cmd: string, reqData: any, timeoutMs: number = 4000): Promise<any> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(opUrl);
    } catch (e) {
      return reject(new Error(`WebSocket initialization failed: ${(e as Error).message}`));
    }

    const timer = setTimeout(() => {
      ws.close();
      reject(new Error(`FutuOpenD connection to ${opUrl} timed out after ${timeoutMs}ms.`));
    }, timeoutMs);

    ws.on("open", () => {
      // Setup payload matching FutuOpenD standards
      const payload = {
        cmd: cmd,
        id: Math.floor(Math.random() * 1000000),
        req: reqData
      };
      ws.send(JSON.stringify(payload));
    });

    ws.on("message", (data) => {
      clearTimeout(timer);
      ws.close();
      try {
        const response = JSON.parse(data.toString());
        resolve(response);
      } catch (e) {
        reject(new Error("Failed to parse FutuOpenD JSON response"));
      }
    });

    ws.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

// API endpoint to connect, check status, and check if FutuOpenD is running
app.post("/api/moomoo/status", async (req, res) => {
  const { opend_url } = req.body;
  const targetUrl = opend_url || "ws://127.0.0.1:33333";

  try {
    // Try to trigger a lightweight handshake or connection test
    // cmd: 'InitConnect' or standard basic call
    const result = await queryFutuOpenD(targetUrl, "InitConnect", {
      clientVer: 101,
      clientID: "MooViewWebProxy",
      recvNotify: false
    }, 2500);

    return res.json({
      connected: true,
      url: targetUrl,
      info: result,
      message: "Successfully connected to FutuOpenD / Moomoo API!"
    });
  } catch (error) {
    return res.json({
      connected: false,
      url: targetUrl,
      error: (error as Error).message,
      help: "Ensure FutuOpenD is running on your machine and configured to listen for WebSockets on the requested IP/Port with standard JSON protocol."
    });
  }
});

// API endpoint to request historical Candle data (K-Line) from Moomoo OpenAPI
app.post("/api/moomoo/kline", async (req, res) => {
  const { symbol, timeframe, opend_url, reqNum = 200 } = req.body;
  const targetUrl = opend_url || "ws://127.0.0.1:33333";

  const { market, code } = getMarketCode(symbol);
  const klType = getKlType(timeframe);

  try {
    // FutuOpenD 'Qot_GetKL' command fetches K-Line candles
    const response = await queryFutuOpenD(targetUrl, "Qot_GetKL", {
      security: { market, code },
      rehabType: 1, // 1 for Forward split adjustment
      klType: klType,
      reqNum: reqNum
    }, 3500);

    if (response.errCode !== 0 || response.retType !== 0) {
      throw new Error(response.retMsg || `FutuOpenD returned error code ${response.errCode}`);
    }

    const klList = response.s2c?.klList || [];
    
    // Map FutuOpenD Candle items to our UI Candle interface format
    const formattedCandles = klList.map((item: any) => {
      const parsedTime = item.time ? Math.floor(new Date(item.time).getTime() / 1000) : Math.floor(Date.now() / 1000);
      return {
        time: parsedTime,
        timeStr: item.time || "",
        open: Number(item.open),
        high: Number(item.high),
        low: Number(item.low),
        close: Number(item.close),
        volume: Number(item.volume || item.turnover || 0)
      };
    });

    return res.json({
      success: true,
      symbol,
      timeframe,
      candles: formattedCandles
    });

  } catch (error) {
    // Return standard error payload so client can trigger a beautiful mock fallback gracefully
    return res.json({
      success: false,
      error: (error as Error).message,
      isFallback: true,
    });
  }
});

// API endpoint to request real-time snapshot quote from Moomoo OpenAPI
app.post("/api/moomoo/quote", async (req, res) => {
  const { symbol, opend_url } = req.body;
  const targetUrl = opend_url || "ws://127.0.0.1:33333";

  const { market, code } = getMarketCode(symbol);

  try {
    // FutuOpenD 'Qot_GetSecuritySnapshot' command fetches snapshot quotes
    const response = await queryFutuOpenD(targetUrl, "Qot_GetSecuritySnapshot", {
      securityList: [{ market, code }]
    }, 3500);

    if (response.errCode !== 0 || response.retType !== 0) {
      throw new Error(response.retMsg || `FutuOpenD error code ${response.errCode}`);
    }

    const snapshot = response.s2c?.snapshotList?.[0] || {};
    const basic = snapshot.basic || {};

    return res.json({
      success: true,
      symbol,
      price: Number(basic.curPrice || basic.lastClosePrice || 0),
      high: Number(basic.highPrice || 0),
      low: Number(basic.lowPrice || 0),
      volume: Number(basic.volume || 0),
      changePct: Number(basic.curPrice && basic.lastClosePrice ? ((basic.curPrice - basic.lastClosePrice) / basic.lastClosePrice) * 100 : 0)
    });

  } catch (error) {
    return res.json({
      success: false,
      error: (error as Error).message,
      isFallback: true
    });
  }
});

// Serve frontend assets
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
