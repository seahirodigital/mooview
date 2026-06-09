$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$localRoot = [System.IO.Path]::GetFullPath((Join-Path $localAppData "mooview"))

& (Join-Path $PSScriptRoot "setup-local-runtime.ps1")

Copy-Item -LiteralPath (Join-Path $repoRoot "package.json") -Destination (Join-Path $localRoot "package.json") -Force
Copy-Item -LiteralPath (Join-Path $repoRoot "package-lock.json") -Destination (Join-Path $localRoot "package-lock.json") -Force

$env:NODE_OPTIONS = "--use-system-ca"
npm.cmd install --prefix $localRoot --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Copy-Item -LiteralPath (Join-Path $localRoot "package-lock.json") -Destination (Join-Path $repoRoot "package-lock.json") -Force
& (Join-Path $PSScriptRoot "setup-local-runtime.ps1")
