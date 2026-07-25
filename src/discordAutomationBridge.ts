import type {
  DiscordAutomationArtifacts,
  DiscordAutomationJob,
} from '../discordAutomation';

export interface DiscordAutomationBrowserBridge {
  run: (job: DiscordAutomationJob) => Promise<DiscordAutomationArtifacts>;
}

declare global {
  interface Window {
    mooviewDiscordAutomation?: DiscordAutomationBrowserBridge;
  }
}

export {};
