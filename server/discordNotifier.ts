import type { DiscordAutomationArtifact } from '../discordAutomation';

const DISCORD_MESSAGE_LIMIT = 2_000;
const DISCORD_FILES_PER_MESSAGE = 10;

function getDiscordWebhookUrl(): string {
  const value = process.env.DISCORD_WEBHOOK_URL?.trim() || '';
  if (!value) {
    throw new Error('Discord Webhook URLがサーバーに設定されていません。');
  }
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Discord Webhook URLの形式が正しくありません。');
  }
  if (
    url.protocol !== 'https:'
    || !['discord.com', 'discordapp.com'].includes(url.hostname)
    || !url.pathname.startsWith('/api/webhooks/')
  ) {
    throw new Error('Discord Webhook URLはDiscord公式ドメインのHTTPS Webhookを指定してください。');
  }
  return url.toString();
}

function splitDiscordText(text: string): string[] {
  if (text.length <= DISCORD_MESSAGE_LIMIT) return [text];
  const parts: string[] = [];
  let remaining = text;
  while (remaining.length > DISCORD_MESSAGE_LIMIT) {
    let splitAt = remaining.lastIndexOf('\n', DISCORD_MESSAGE_LIMIT);
    if (splitAt <= 0) splitAt = DISCORD_MESSAGE_LIMIT;
    parts.push(remaining.slice(0, splitAt));
    remaining = remaining.slice(splitAt);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function assertDiscordResponse(response: Response): Promise<void> {
  if (response.ok) return;
  const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 500);
  throw new Error(`Discord通知に失敗しました（HTTP ${response.status}）。${detail}`);
}

async function sendDiscordJson(webhookUrl: string, content: string): Promise<void> {
  const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}wait=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content,
      allowed_mentions: { parse: [] },
    }),
  });
  await assertDiscordResponse(response);
}

async function sendDiscordFiles(
  webhookUrl: string,
  files: DiscordAutomationArtifact[],
): Promise<void> {
  const body = new FormData();
  body.append('payload_json', JSON.stringify({ allowed_mentions: { parse: [] } }));
  files.forEach((file, index) => {
    const bytes = Buffer.from(file.base64, 'base64');
    body.append(
      `files[${index}]`,
      new Blob([bytes], { type: file.mimeType || 'application/octet-stream' }),
      file.name,
    );
  });
  const response = await fetch(`${webhookUrl}${webhookUrl.includes('?') ? '&' : '?'}wait=true`, {
    method: 'POST',
    body,
  });
  await assertDiscordResponse(response);
}

export async function notifyDiscordText(text: string): Promise<void> {
  const webhookUrl = getDiscordWebhookUrl();
  const normalized = text.trim();
  if (!normalized) throw new Error('Discordへ送信する本文が空です。');
  for (const part of splitDiscordText(normalized)) {
    await sendDiscordJson(webhookUrl, part);
  }
}

/**
 * Gemini本文を先に送信し、その後は動画、画像の順で添付する。
 * Discordの2,000文字制限を超える本文は、内容を変更せず連続メッセージへ分割する。
 */
export async function notifyDiscordWithAutomationArtifacts(
  text: string,
  videos: DiscordAutomationArtifact[],
  images: DiscordAutomationArtifact[],
): Promise<void> {
  const webhookUrl = getDiscordWebhookUrl();
  if (!text.trim()) throw new Error('Discordへ送信するGemini本文が空です。');
  if (videos.length === 0 && images.length === 0) {
    throw new Error('Discordへ送信する動画・画像がありません。');
  }

  for (const part of splitDiscordText(text)) {
    await sendDiscordJson(webhookUrl, part);
  }

  const orderedFiles = [...videos, ...images];
  for (let index = 0; index < orderedFiles.length; index += DISCORD_FILES_PER_MESSAGE) {
    await sendDiscordFiles(webhookUrl, orderedFiles.slice(index, index + DISCORD_FILES_PER_MESSAGE));
  }
}
