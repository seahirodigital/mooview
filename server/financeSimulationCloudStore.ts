import { promises as fs } from 'fs';
import path from 'path';
import type { Response } from 'express';

import {
  readFinanceSimulationSheet,
  writeFinanceSimulationSheet,
} from './financeSimulationSheets.js';

const DEFAULT_FINANCE_SPREADSHEET_ID = '1RTOkvn7eV6ddcvGEPIgPYRgHqkVEswUZ6avz_FV6P3A';
const CLOUD_CONFIG_FILE = path.join(
  process.env.MOOVIEW_DATA_DIR?.trim() || '/var/lib/mooview',
  'finance-simulation-cloud.json',
);
const EXTERNAL_SHEET_POLL_MS = 10_000;

interface CloudConfig {
  spreadsheetId: string;
}

interface CachedSnapshot {
  spreadsheetId: string;
  state: unknown;
  revision: string;
  updatedAt: string;
}

let cachedSnapshot: CachedSnapshot | null = null;
let refreshInFlight: Promise<CachedSnapshot> | null = null;
let configPromise: Promise<CloudConfig> | null = null;
let pollTimer: NodeJS.Timeout | null = null;
const subscribers = new Set<Response>();

function snapshotHash(state: unknown): string {
  return JSON.stringify(state);
}

function normalizeCloudState(state: unknown): Record<string, unknown> {
  const source = state && typeof state === 'object' ? state as Record<string, unknown> : {};
  const layout = source.assetTableLayout && typeof source.assetTableLayout === 'object'
    ? source.assetTableLayout as Record<string, unknown>
    : {};
  const styles = source.customStyles && typeof source.customStyles === 'object'
    ? source.customStyles as Record<string, unknown>
    : {};
  return {
    ...source,
    categoryOrder: Array.isArray(source.categoryOrder)
      ? source.categoryOrder
      : ['core_stocks', 'dividend_stocks', 'cash', 'illiquid_other'],
    assetTableLayout: {
      columnOrder: Array.isArray(layout.columnOrder) ? layout.columnOrder : [],
      columnWidths: layout.columnWidths && typeof layout.columnWidths === 'object' ? layout.columnWidths : {},
    },
    customStyles: {
      cells: styles.cells && typeof styles.cells === 'object' ? styles.cells : {},
      rows: styles.rows && typeof styles.rows === 'object' ? styles.rows : {},
      cols: styles.cols && typeof styles.cols === 'object' ? styles.cols : {},
    },
  };
}

async function readConfig(): Promise<CloudConfig> {
  try {
    const value = JSON.parse(await fs.readFile(CLOUD_CONFIG_FILE, 'utf8')) as Partial<CloudConfig>;
    if (typeof value.spreadsheetId === 'string' && value.spreadsheetId.trim()) {
      return { spreadsheetId: value.spreadsheetId.trim() };
    }
  } catch {}
  return { spreadsheetId: DEFAULT_FINANCE_SPREADSHEET_ID };
}

async function cloudConfig(): Promise<CloudConfig> {
  if (!configPromise) configPromise = readConfig();
  return configPromise;
}

async function saveConfig(spreadsheetId: string): Promise<void> {
  const next = { spreadsheetId };
  await fs.mkdir(path.dirname(CLOUD_CONFIG_FILE), { recursive: true });
  await fs.writeFile(`${CLOUD_CONFIG_FILE}.tmp`, JSON.stringify(next), 'utf8');
  await fs.rename(`${CLOUD_CONFIG_FILE}.tmp`, CLOUD_CONFIG_FILE);
  configPromise = Promise.resolve(next);
}

async function resolveSpreadsheetId(explicitId?: string): Promise<string> {
  const requested = String(explicitId || '').trim();
  if (requested) {
    const current = await cloudConfig();
    if (current.spreadsheetId !== requested) await saveConfig(requested);
    return requested;
  }
  return (await cloudConfig()).spreadsheetId;
}

function publish(snapshot: CachedSnapshot): void {
  const payload = `event: revision\ndata: ${JSON.stringify({ revision: snapshot.revision, updatedAt: snapshot.updatedAt })}\n\n`;
  subscribers.forEach((response) => response.write(payload));
}

async function refreshSnapshot(explicitSpreadsheetId?: string, announce = true, force = false): Promise<CachedSnapshot> {
  const spreadsheetId = await resolveSpreadsheetId(explicitSpreadsheetId);
  if (!force && cachedSnapshot?.spreadsheetId === spreadsheetId) {
    return cachedSnapshot;
  }
  // PC・スマホの同時起動で Apps Script を重複呼出しせず、同じスナップショットへ収束させる。
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const result = await readFinanceSimulationSheet(spreadsheetId);
    const state = normalizeCloudState(result?.state);
    const revision = snapshotHash(state);
    const changed = !cachedSnapshot
      || cachedSnapshot.spreadsheetId !== spreadsheetId
      || cachedSnapshot.revision !== revision;
    const snapshot: CachedSnapshot = {
      spreadsheetId,
      state,
      revision,
      updatedAt: new Date().toISOString(),
    };
    cachedSnapshot = snapshot;
    if (changed && announce) publish(snapshot);
    return snapshot;
  })();
  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

function startPolling(): void {
  if (pollTimer || subscribers.size === 0) return;
  pollTimer = setInterval(() => {
    void refreshSnapshot(undefined, true, true).catch(() => undefined);
  }, EXTERNAL_SHEET_POLL_MS);
}

function stopPollingWhenUnused(): void {
  if (subscribers.size > 0 || !pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

export async function readFinanceCloudSnapshot(spreadsheetId?: string): Promise<CachedSnapshot> {
  return refreshSnapshot(spreadsheetId, false);
}

export async function writeFinanceCloudSnapshot(state: unknown, spreadsheetId?: string): Promise<CachedSnapshot> {
  const resolvedId = await resolveSpreadsheetId(spreadsheetId);
  await writeFinanceSimulationSheet(resolvedId, state);
  return refreshSnapshot(resolvedId, true, true);
}

export function subscribeFinanceCloud(response: Response): () => void {
  subscribers.add(response);
  startPolling();
  return () => {
    subscribers.delete(response);
    stopPollingWhenUnused();
  };
}
