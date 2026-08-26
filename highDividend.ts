export interface HighDividendAutomationSettings {
  enabled: boolean;
  time: string;
  weekdaysOnly: boolean;
}

export type HighDividendRunStatus = 'idle' | 'running' | 'succeeded' | 'skipped' | 'failed';

export interface HighDividendAutomationState {
  lastScheduledFor: string | null;
  lastRunAt: string | null;
  lastRunStatus: HighDividendRunStatus;
  lastRunMessage: string | null;
  lastFetchedDataDate: string | null;
  lastNotifiedDataDate: string | null;
}

export interface HighDividendAutomationPayload {
  settings: HighDividendAutomationSettings;
  state: HighDividendAutomationState;
  webhookConfigured: boolean;
}

export const DEFAULT_HIGH_DIVIDEND_AUTOMATION_SETTINGS: HighDividendAutomationSettings = {
  enabled: true,
  time: '19:00',
  weekdaysOnly: true,
};

export const DEFAULT_HIGH_DIVIDEND_AUTOMATION_STATE: HighDividendAutomationState = {
  lastScheduledFor: null,
  lastRunAt: null,
  lastRunStatus: 'idle',
  lastRunMessage: null,
  lastFetchedDataDate: null,
  lastNotifiedDataDate: null,
};

export function normalizeHighDividendAutomationSettings(
  value: unknown,
): HighDividendAutomationSettings {
  const source = value && typeof value === 'object'
    ? value as Partial<HighDividendAutomationSettings>
    : {};
  const time = typeof source.time === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(source.time)
    ? source.time
    : DEFAULT_HIGH_DIVIDEND_AUTOMATION_SETTINGS.time;
  return {
    enabled: source.enabled !== false,
    time,
    weekdaysOnly: source.weekdaysOnly !== false,
  };
}
