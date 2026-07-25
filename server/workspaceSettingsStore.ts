import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import type {
  SharedWorkspaceEnvelope,
  SharedWorkspaceProfile,
  SharedWorkspaceSettings,
} from '../src/workspaceSettings';

interface StoredWorkspaceDocument {
  schemaVersion: 1;
  revision: number;
  updatedAt: string;
  settings: SharedWorkspaceSettings;
}

let writeQueue: Promise<unknown> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function sharedWorkspaceSettingsEnabled(): boolean {
  return process.env.MOOVIEW_SHARED_SETTINGS === 'true';
}

export function resolveWorkspaceSettingsDirectory(): string {
  const configured = process.env.MOOVIEW_DATA_DIR?.trim();
  if (configured) {
    return path.resolve(configured);
  }
  return path.join(os.homedir(), '.local', 'share', 'mooview');
}

export function normalizeSharedWorkspaceProfile(_value: unknown): SharedWorkspaceProfile {
  // 既存クライアントの profile=mobile も、全端末共通の正本へ接続する。
  return 'desktop';
}

function resolveSettingsPath(profile: SharedWorkspaceProfile): string {
  return path.join(resolveWorkspaceSettingsDirectory(), `workspace-settings.${profile}.json`);
}

function resolveBackupPath(profile: SharedWorkspaceProfile): string {
  return path.join(resolveWorkspaceSettingsDirectory(), `workspace-settings.${profile}.previous.json`);
}

function validateWorkspaceSettings(value: unknown): SharedWorkspaceSettings {
  if (!isRecord(value) || value.schemaVersion !== 1) {
    throw new Error('共有設定のスキーマバージョンが正しくありません。');
  }
  if (!Array.isArray(value.panels) || value.panels.length < 1 || value.panels.length > 12) {
    throw new Error('チャート一覧は1件以上12件以下である必要があります。');
  }
  if (!Array.isArray(value.tickers) || value.tickers.length > 5_000) {
    throw new Error('銘柄一覧の形式または件数が正しくありません。');
  }
  if (!Array.isArray(value.watchlistTabs) || value.watchlistTabs.length > 200) {
    throw new Error('ウォッチリストの形式または件数が正しくありません。');
  }
  if (!isRecord(value.indicatorDatabase)) {
    throw new Error('インジケーター設定の形式が正しくありません。');
  }
  if (!isRecord(value.browserSettings)) {
    throw new Error('ブラウザ設定の形式が正しくありません。');
  }
  const browserSettingsEntries = Object.entries(value.browserSettings);
  if (
    browserSettingsEntries.length > 100
    || browserSettingsEntries.some(([key, setting]) => (
      key.length > 100
      || typeof setting !== 'string'
      || setting.length > 10_000_000
    ))
    || JSON.stringify(value.browserSettings).length > 18_000_000
  ) {
    throw new Error('ブラウザ設定の件数またはサイズが上限を超えています。');
  }
  if (!['grid', 'columns', 'rows'].includes(String(value.layoutStyle))) {
    throw new Error('チャート配置形式が正しくありません。');
  }
  return value as unknown as SharedWorkspaceSettings;
}

async function readStoredDocument(
  profile: SharedWorkspaceProfile,
): Promise<StoredWorkspaceDocument | null> {
  try {
    const raw = await fs.readFile(resolveSettingsPath(profile), 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    if (
      !isRecord(parsed)
      || parsed.schemaVersion !== 1
      || typeof parsed.revision !== 'number'
      || typeof parsed.updatedAt !== 'string'
    ) {
      throw new Error('共有設定ファイルの形式が正しくありません。');
    }
    return {
      schemaVersion: 1,
      revision: Math.max(0, Math.trunc(parsed.revision)),
      updatedAt: parsed.updatedAt,
      settings: validateWorkspaceSettings(parsed.settings),
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

export async function readSharedWorkspaceSettings(
  profile: SharedWorkspaceProfile,
): Promise<SharedWorkspaceEnvelope> {
  if (!sharedWorkspaceSettingsEnabled()) {
    return {
      enabled: false,
      profile,
      revision: 0,
      updatedAt: null,
      settings: null,
    };
  }

  const stored = await readStoredDocument(profile);
  return {
    enabled: true,
    profile,
    revision: stored?.revision ?? 0,
    updatedAt: stored?.updatedAt ?? null,
    settings: stored?.settings ?? null,
  };
}

export async function writeSharedWorkspaceSettings(
  profile: SharedWorkspaceProfile,
  rawSettings: unknown,
  expectedRevision: unknown,
  force: boolean,
): Promise<SharedWorkspaceEnvelope> {
  const executeWrite = async (): Promise<SharedWorkspaceEnvelope> => {
    if (!sharedWorkspaceSettingsEnabled()) {
      throw new Error('このMooViewでは共有設定保存が無効です。');
    }

    const settings = validateWorkspaceSettings(rawSettings);
    const current = await readStoredDocument(profile);
    const currentRevision = current?.revision ?? 0;
    if (
      !force
      && typeof expectedRevision === 'number'
      && Math.trunc(expectedRevision) !== currentRevision
    ) {
      const conflict = new Error('別端末で共有設定が更新されています。') as Error & {
        code?: string;
      };
      conflict.code = 'REVISION_CONFLICT';
      throw conflict;
    }

    const directory = resolveWorkspaceSettingsDirectory();
    await fs.mkdir(directory, { recursive: true, mode: 0o750 });
    if (current) {
      await fs.copyFile(resolveSettingsPath(profile), resolveBackupPath(profile));
    }

    const document: StoredWorkspaceDocument = {
      schemaVersion: 1,
      revision: currentRevision + 1,
      updatedAt: new Date().toISOString(),
      settings,
    };
    const temporaryPath = path.join(
      directory,
      `.workspace-settings.${profile}.${process.pid}.${Date.now()}.tmp`,
    );
    await fs.writeFile(temporaryPath, `${JSON.stringify(document, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o640,
    });
    await fs.rename(temporaryPath, resolveSettingsPath(profile));

    return {
      enabled: true,
      profile,
      revision: document.revision,
      updatedAt: document.updatedAt,
      settings: document.settings,
    };
  };

  const queuedWrite = writeQueue.then(executeWrite, executeWrite);
  writeQueue = queuedWrite.catch(() => undefined);
  return queuedWrite;
}
