param(
    [switch]$SkipBrowser
)

$ErrorActionPreference = "Stop"

$repoRoot = "C:\Users\mahha\OneDrive\開発\mooview"
$openDPath = "C:\Users\mahha\AppData\Roaming\moomoo_OpenD\moomoo_OpenD.exe"
$pythonPath = "C:\Users\mahha\AppData\Local\mooview\venv\Scripts\python.exe"
$requirementsPath = "C:\Users\mahha\OneDrive\開発\mooview\requirements-moomoo.txt"
$setupRuntimePath = "C:\Users\mahha\OneDrive\開発\mooview\scripts\setup-local-runtime.ps1"
$installNodePath = "C:\Users\mahha\OneDrive\開発\mooview\scripts\install-node-local.ps1"
$npmPath = "C:\Program Files\nodejs\npm.cmd"
$tsxPath = "C:\Users\mahha\OneDrive\開発\mooview\node_modules\.bin\tsx.cmd"
$logRoot = "C:\Users\mahha\AppData\Local\mooview\logs"
$appUrl = "http://127.0.0.1:3000/?launcher=$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"

function Write-Step {
    param([string]$Message)
    Write-Host ""
    Write-Host "【MooView】$Message" -ForegroundColor Cyan
}

function Test-TcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutMilliseconds = 700
    )

    $client = [System.Net.Sockets.TcpClient]::new()
    try {
        $connectTask = $client.ConnectAsync($HostName, $Port)
        return $connectTask.Wait($TimeoutMilliseconds) -and $client.Connected
    }
    catch {
        return $false
    }
    finally {
        $client.Dispose()
    }
}

