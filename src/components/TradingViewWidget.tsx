import React, { useEffect, useRef } from 'react';
import { Timeframe } from '../types';

interface TradingViewWidgetProps {
  symbol: string;
  timeframe: Timeframe;
  containerId: string;
}

// Map standard short timeframe to TradingView equivalent interval representation
function getTradingViewInterval(timeframe: Timeframe): string {
  switch (timeframe) {
    case '1m': return '1';
    case '3m': return '3';
    case '5m': return '5';
    case '10m': return '10'; // or '15'
    case '30m': return '30';
    case '1h': return '60';
    case '4h': return '240';
    case '1d': return 'D';
    case '1w': return 'W';
    case '1mo': return 'M';
    default: return 'D';
  }
}

export const TradingViewWidget: React.FC<TradingViewWidgetProps> = ({
  symbol,
  timeframe,
  containerId,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<any>(null);

  useEffect(() => {
    // If window.TradingView is loaded, initialize the widget
    const initWidget = () => {
      if ((window as any).TradingView && containerRef.current) {
        // Clear previous container contents (to avoid duplicates)
        containerRef.current.innerHTML = '';
        const widgetId = `tv-widget-${containerId}`;
        const childDiv = document.createElement('div');
        childDiv.id = widgetId;
        childDiv.style.height = '100%';
        childDiv.style.width = '100%';
        containerRef.current.appendChild(childDiv);

        try {
          const interval = getTradingViewInterval(timeframe);
          widgetRef.current = new (window as any).TradingView.widget({
            autosize: true,
            symbol: symbol.includes('_') ? symbol.replace('_', '') : symbol,
            interval: interval,
            timezone: 'Asia/Tokyo',
            theme: 'dark',
            style: '1',
            locale: 'ja',
            toolbar_bg: '#131722',
            enable_publishing: false,
            hide_side_toolbar: false,
            allow_symbol_change: true,
            container_id: widgetId,
            studies: [
              'RSI@tv-basicstudies',
              'MASimple@tv-basicstudies'
            ],
            disabled_features: ['use_localstorage_for_settings_and_templates'],
            enabled_features: [],
            overrides: {
              'paneProperties.background': '#131722',
              'paneProperties.vertGridProperties.color': '#202430',
              'paneProperties.horzGridProperties.color': '#202430',
            }
          });
        } catch (e) {
          console.error("Failed to initialize TradingView widget: ", e);
        }
      }
    };

    // Retry checking window.TradingView for a couple of times if not loaded yet
    let checkCount = 0;
    const intervalId = setInterval(() => {
      if ((window as any).TradingView) {
        clearInterval(intervalId);
        initWidget();
      } else {
        checkCount++;
        if (checkCount > 15) {
          clearInterval(intervalId);
          console.warn("TradingView widget script not found in window");
        }
      }
    }, 200);

    return () => {
      clearInterval(intervalId);
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [symbol, timeframe, containerId]);

  return (
    <div className="w-full h-full relative bg-[#131722] rounded overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
    </div>
  );
};
