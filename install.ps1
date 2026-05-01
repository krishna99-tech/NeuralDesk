$ErrorActionPreference = "Stop"

$AppName = "neuraldesk-desktop"
$InstallDir = Join-Path $env:LOCALAPPDATA $AppName
$BinDir = Join-Path $env:USERPROFILE ".local\bin"
$ExeName = "neuraldesk-desktop.exe"
$DownloadUrl = "https://github.com/krishna99-tech/NeuralDesk/releases/latest/download/$ExeName"
$ExePath = Join-Path $InstallDir $ExeName
$CmdPath = Join-Path $BinDir "$AppName.cmd"
$ManagerPath = Join-Path $BinDir "$AppName.ps1"

function Download-FileWithProgress {
    param(
        [Parameter(Mandatory = $true)][string]$Url,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $request = [System.Net.HttpWebRequest]::Create($Url)
    $request.Method = "GET"
    $request.UserAgent = "$AppName-installer"
    $response = $request.GetResponse()
    $totalBytes = $response.ContentLength

    $responseStream = $response.GetResponseStream()
    $fileStream = [System.IO.File]::Open($DestinationPath, [System.IO.FileMode]::Create)
    try {
        $buffer = New-Object byte[] (128KB)
        $read = 0
        $downloaded = 0L
        $stopwatch = [System.Diagnostics.Stopwatch]::StartNew()
        do {
            $read = $responseStream.Read($buffer, 0, $buffer.Length)
            if ($read -gt 0) {
                $fileStream.Write($buffer, 0, $read)
                $downloaded += $read
                if ($totalBytes -gt 0) {
                    $percent = [int](($downloaded * 100) / $totalBytes)
                    $mbDone = "{0:N1}" -f ($downloaded / 1MB)
                    $mbTotal = "{0:N1}" -f ($totalBytes / 1MB)
                    Write-Progress -Activity "Downloading $ExeName" -Status "$mbDone MB / $mbTotal MB" -PercentComplete $percent
                    $barWidth = 24
                    $filled = [Math]::Floor(($percent / 100) * $barWidth)
                    $bar = ("#" * $filled).PadRight($barWidth, "-")
                    Write-Host -NoNewline "`r[2/5] Downloading: [$bar] $percent% ($mbDone/$mbTotal MB)"
                } else {
                    $mbDone = "{0:N1}" -f ($downloaded / 1MB)
                    Write-Progress -Activity "Downloading $ExeName" -Status "$mbDone MB downloaded" -PercentComplete 0
                    Write-Host -NoNewline "`r[2/5] Downloading: $mbDone MB"
                }
            }
        } while ($read -gt 0)
        $stopwatch.Stop()
        Write-Progress -Activity "Downloading $ExeName" -Completed
        Write-Host ""
    } finally {
        if ($responseStream) { $responseStream.Dispose() }
        if ($fileStream) { $fileStream.Dispose() }
        if ($response) { $response.Dispose() }
    }
}

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
try {
    Download-FileWithProgress -Url $DownloadUrl -DestinationPath $ExePath
} catch {
    Write-Error "Download failed: $($_.Exception.Message)`nURL: $DownloadUrl"
    exit 1
}
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
    "uninstall" {
        `$confirm = Read-Host "Are you sure you want to uninstall $AppName? (y/N)"
        if (`$confirm -notmatch '^yY?$') {
            Write-Host "Uninstall cancelled."
            break
        }

        `$procs = Get-Process -Name `$procName -ErrorAction SilentlyContinue
        if (`$procs) {
            `$procs | Stop-Process -Force
            Write-Host "Stopped `$procName"
        }
        if (Test-Path "$InstallDir") {
            Remove-Item -Path "$InstallDir" -Recurse -Force
            Write-Host "Removed installation directory: $InstallDir"
        }
        `$uPath = [Environment]::GetEnvironmentVariable("Path", "User")
        `$bDir = [IO.Path]::GetFullPath("$BinDir").TrimEnd('\')
        `$nPath = (`$uPath.Split(';', [System.StringSplitOptions]::RemoveEmptyEntries) | Where-Object { try { [IO.Path]::GetFullPath(`$_.Trim()).TrimEnd('\') -ne `$bDir } catch { `$true } }) -join ';'
        [Environment]::SetEnvironmentVariable("Path", `$nPath, "User")
        Write-Host "uninstalled completly"
        break
    }
    default {
        Write-Host "Usage: $AppName [run|stop|status|uninstall]"
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
$NormalizedEntries = @()
foreach ($entry in $PathEntries) {
    try {
        $NormalizedEntries += [IO.Path]::GetFullPath($entry).TrimEnd('\')
    } catch {
        # Ignore invalid PATH entries instead of failing install.
    }
}
$Exists = $NormalizedEntries | Where-Object { $_ -eq $BinDirNormalized } | Select-Object -First 1

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
Write-Host "  $AppName uninstall"
Write-Host ""
Write-Host "Tip: If command is not recognized immediately, restart terminal."