function Wait-TcpPort {
    param(
        [string]$HostName,
        [int]$Port,
        [int]$TimeoutSeconds
    )

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        if (Test-TcpPort -HostName $HostName -Port $Port) {
            return $true
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Get-MooViewStatus {
    try {
        return Invoke-RestMethod `
            -Uri "http://127.0.0.1:3000/api/moomoo/status" `
            -Method Post `
            -ContentType "application/json" `
            -Body "{}" `
            -TimeoutSec 5
    }
    catch {
        return $null
    }
}

function Wait-MooViewStatus {
    param([int]$TimeoutSeconds = 8)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        $status = Get-MooViewStatus
        if ($status) {
            return $status
        }
        Start-Sleep -Milliseconds 500
    }
    return $null
}

function Get-ProcessLineage {
    param([int]$ProcessId)

    $processes = @{}
    Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | ForEach-Object {
        $processes[[int]$_.ProcessId] = $_
    }

    $lineage = @()
    $currentId = $ProcessId
    $visited = @{}
    while ($currentId -gt 0 -and -not $visited.ContainsKey($currentId)) {
        $visited[$currentId] = $true
        $process = $processes[$currentId]
        if (-not $process) {
            break
        }
        $lineage += $process
        $currentId = [int]$process.ParentProcessId
    }
    return $lineage
}

function Restart-StaleMooViewServer {
    $listeners = @(
        Get-NetTCPConnection `
            -State Listen `
            -LocalPort 3000 `
            -ErrorAction SilentlyContinue
    )
    if ($listeners.Count -eq 0) {
        return $false
    }

    $repoPattern = [regex]::Escape($repoRoot)
    $runtimePattern = [regex]::Escape("C:\Users\mahha\AppData\Local\mooview\node_modules")
    $listenerProcessIds = @{}
    $ancestorProcessesToStop = @{}
    foreach ($listener in $listeners) {
        $lineage = @(Get-ProcessLineage -ProcessId $listener.OwningProcess)
        $isMooView = $lineage | Where-Object {
            (
                $_.CommandLine -match $repoPattern -or
                $_.CommandLine -match $runtimePattern
            ) -and
            $_.CommandLine -match "(server\.ts|npm(\.cmd)?\s+run\s+dev|tsx)"
        }
        if (-not $isMooView) {
            $owner = $lineage | Select-Object -First 1
            $ownerName = if ($owner) { $owner.Name } else { "不明" }
            throw "127.0.0.1:3000 は別のプログラムが使用しています。PID=$($listener.OwningProcess)、プロセス=$ownerName"
        }

        $listenerProcessIds[[int]$listener.OwningProcess] = $true
        foreach ($process in $lineage) {
            if (
                (
                    $process.CommandLine -match $repoPattern -or
                    $process.CommandLine -match $runtimePattern
                ) -and
                $process.CommandLine -match "(server\.ts|npm(\.cmd)?\s+run\s+dev|tsx)"
            ) {
                $ancestorProcessesToStop[[int]$process.ProcessId] = $process
            }
        }
    }

    Write-Step "応答しない古いMooViewサーバーを終了し、自動復旧します。"
    $listenerProcessIds.Keys | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Milliseconds 500
    $ancestorProcessesToStop.Keys | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2

    if (Test-TcpPort -HostName "127.0.0.1" -Port 3000) {
        throw "古いMooViewサーバーを終了しましたが、127.0.0.1:3000 が解放されませんでした。"
    }
    return $true
}

function Invoke-MooViewApi {
    param(
        [string]$Path,
        [string]$Body,
        [int]$TimeoutSeconds = 15
    )

    return Invoke-RestMethod `
        -Uri "http://127.0.0.1:3000$Path" `
        -Method Post `
        -ContentType "application/json" `
        -Body $Body `
        -TimeoutSec $TimeoutSeconds
}

function Test-MooViewMarketData {
    $quote = Invoke-MooViewApi `
        -Path "/api/moomoo/quote" `
        -Body '{"symbol":"US.VOO"}'
    $quotePrice = 0.0
    $hasQuotePrice = [double]::TryParse(
        [string]$quote.price,
        [ref]$quotePrice
    )
    if (
        -not $quote.success -or
        -not $hasQuotePrice -or
        $quotePrice -le 0
    ) {
        $detail = if ($quote.error) { " 詳細: $($quote.error)" } else { "" }
        throw "実株価を取得できませんでした。$detail"
    }

    $kline = Invoke-MooViewApi `
        -Path "/api/moomoo/kline" `
        -Body '{"symbol":"US.VOO","timeframe":"5m","reqNum":30}' `
        -TimeoutSeconds 20
    if (-not $kline.success -or @($kline.candles).Count -eq 0) {
        $detail = if ($kline.error) { " 詳細: $($kline.error)" } else { "" }
        throw "ローソク足を取得できませんでした。$detail"
    }

    return @{
        Quote = $quote
        CandleCount = @($kline.candles).Count
    }
}

function Show-RecentLog {
    param([string]$Path)
    if (Test-Path -LiteralPath $Path) {
        Write-Host ""
        Write-Host "直近のログ: $Path" -ForegroundColor Yellow
        Get-Content -LiteralPath $Path -Encoding UTF8 -Tail 30
    }
}

function Test-PythonModules {
    for ($attempt = 1; $attempt -le 3; $attempt += 1) {
        $previousErrorActionPreference = $ErrorActionPreference
        try {
            $ErrorActionPreference = "Continue"
            & $pythonPath -c "import moomoo, pandas, Crypto" 2>$null
            if ($LASTEXITCODE -eq 0) {
                return $true
            }
        }
        finally {
            $ErrorActionPreference = $previousErrorActionPreference
        }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

try {
    Write-Step "OpenD、Python、MooViewサーバーを順番に確認します。"

    if (-not (Test-Path -LiteralPath $repoRoot)) {
        throw "プロジェクトが見つかりません: $repoRoot"
    }
    if (-not (Test-Path -LiteralPath $openDPath)) {
        throw "Moomoo OpenDが見つかりません: $openDPath"
    }
    if (-not (Test-Path -LiteralPath $npmPath)) {
        throw "Node.jsが見つかりません: $npmPath"
    }

    if (-not (Test-TcpPort -HostName "127.0.0.1" -Port 11111)) {
        Write-Step "Moomoo OpenDを起動しています。ログイン画面が出た場合はログインしてください。"
        $openDProcess = Get-Process -Name "moomoo_OpenD" -ErrorAction SilentlyContinue
        if (-not $openDProcess) {
            Start-Process -FilePath $openDPath -WorkingDirectory "C:\Users\mahha\AppData\Roaming\moomoo_OpenD"
        }

        if (-not (Wait-TcpPort -HostName "127.0.0.1" -Port 11111 -TimeoutSeconds 120)) {
            throw "OpenDは起動しましたが、Socket API 127.0.0.1:11111 が開きませんでした。OpenDへログインし、APIポートが11111になっているか確認してください。"
        }
    }
    Write-Host "OpenD接続: 正常（127.0.0.1:11111）" -ForegroundColor Green

    if (-not (Test-Path -LiteralPath $pythonPath)) {
        Write-Step "MooView専用Python環境を作成しています。"
        & "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $setupRuntimePath
        if ($LASTEXITCODE -ne 0) {
            throw "MooView専用Python環境の作成に失敗しました。"
        }
    }

    $pythonModulesAvailable = Test-PythonModules
    if (-not $pythonModulesAvailable) {
        Write-Step "Moomoo公式Python SDKが不足しているため、初回セットアップを実行しています。"
        & $pythonPath -m pip install --disable-pip-version-check -r $requirementsPath
        if ($LASTEXITCODE -ne 0) {
            throw "Moomoo公式Python SDKのインストールに失敗しました。"
        }
        $pythonModulesAvailable = Test-PythonModules
    }

    if (-not $pythonModulesAvailable) {
        throw "Moomoo公式Python SDKを読み込めません。"
    }
    Write-Host "Python SDK: 正常（$pythonPath）" -ForegroundColor Green

    if (-not (Test-Path -LiteralPath $tsxPath)) {
        Write-Step "Node.js依存関係が不足しているため、初回セットアップを実行しています。"
        & "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe" `
            -NoProfile `
            -ExecutionPolicy Bypass `
            -File $installNodePath
        if ($LASTEXITCODE -ne 0) {
            throw "Node.js依存関係のインストールに失敗しました。"
        }
    }
    Write-Host "Node.js依存関係: 正常" -ForegroundColor Green

    $status = Wait-MooViewStatus
    if (-not $status) {
        if (Test-TcpPort -HostName "127.0.0.1" -Port 3000) {
            Restart-StaleMooViewServer | Out-Null
        }

        Write-Step "MooViewサーバーを起動しています。"
        New-Item -ItemType Directory -Path $logRoot -Force | Out-Null
        $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $stdoutLog = Join-Path $logRoot "mooview-$timestamp.log"
        $stderrLog = Join-Path $logRoot "mooview-$timestamp.err.log"

        $env:MOOMOO_PYTHON = $pythonPath
        $env:MOOMOO_GATEWAY_URL = "http://127.0.0.1:8787"
        $env:MOOMOO_GATEWAY_AUTOSTART = "true"
        $env:NODE_OPTIONS = "--use-system-ca"

        $serverProcess = Start-Process `
            -FilePath $npmPath `
            -ArgumentList @("run", "dev") `
            -WorkingDirectory $repoRoot `
            -WindowStyle Hidden `
            -RedirectStandardOutput $stdoutLog `
            -RedirectStandardError $stderrLog `
            -PassThru

        $deadline = (Get-Date).AddSeconds(90)
        while ((Get-Date) -lt $deadline) {
            Start-Sleep -Seconds 1
            $serverProcess.Refresh()
            if ($serverProcess.HasExited) {
                Show-RecentLog -Path $stdoutLog
                Show-RecentLog -Path $stderrLog
                throw "MooViewサーバーが起動途中で終了しました。終了コード: $($serverProcess.ExitCode)"
            }

            $status = Get-MooViewStatus
            if ($status -and $status.connected -eq $true) {
                break
            }
        }

        if (-not $status -or $status.connected -ne $true) {
            Show-RecentLog -Path $stdoutLog
            Show-RecentLog -Path $stderrLog
            $detail = if ($status -and $status.error) { " 詳細: $($status.error)" } else { "" }
            throw "MooViewサーバーは起動しましたが、OpenD実データ接続を確認できませんでした。$detail"
        }
    }

    if ($status.connected -ne $true) {
        $detail = if ($status.error) { " 詳細: $($status.error)" } else { "" }
        throw "MooView APIは応答しましたが、OpenDへ接続できていません。$detail"
    }

    Write-Host "MooView API: 正常（http://127.0.0.1:3000）" -ForegroundColor Green
    Write-Step "実株価とローソク足を確認しています。"
    $marketData = Test-MooViewMarketData
    Write-Host "実株価: 正常（US.VOO = $($marketData.Quote.price)）" -ForegroundColor Green
    Write-Host "ローソク足: 正常（5分足 $($marketData.CandleCount)本）" -ForegroundColor Green

    if (-not $SkipBrowser) {
        Write-Step "ブラウザでMooViewを開きます。"
        Start-Process -FilePath $appUrl
    }

    Write-Host ""
    Write-Host "MooViewの起動が完了しました。" -ForegroundColor Green
    exit 0
}
catch {
    Write-Host ""
    Write-Host "MooViewの起動に失敗しました。" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
