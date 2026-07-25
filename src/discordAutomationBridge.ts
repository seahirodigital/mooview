import type {
  DiscordAutomationArtifacts,
  DiscordAutomationArtifact,
  DiscordAutomationJob,
  DiscordAutomationPreparation,
} from '../discordAutomation';

export interface DiscordAutomationBrowserBridge {
  prepare: (job: DiscordAutomationJob) => Promise<DiscordAutomationPreparation>;
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
