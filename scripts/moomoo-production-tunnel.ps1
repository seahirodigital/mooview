$ErrorActionPreference = "Stop"

$developmentFolder = ([char]0x958b).ToString() + ([char]0x767a)
$repoRoot = Join-Path $env:USERPROFILE ("OneDrive\" + $developmentFolder + "\mooview")
$runtimeRoot = "C:\Users\mahha\AppData\Local\mooview\production-tunnel"
$logRoot = Join-Path $runtimeRoot "logs"
$pythonPath = "C:\Users\mahha\AppData\Local\mooview\venv\Scripts\python.exe"
$gatewayScript = Join-Path $repoRoot "moomoo_gateway.py"
$cloudflaredPath = "C:\Users\mahha\AppData\Local\Microsoft\WinGet\Packages\Cloudflare.cloudflared_Microsoft.Winget.Source_8wekyb3d8bbwe\cloudflared.exe"
$vercelPath = "C:\Users\mahha\AppData\Local\mooview\vercel-cli\node_modules\.bin\vercel.cmd"
$encryptedKeyPath = Join-Path $runtimeRoot "gateway-key.dpapi"
$statePath = Join-Path $runtimeRoot "current-tunnel-url.txt"
$supervisorLog = Join-Path $logRoot "supervisor.log"
$gatewayPort = 8787

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
New-Item -ItemType Directory -Path $logRoot -Force | Out-Null

function Write-SupervisorLog {
    param([string]$Message)
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -LiteralPath $supervisorLog -Value $line -Encoding UTF8
}

function Get-OrCreateGatewayKey {
    if (-not (Test-Path -LiteralPath $encryptedKeyPath)) {
        $bytes = New-Object byte[] 32
        [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
        $plainKey = [Convert]::ToBase64String($bytes).TrimEnd("=").Replace("+", "-").Replace("/", "_")
        $secureKey = ConvertTo-SecureString -String $plainKey -AsPlainText -Force
        $encryptedKey = ConvertFrom-SecureString -SecureString $secureKey
        Set-Content -LiteralPath $encryptedKeyPath -Value $encryptedKey -Encoding ASCII
    }

    $encryptedValue = (Get-Content -LiteralPath $encryptedKeyPath -Raw).Trim()
    $secureValue = $encryptedValue | ConvertTo-SecureString
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
    try {
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
    }
}

function Test-TcpPort {
    param([int]$Port)
    $client = New-Object System.Net.Sockets.TcpClient
    try {
        $result = $client.BeginConnect("127.0.0.1", $Port, $null, $null)
        if (-not $result.AsyncWaitHandle.WaitOne(700, $false)) {
            return $false
        }
        $client.EndConnect($result)
        return $true
    } catch {
        return $false
    } finally {
        $client.Close()
    }
}

function Test-GatewayAuthorization {
    param([string]$GatewayKey)
    try {
        Invoke-WebRequest `
            -Uri "http://127.0.0.1:$gatewayPort/v1/status" `
            -Method Post `
            -ContentType "application/json" `
            -Headers @{ Authorization = "Bearer $GatewayKey" } `
            -Body "{}" `
            -UseBasicParsing `
            -TimeoutSec 5 | Out-Null
        return $true
    } catch {
        if ($_.Exception.Response -and [int]$_.Exception.Response.StatusCode -eq 401) {
            return $false
        }
        return $true
    }
}

function Stop-UnmanagedGateway {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $gatewayPort -ErrorAction SilentlyContinue |
        Select-Object -First 1
    if (-not $listener) {
        return
    }

    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
    if ($process.CommandLine -match "moomoo_gateway\.py") {
        Stop-Process -Id $listener.OwningProcess -Force
        Start-Sleep -Seconds 1
        return
    }
    throw "Port $gatewayPort is already used by another program."
}

function Start-MoomooGateway {
    param([string]$GatewayKey)

    if (Test-TcpPort -Port $gatewayPort) {
        if (Test-GatewayAuthorization -GatewayKey $GatewayKey) {
            return
        }
        Stop-UnmanagedGateway
    }

    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $stdout = Join-Path $logRoot "gateway_$timestamp.log"
    $stderr = Join-Path $logRoot "gateway_$timestamp.err.log"

    $previousKey = $env:MOOMOO_GATEWAY_KEY
    $previousHost = $env:MOOMOO_GATEWAY_HOST
    $previousPort = $env:MOOMOO_GATEWAY_PORT
    try {
        $env:MOOMOO_GATEWAY_KEY = $GatewayKey
        $env:MOOMOO_GATEWAY_HOST = "127.0.0.1"
        $env:MOOMOO_GATEWAY_PORT = "$gatewayPort"
        Start-Process `
            -FilePath $pythonPath `
            -ArgumentList @($gatewayScript) `
            -WorkingDirectory $repoRoot `
            -RedirectStandardOutput $stdout `
            -RedirectStandardError $stderr `
            -WindowStyle Hidden | Out-Null
    } finally {
        $env:MOOMOO_GATEWAY_KEY = $previousKey
        $env:MOOMOO_GATEWAY_HOST = $previousHost
        $env:MOOMOO_GATEWAY_PORT = $previousPort
    }

    for ($attempt = 0; $attempt -lt 40; $attempt++) {
        if (Test-TcpPort -Port $gatewayPort) {
            Write-SupervisorLog "Moomoo gateway started."
            return
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Failed to start the Moomoo gateway."
}

function Start-QuickTunnel {
    $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
    $stdout = Join-Path $logRoot "cloudflared_$timestamp.log"
    $stderr = Join-Path $logRoot "cloudflared_$timestamp.err.log"
    $process = Start-Process `
        -FilePath $cloudflaredPath `
        -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:$gatewayPort") `
        -WorkingDirectory $runtimeRoot `
        -RedirectStandardOutput $stdout `
        -RedirectStandardError $stderr `
        -WindowStyle Hidden `
        -PassThru

    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        if ($process.HasExited) {
            throw "Cloudflare Tunnel exited before issuing a URL."
        }
        $text = ""
        if (Test-Path -LiteralPath $stdout) {
            $text += Get-Content -LiteralPath $stdout -Raw -ErrorAction SilentlyContinue
        }
        if (Test-Path -LiteralPath $stderr) {
            $text += Get-Content -LiteralPath $stderr -Raw -ErrorAction SilentlyContinue
        }
        $match = [regex]::Match($text, "https://[a-z0-9-]+\.trycloudflare\.com")
        if ($match.Success) {
            return @{
                Process = $process
                Url = $match.Value
            }
        }
        Start-Sleep -Milliseconds 500
    }

    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    throw "Failed to obtain the Cloudflare Tunnel HTTPS URL."
}

function Set-VercelEnvironment {
    param(
        [string]$GatewayUrl,
        [string]$GatewayKey
    )
    $vercelLog = Join-Path $logRoot "vercel.log"
    $env:NODE_OPTIONS = "--use-system-ca"
    $env:npm_config_cache = "C:\Users\mahha\AppData\Local\mooview\npm-cache"

    function Invoke-VercelCommand {
        param(
            [string]$Arguments,
            [string]$InputValue = ""
        )

        $startInfo = New-Object System.Diagnostics.ProcessStartInfo
        $startInfo.FileName = $env:ComSpec
        $startInfo.Arguments = "/d /s /c `"`"$vercelPath`" $Arguments`""
        $startInfo.WorkingDirectory = $repoRoot
        $startInfo.UseShellExecute = $false
        $startInfo.CreateNoWindow = $true
        $startInfo.RedirectStandardInput = $true
        $startInfo.RedirectStandardOutput = $true
        $startInfo.RedirectStandardError = $true

        $process = New-Object System.Diagnostics.Process
        $process.StartInfo = $startInfo
        $null = $process.Start()
        if ($InputValue) {
            $process.StandardInput.WriteLine($InputValue)
        }
        $process.StandardInput.Close()
        $stdout = $process.StandardOutput.ReadToEnd()
        $stderr = $process.StandardError.ReadToEnd()
        $process.WaitForExit()

        if ($stdout) {
            Add-Content -LiteralPath $vercelLog -Value $stdout -Encoding UTF8
        }
        if ($stderr) {
            Add-Content -LiteralPath $vercelLog -Value $stderr -Encoding UTF8
        }
        if ($process.ExitCode -ne 0) {
            throw "Vercel CLI failed with exit code $($process.ExitCode)."
        }
    }

    Push-Location $repoRoot
    try {
        Invoke-VercelCommand `
            -Arguments "env add MOOMOO_GATEWAY_URL production --force --yes" `
            -InputValue $GatewayUrl
        Invoke-VercelCommand `
            -Arguments "env add MOOMOO_GATEWAY_KEY production --force --yes --sensitive" `
            -InputValue $GatewayKey
        Invoke-VercelCommand -Arguments "deploy --prod --yes"
    } finally {
        Pop-Location
    }
}

function Test-ProductionQuote {
    for ($attempt = 0; $attempt -lt 30; $attempt++) {
        try {
            $response = Invoke-RestMethod `
                -Uri "https://mooview-pink.vercel.app/api/moomoo/quote" `
                -Method Post `
                -ContentType "application/json" `
                -Body '{"symbol":"VOO"}' `
                -TimeoutSec 20
            if ($response.success -and $response.symbol -eq "US.VOO" -and $response.price -gt 0) {
                Write-SupervisorLog "Verified live US.VOO data on Vercel production."
                return
            }
        } catch {
            Start-Sleep -Seconds 3
            continue
        }
        Start-Sleep -Seconds 3
    }
    throw "Failed to verify live data on Vercel production."
}

$gatewayKey = Get-OrCreateGatewayKey
Write-SupervisorLog "MooView production tunnel supervisor started."

while ($true) {
    $tunnel = $null
    try {
        Start-MoomooGateway -GatewayKey $gatewayKey
        $tunnel = Start-QuickTunnel
        $tunnelUrl = [string]$tunnel.Url
        Write-SupervisorLog "Cloudflare Tunnel HTTPS URL acquired."

        Set-VercelEnvironment -GatewayUrl $tunnelUrl -GatewayKey $gatewayKey
        Set-Content -LiteralPath $statePath -Value $tunnelUrl -Encoding ASCII
        Test-ProductionQuote

        while (-not $tunnel.Process.HasExited) {
            if (-not (Test-TcpPort -Port $gatewayPort)) {
                Start-MoomooGateway -GatewayKey $gatewayKey
            }
            Start-Sleep -Seconds 10
        }
        Write-SupervisorLog "Cloudflare Tunnel exited. Reconnecting."
    } catch {
        if ($tunnel -and $tunnel.Process -and -not $tunnel.Process.HasExited) {
            Stop-Process -Id $tunnel.Process.Id -Force -ErrorAction SilentlyContinue
        }
        Write-SupervisorLog "Retrying: $($_.Exception.Message)"
        Start-Sleep -Seconds 10
    }
}
