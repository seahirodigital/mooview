import * as tls from 'node:tls';

/** Windowsを含む実行OSの信頼済みCAを、Node既定CAへ安全に追加する。 */
export function configureSystemTlsTrust(): void {
  if (
    typeof tls.getCACertificates !== 'function'
    || typeof tls.setDefaultCACertificates !== 'function'
  ) {
    return;
  }
  try {
    const systemCertificates = tls.getCACertificates('system');
    if (systemCertificates.length === 0) return;
    tls.setDefaultCACertificates([
      ...tls.getCACertificates('default'),
      ...systemCertificates,
    ]);
  } catch (error) {
    console.warn(
      `OS信頼済み証明書の読み込みを継続できませんでした: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
