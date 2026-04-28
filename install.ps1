$ErrorActionPreference = "Stop"

$AppName = "neuraldesk-desktop"
$InstallDir = Join-Path $env:LOCALAPPDATA $AppName
$BinDir = Join-Path $env:USERPROFILE ".local\bin"
$ExeName = "neuraldesk-desktop.exe"
$DownloadUrl = "https://github.com/krishna99-tech/NeuralDesk/releases/latest/download/$ExeName"
$ExePath = Join-Path $InstallDir $ExeName
$CmdPath = Join-Path $BinDir "$AppName.cmd"
$ManagerPath = Join-Path $BinDir "$AppName.ps1"

Write-Host "========================================"
Write-Host " NeuralDesk Windows Installer"
Write-Host "========================================"
Write-Host "[1/5] Preparing install directories..."
Write-Host "App: $AppName"
Write-Host "Install Dir: $InstallDir"
Write-Host "Launcher Dir: $BinDir"

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
New-Item -ItemType Directory -Path $BinDir -Force | Out-Null

Write-Host "[2/5] Downloading latest release..."
Write-Host "Source: $DownloadUrl"
Invoke-WebRequest -Uri $DownloadUrl -OutFile $ExePath
Write-Host "Downloaded to: $ExePath"

Write-Host "[3/5] Creating launcher command..."
@"
param(
    [string]`$Command = "run"
)

`$exePath = "$ExePath"
`$procName = [System.IO.Path]::GetFileNameWithoutExtension(`$exePath)

switch (`$Command.ToLowerInvariant()) {
    "run" {
        Start-Process -FilePath `$exePath | Out-Null
        Write-Host "Started: `$exePath"
        break
    }
    "stop" {
        `$procs = Get-Process -Name `$procName -ErrorAction SilentlyContinue
        if (-not `$procs) {
            Write-Host "No running process found for `$procName"
        } else {
            `$procs | Stop-Process -Force
            Write-Host "Stopped `$procName (`$($procs.Count) process(es))"
        }
        break
    }
    "status" {
        `$procs = Get-Process -Name `$procName -ErrorAction SilentlyContinue
        if (-not `$procs) {
            Write-Host "Status: STOPPED"
        } else {
            Write-Host "Status: RUNNING (`$($procs.Count) process(es))"
            `$procs | Select-Object Id, ProcessName, StartTime | Format-Table -AutoSize
        }
        break
    }
    default {
        Write-Host "Usage: $AppName [run|stop|status]"
        exit 1
    }
}
"@ | Set-Content -Path $ManagerPath -Encoding UTF8

@"
@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "$ManagerPath" %*
"@ | Set-Content -Path $CmdPath -Encoding ASCII
Write-Host "Launcher created: $CmdPath"
Write-Host "Manager created:  $ManagerPath"

$UserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not $UserPath) { $UserPath = "" }

$BinDirNormalized = [IO.Path]::GetFullPath($BinDir).TrimEnd('\')
$PathEntries = $UserPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) | ForEach-Object { $_.Trim() }
$Exists = $PathEntries | Where-Object { [IO.Path]::GetFullPath($_).TrimEnd('\') -eq $BinDirNormalized } | Select-Object -First 1

Write-Host "[4/5] Checking PATH..."
if (-not $Exists) {
    $NewPath = if ([string]::IsNullOrWhiteSpace($UserPath)) { $BinDir } else { "$UserPath;$BinDir" }
    [Environment]::SetEnvironmentVariable("Path", $NewPath, "User")
    Write-Host "Added to user PATH: $BinDir"
}
else {
    Write-Host "PATH already contains: $BinDir"
}

Write-Host "[5/5] Installation complete."
Write-Host ""
Write-Host "Run now:"
Write-Host "  $ExePath"
Write-Host ""
Write-Host "Or open a new terminal and run:"
Write-Host "  $AppName run"
Write-Host "  $AppName stop"
Write-Host "  $AppName status"
Write-Host ""
Write-Host "Tip: If command is not recognized immediately, restart terminal."
