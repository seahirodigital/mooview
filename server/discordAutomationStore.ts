import fs from 'fs/promises';
import path from 'path';

import {
  createDefaultDiscordAutomationSettings,
  normalizeDiscordAutomationSettings,
  type DiscordAutomationRunRecord,
  type DiscordAutomationSettings,
} from '../discordAutomation';
import { resolveWorkspaceSettingsDirectory } from './workspaceSettingsStore';

const SETTINGS_FILE_NAME = 'discord-automation-settings.json';
const RUNS_FILE_NAME = 'discord-automation-runs.json';
const MAX_RUN_RECORDS = 200;

let writeQueue: Promise<unknown> = Promise.resolve();

function settingsPath(): string {
  return path.join(resolveWorkspaceSettingsDirectory(), SETTINGS_FILE_NAME);
}

function runsPath(): string {
  return path.join(resolveWorkspaceSettingsDirectory(), RUNS_FILE_NAME);
}

async function writeJsonAtomically(targetPath: string, value: unknown): Promise<void> {
  const directory = path.dirname(targetPath);
  await fs.mkdir(directory, { recursive: true, mode: 0o750 });
  const temporaryPath = path.join(
    directory,
    `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`,
  );
  await fs.writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o640,
  });
  await fs.rename(temporaryPath, targetPath);
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const queued = writeQueue.then(operation, operation);
  writeQueue = queued.catch(() => undefined);
  return queued;
}

export async function readDiscordAutomationSettings(): Promise<DiscordAutomationSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), 'utf8');
    return normalizeDiscordAutomationSettings(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return createDefaultDiscordAutomationSettings();
    }
    throw error;
  }
}

export function writeDiscordAutomationSettings(value: unknown): Promise<DiscordAutomationSettings> {
  return enqueueWrite(async () => {
    const settings = normalizeDiscordAutomationSettings(value);
    await writeJsonAtomically(settingsPath(), settings);
    return settings;
  });
}

export async function readDiscordAutomationRuns(): Promise<DiscordAutomationRunRecord[]> {
  try {
    const raw = await fs.readFile(runsPath(), 'utf8');
    const value = JSON.parse(raw) as unknown;
    if (!Array.isArray(value)) return [];
    return value.filter((record): record is DiscordAutomationRunRecord => (
      Boolean(record)
      && typeof record === 'object'
      && typeof (record as DiscordAutomationRunRecord).id === 'string'
      && typeof (record as DiscordAutomationRunRecord).jobId === 'string'
      && typeof (record as DiscordAutomationRunRecord).scheduledFor === 'string'
      && typeof (record as DiscordAutomationRunRecord).status === 'string'
    )).slice(0, MAX_RUN_RECORDS);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

export function writeDiscordAutomationRuns(records: DiscordAutomationRunRecord[]): Promise<void> {
  return enqueueWrite(async () => {
    await writeJsonAtomically(runsPath(), records.slice(0, MAX_RUN_RECORDS));
  });
}
