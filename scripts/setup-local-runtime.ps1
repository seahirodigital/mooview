$ErrorActionPreference = "Stop"

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$localAppData = [Environment]::GetFolderPath("LocalApplicationData")
$localRoot = [System.IO.Path]::GetFullPath((Join-Path $localAppData "mooview"))

New-Item -ItemType Directory -Path $localRoot -Force | Out-Null

$venvPython = Join-Path $localRoot "venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $venvPython)) {
    python -m venv --system-site-packages (Join-Path $localRoot "venv")
}

foreach ($name in @("node_modules", "dist", "build", "coverage")) {
    $target = [System.IO.Path]::GetFullPath((Join-Path $localRoot $name))
    $link = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $name))

    New-Item -ItemType Directory -Path $target -Force | Out-Null
    if (Test-Path -LiteralPath $link) {
        $item = Get-Item -LiteralPath $link -Force
        $actualTarget = @($item.Target) -join ""
        if (
            $item.LinkType -ne "Junction" -or
            -not $actualTarget.Equals($target, [System.StringComparison]::OrdinalIgnoreCase)
        ) {
            throw "既存パスを安全に置換できません: $link"
        }
        continue
    }

    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
}

Write-Output "ローカル保存先: $localRoot"
Write-Output "Python実行ファイル: $venvPython"
