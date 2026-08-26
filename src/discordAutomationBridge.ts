import type {
  DiscordAutomationArtifacts,
  DiscordAutomationArtifact,
  DiscordAutomationJob,
  DiscordAutomationPreparation,
} from '../discordAutomation';

export interface DiscordAutomationBrowserBridge {
  prepare: (job: DiscordAutomationJob) => Promise<DiscordAutomationPreparation>;
  // 失敗後の再試行前に、画面の更新操作と同じデータ再取得だけを実行する。
  refresh: (job: DiscordAutomationJob) => Promise<void>;
  complete: (
    preparation: DiscordAutomationPreparation,
    screenshots: DiscordAutomationArtifact[],
  ) => Promise<DiscordAutomationArtifacts>;
}

declare global {
  interface Window {
    mooviewDiscordAutomation?: DiscordAutomationBrowserBridge;
  }
}

export {};
