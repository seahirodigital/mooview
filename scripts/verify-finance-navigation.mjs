import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '..');
const checkBundle = process.argv.includes('--bundle');

async function readRepositoryFile(...segments) {
  return readFile(resolve(repositoryRoot, ...segments), 'utf8');
}

function requireText(source, expected, label) {
  if (!source.includes(expected)) {
    throw new Error(`${label} に必要な定義がありません: ${expected}`);
  }
}

async function main() {
  const [appView, workspaceMenu, app, navigation] = await Promise.all([
    readRepositoryFile('src', 'appView.ts'),
    readRepositoryFile('src', 'components', 'WorkspaceMenuOverlay.tsx'),
    readRepositoryFile('src', 'App.tsx'),
    readRepositoryFile('finance_simulation', 'ai_studio', 'finance-simulation', 'src', 'components', 'Navigation.tsx'),
  ]);

  // 財務画面の登録、ハンバーガー、統合コンテナ、資産管理タブを同時に検査する。
  requireText(appView, "'finance-simulation'", 'アプリ画面定義');
  requireText(workspaceMenu, "{ view: 'finance-simulation', label: '財務シミュレーション' }", 'ハンバーガーメニュー');
  requireText(app, "import FinanceSimulationApp from '../finance_simulation/ai_studio/finance-simulation/src/App';", '統合アプリ');
  requireText(app, "appView === 'high-dividend' || appView === 'finance-simulation'", '財務画面ルーティング');
  requireText(app, '<FinanceSimulationApp onOpenWorkspaceMenu={() => setWorkspaceMenuOpen(true)} />', '財務画面のメニュー連携');
  requireText(navigation, "id: 'assets'", '資産管理タブ');
  requireText(navigation, "label: '資産管理'", '資産管理タブ表示名');

  if (checkBundle) {
    const { readdir } = await import('node:fs/promises');
    const assetDirectory = resolve(repositoryRoot, 'dist', 'assets');
    const assetNames = (await readdir(assetDirectory)).filter((name) => name.endsWith('.js'));
    const assets = await Promise.all(assetNames.map((name) => readFile(resolve(assetDirectory, name), 'utf8')));
    const bundle = assets.join('\n');

    requireText(bundle, '財務シミュレーション', '本番JavaScriptバンドル');
    requireText(bundle, 'Finance Simulation', '本番JavaScriptバンドル');
    requireText(bundle, '資産管理', '本番JavaScriptバンドル');
  }

  console.log(`財務導線の検査に成功しました${checkBundle ? '（本番バンドルを含む）' : ''}。`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
