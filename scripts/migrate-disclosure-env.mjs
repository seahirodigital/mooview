import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const examplePath = path.join(workspaceRoot, '.env.example');
const runtimePath = path.join(workspaceRoot, '.env');
const requiredKeys = ['EDINET_API_KEY', 'EDINET_DB_API_KEY', 'DISCORD_WEBHOOK_URL'];

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function findSecret(lines, key) {
  const pattern = new RegExp(`^\\s*#?\\s*${key}\\s*=\\s*(.+?)\\s*$`);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const match = lines[index].match(pattern);
    if (!match) continue;
    const value = match[1].trim().replace(/^(["'])(.*)\1$/, '$2');
    if (value) return value;
  }
  return '';
}

function updateEnvText(currentText, replacements) {
  const lines = currentText ? currentText.split(/\r?\n/) : [];
  const replaced = new Set();
  const nextLines = lines.map((line) => {
    const match = line.match(/^\s*([^#=\s]+)\s*=/);
    const key = match?.[1];
    if (!key || !(key in replacements)) return line;
    replaced.add(key);
    return `${key}=${replacements[key]}`;
  });
  for (const key of requiredKeys) {
    if (!replaced.has(key)) nextLines.push(`${key}=${replacements[key]}`);
  }
  return `${nextLines.filter((line, index, all) => index < all.length - 1 || line !== '').join('\n').replace(/\n+$/, '')}\n`;
}

function sanitizeExampleText(currentText) {
  const lines = currentText.split(/\r?\n/);
  const replaced = new Set();
  const nextLines = lines.map((line) => {
    for (const key of requiredKeys) {
      const pattern = new RegExp(`^\\s*#?\\s*${key}\\s*=`);
      if (!pattern.test(line)) continue;
      replaced.add(key);
      return `${key}=`;
    }
    return line;
  });
  for (const key of requiredKeys) {
    if (!replaced.has(key)) nextLines.push(`${key}=`);
  }
  return `${nextLines.filter((line, index, all) => index < all.length - 1 || line !== '').join('\n').replace(/\n+$/, '')}\n`;
}

if (!fs.existsSync(examplePath)) fail(`設定例が見つかりません: ${examplePath}`);

const exampleText = fs.readFileSync(examplePath, 'utf8');
const exampleLines = exampleText.split(/\r?\n/);
const secrets = Object.fromEntries(requiredKeys.map((key) => [key, findSecret(exampleLines, key)]));
for (const key of requiredKeys) {
  if (!secrets[key]) fail(`${key} が設定されていません。`);
}
if (!/^https:\/\/(?:discord\.com|discordapp\.com)\/api\/webhooks\//i.test(secrets.DISCORD_WEBHOOK_URL)) {
  fail('DISCORD_WEBHOOK_URL の形式が正しくありません。');
}

const runtimeText = fs.existsSync(runtimePath) ? fs.readFileSync(runtimePath, 'utf8') : '';
fs.writeFileSync(runtimePath, updateEnvText(runtimeText, secrets), { encoding: 'utf8', mode: 0o600 });
fs.chmodSync(runtimePath, 0o600);
fs.writeFileSync(examplePath, sanitizeExampleText(exampleText), 'utf8');

process.stdout.write('企業開示DBの3設定を .env へ保存し、.env.example から秘密値を除去しました。\n');
process.stdout.write('秘密値は表示していません。\n');
