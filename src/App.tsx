import React, { useState, useEffect, useMemo } from 'react';
import { 
  Plus, 
  Settings, 
  Trash2, 
  Sliders,
  Database,
  LayoutGrid,
  Columns2,
  Rows2,
  Search,
  X,
  List,
  ChartNoAxesCombined
} from 'lucide-react';

import { Timeframe, ChartPanel, SymbolIndicatorSettings, TickerInfo, Candle } from './types';
import { DEFAULT_TICKERS, generateCandles, simulateTick } from './mockData';
import { InteractiveCustomChart } from './components/InteractiveCustomChart';
import { TradingViewWidget } from './components/TradingViewWidget';
import { IndicatorSettingsPanel } from './components/IndicatorSettingsPanel';

const DEFAULT_PANEL_HEIGHT = 840;

interface SymbolSearchCandidate {
  symbol: string;
  code: string;
  name: string;
  nameEn: string;
  market: string;
  category: string;
}

function readStoredValue<T>(key: string, fallback: T): T {
  const saved = localStorage.getItem(key);
  if (!saved) return fallback;
  try {
    return JSON.parse(saved) as T;
  } catch {
    return fallback;
  }
}

function normalizePanel(panel: ChartPanel): ChartPanel {
  return {
    ...panel,
    timeframe: (panel.timeframe as string) === '15m' ? '10m' : panel.timeframe,
    priceScale: panel.priceScale ?? 1,
    rsiHeightPct: panel.rsiHeightPct ?? 25,
    macdHeightPct: panel.macdHeightPct ?? 25,
  };
}

