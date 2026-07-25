import type {
  ChartPanel,
  ComparisonLabelLayoutMode,
  SymbolIndicatorSettings,
  TickerInfo,
} from './types';

export type SharedWorkspaceLayoutStyle = 'grid' | 'columns' | 'rows';
export type SharedWatchlistQuoteFetchMode = 'manual' | 'auto';
export type SharedWorkspaceProfile = 'desktop' | 'mobile';

export interface SharedWatchlistSection {
  id: string;
  name: string;
  collapsed: boolean;
  symbols: string[];
  sourceSectorId?: string;
  sourceBasketId?: string;
}

export interface SharedWatchlistTab {
  id: string;
  name: string;
  sections: SharedWatchlistSection[];
}

export interface SharedWorkspaceSettings {
  schemaVersion: 1;
  seededFromLocal: boolean;
  panels: ChartPanel[];
  tickers: TickerInfo[];
  watchlistTabs: SharedWatchlistTab[];
  activeWatchlistTabId: string;
  watchlistQuoteFetchModes: Record<string, SharedWatchlistQuoteFetchMode>;
  watchlistNameOverrides: Record<string, string>;
  indicatorDatabase: Record<string, SymbolIndicatorSettings>;
  focusedSymbolIndex: string;
  panelEngineToggle: Record<string, boolean>;
  layoutStyle: SharedWorkspaceLayoutStyle;
  gridRows: number;
  gridCols: number;
  colWeights: Record<string, number>;
  panelHeights: Record<string, number>;
  comparisonLabelFontSize: number;
  comparisonLabelLayoutMode: ComparisonLabelLayoutMode;
  browserSettings: Record<string, string>;
}

export interface SharedWorkspaceEnvelope {
  enabled: boolean;
  profile: SharedWorkspaceProfile;
  revision: number;
  updatedAt: string | null;
  settings: SharedWorkspaceSettings | null;
}

export interface SharedWorkspaceWriteRequest {
  settings: SharedWorkspaceSettings;
  expectedRevision?: number;
  force?: boolean;
}
