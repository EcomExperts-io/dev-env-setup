# EcomExperts dev environment bootstrap - Windows
#
# This script's only job is to make sure Node.js exists, then it hands off
# to the real setup tool (a Node CLI) for everything else. Safe to re-run.
#
# Usage (PowerShell): .\bootstrap.ps1
# If script execution is blocked, run once:
#   Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path

# Make sure the console can render the checkmarks/arrows the setup tool prints.
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

Write-Host "EcomExperts dev-setup - bootstrap" -ForegroundColor Cyan

function Test-Command($name) {
    return $null -ne (Get-Command $name -ErrorAction SilentlyContinue)
}

function Sync-Path {
    # A fresh PowerShell process only loads PATH once, at startup. When
    # winget/an installer adds Node to PATH mid-session, THIS process never
    # finds out on its own - so re-read it from the registry directly rather
    # than relying on whatever this process started with.
    $machinePath = [System.Environment]::GetEnvironmentVariable("Path", "Machine")
    $userPath = [System.Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$machinePath;$userPath"
}

if (-not (Test-Command "node")) {
    Write-Host "  Node.js not found - installing..."
    $installedViaWinget = $false
    if (Test-Command "winget") {
        winget install --id OpenJS.NodeJS.LTS -e --source winget --accept-package-agreements --accept-source-agreements
        Sync-Path
        if (Test-Command "node") { $installedViaWinget = $true }
    }

    if (-not $installedViaWinget) {
        # winget can silently fail when driven non-interactively even though
        # the exact same command works fine typed by hand - don't depend on
        # it. Download Node's own installer directly and run it silently
        # instead, the same way winget would have under the hood.
        Write-Host "  Falling back to a direct download of the official Node.js installer..."
        try {
            $releases = Invoke-RestMethod -Uri "https://nodejs.org/dist/index.json" -UseBasicParsing
            $lts = $releases | Where-Object { $_.lts -ne $false } | Select-Object -First 1
            if (-not $lts) { throw "Could not find a current LTS release." }
            $version = $lts.version
            $msiUrl = "https://nodejs.org/dist/$version/node-$version-x64.msi"
            $msiPath = Join-Path $env:TEMP "node-$version-x64.msi"
            Write-Host "  Downloading Node.js $version..."
            Invoke-WebRequest -Uri $msiUrl -OutFile $msiPath -UseBasicParsing
            Write-Host "  Installing..."
            Start-Process msiexec.exe -ArgumentList "/i `"$msiPath`" /quiet /norestart" -Wait
            Sync-Path
        } catch {
            Write-Host "  Direct download install failed: $($_.Exception.Message)" -ForegroundColor Yellow
        }
    }
}

if (-not (Test-Command "node")) {
    # Belt-and-suspenders: check the usual install locations directly, in
    # case the registry read above raced the installer finishing.
    $candidates = @(
        "$env:ProgramFiles\nodejs",
        "${env:ProgramFiles(x86)}\nodejs",
        "$env:LOCALAPPDATA\Programs\nodejs"
    )
    foreach ($dir in $candidates) {
        if (Test-Path "$dir\node.exe") { $env:Path = "$dir;$env:Path" }
    }
}

if ((-not (Test-Command "node")) -and ($env:EE_SETUP_RELAUNCHED -ne "1")) {
    # Node was just installed, but this specific PowerShell process still
    # doesn't see it on PATH. Rather than asking you to close this window
    # and open a new one, restart the script in a brand-new PowerShell
    # process right now - a new process loads PATH from scratch, so this
    # just works instead of leaving you stuck. EE_SETUP_RELAUNCHED guards
    # against looping forever if something is genuinely broken.
    Write-Host "  Node was just installed but this window doesn't see it yet - restarting in a fresh session..." -ForegroundColor Yellow
    $env:EE_SETUP_RELAUNCHED = "1"
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$scriptDir\bootstrap.ps1"
    exit $LASTEXITCODE
}

if (-not (Test-Command "node")) {
    Write-Host "Node.js still isn't available. Install it manually from https://nodejs.org/en/download/ and re-run this script." -ForegroundColor Red
    exit 1
}

Write-Host ("  Node {0} ready." -f (node -v))

# The setup tool's terminal UI (the full-screen, arrow-key checklist) needs
# one small dependency (blessed). Install it automatically here so nobody
# ever has to run `npm install` by hand - same "fully automatic" principle
# as everything else in this script. If it fails for any reason (offline,
# locked-down machine, npm registry unreachable), don't abort the whole
# setup over it: the tool detects a missing dependency itself and falls
# back to its plain text mode automatically.
$packageJson = Join-Path $scriptDir "package.json"
$blessedDir = Join-Path $scriptDir "node_modules\blessed"
if ((Test-Path $packageJson) -and (-not (Test-Path $blessedDir))) {
    Write-Host "  Installing the terminal UI dependency (one-time)..."
    Push-Location $scriptDir
    try {
        npm install --omit=dev --no-audit --no-fund
        if ($LASTEXITCODE -ne 0) {
            Write-Host "  Note: couldn't install the terminal UI dependency automatically." -ForegroundColor Yellow
            Write-Host "  The setup tool still works fine - it'll use its plain text mode instead." -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Note: couldn't install the terminal UI dependency automatically." -ForegroundColor Yellow
        Write-Host "  The setup tool still works fine - it'll use its plain text mode instead." -ForegroundColor Yellow
    } finally {
        Pop-Location
    }
}

Write-Host "  Handing off to the setup tool..."
Write-Host ""

& node "$scriptDir\bin\setup.js"
exit $LASTEXITCODE