function formatTickerPrice(symbol: string, price: number | null): string {
  if (price === null) return 'N/A';
  if (symbol.startsWith('JP.')) {
    return `¥${price.toLocaleString('ja-JP', { maximumFractionDigits: 2 })}`;
  }
  return `$${price.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function formatWatchlistSymbol(symbol: string): string {
  return symbol.startsWith('JP.') ? symbol.slice(3) : symbol;
}

// Local default indicator generator to keep things resilient
function createDefaultIndicatorSettings(symbol: string): SymbolIndicatorSettings {
  const norm = symbol.toUpperCase();
  return {
    symbol: norm,
    indicators: {
      ma: { 
        enabled: norm === 'VOO' || norm === 'AAPL', 
        period1: 5, color1: '#e7c039', 
        period2: 12, color2: '#20aced', 
        period3: 20, color3: '#e152f2' 
      },
      ema: { 
        enabled: norm === 'QQQ' || norm === 'NVDA', 
        period1: 9, color1: '#f85f73', 
        period2: 26, color2: '#00e575' 
      },
      boll: { 
        enabled: true, 
        period: 20, 
        levels: [1, 2, 3],
        color: '#6c5dd3', 
        colorFill: 'rgba(108, 93, 211, 0.04)' 
      },
      rsi: { 
        enabled: true, 
        period: 14, 
        color: '#f3a14b', 
        overbought: 70, 
        oversold: 30 
      },
      macd: { 
        enabled: true, 
        fast: 12, 
        slow: 26, 
        signal: 9, 
        colorMacd: '#2d8cf0', 
        colorSignal: '#ff9900', 
        colorHistUp: '#26a69a', 
        colorHistDown: '#ef5350' 
      },
      vrvp: {
        enabled: false,
        rows: 24,
        widthPct: 22,
        colorUp: '#26a69a',
        colorDown: '#ef5350',
        colorPoc: '#f3a14b',
      }
    }
  };
}

function normalizeIndicatorSettings(
  symbol: string,
  raw?: Partial<SymbolIndicatorSettings>,
): SymbolIndicatorSettings {
  const defaults = createDefaultIndicatorSettings(symbol);
  const stored = raw?.indicators as Partial<SymbolIndicatorSettings['indicators']> | undefined;
  const storedBoll = stored?.boll as
    | (Partial<SymbolIndicatorSettings['indicators']['boll']> & { stdDev?: number })
    | undefined;
  const levels = Array.isArray(storedBoll?.levels)
    ? storedBoll.levels
        .map(Number)
        .filter((level) => Number.isFinite(level) && level > 0 && level <= 6)
    : [1, 2, 3];

  return {
    symbol: symbol.toUpperCase(),
    indicators: {
      ma: { ...defaults.indicators.ma, ...stored?.ma },
      ema: { ...defaults.indicators.ema, ...stored?.ema },
      boll: {
        ...defaults.indicators.boll,
        ...storedBoll,
        levels: levels.length > 0 ? Array.from(new Set(levels)).sort((a, b) => a - b) : [1, 2, 3],
      },
      rsi: { ...defaults.indicators.rsi, ...stored?.rsi },
      macd: { ...defaults.indicators.macd, ...stored?.macd },
      vrvp: { ...defaults.indicators.vrvp, ...stored?.vrvp },
    },
  };
}

interface MoomooTickerQuote {
  name: string;
  price: number;
  changePct: number;
}

export default function App() {
  // --- STATE ---
  // Tickers list management
  const [tickers, setTickers] = useState<TickerInfo[]>(() => {
    const saved = localStorage.getItem('tv_dashboard_tickers');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse tickers, resetting", e);
      }
    }
    return DEFAULT_TICKERS;
  });

  const [newSymbolInput, setNewSymbolInput] = useState('');
  const [tickerSearchOpen, setTickerSearchOpen] = useState(false);
  const [tickerSearchLoading, setTickerSearchLoading] = useState(false);
  const [tickerSearchError, setTickerSearchError] = useState<string | null>(null);
  const [tickerSearchCandidates, setTickerSearchCandidates] = useState<SymbolSearchCandidate[]>([]);

  // Chart Panels state
  const [panels, setPanels] = useState<ChartPanel[]>(() => {
    const saved = localStorage.getItem('tv_dashboard_panels');
    if (saved) {
      try {
        return (JSON.parse(saved) as ChartPanel[]).map(normalizePanel);
      } catch (e) {
        console.error("Failed to parse panels, resetting", e);
      }
    }
    // Default structure: 2 side by side charts (VOO and QQQ)
    return [
      {
        id: 'panel-1',
        symbol: 'VOO',
        timeframe: '5m',
        zoomFactor: 12,
        scrollOffsetPct: 100,
        showRsi: true,
        showMacd: false,
        showVolume: true,
        priceScale: 1,
        rsiHeightPct: 25,
        macdHeightPct: 25,
      },
      {
        id: 'panel-2',
        symbol: 'QQQ',
        timeframe: '10m',
        zoomFactor: 12,
        scrollOffsetPct: 100,
        showRsi: false,
        showMacd: true,
        showVolume: true,
        priceScale: 1,
        rsiHeightPct: 25,
        macdHeightPct: 25,
      }
    ];
  });

  // Symbol specific indicator settings
  const [indicatorDatabase, setIndicatorDatabase] = useState<Record<string, SymbolIndicatorSettings>>(() => {
    const saved = localStorage.getItem('tv_dashboard_indicators');
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as Record<string, Partial<SymbolIndicatorSettings>>;
        return Object.fromEntries(
          Object.entries(parsed).map(([symbol, settings]) => [
            symbol.toUpperCase(),
            normalizeIndicatorSettings(symbol, settings),
          ])
        );
      } catch (e) {
        console.error("Failed to parse indicator settings, resetting", e);
      }
    }
    // Seed default indicator records for VOO, QQQ, and others
    const initialRecords: Record<string, SymbolIndicatorSettings> = {};
    DEFAULT_TICKERS.forEach((t) => {
      initialRecords[t.symbol.toUpperCase()] = createDefaultIndicatorSettings(t.symbol);
    });
    return initialRecords;
  });

  // Active Symbol indicators currently editing (shows configuration controls)
  const [focusedSymbolIndex, setFocusedSymbolIndex] = useState<string>(() =>
    readStoredValue('tv_dashboard_focused_symbol', 'VOO')
  );

  // Toggle for Official TradingView widget embed instead of local custom interactive canvas
  // Key represents panel ID, value represents isTradingViewWidgetActive
  const [panelEngineToggle, setPanelEngineToggle] = useState<Record<string, boolean>>(() =>
    readStoredValue('tv_dashboard_panel_engines', {
      'panel-1': false,
      'panel-2': false,
    })
  );

  // Tickers historical candles cache
  const [candlesCache, setCandlesCache] = useState<Record<string, Candle[]>>({});
  const [quoteCache, setQuoteCache] = useState<Record<string, MoomooTickerQuote | null>>({});

  // Layout presentation selection: 'grid' (automatic grid wrapping) | 'columns' (side-by-side flex) | 'rows' (stacked flex)
  const [layoutStyle, setLayoutStyle] = useState<'grid' | 'columns' | 'rows'>(() =>
    readStoredValue('tv_dashboard_layout_style', 'grid')
  );

  // Sidebar visibility on the right - default closed
  const [sidebarOpen, setSidebarOpen] = useState(() =>
    readStoredValue('tv_dashboard_sidebar_open', false)
  );
  const [sidebarView, setSidebarView] = useState<'watchlist' | 'indicators' | 'settings'>(() =>
    readStoredValue('tv_dashboard_sidebar_view', 'watchlist')
  );

  // Active panel ID currently displaying comparison symbol overlay selector
  const [activeComparisonPopoverPanelId, setActiveComparisonPopoverPanelId] = useState<string | null>(null);

  // Resize weights for resizable bento grid layout
  const [colWeights, setColWeights] = useState<Record<string, number>>(() =>
    readStoredValue('tv_dashboard_column_widths', {})
  );
  const [panelHeights, setPanelHeights] = useState<Record<string, number>>(() =>
    readStoredValue('tv_dashboard_panel_heights', {})
  );

  // Real-time ticker price update counter/trigger
  const [tickTrigger, setTickTrigger] = useState(0);

  // Status message tracker for simulated API state
  const [networkLatency, setNetworkLatency] = useState(24);
  const [lastApiSyncTime, setLastApiSyncTime] = useState(new Date().toLocaleTimeString());

  // --- MOOMOO API (OPEND) CONFIG AND STATE ---
  const [moomooStatus, setMoomooStatus] = useState<'disconnected' | 'connected' | 'connecting' | 'error'>('disconnected');
  const [moomooError, setMoomooError] = useState<string | null>(null);
  const [moomooRealTimeActive, setMoomooRealTimeActive] = useState<boolean>(() => {
    const saved = localStorage.getItem('moomoo_active');
    return saved === null ? true : saved === 'true';
  });

  // --- PERSISTENCE EFFECT WRITERS ---
  useEffect(() => {
    localStorage.setItem('tv_dashboard_tickers', JSON.stringify(tickers));
  }, [tickers]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_panels', JSON.stringify(panels));
  }, [panels]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_indicators', JSON.stringify(indicatorDatabase));
  }, [indicatorDatabase]);

  useEffect(() => {
    localStorage.setItem('moomoo_active', String(moomooRealTimeActive));
  }, [moomooRealTimeActive]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_focused_symbol', JSON.stringify(focusedSymbolIndex));
  }, [focusedSymbolIndex]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_panel_engines', JSON.stringify(panelEngineToggle));
  }, [panelEngineToggle]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_layout_style', JSON.stringify(layoutStyle));
  }, [layoutStyle]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_sidebar_open', JSON.stringify(sidebarOpen));
  }, [sidebarOpen]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_sidebar_view', JSON.stringify(sidebarView));
  }, [sidebarView]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_column_widths', JSON.stringify(colWeights));
  }, [colWeights]);

  useEffect(() => {
    localStorage.setItem('tv_dashboard_panel_heights', JSON.stringify(panelHeights));
  }, [panelHeights]);

  const handleMoomooModeToggle = () => {
    if (!moomooRealTimeActive) {
      setCandlesCache({});
      setQuoteCache({});
      setMoomooStatus('connecting');
      setMoomooError(null);
    }
    setMoomooRealTimeActive((active) => !active);
  };

  // OpenDへの接続状態はサーバー側ゲートウェイを通して確認する
  const checkMoomooStatus = async () => {
    if (!moomooRealTimeActive) {
      setMoomooStatus('disconnected');
      return;
    }
    setMoomooStatus('connecting');
    try {
      const res = await fetch('/api/moomoo/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (data.connected) {
        setMoomooStatus('connected');
        setMoomooError(null);
      } else {
        setMoomooStatus('error');
        setMoomooError(data.error || 'Moomoo OpenDへ接続できません。');
      }
    } catch {
      setMoomooStatus('error');
      setMoomooError('Moomoo中継APIへ接続できません。');
    }
  };

  // --- REAL MOOMOO DATA FETCH MECHANISM ---
  // 有効時はサーバー側ゲートウェイから実際のローソク足を取得する
  useEffect(() => {
    if (!moomooRealTimeActive) return;
    let cancelled = false;

    const fetchMoomooCandles = async () => {
      const requests = new Map<string, { symbol: string; timeframe: Timeframe }>();
      panels.forEach((panel) => {
        requests.set(`${panel.symbol}-${panel.timeframe}`, {
          symbol: panel.symbol,
          timeframe: panel.timeframe,
        });
        panel.comparisonSymbols?.forEach((symbol) => {
          requests.set(`${symbol}-${panel.timeframe}`, {
            symbol,
            timeframe: panel.timeframe,
          });
        });
      });

      const updatedCache: Record<string, Candle[]> = {};
      let firstError: string | null = null;
      await Promise.all(Array.from(requests.entries()).map(async ([key, request]) => {
        try {
          const res = await fetch('/api/moomoo/kline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              symbol: request.symbol,
              timeframe: request.timeframe,
              reqNum: 150
            })
          });
          const data = await res.json();
          if (data.success && data.candles && data.candles.length > 0) {
            updatedCache[key] = data.candles;
          } else {
            firstError ||= data.error || `${key}のローソク足を取得できません。`;
          }
        } catch (error) {
          firstError ||= error instanceof Error ? error.message : String(error);
        }
      }));

      if (cancelled) return;

      if (Object.keys(updatedCache).length > 0) {
        setCandlesCache((currentCache) => ({
          ...currentCache,
          ...updatedCache,
        }));
        setMoomooStatus('connected');
        setMoomooError(null);
      } else if (firstError) {
        setMoomooStatus('error');
        setMoomooError(firstError);
      }
    };

    fetchMoomooCandles();
    return () => {
      cancelled = true;
    };
  }, [panels, moomooRealTimeActive, tickTrigger]);

  useEffect(() => {
    if (!moomooRealTimeActive) return;
    let cancelled = false;

    const fetchMoomooQuotes = async () => {
      const updatedQuotes: Record<string, MoomooTickerQuote | null> = {};
      await Promise.all(tickers.map(async (ticker) => {
        try {
          const response = await fetch('/api/moomoo/quote', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ symbol: ticker.symbol }),
          });
          const data = await response.json();
          updatedQuotes[ticker.symbol] = data.success && Number(data.price) > 0
            ? {
                name: data.name || ticker.name,
                price: Number(data.price),
                changePct: Number(data.changePct || 0),
              }
            : null;
        } catch {
          updatedQuotes[ticker.symbol] = null;
        }
      }));

      if (cancelled) return;

      setQuoteCache((currentQuotes) => ({
        ...currentQuotes,
        ...updatedQuotes,
      }));
    };

    fetchMoomooQuotes();
    return () => {
      cancelled = true;
    };
  }, [tickers, moomooRealTimeActive, tickTrigger]);

  // --- REAL-TIME DATA SIMULATOR IN BACKGROUND ---
  // Periodically triggers updates. Mutates simulated candles only when moomoo API is disabled
  useEffect(() => {
    const interval = setInterval(() => {
      setTickTrigger(prev => prev + 1);
      setNetworkLatency(moomooRealTimeActive ? 12 : Math.floor(15 + Math.random() * 20));
      setLastApiSyncTime(new Date().toLocaleTimeString());
      
      if (moomooRealTimeActive) {
        // If we connect to Moomoo, we already fetch real data in the fetcher effect.
        return;
      }

      // Simulated ticks fallback when moomoo connection is disabled/offline
      if (panels.length === 0) return;
      const rIdx = Math.floor(Math.random() * panels.length);
      const targetPanel = panels[rIdx];
      const targetSym = targetPanel.symbol;
      
      setCandlesCache(prevCache => {
        const key = `${targetSym}-${targetPanel.timeframe}`;
        if (!prevCache[key] || prevCache[key].length === 0) return prevCache;
        
        const updated = { ...prevCache };
        
        // Tick main symbol
        const mainCandles = [...updated[key]];
        const mainLastIdx = mainCandles.length - 1;
        mainCandles[mainLastIdx] = simulateTick(mainCandles[mainLastIdx]);
        updated[key] = mainCandles;
        
        // Tick overlay/comparison symbols if present
        if (targetPanel.comparisonSymbols) {
          targetPanel.comparisonSymbols.forEach(compSym => {
            const compKey = `${compSym}-${targetPanel.timeframe}`;
            if (updated[compKey] && updated[compKey].length > 0) {
              const compCandles = [...updated[compKey]];
              const compLastIdx = compCandles.length - 1;
              compCandles[compLastIdx] = simulateTick(compCandles[compLastIdx]);
              updated[compKey] = compCandles;
            }
          });
        }
        
        return updated;
      });
    }, 3500);

    return () => clearInterval(interval);
  }, [panels, moomooRealTimeActive]);

  // --- HISTORICAL CANDLE GENERATOR RESOLVER ---
  // デモモードでのみ疑似ローソク足を生成する
  useEffect(() => {
    if (moomooRealTimeActive) return;

    setCandlesCache(prev => {
      const updated = { ...prev };
      let changed = false;
      
      panels.forEach(p => {
        // Core symbol candle key
        const key = `${p.symbol}-${p.timeframe}`;
        if (!updated[key]) {
          updated[key] = generateCandles(p.symbol, p.timeframe, 220);
          changed = true;
        }

        // Comparison symbols overlay candles key
        if (p.comparisonSymbols) {
          p.comparisonSymbols.forEach(compSym => {
            const compKey = `${compSym}-${p.timeframe}`;
            if (!updated[compKey]) {
              updated[compKey] = generateCandles(compSym, p.timeframe, 220);
              changed = true;
            }
          });
        }
      });
      
      return changed ? updated : prev;
    });
  }, [panels, moomooRealTimeActive]);

  // --- HANDLERS ---
  // Grouping configuration for unified resizable grid layout calculation
  const colGroups = useMemo(() => {
    if (layoutStyle === 'columns') {
      return panels.map(p => [p]);
    }
    if (layoutStyle === 'rows') {
      return [panels];
    }
    // grid layout grouping (panels grouped up to 2 per column)
    if (panels.length <= 1) return [[panels[0]]];
    if (panels.length === 2) return [[panels[0]], [panels[1]]];
    if (panels.length === 3) return [[panels[0]], [panels[1]], [panels[2]]];
    if (panels.length === 4) return [[panels[0], panels[1]], [panels[2], panels[3]]];
    if (panels.length === 5) return [[panels[0], panels[1]], [panels[2], panels[3]], [panels[4]]];
    return [[panels[0], panels[1]], [panels[2], panels[3]], [panels[4], panels[5]]];
  }, [panels, layoutStyle]);

  // Handle column width dragging
  const handleColResizeMouseDown = (
    e: React.MouseEvent,
    firstColIdx: number,
    secondColIdx: number
  ) => {
    e.preventDefault();
    const startX = e.clientX;
    
    const firstEl = document.getElementById(`col-group-${firstColIdx}`);
    const secondEl = document.getElementById(`col-group-${secondColIdx}`);
    if (!firstEl || !secondEl) return;
    
    const firstRect = firstEl.getBoundingClientRect();
    const secondRect = secondEl.getBoundingClientRect();
    
    const initialWidthFirst = firstRect.width;
    const initialWidthSecond = secondRect.width;
    
    const currentWeightFirst = colWeights[`col-${firstColIdx}`] ?? 100;
    const currentWeightSecond = colWeights[`col-${secondColIdx}`] ?? 100;
    const totalWeight = currentWeightFirst + currentWeightSecond;
    const totalPixels = initialWidthFirst + initialWidthSecond;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const delta = moveEvent.clientX - startX;
      
      const nextWidthFirst = Math.max(120, initialWidthFirst + delta);
      const nextWidthSecond = Math.max(120, initialWidthSecond - delta);
      
      const firstRatio = nextWidthFirst / totalPixels;
      const secondRatio = nextWidthSecond / totalPixels;
      
      setColWeights(prev => ({
        ...prev,
        [`col-${firstColIdx}`]: parseFloat((firstRatio * totalWeight).toFixed(3)),
        [`col-${secondColIdx}`]: parseFloat((secondRatio * totalWeight).toFixed(3))
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  // Handle absolute panel height resize dragging
  const handlePanelHeightResizeMouseDown = (
    e: React.MouseEvent,
    panelId: string
  ) => {
    e.preventDefault();
    const startY = e.clientY;
    const initialHeight = panelHeights[panelId] ?? DEFAULT_PANEL_HEIGHT;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaY = moveEvent.clientY - startY;
      setPanelHeights(prev => ({
        ...prev,
        [panelId]: Math.max(100, initialHeight + deltaY)
      }));
    };

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const selectTickerForPrimaryChart = (symbol: string) => {
    setFocusedSymbolIndex(symbol);
    setPanels((currentPanels) =>
      currentPanels.map((panel, index) =>
        index === 0
          ? {
              ...panel,
              symbol,
              comparisonSymbols: (panel.comparisonSymbols || []).filter(
                (comparisonSymbol) => comparisonSymbol !== symbol
              ),
            }
          : panel
      )
    );
  };

  const registerTickerCandidate = async (candidate: SymbolSearchCandidate) => {
    if (tickers.some((ticker) => ticker.symbol === candidate.symbol)) {
      selectTickerForPrimaryChart(candidate.symbol);
      setTickerSearchOpen(false);
      return;
    }

    setTickerSearchLoading(true);
    setTickerSearchError(null);
    try {
      const response = await fetch('/api/moomoo/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: candidate.symbol }),
      });
      const data = await response.json();
      if (!data.success || !Number(data.price)) {
        throw new Error(data.error || 'Moomooから銘柄情報を取得できません。');
      }

      const newTicker: TickerInfo = {
        symbol: candidate.symbol,
        name: candidate.name || data.name || candidate.symbol,
        basePrice: Number(data.price),
        dailyChangePct: Number(data.changePct || 0),
      };

      setTickers((currentTickers) => [...currentTickers, newTicker]);
      setQuoteCache((currentQuotes) => ({
        ...currentQuotes,
        [candidate.symbol]: {
          name: newTicker.name,
          price: newTicker.basePrice,
          changePct: newTicker.dailyChangePct,
        },
      }));
      setIndicatorDatabase((currentDatabase) => ({
        ...currentDatabase,
        [candidate.symbol]: currentDatabase[candidate.symbol]
          || createDefaultIndicatorSettings(candidate.symbol),
      }));
      selectTickerForPrimaryChart(candidate.symbol);
      setNewSymbolInput('');
      setTickerSearchCandidates([]);
      setTickerSearchOpen(false);
    } catch (error) {
      setTickerSearchError(
        error instanceof Error ? error.message : '銘柄を登録できませんでした。'
      );
    } finally {
      setTickerSearchLoading(false);
    }
  };

  // 銘柄名・証券コード・ティッカーから候補を検索する
  const handleAddTicker = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSymbolInput.trim()) return;
    setTickerSearchLoading(true);
    setTickerSearchError(null);
    setTickerSearchCandidates([]);
    try {
      const response = await fetch('/api/moomoo/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: newSymbolInput.trim(), limit: 10 }),
      });
      const data = await response.json();
      const candidates = Array.isArray(data.candidates)
        ? data.candidates as SymbolSearchCandidate[]
        : [];
      if (!data.success || candidates.length === 0) {
        throw new Error(data.error || '該当する銘柄が見つかりません。');
      }
      if (candidates.length === 1) {
        await registerTickerCandidate(candidates[0]);
      } else {
        setTickerSearchCandidates(candidates);
      }
    } catch (error) {
      setTickerSearchError(
        error instanceof Error ? error.message : '銘柄検索に失敗しました。'
      );
    } finally {
      setTickerSearchLoading(false);
    }
  };

  // Remove symbol from search registry
  const handleRemoveTicker = (symToRemove: string) => {
    if (tickers.length <= 1) {
      alert("最後の1つの銘柄は削除できません。");
      return;
    }
    setTickers(prev => prev.filter(t => t.symbol !== symToRemove));
    
    // If any panel is using this symbol, switch it to remaining symbol
    const remaining = tickers.find(t => t.symbol !== symToRemove)?.symbol || 'VOO';
    setPanels(prev => prev.map(p => ({
      ...p,
      symbol: p.symbol === symToRemove ? remaining : p.symbol,
      comparisonSymbols: (p.comparisonSymbols || []).filter(
        (symbol) => symbol !== symToRemove
      ),
    })));
    if (focusedSymbolIndex === symToRemove) {
      setFocusedSymbolIndex(remaining);
    }
  };

  // Switch a panel engine style
  const togglePanelEngine = (panelId: string) => {
    setPanelEngineToggle(prev => ({
      ...prev,
      [panelId]: !prev[panelId]
    }));
  };

  // Create a new chart segment panel (plus indicator button)
  const handleAddChartPanel = () => {
    if (panels.length >= 6) {
      alert("表示できるチャートパネルは最大6つまでです。");
      return;
    }
    
    // Pick reference sym from available tickers list
    const currentSymbols = panels.map(p => p.symbol);
    const fallbackTicker = tickers.find(t => !currentSymbols.includes(t.symbol)) || tickers[0];
    
    const newId = `panel-${Date.now()}`;
    const newPanel: ChartPanel = {
      id: newId,
      symbol: fallbackTicker.symbol,
      timeframe: '5m',
      zoomFactor: 12,
      scrollOffsetPct: 100,
      showRsi: true,
      showMacd: false,
      showVolume: true,
      priceScale: 1,
      rsiHeightPct: 25,
      macdHeightPct: 25,
    };

    setPanels(prev => [...prev, newPanel]);
    setPanelEngineToggle(prev => ({ ...prev, [newId]: false }));
  };

  // Remove a specific chart segment panel (minus indicator button)
  const handleRemoveChartPanel = (idToRemove: string) => {
    if (panels.length <= 1) {
      alert("少なくとも1つのチャートを表示する必要があります。");
      return;
    }
    setPanels(prev => prev.filter(p => p.id !== idToRemove));
  };

  // Modify individual chart properties
  const handleUpdatePanel = (id: string, updates: Partial<ChartPanel>) => {
    setPanels(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  };

  // Write custom indicator updates specifically for matching target symbol
  const handleUpdateIndicators = (updatedSettings: SymbolIndicatorSettings) => {
    const sym = updatedSettings.symbol.toUpperCase();
    setIndicatorDatabase(prev => ({
      ...prev,
      [sym]: updatedSettings
    }));
  };

  // Reset indicator parameters to defaults for a ticker symbol
  const handleResetIndicators = (sym: string) => {
    setIndicatorDatabase(prev => ({
      ...prev,
      [sym.toUpperCase()]: createDefaultIndicatorSettings(sym)
    }));
  };

  // --- VOLATILITY METRIC CALCULATION DISPLAY ---
  // Evaluates live visual statistics of active cached charts
  const liveTickerStats = useMemo(() => {
    return tickers.map(t => {
      if (moomooRealTimeActive) {
        const quote = quoteCache[t.symbol];
        return {
          ...t,
          currentPrice: quote?.price ?? null,
          computedChange: quote?.changePct ?? null,
        };
      }

      const cached = candlesCache[`${t.symbol}-5m`];
      const curPrice = cached && cached.length > 0 ? cached[cached.length - 1].close : t.basePrice;
      const initialPrice = cached && cached.length > 0 ? cached[0].close : t.basePrice;
      const changePct = ((curPrice - initialPrice) / initialPrice) * 100;
      return {
        ...t,
        currentPrice: curPrice,
        computedChange: changePct
      };
    });
  }, [tickers, candlesCache, quoteCache, moomooRealTimeActive]);

  return (
    <div className="min-h-screen bg-[#070913] text-[#d1d4dc] font-sans flex flex-col antialiased selection:bg-blue-600/30">
      
      {/* Dynamic Upper Banner with real-time quote ticks */}
      <div className="bg-[#0c0e1a] border-b border-[#1e2235] py-2 px-4 shrink-0 overflow-x-auto whitespace-nowrap scrollbar-none flex items-center justify-between text-xs">
        <div className="flex items-center space-x-6 min-w-0">
          <div className="flex items-center space-x-2 shrink-0">
            <span className="inline-flex w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
            <span className="font-bold tracking-tight text-white uppercase text-xs">MooView</span>
          </div>
          <div className="h-4 w-px bg-[#2d3142]" />
          <div className="flex items-center space-x-5">
            {liveTickerStats.slice(0, 6).map((ticker) => {
              const hasRealQuote = ticker.currentPrice !== null && ticker.computedChange !== null;
              const pos = hasRealQuote && ticker.computedChange >= 0;
              return (
                <div 
                  key={ticker.symbol} 
                  className="inline-flex flex-col cursor-pointer hover:bg-[#1a1d2e] px-2 py-0.5 rounded transition-colors"
                  onClick={() => selectTickerForPrimaryChart(ticker.symbol)}
                  title="左側のチャートに表示する"
                >
                  <div className="flex items-center space-x-1.5">
                    <span className="font-bold text-gray-200 text-xs">{ticker.symbol}</span>
                    <span className={`text-[10px] font-mono font-bold ${
                      !hasRealQuote ? 'text-gray-500' : pos ? 'text-[#26a69a]' : 'text-[#ef5350]'
                    }`}>
                      {hasRealQuote
                        ? `${pos ? '▲' : '▼'} ${Math.abs(ticker.computedChange).toFixed(2)}%`
                        : 'N/A'}
                    </span>
                  </div>
                  <span className="text-[10px] text-gray-400 font-mono mt-0.5">
                    {formatTickerPrice(ticker.symbol, ticker.currentPrice)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Right header actions */}
        <div className="flex items-center space-x-4 shrink-0 text-xs text-[#848e9c] select-none">
          <div className="flex items-center space-x-1.5 bg-[#141624] px-2.5 py-1 rounded border border-[#21263d] text-[10px]">
            <span className={`inline-block w-2 h-2 rounded-full ${
              moomooStatus === 'connected' ? 'bg-emerald-400 animate-pulse' :
              moomooStatus === 'connecting' ? 'bg-yellow-400 animate-pulse' :
              moomooStatus === 'error' ? 'bg-red-400' : 'bg-gray-500'
            }`} />
            <span className="text-[#a0a5b5] font-bold">
              moomoo API: {
                moomooStatus === 'connected' ? '接続中' :
                moomooStatus === 'connecting' ? '接続中...' :
                moomooStatus === 'error' ? '接続エラー' : 'デモモード'
              }
            </span>
          </div>
          <div className="flex items-center space-x-1 font-mono">
            <span>最新同期: <b className="text-[#d1d4dc]">{lastApiSyncTime}</b></span>
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="text-gray-400 hover:text-white transition-colors duration-200 cursor-pointer flex items-center justify-center p-1"
            title={sidebarOpen ? '設定を閉じる' : '設定パネルを開く'}
          >
            <Sliders className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Multi-Chart Workspace Container and Indicator Sidebar Controls split */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        
        {/* Workspace Panels container */}
        <div className="flex-1 flex flex-col min-h-0 p-3 bg-[#070913] overflow-y-auto">
          
          <div className="flex-1 min-h-0 w-full flex flex-row select-none">
            {colGroups.map((col, colIdx) => (
              <React.Fragment key={colIdx}>
                <div
                  id={`col-group-${colIdx}`}
                  style={{
                    flexGrow: colWeights[`col-${colIdx}`] ?? 100,
                    flexShrink: 1,
                    flexBasis: 0,
                  }}
                  className="flex flex-col min-h-0 min-w-[120px]"
                >
                  {col.map((panel, pIdx) => {
                    const cacheKey = `${panel.symbol}-${panel.timeframe}`;
                    const pCandles = candlesCache[cacheKey] || [];
                    const pSettings = indicatorDatabase[panel.symbol.toUpperCase()] || createDefaultIndicatorSettings(panel.symbol);
                    const isTvEmbed = panelEngineToggle[panel.id];

                    return (
                      <React.Fragment key={panel.id}>
                        <div
                          id={`chart-panel-container-${panel.id}`}
                          style={{
                            height: `${panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}px`,
                          }}
                          className="w-full flex flex-col shrink-0"
                        >
                          <div className="flex-1 flex flex-col min-h-0 bg-[#121624] border border-[#21263d] rounded-lg overflow-hidden relative focus-within:border-blue-500 transition-colors shadow-lg">
                            {/* Active Comparison (Add Overlaid Symbol) Custom Popover */}
                            {activeComparisonPopoverPanelId === panel.id && (
                              <div className="absolute top-10 right-3 z-30 bg-[#0d101a] border border-[#21263d] p-3 rounded-lg shadow-xl w-60 text-xs flex flex-col space-y-2">
                                <div className="flex items-center justify-between border-b border-[#21263d]/60 pb-2">
                                  <span className="font-bold text-gray-200">株価を重ねて比較追加</span>
                                  <button
                                    onClick={() => setActiveComparisonPopoverPanelId(null)}
                                    className="text-gray-400 hover:text-white font-bold p-1 hover:bg-[#1a1d2e] rounded leading-none transition cursor-pointer"
                                  >
                                    ✕
                                  </button>
                                </div>
                                <div className="max-h-48 overflow-y-auto space-y-1.5 pr-1 text-gray-300">
                                  {liveTickerStats
                                    .filter(t => t.symbol !== panel.symbol)
                                    .map(t => {
                                      const isAdded = (panel.comparisonSymbols || []).includes(t.symbol);
                                      const canCompare = !moomooRealTimeActive || t.currentPrice !== null;
                                      return (
                                        <label
                                          key={t.symbol}
                                          className={`flex items-center justify-between p-1.5 px-2 rounded transition select-none ${
                                            canCompare
                                              ? 'hover:bg-[#161a29]/80 cursor-pointer'
                                              : 'opacity-45 cursor-not-allowed'
                                          }`}
                                        >
                                          <div className="flex items-center space-x-2">
                                            <input
                                              type="checkbox"
                                              checked={isAdded}
                                              disabled={!canCompare}
                                              onChange={() => {
                                                const prevList = panel.comparisonSymbols || [];
                                                const updatedList = isAdded
                                                  ? prevList.filter(s => s !== t.symbol)
                                                  : [...prevList, t.symbol];
                                                handleUpdatePanel(panel.id, { comparisonSymbols: updatedList });
                                              }}
                                              className="rounded border-[#2d3552] bg-[#20263c] text-blue-600 focus:ring-blue-500/20 w-3.5 h-3.5 cursor-pointer"
                                            />
                                            <span className="font-bold font-mono text-xs">{t.symbol}</span>
                                            <span className="text-[10px] text-gray-500 truncate max-w-[90px]">{t.name}</span>
                                          </div>
                                          <span className="text-[10px] text-gray-400 font-mono">
                                            {t.currentPrice !== null ? `$${t.currentPrice.toFixed(2)}` : '取得不可'}
                                          </span>
                                        </label>
                                      );
                                    })}
                                </div>
                                <div className="text-[9px] text-gray-500 text-center border-t border-[#1e2235]/60 pt-1.5 leading-tight">
                                  始点からの変動比率(％)を算出し、チャート上にラインを重ねてリアルタイム描画します。
                                </div>
                              </div>
                            )}

                            {/* Panel Toolbar Header */}
                            <div className="h-10 border-b border-[#21263d] bg-[#161a29] px-3 flex items-center justify-between shrink-0 select-none">
                              <div className="flex items-center space-x-2 overflow-x-auto whitespace-nowrap scrollbar-none scroll-smooth pr-2">
                                
                                {/* SYMBOL SELECT DROPDOWN */}
                                <select
                                  id={`select-symbol-${panel.id}`}
                                  value={panel.symbol}
                                  onChange={(e) => handleUpdatePanel(panel.id, { symbol: e.target.value })}
                                  className="bg-[#20263c] border border-[#2d3552] text-white rounded text-xs px-2 py-0.5 font-bold uppercase outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                                >
                                  {tickers.map(t => (
                                    <option key={t.symbol} value={t.symbol}>{t.symbol}</option>
                                  ))}
                                </select>

                                {/* ACTIVE OVERLAYS BADGES */}
                                {panel.comparisonSymbols && panel.comparisonSymbols.length > 0 && (
                                  <div className="flex items-center space-x-1 pl-1.5 border-l border-[#21263d] shrink-0">
                                    {panel.comparisonSymbols.map((compSym, idx) => {
                                      const lineColors = ['#f3a14b', '#a78bfa', '#22d3ee', '#f43f5e', '#eab308'];
                                      const color = lineColors[idx % lineColors.length];
                                      return (
                                        <span 
                                          key={compSym}
                                          className="inline-flex items-center bg-[#20263c]/70 border text-[9px] px-1.5 py-0.5 rounded font-bold font-mono space-x-1 transition shrink-0"
                                          style={{ color, borderColor: `${color}33` }}
                                        >
                                          <span>{compSym}</span>
                                          <button
                                            onClick={() => {
                                              const updatedList = (panel.comparisonSymbols || []).filter(s => s !== compSym);
                                              handleUpdatePanel(panel.id, { comparisonSymbols: updatedList });
                                            }}
                                            className="hover:text-red-400 transition ml-0.5 cursor-pointer font-bold shrink-0 text-[8px]"
                                            title="この重ね比較を削除"
                                          >
                                            ✕
                                          </button>
                                        </span>
                                      );
                                    })}
                                  </div>
                                )}
 
                                {/* TIMEFRAME INTERVAL PICKER */}
                                <div className="flex items-center bg-[#20263c] border border-[#2d3552] rounded p-0.5 space-x-0.5">
                                  {(['1m', '3m', '5m', '10m', '30m', '1h', '4h', '1d', '1w', '1mo'] as Timeframe[]).map((tf) => (
                                    <button
                                      key={tf}
                                      onClick={() => handleUpdatePanel(panel.id, { timeframe: tf })}
                                      className={`px-1.5 py-0.5 text-[10px] rounded font-bold transition-colors ${
                                        panel.timeframe === tf 
                                          ? 'bg-blue-600 text-white' 
                                          : 'text-gray-400 hover:text-white hover:bg-[#20263c]'
                                      }`}
                                    >
                                      {tf === '1mo' ? '1月' : tf === '1d' ? '日' : tf === '1w' ? '週' : tf}
                                    </button>
                                  ))}
                                </div>

                                {/* ENGINE SELECT SWITCH */}
                                <button
                                  onClick={() => togglePanelEngine(panel.id)}
                                  className={`text-[9px] px-2 py-0.5 rounded font-bold uppercase transition-colors ${
                                    isTvEmbed 
                                      ? 'bg-purple-950/80 text-purple-300 border border-purple-800' 
                                      : 'bg-blue-950/80 text-blue-300 border border-blue-900'
                                  }`}
                                  title="TradingView公式ライブウィジェットとカスタムチャートを切り替えます"
                                >
                                  {isTvEmbed ? 'TradingView公式' : 'カスタム' }
                                </button>

                              </div>

                              {/* ACTIONS AND PANEL REMOVAL (MINUS BUTTON) */}
                              <div className="flex items-center space-x-2 shrink-0">
                                
                                {/* Quick setting indicators toggles */}
                                {!isTvEmbed && (
                                  <div className="hidden sm:flex items-center space-x-1.5 bg-[#20263c]/50 px-2 py-0.5 rounded text-[10px]">
                                    <button
                                      onClick={() => handleUpdatePanel(panel.id, { showVolume: !panel.showVolume })}
                                      className={`px-1 rounded ${panel.showVolume ? 'text-[#26a69a] font-bold bg-[#142d2a]' : 'text-gray-500'}`}
                                      title="出来高を表示"
                                    >
                                      出来高
                                    </button>
                                    <button
                                      onClick={() => handleUpdatePanel(panel.id, { showRsi: !panel.showRsi })}
                                      className={`px-1 rounded ${panel.showRsi ? 'text-[#f3a14b] font-bold bg-[#342416]' : 'text-gray-500'}`}
                                      title="RSIサブ画面を表示"
                                    >
                                      RSI
                                    </button>
                                    <button
                                      onClick={() => handleUpdatePanel(panel.id, { showMacd: !panel.showMacd })}
                                      className={`px-1 rounded ${panel.showMacd ? 'text-blue-400 font-bold bg-[#14233c]' : 'text-gray-500'}`}
                                      title="MACDサブ画面を表示"
                                    >
                                      MACD
                                    </button>
                                  </div>
                                )}

                                {/* PLUS BUTTON - OVERLAY MULTIPLE COMPARISONS */}
                                {!isTvEmbed && (
                                  <button
                                    onClick={() => setActiveComparisonPopoverPanelId(activeComparisonPopoverPanelId === panel.id ? null : panel.id)}
                                    className={`p-1.5 hover:bg-[#20263c] rounded text-gray-400 hover:text-white transition cursor-pointer flex items-center justify-center ${activeComparisonPopoverPanelId === panel.id ? 'text-blue-400 bg-[#20263c] border border-blue-500/30' : ''}`}
                                    title="このチャート内に他銘柄を比較追加する (+)"
                                  >
                                    <Plus className="w-3.5 h-3.5 stroke-[2.8]" />
                                  </button>
                                )}

                                {/* MINUS BUTTON - REMOVE PANEL */}
                                <button
                                  onClick={() => handleRemoveChartPanel(panel.id)}
                                  disabled={panels.length <= 1}
                                  id={`btn-remove-panel-${panel.id}`}
                                  className="w-5 h-5 bg-red-950 hover:bg-red-900 text-red-200 border border-red-800 disabled:opacity-20 disabled:cursor-not-allowed rounded flex items-center justify-center font-bold font-mono transition-colors"
                                  title="このチャートをグリッドから削除します (-)"
                                >
                                  ー
                                </button>

                              </div>
                            </div>

                            {/* Rendering workspace */}
                            <div className="flex-1 flex flex-col min-h-0 bg-[#131722]">
                              {isTvEmbed ? (
                                <TradingViewWidget 
                                  symbol={panel.symbol} 
                                  timeframe={panel.timeframe} 
                                  containerId={panel.id} 
                                  height={panelHeights[panel.id] ?? DEFAULT_PANEL_HEIGHT}
                                />
                              ) : (
                                <InteractiveCustomChart 
                                  symbol={panel.symbol}
                                  candles={pCandles}
                                  indicatorSettings={pSettings}
                                  zoomFactor={panel.zoomFactor}
                                  setZoomFactor={(zf) => handleUpdatePanel(panel.id, { zoomFactor: zf })}
                                  scrollOffsetPct={panel.scrollOffsetPct}
                                  setScrollOffsetPct={(offset) => handleUpdatePanel(panel.id, { scrollOffsetPct: offset })}
                                  showVolume={panel.showVolume}
                                  showRsi={panel.showRsi}
                                  showMacd={panel.showMacd}
                                  comparisonSymbols={panel.comparisonSymbols || []}
                                  comparisonCandles={
                                    (panel.comparisonSymbols || []).reduce((acc, compSym) => {
                                      const key = `${compSym}-${panel.timeframe}`;
                                      if (candlesCache[key]) {
                                        acc[compSym] = candlesCache[key];
                                      }
                                      return acc;
                                    }, {} as Record<string, Candle[]>)
                                  }
                                  emptyMessage={moomooRealTimeActive ? 'Moomoo実データを取得中...' : 'デモデータを生成中...'}
                                  priceScale={panel.priceScale ?? 1}
                                  setPriceScale={(scale) => handleUpdatePanel(panel.id, { priceScale: scale })}
                                  rsiHeightPct={panel.rsiHeightPct ?? 25}
                                  setRsiHeightPct={(pct) => handleUpdatePanel(panel.id, { rsiHeightPct: pct })}
                                  macdHeightPct={panel.macdHeightPct ?? 25}
                                  setMacdHeightPct={(pct) => handleUpdatePanel(panel.id, { macdHeightPct: pct })}
                                />
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Drag splitter to change absolute height for every panel */}
                        <div
                          className="h-1.5 bg-[#1b1d30]/80 hover:bg-blue-500 active:bg-blue-600 cursor-row-resize transition-colors shrink-0 self-stretch mt-1 mb-2.5 rounded"
                          onMouseDown={(e) => handlePanelHeightResizeMouseDown(e, panel.id)}
                          title="上下にドラッグして高さを変更"
                        />
                      </React.Fragment>
                    );
                  })}
                </div>

                {/* Drag splitter between adjacent column groups */}
                {colIdx < colGroups.length - 1 && (
                  <div
                    className="w-1.5 bg-[#1b1d30]/80 hover:bg-blue-500 active:bg-blue-600 cursor-col-resize transition-colors shrink-0 self-stretch mx-1 rounded"
                    onMouseDown={(e) => handleColResizeMouseDown(e, colIdx, colIdx + 1)}
                    title="左右にドラッグしてサイズ変更"
                  />
                )}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Right-hand Sidebar - Collapsible & Default Closed */}
        <div className={`transition-all duration-300 ease-in-out shrink-0 border-l border-[#1e2235] bg-[#0c0e1a] flex overflow-hidden ${sidebarOpen ? 'w-full md:w-[420px]' : 'w-0 !border-l-0'}`}>
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* 1. LAYOUT SCREEN SUBDIVISION CONFIG */}
          <div className="shrink-0 p-2 border-b border-[#242938]">
            <div className="grid grid-cols-4 gap-1 bg-[#0c0e1a] p-1 border border-[#21263d]">
              <button
                onClick={() => setLayoutStyle('grid')}
                className={`h-9 flex items-center justify-center transition-all cursor-pointer ${layoutStyle === 'grid' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#171b28]'}`}
                title="グリッド"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLayoutStyle('columns')}
                className={`h-9 flex items-center justify-center transition-all cursor-pointer ${layoutStyle === 'columns' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#171b28]'}`}
                title="左右並列"
              >
                <Columns2 className="w-4 h-4" />
              </button>
              <button
                onClick={() => setLayoutStyle('rows')}
                className={`h-9 flex items-center justify-center transition-all cursor-pointer ${layoutStyle === 'rows' ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-[#171b28]'}`}
                title="上下分割"
              >
                <Rows2 className="w-4 h-4" />
              </button>
              <button
                onClick={handleAddChartPanel}
                disabled={panels.length >= 6}
                id="btn-add-chart-panel"
                className="h-9 flex items-center justify-center text-gray-400 hover:text-white hover:bg-[#171b28] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                title="チャートを追加"
                aria-label="チャートを追加"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2. TRADINGVIEW-LIKE WATCHLIST */}
          {sidebarView === 'watchlist' && (
          <div className="flex-1 min-h-0 bg-[#10131f] overflow-hidden flex flex-col">
            <div className="grid grid-cols-[minmax(0,1fr)_92px_64px_24px] items-center h-8 px-2 border-b border-[#2a2e3d] text-[10px] text-gray-500">
              <span>銘柄</span>
              <span className="text-right">現在値</span>
              <span className="text-right">変動率</span>
              <button
                type="button"
                onClick={() => {
                  setTickerSearchOpen((open) => !open);
                  setTickerSearchError(null);
                  setTickerSearchCandidates([]);
                }}
                className="w-6 h-6 hover:bg-[#242838] text-gray-300 hover:text-white flex items-center justify-center transition"
                aria-label="銘柄を追加"
                title="銘柄を追加"
              >
                {tickerSearchOpen ? <X className="w-3.5 h-3.5" /> : <Plus className="w-4 h-4" />}
              </button>
            </div>

            {tickerSearchOpen && (
              <div className="p-2 border-b border-[#2a2e3d] bg-[#0c0e18]">
                <form onSubmit={handleAddTicker} className="flex gap-1.5">
                  <div className="relative flex-1">
                    <Search className="absolute left-2 top-2 w-3 h-3 text-gray-500" />
                    <input
                      type="text"
                      placeholder="任天堂、Nintendo、7974、AAPL"
                      value={newSymbolInput}
                      onChange={(e) => setNewSymbolInput(e.target.value)}
                      className="h-7 bg-[#171a27] border border-[#303548] text-white text-[10px] pl-7 pr-2 w-full outline-none focus:border-blue-500 placeholder-gray-600"
                      autoFocus
                    />
                  </div>
                  <button
                    type="submit"
                    id="btn-add-ticker"
                    disabled={tickerSearchLoading || !newSymbolInput.trim()}
                    className="h-7 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white text-[10px] px-2 font-bold transition"
                  >
                    {tickerSearchLoading ? '検索中' : '検索'}
                  </button>
                </form>

                {tickerSearchError && (
                  <div className="mt-2 text-[10px] text-red-300 bg-red-950/30 border border-red-900/50 rounded p-2">
                    {tickerSearchError}
                  </div>
                )}

                {tickerSearchCandidates.length > 0 && (
                  <div className="mt-2 max-h-40 overflow-y-auto border border-[#292e40]">
                    {tickerSearchCandidates.map((candidate) => (
                      <button
                        type="button"
                        key={candidate.symbol}
                        onClick={() => registerTickerCandidate(candidate)}
                        className="w-full px-2.5 py-2 flex items-center justify-between text-left border-b last:border-b-0 border-[#242938] hover:bg-[#1b2030] transition"
                      >
                        <span className="min-w-0">
                          <span className="block text-xs font-bold text-white truncate">{candidate.name}</span>
                          <span className="block text-[9px] text-gray-500 truncate">{candidate.nameEn || candidate.category}</span>
                        </span>
                        <span className="font-mono text-[11px] text-blue-300 ml-3">{candidate.symbol}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="flex-1 min-h-0 overflow-y-auto">
              {liveTickerStats.map((ticker) => {
                const hasQuote = ticker.currentPrice !== null && ticker.computedChange !== null;
                const isPositive = hasQuote && ticker.computedChange >= 0;
                const isSelected = panels[0]?.symbol === ticker.symbol;
                return (
                  <div
                    key={ticker.symbol}
                    className={`flex items-center h-7 px-2 border-b border-[#242836] last:border-b-0 transition ${
                      isSelected ? 'bg-blue-950/35 ring-1 ring-inset ring-gray-500' : 'hover:bg-[#171b28]'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => selectTickerForPrimaryChart(ticker.symbol)}
                      className="flex-1 min-w-0 grid grid-cols-[minmax(0,1fr)_92px_64px] items-center h-full"
                      title={`${ticker.name}を左側チャートに表示`}
                    >
                      <span className="text-left text-[11px] font-bold font-mono text-gray-100 truncate">
                        {formatWatchlistSymbol(ticker.symbol)}
                      </span>
                      <span className="text-right font-mono text-[10px] text-gray-200">
                        {formatTickerPrice(ticker.symbol, ticker.currentPrice)}
                      </span>
                      <span className={`text-right font-mono text-[10px] ${
                          !hasQuote ? 'text-gray-600' : isPositive ? 'text-[#20c7b0]' : 'text-[#ff4961]'
                        }`}
                      >
                        {hasQuote ? `${ticker.computedChange >= 0 ? '+' : ''}${ticker.computedChange.toFixed(2)}%` : 'N/A'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveTicker(ticker.symbol)}
                      disabled={tickers.length <= 1}
                      className="w-6 h-6 text-gray-700 hover:text-red-400 disabled:opacity-20 flex items-center justify-end"
                      aria-label={`${ticker.name}を削除`}
                      title="ウォッチリストから削除"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* 3. INDICATOR PARAMETERS */}
          {sidebarView === 'indicators' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {focusedSymbolIndex && indicatorDatabase[focusedSymbolIndex] ? (
              <div className="flex flex-col min-h-full">
                <IndicatorSettingsPanel
                  settings={indicatorDatabase[focusedSymbolIndex]}
                  onChange={handleUpdateIndicators}
                  onReset={() => handleResetIndicators(focusedSymbolIndex)}
                />
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500 border border-dashed border-gray-800">
                <Settings className="w-8 h-8 mx-auto opacity-30 mb-2" />
                <p>銘柄を選択してください</p>
              </div>
            )}
          </div>
          )}

          {/* 5. CONNECTION STATUS & PERFORMANCE (Moved to sidebar bottom) */}
          {sidebarView === 'settings' && (
          <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-2">
          <div className="bg-[#141624] p-3 border border-[#21263d] text-xs leading-relaxed shrink-0 flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">接続ステータス</span>
              <span className="inline-flex w-2 h-2 rounded-full bg-[#26a69a] animate-pulse" />
            </div>
            <div className="h-px bg-gray-800/60" />
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="flex items-center space-x-1.5 text-gray-400">
                <Database className="w-3.5 h-3.5 text-[#26a69a]" />
                <span>Moomoo OpenAPI:</span>
              </span>
              <span className="text-gray-200 font-bold">
                {moomooStatus === 'connected' ? '接続中' : moomooStatus === 'error' ? '接続エラー' : '確認中'}
              </span>
            </div>
            <div className="flex items-center justify-between text-[11px] font-mono">
              <span className="text-gray-400">応答速度:</span>
              <span className="text-[#26a69a] font-bold">{networkLatency}ms</span>
            </div>
          </div>

          {/* 5. MOOMOO OPENAPI SETTINGS */}
          <div className="bg-[#141624] p-3 border border-[#21263d] flex flex-col space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-gray-200 text-xs tracking-wider uppercase flex items-center space-x-1.5">
                <Database className="w-4 h-4 text-orange-400" />
                <span>moomoo API 接続設定</span>
              </span>
              <span className={`inline-flex px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wide ${
                moomooStatus === 'connected' ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-900' :
                moomooStatus === 'connecting' ? 'bg-amber-950/80 text-amber-300 border border-amber-900 animate-pulse' :
                moomooStatus === 'error' ? 'bg-red-950/80 text-red-300 border border-red-900' :
                'bg-gray-900 text-gray-400 border border-gray-800'
              }`}>
                {moomooStatus === 'connected' && '接続完了（実データ）'}
                {moomooStatus === 'connecting' && '接続確認中'}
                {moomooStatus === 'error' && '接続エラー'}
                {moomooStatus === 'disconnected' && 'デモデータ'}
              </span>
            </div>

            <div className="flex items-center justify-between bg-[#0c0e1a] p-2 rounded border border-[#1e2235]">
              <span className="text-[11px] text-gray-300 font-medium">Moomoo実データを使用</span>
              <button
                type="button"
                aria-label="Moomoo実データの使用を切り替える"
                onClick={handleMoomooModeToggle}
                className={`w-10 h-6 rounded-full p-0.5 transition-colors duration-200 cursor-pointer ${moomooRealTimeActive ? 'bg-emerald-500' : 'bg-gray-700'}`}
              >
                <div className={`bg-white w-5 h-5 rounded-full shadow-md transform duration-200 ease-in-out ${moomooRealTimeActive ? 'translate-x-4' : 'translate-x-0'}`} />
              </button>
            </div>

            {moomooRealTimeActive && (
              <div className="flex flex-col space-y-2 text-xs">
                <button
                  type="button"
                  onClick={() => checkMoomooStatus()}
                  className="bg-blue-600 hover:bg-blue-500 text-white rounded px-3 py-1.5 font-bold text-xs transition cursor-pointer"
                >
                  OpenD接続を確認
                </button>
                {moomooStatus === 'error' && moomooError && (
                  <div className="bg-red-950/40 border border-red-900/60 p-2.5 rounded text-[10px] text-red-300 leading-normal font-mono">
                    <strong>エラー詳細:</strong> {moomooError}
                  </div>
                )}
              </div>
            )}
          </div>
          </div>
          )}

          </div>

          <nav className="w-11 shrink-0 border-l border-[#242938] bg-[#090b12] flex flex-col items-center py-2 gap-1">
            <button
              type="button"
              onClick={() => setSidebarView('watchlist')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarView === 'watchlist'
                  ? 'bg-[#2a2d34] border-[#4a4f5a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#171a22]'
              }`}
              title="ウォッチリスト"
              aria-label="ウォッチリストを表示"
            >
              <List className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarView('indicators')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarView === 'indicators'
                  ? 'bg-[#2a2d34] border-[#4a4f5a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#171a22]'
              }`}
              title="インジケーター"
              aria-label="インジケーター設定を表示"
            >
              <ChartNoAxesCombined className="w-5 h-5" />
            </button>
            <button
              type="button"
              onClick={() => setSidebarView('settings')}
              className={`w-9 h-10 flex items-center justify-center border transition ${
                sidebarView === 'settings'
                  ? 'bg-[#2a2d34] border-[#4a4f5a] text-white'
                  : 'border-transparent text-gray-400 hover:text-white hover:bg-[#171a22]'
              }`}
              title="接続設定"
              aria-label="接続設定を表示"
            >
              <Settings className="w-5 h-5" />
            </button>
          </nav>
        </div>

      </div>

      {/* Footer information panel */}
      <footer className="h-8 border-t border-[#1e2235] bg-[#0c0e1a] shrink-0 flex items-center justify-between px-4 text-[10px] text-[#848e9c]">
        <div className="flex items-center space-x-3">
          <span className="flex items-center space-x-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#26a69a]"></span>
            <span>WebSocket Quotations Client: Online</span>
          </span>
          <span className="text-gray-800">|</span>
          <span>データソース: moomoo OpenAPI quotes gateway stream</span>
        </div>
        <div className="flex items-center space-x-4">
          <span className="uppercase text-gray-400 font-bold bg-[#1d2138] px-2 py-0.5 rounded">AUTO-SAVE: ENABLED</span>
          <span>© {new Date().getFullYear()} trading multi dashboard workspace</span>
        </div>
      </footer>

    </div>
  );
}
