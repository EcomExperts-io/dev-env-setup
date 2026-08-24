# EcomExperts dev environment bootstrap - Windows
#
# This script's only job is to make sure Node.js exists, then it hands off
# to the real setup tool (a Node CLI) for everything else. Safe to re-run.
#
# Works two ways:
#   - From inside an already-downloaded copy of this repo (the traditional
#     way): .\bootstrap.ps1
#     If script execution is blocked, run once:
#       Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
#   - As a single command, with nothing downloaded yet:
#       irm https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Main/bootstrap.ps1 | iex
#     Run this way, there's no real script file on disk for this process to
#     find its own folder from ($MyInvocation.MyCommand.Path is $null) -
#     this script notices that and downloads a real copy of the repo itself
#     first (it's public, so no login/token is needed), then carries on
#     exactly as it would from a real local copy.

$ErrorActionPreference = "Stop"

$RepoOwner = "EcomExperts-io"
$RepoName = "dev-env-setup"
$RepoRef = "Main"
$RawBootstrapUrl = "https://raw.githubusercontent.com/$RepoOwner/$RepoName/$RepoRef/bootstrap.ps1"

$scriptPath = $MyInvocation.MyCommand.Path
$isPiped = [string]::IsNullOrEmpty($scriptPath)
$scriptDir = $null
if (-not $isPiped) {
    $scriptDir = Split-Path -Parent $scriptPath
}

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
    # against looping forever if something is genuinely broken. (It's set
    # in THIS process's environment below, before spawning the child, so
    # the child inherits it automatically - no need to pass it explicitly.)
    Write-Host "  Node was just installed but this window doesn't see it yet - restarting in a fresh session..." -ForegroundColor Yellow
    $env:EE_SETUP_RELAUNCHED = "1"
    if ($isPiped) {
        # No real bootstrap.ps1 file on disk to re-run (this process only
        # ever saw it as text piped into iex) - re-fetch and re-run the
        # same way it was launched the first time.
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "irm '$RawBootstrapUrl' | iex"
    } else {
        & powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$scriptDir\bootstrap.ps1"
    }
    exit $LASTEXITCODE
}

if (-not (Test-Command "node")) {
    Write-Host "Node.js still isn't available. Install it manually from https://nodejs.org/en/download/ and re-run this script." -ForegroundColor Red
    exit 1
}

Write-Host ("  Node {0} ready." -f (node -v))

# If there's no real local copy of the setup tool next to this script (it
# was piped straight into iex, or this is a lone bootstrap.ps1 someone
# downloaded by itself), get one. The repo is public, so this is a plain
# download - no login/token needed. Expand-Archive (built into PowerShell
# since 5.0) handles the .zip natively, so there's no dependency on `tar`
# or any other external tool for this step.
if ($isPiped -or (-not $scriptDir) -or (-not (Test-Path (Join-Path $scriptDir "bin\setup.js")))) {
    Write-Host "  No local copy of the setup tool found next to this script - downloading one..."
    $installDir = Join-Path $env:USERPROFILE "Documents\EcomExperts\Clients\$RepoName"
    $tmpZip = Join-Path $env:TEMP "$RepoName.zip"
    $tmpExtract = Join-Path $env:TEMP "$RepoName-extract"

    Invoke-WebRequest -Uri "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$RepoRef.zip" -OutFile $tmpZip -UseBasicParsing
    if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force

    # GitHub's zip has one top-level folder (e.g. dev-env-setup-Main) - copy
    # its contents into place rather than that wrapper folder itself.
    $extractedSubdir = Get-ChildItem -Path $tmpExtract -Directory | Select-Object -First 1
    New-Item -ItemType Directory -Force -Path $installDir | Out-Null
    Copy-Item -Path (Join-Path $extractedSubdir.FullName "*") -Destination $installDir -Recurse -Force

    Remove-Item $tmpZip -ErrorAction SilentlyContinue
    Remove-Item $tmpExtract -Recurse -Force -ErrorAction SilentlyContinue

    $scriptDir = $installDir
    Write-Host "  Downloaded to $installDir"
}

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
