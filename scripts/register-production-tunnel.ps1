$ErrorActionPreference = "Stop"

$sourceScript = Join-Path $PSScriptRoot "moomoo-production-tunnel.ps1"
$runtimeRoot = "C:\Users\mahha\AppData\Local\mooview\production-tunnel"
$runtimeScript = Join-Path $runtimeRoot "moomoo-production-tunnel.ps1"
$startupFolder = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupFolder "MooView Production Tunnel.lnk"
$powershellPath = "C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe"

New-Item -ItemType Directory -Path $runtimeRoot -Force | Out-Null
Copy-Item -LiteralPath $sourceScript -Destination $runtimeScript -Force

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $powershellPath
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$runtimeScript`""
$shortcut.WorkingDirectory = $runtimeRoot
$shortcut.Description = "Starts the MooView live Moomoo data HTTPS tunnel."
$shortcut.Save()

$running = Get-CimInstance Win32_Process |
    Where-Object {
        $_.ProcessId -ne $PID -and
        $_.Name -eq "powershell.exe" -and
        $_.CommandLine -match "-File\s+`"?$([regex]::Escape($runtimeScript))"
    }
foreach ($process in $running) {
    Stop-Process -Id $process.ProcessId -Force -ErrorAction SilentlyContinue
}

Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -eq "cloudflared.exe" -and
        $_.CommandLine -match "tunnel.*127\.0\.0\.1:8787"
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

$gatewayListeners = Get-NetTCPConnection `
    -State Listen `
    -LocalPort 8787 `
    -ErrorAction SilentlyContinue
foreach ($gatewayListener in $gatewayListeners) {
    $gatewayProcess = Get-CimInstance Win32_Process `
        -Filter "ProcessId = $($gatewayListener.OwningProcess)"
    if ($gatewayProcess.CommandLine -notmatch "moomoo_gateway\.py") {
        throw "Port 8787 is already used by another program."
    }
}

Get-CimInstance Win32_Process |
    Where-Object {
        $_.Name -like "python*.exe" -and
        $_.CommandLine -match "moomoo_gateway\.py"
    } |
    ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }

Start-Sleep -Seconds 1
Start-Process `
    -FilePath $powershellPath `
    -ArgumentList @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-WindowStyle", "Hidden",
        "-File", $runtimeScript
    ) `
    -WorkingDirectory $runtimeRoot `
    -WindowStyle Hidden | Out-Null

Write-Output "Registered: $shortcutPath"
Write-Output "Runtime script: $runtimeScript"
