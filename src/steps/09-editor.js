'use strict';
 
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  heading,
  ok,
  warn,
  info,
  ask,
  run,
  commandExists,
  ensureWinget,
  downloadFile,
  fetchJson,
  runInstaller,
  tempInstallerPath,
  refreshWindowsPath,
  addDirToWindowsPath,
  addDirToUnixPath,
  ensureCurlOnLinux,
} = require('../utils');
const { isMac, isWindows, isLinux, homedir } = require('../platform');
const { VSCODE_CUSTOM_LINK } = require('../config');
 
function openUrl(url) {
  if (isMac) run(`open "${url}"`, { silent: true });
  else if (isWindows) run(`Start-Process "${url}"`, { silent: true });
  else run(`xdg-open "${url}" 2>/dev/null`, { silent: true });
}
 
// ---------------------------------------------------------------------------
// Visual Studio Code
// ---------------------------------------------------------------------------
 
async function installVSCodeWindows() {
  if (ensureWinget()) {
    info('Trying winget...');
    const result = run(
      'winget install --id Microsoft.VisualStudioCode -e --source winget --accept-package-agreements --accept-source-agreements'
    );
    if (result.success && commandExists('code')) return { success: true };
    warn('winget didn\'t get VS Code installed — falling back to a direct download.');
  }
 
  try {
    info('Downloading the official VS Code installer...');
    const dest = tempInstallerPath('VSCodeSetup-x64.exe');
    await downloadFile('https://update.code.visualstudio.com/latest/win32-x64/stable', dest);
    info('Running the installer silently...');
    const installResult = runInstaller(dest, ['/VERYSILENT', '/NORESTART', '/MERGETASKS=!runcode,addtopath']);
    return { success: installResult.success && commandExists('code') };
  } catch (err) {
    warn(`Direct download install failed: ${err.message || err}`);
    return { success: false };
  }
}
 
// Last-resort VS Code install for Linux: no root, no package manager
// needed — Microsoft also publishes a plain, official Linux tarball build
// (the same ".tar.gz" download offered on code.visualstudio.com's own
// downloads page, not a third-party build) alongside the .deb/.rpm/snap
// packages. This exists because snap and apt-get are both dead ends on a
// distro that has neither — an immutable/locked-down one like SteamOS
// (whose pacman isn't set up for general package installs — see the same
// note in bootstrap.sh) being the concrete case that surfaced this gap, but
// the same applies to any other non-Debian, non-snap Linux (Fedora, Arch,
// etc. without snapd installed and working).
async function installVSCodeLinuxTarball() {
  const arch = os.arch();
  const archKey = arch === 'x64' ? 'linux-x64' : arch === 'arm64' ? 'linux-arm64' : null;
  if (!archKey) {
    warn(`No official VS Code tarball build for this CPU architecture (${arch}).`);
    return { success: false };
  }
 
  try {
    info('Downloading the official VS Code tarball (no package manager needed)...');
    const dest = tempInstallerPath(`vscode-${archKey}.tar.gz`);
    await downloadFile(`https://code.visualstudio.com/sha/download?build=stable&os=${archKey}`, dest);
 
    const installDir = path.join(homedir, '.local', 'share', 'vscode');
    fs.mkdirSync(installDir, { recursive: true });
    info('Extracting...');
    // The tarball has one top-level "VSCode-linux-*" directory —
    // --strip-components=1 flattens that away so installDir/bin/code is a
    // stable path regardless of the exact directory name Microsoft ships.
    const extractResult = run(`tar -xzf "${dest}" -C "${installDir}" --strip-components=1`, { silent: true });
    if (!extractResult.success) {
      warn('Could not extract the downloaded VS Code archive.');
      return { success: false };
    }
 
    const binPath = path.join(installDir, 'bin', 'code');
    if (!fs.existsSync(binPath)) {
      warn('Extracted VS Code but the expected bin/code launcher wasn\'t where expected — the archive layout may have changed upstream.');
      return { success: false };
    }
    fs.chmodSync(binPath, 0o755);
    addDirToUnixPath(path.join(installDir, 'bin'));
 
    // Desktop entry so it shows up in the app menu too, same as the Cursor
    // Linux install just below.
    const desktopEntryDir = path.join(homedir, '.local', 'share', 'applications');
    fs.mkdirSync(desktopEntryDir, { recursive: true });
    const desktopEntry = [
      '[Desktop Entry]',
      'Name=Visual Studio Code',
      `Exec="${binPath}" %F`,
      'Terminal=false',
      'Type=Application',
      'Icon=vscode',
      'Categories=Development;',
      'StartupWMClass=Code',
    ].join('\n');
    fs.writeFileSync(path.join(desktopEntryDir, 'code.desktop'), desktopEntry + '\n');
    run(`update-desktop-database "${desktopEntryDir}"`, { silent: true }); // best-effort, fine if missing
 
    return { success: commandExists('code') };
  } catch (err) {
    warn(`Tarball install failed: ${err.message || err}`);
    return { success: false };
  }
}
 
async function installVSCodeLinux() {
  if (commandExists('snap')) {
    info('Trying snap...');
    const result = run('sudo snap install --classic code');
    if (result.success && commandExists('code')) return { success: true };
    warn('snap didn\'t get VS Code installed — trying another way.');
  }
 
  if (commandExists('apt-get')) {
    try {
      info('Downloading the official VS Code .deb package...');
      const dest = tempInstallerPath('vscode-amd64.deb');
      await downloadFile('https://code.visualstudio.com/sha/download?build=stable&os=linux-deb-x64', dest);
      info('Installing it...');
      run(`sudo dpkg -i "${dest}" || sudo apt-get install -f -y`);
      if (commandExists('code')) return { success: true };
      warn('The .deb install didn\'t get VS Code working — trying another way.');
    } catch (err) {
      warn(`Direct .deb download install failed: ${err.message || err}`);
    }
  }
 
  // No snap, no apt-get, or both were tried and didn't work — fall back to
  // the official tarball rather than giving up.
  return installVSCodeLinuxTarball();
}
 
async function installVSCode() {
  if (commandExists('code')) {
    ok('VS Code is already installed.');
    return { success: true };
  }
 
  let success = false;
  if (isMac && commandExists('brew')) {
    success = run('brew install --cask visual-studio-code').success && commandExists('code');
  } else if (isWindows) {
    success = (await installVSCodeWindows()).success;
  } else if (isLinux) {
    success = (await installVSCodeLinux()).success;
  }
 
  if (success) {
    ok('VS Code installed successfully.');
    if (isMac) info('Move it from Downloads into Applications if it isn\'t already there (needed for full permissions).');
    info(`FYI — EcomExperts' recommended build/config: ${VSCODE_CUSTOM_LINK}`);
    return { success: true };
  }
 
  warn('Automatic VS Code install wasn\'t possible on this machine.');
  info(`EcomExperts' recommended build: ${VSCODE_CUSTOM_LINK}`);
  info('Opening that link now — install it manually, then give VS Code full disk/terminal access when asked.');
  openUrl(VSCODE_CUSTOM_LINK);
  return { success: false };
}
 
// ---------------------------------------------------------------------------
// Cursor
// ---------------------------------------------------------------------------
//
// Cursor's Windows installer is NSIS-based (unlike VS Code's Inno Setup one)
// — its silent switch is /S, not /VERYSILENT. There's no winget package
// worth relying on for it, and unlike Git/VS Code, Cursor doesn't publish a
// stable "always latest" download alias — the old downloader.cursor.sh
// links are dead (DNS doesn't even resolve anymore). Real downloads live at
// https://downloads.cursor.com/production/<build-hash>/..., with the build
// hash changing every release, so the actual URL has to be looked up
// per-release rather than hardcoded. oslook/cursor-ai-downloads is a
// community-maintained GitHub repo that mirrors Cursor's own official
// per-version download links as a JSON file, updated on every Cursor
// release — this reads that file the same way the Git step already reads
// GitHub's Releases API, and picks the newest release that actually has the
// platform we need.
const CURSOR_VERSION_HISTORY_URL =
  'https://raw.githubusercontent.com/oslook/cursor-ai-downloads/main/version-history.json';
 
async function fetchLatestCursorDownload(platformKey) {
  const data = await fetchJson(CURSOR_VERSION_HISTORY_URL);
  // The feed's top-level shape is `{ versions: [...] }`, not a bare array —
  // still accept a bare array too in case that ever changes upstream.
  const history = Array.isArray(data) ? data : Array.isArray(data && data.versions) ? data.versions : null;
  if (!history || !history.length) {
    throw new Error('Unexpected format from the Cursor version-history feed');
  }
  const byNewestFirst = [...history].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const match = byNewestFirst.find((entry) => entry.platforms && entry.platforms[platformKey]);
  if (!match) throw new Error(`No recent Cursor release has a "${platformKey}" download listed`);
  return { url: match.platforms[platformKey], version: match.version };
}
 
function cursorWindowsInstallPaths() {
  const candidates = [];
  const local = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  candidates.push(path.join(local, 'Programs', 'cursor', 'Cursor.exe'));
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'cursor', 'Cursor.exe'));
  if (process.env['ProgramFiles(x86)']) candidates.push(path.join(process.env['ProgramFiles(x86)'], 'cursor', 'Cursor.exe'));
  return candidates;
}
 
function cursorInstalledOnWindows() {
  return commandExists('cursor') || cursorWindowsInstallPaths().some((p) => fs.existsSync(p));
}
 
async function installCursorWindows() {
  // Cursor is also published as a real winget package (Anysphere.Cursor) —
  // winget-pkgs manifests are validated in CI to actually install silently
  // before they're accepted, so it's a more trustworthy source of "the
  // correct silent switch" than guessing flags against the installer
  // ourselves. Try that first.
  if (ensureWinget()) {
    info('Trying winget...');
    const result = run(
      'winget install --id Anysphere.Cursor -e --source winget --accept-package-agreements --accept-source-agreements'
    );
    if (result.success && cursorInstalledOnWindows()) return { success: true };
    warn('winget didn\'t get Cursor installed — falling back to a direct download.');
  }
 
  try {
    info('Looking up the latest Cursor release...');
    const { url, version } = await fetchLatestCursorDownload('win32-x64-system');
    info(`Downloading Cursor ${version}...`);
    const dest = tempInstallerPath(`CursorSetup-x64-${version}.exe`);
    await downloadFile(url, dest);
    // Cursor's Windows installer is Inno Setup-based, not NSIS — it has
    // never actually recognized /S (that's an NSIS switch); Inno just
    // ignores unknown switches and falls back to its normal wizard, which
    // is exactly the "installer opens and waits for a click" symptom this
    // was causing. Cursor's own enterprise deployment docs confirm the real
    // switches are the standard Inno Setup silent set below. /LOG writes to
    // a file we can read back on failure so a silent-install problem shows
    // an actual reason instead of just "didn't work".
    const logPath = tempInstallerPath(`cursor-install-${version}.log`);
    info('Running the installer silently...');
    const installResult = runInstaller(dest, [
      '/VERYSILENT',
      '/SUPPRESSMSGBOXES',
      '/NORESTART',
      '/CLOSEAPPLICATIONS',
      `/LOG=${logPath}`,
    ]);
    const success = cursorInstalledOnWindows();
    if (!success) {
      if (installResult.error) info(`(installer error: ${installResult.error.message || installResult.error})`);
      try {
        if (fs.existsSync(logPath)) {
          const log = fs.readFileSync(logPath, 'utf8').trim();
          if (log) info(`Installer log (${logPath}):\n${log.split('\n').slice(-20).join('\n')}`);
        }
      } catch {
        // best-effort — not having the log is fine, just less diagnosable
      }
      warn('The silent install did not complete — see the log above for why.');
    }
    return { success };
  } catch (err) {
    warn(`Direct download install failed: ${err.message || err}`);
    return { success: false };
  }
}
 
async function installCursorMac() {
  if (commandExists('brew')) {
    const result = run('brew install --cask cursor');
    if (result.success) return { success: true };
    warn('Homebrew cask install for Cursor failed — falling back to a direct .dmg download.');
  }
  try {
    info('Looking up the latest Cursor release...');
    const { url, version } = await fetchLatestCursorDownload('darwin-universal');
    info(`Downloading Cursor ${version}...`);
    const dest = tempInstallerPath('Cursor.dmg');
    await downloadFile(url, dest);
    info('Mounting and installing...');
    const mountPoint = '/Volumes/Cursor-install-tmp';
    run(`hdiutil attach "${dest}" -nobrowse -mountpoint "${mountPoint}"`, { silent: true });
    const copyResult = run(`cp -R "${mountPoint}/Cursor.app" /Applications/`, { silent: true });
    run(`hdiutil detach "${mountPoint}"`, { silent: true });
    return { success: copyResult.success && fs.existsSync('/Applications/Cursor.app') };
  } catch (err) {
    warn(`Direct download install failed: ${err.message || err}`);
    return { success: false };
  }
}
 
async function installCursorLinux() {
  // The version-history feed only reliably lists an AppImage for Linux (no
  // consistent .deb/.rpm key across releases) — the AppImage also needs no
  // root, so it's used directly rather than guessing at a package format.
  try {
    info('Looking up the latest Cursor release...');
    const { url, version } = await fetchLatestCursorDownload('linux-x64');
    info(`Downloading Cursor ${version}...`);
    const appDir = path.join(homedir, 'Applications');
    fs.mkdirSync(appDir, { recursive: true });
    const dest = path.join(appDir, 'Cursor.AppImage');
    await downloadFile(url, dest);
    fs.chmodSync(dest, 0o755);
 
    // Wrap it so `cursor` works from a terminal like a normal command. On
    // its own, an AppImage in ~/Applications is invisible both to PATH
    // (nothing points at it) and to the desktop's application menu (no
    // .desktop entry) — which is exactly "installed, but nowhere to be
    // found." This fixes both halves of that.
    const wrapperDir = path.join(homedir, '.local', 'bin');
    fs.mkdirSync(wrapperDir, { recursive: true });
    const wrapperPath = path.join(wrapperDir, 'cursor');
    fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec "${dest}" --no-sandbox "$@"\n`);
    fs.chmodSync(wrapperPath, 0o755);
    addDirToUnixPath(wrapperDir);
 
    const desktopEntryDir = path.join(homedir, '.local', 'share', 'applications');
    fs.mkdirSync(desktopEntryDir, { recursive: true });
    const desktopEntry = [
      '[Desktop Entry]',
      'Name=Cursor',
      `Exec="${dest}" --no-sandbox %F`,
      'Terminal=false',
      'Type=Application',
      'Icon=cursor',
      'Categories=Development;',
      'StartupWMClass=Cursor',
    ].join('\n');
    fs.writeFileSync(path.join(desktopEntryDir, 'cursor.desktop'), desktopEntry + '\n');
    run(`update-desktop-database "${desktopEntryDir}"`, { silent: true }); // best-effort, fine if missing
 
    return { success: fs.existsSync(dest) };
  } catch (err) {
    warn(`AppImage download failed: ${err.message || err}`);
    return { success: false };
  }
}
 
async function installCursor() {
  if (isWindows ? cursorInstalledOnWindows() : commandExists('cursor')) {
    ok('Cursor is already installed.');
    return { success: true };
  }
 
  let result;
  if (isMac) result = await installCursorMac();
  else if (isWindows) result = await installCursorWindows();
  else result = await installCursorLinux();
 
  if (result.success) {
    ok('Cursor installed successfully.');
    return { success: true };
  }
 
  warn('Automatic Cursor install wasn\'t possible on this machine.');
  info('Download it manually from: https://cursor.com/download');
  openUrl('https://cursor.com/download');
  return { success: false };
}
 
// ---------------------------------------------------------------------------
// Claude Code — CLI + desktop app
// ---------------------------------------------------------------------------
//
// The CLI uses Anthropic's official native installer script (auto-updating,
// works identically cross-platform) rather than winget/npm — it's the
// documented recommended path and sidesteps the package-manager flakiness
// this tool already works around elsewhere. The desktop app has a confirmed
// direct-download API on macOS and an official apt repo on Linux; Windows
// has no confirmed direct-download/silent-install path today, so that one
// opens the official download page instead of guessing at a URL.
 
async function installClaudeCodeCli() {
  if (commandExists('claude')) {
    ok('Claude Code CLI is already installed.');
    return { success: true };
  }
 
  info('Installing the Claude Code CLI (official installer)...');
  if (isWindows) {
    run('irm https://claude.ai/install.ps1 | iex');
  } else {
    ensureCurlOnLinux();
    run('curl -fsSL https://claude.ai/install.sh | bash');
  }
  refreshWindowsPath();
 
  if (commandExists('claude')) {
    ok('Claude Code CLI installed successfully.');
    return { success: true };
  }
 
  // The native installer puts `claude` in ~/.local/bin — if a fresh
  // PATH refresh still doesn't see it, check that location directly and
  // add it ourselves rather than declaring failure.
  const localBinDir = path.join(homedir, '.local', 'bin');
  const fallbackBin = path.join(localBinDir, isWindows ? 'claude.exe' : 'claude');
  if (fs.existsSync(fallbackBin)) {
    if (isWindows) {
      addDirToWindowsPath(localBinDir);
      refreshWindowsPath();
    } else {
      addDirToUnixPath(localBinDir);
    }
    ok('Claude Code CLI installed successfully.');
    return { success: true };
  }
 
  warn('Automatic Claude Code CLI install didn\'t complete.');
  info('Try manually: ' + (isWindows ? 'irm https://claude.ai/install.ps1 | iex' : 'curl -fsSL https://claude.ai/install.sh | bash'));
  return { success: false };
}
 
async function installClaudeDesktopMac() {
  try {
    info('Downloading the Claude desktop app...');
    const dest = tempInstallerPath('Claude.dmg');
    await downloadFile('https://claude.ai/api/desktop/darwin/universal/dmg/latest/redirect', dest);
    info('Mounting and installing...');
    const mountPoint = '/Volumes/Claude-install-tmp';
    run(`hdiutil attach "${dest}" -nobrowse -mountpoint "${mountPoint}"`, { silent: true });
    const copyResult = run(`cp -R "${mountPoint}/Claude.app" /Applications/`, { silent: true });
    run(`hdiutil detach "${mountPoint}"`, { silent: true });
    return { success: copyResult.success && fs.existsSync('/Applications/Claude.app') };
  } catch (err) {
    warn(`Desktop app download failed: ${err.message || err}`);
    return { success: false };
  }
}
 
// Anthropic publishes a winget package (Anthropic.Claude) and, for
// enterprise/scripted deployment, a direct MSIX download — confirmed via
// Anthropic's own "Deploy Claude Desktop for Windows" documentation. MSIX
// packages install per-user with a plain `Add-AppxPackage`, no admin needed,
// since the package carries a trusted Anthropic code-signing certificate.
function isClaudeDesktopInstalledWindows() {
  const result = run('if (Get-AppxPackage -Name "*Claude*") { Write-Output "yes" } else { Write-Output "no" }', {
    silent: true,
  });
  return result.success && /yes/i.test(result.stdout || '');
}
 
async function installClaudeDesktopWindows() {
  if (ensureWinget()) {
    info('Trying winget...');
    const result = run(
      'winget install --id Anthropic.Claude -e --source winget --accept-package-agreements --accept-source-agreements'
    );
    if (result.success && isClaudeDesktopInstalledWindows()) return { success: true };
    warn('winget didn\'t get the Claude desktop app installed — falling back to a direct download.');
  }
 
  try {
    info('Downloading the official Claude desktop app (MSIX)...');
    const dest = tempInstallerPath('Claude.msix');
    await downloadFile('https://claude.ai/api/desktop/win32/x64/msix/latest/redirect', dest);
    info('Installing it...');
    const installResult = run(`Add-AppxPackage -Path "${dest}"`);
    const success = isClaudeDesktopInstalledWindows();
    if (!success && installResult.stderr) info(`(installer output: ${String(installResult.stderr).trim().slice(0, 300)})`);
    return { success };
  } catch (err) {
    warn(`Direct download install failed: ${err.message || err}`);
    return { success: false };
  }
}
 
async function installClaudeDesktopLinux() {
  if (!commandExists('apt-get')) return { success: false };
  ensureCurlOnLinux();
 
  // downloads.claude.ai is a different host than claude.ai (used for the
  // CLI install above) — a transient DNS/connectivity blip to this specific
  // host is a real possibility even when claude.ai itself just worked, so
  // this gets one immediate retry before giving up.
  let keyResult;
  for (let attempt = 1; attempt <= 2; attempt++) {
    keyResult = run(
      'sudo curl -fsSLo /usr/share/keyrings/claude-desktop-archive-keyring.asc https://downloads.claude.ai/claude-desktop/key.asc'
    );
    if (keyResult.success) break;
    if (attempt === 1) info('Couldn\'t reach downloads.claude.ai on the first try — retrying once...');
  }
  if (!keyResult.success) {
    warn('Still couldn\'t reach downloads.claude.ai.');
    info('This looks like a network/DNS/firewall issue reaching that specific host, rather than a bug in this tool — claude.ai itself was reachable moments ago for the CLI install.');
    return { success: false };
  }
 
  run(
    'echo "deb [arch=amd64,arm64 signed-by=/usr/share/keyrings/claude-desktop-archive-keyring.asc] https://downloads.claude.ai/claude-desktop/apt/stable stable main" | sudo tee /etc/apt/sources.list.d/claude-desktop.list'
  );
  run('sudo apt update');
  const installResult = run('sudo apt install -y claude-desktop');
  return { success: installResult.success && commandExists('claude-desktop') };
}
 
async function installClaudeDesktop() {
  if (isMac && fs.existsSync('/Applications/Claude.app')) {
    ok('Claude desktop app is already installed.');
    return { success: true };
  }
  if (isLinux && commandExists('claude-desktop')) {
    ok('Claude desktop app is already installed.');
    return { success: true };
  }
  if (isWindows && isClaudeDesktopInstalledWindows()) {
    ok('Claude desktop app is already installed.');
    return { success: true };
  }
 
  let result;
  if (isMac) result = await installClaudeDesktopMac();
  else if (isWindows) result = await installClaudeDesktopWindows();
  else result = await installClaudeDesktopLinux();
 
  if (result.success) {
    ok('Claude desktop app installed successfully.');
    return { success: true };
  }
 
  warn('Automatic Claude desktop app install wasn\'t possible on this machine.');
  info('Opening the download page — pick your OS and run the installer: https://claude.ai/download');
  openUrl('https://claude.ai/download');
  return { success: false };
}
 
async function installClaudeCode() {
  const cli = await installClaudeCodeCli();
  const desktop = await installClaudeDesktop();
  return { success: cli.success && desktop.success };
}
 
// ---------------------------------------------------------------------------
// Prompt + orchestration
// ---------------------------------------------------------------------------
 
const TOOLS = [
  { key: 'vscode', label: 'Visual Studio Code', install: installVSCode },
  { key: 'cursor', label: 'Cursor', install: installCursor },
  { key: 'claude-code', label: 'Claude Code (CLI + desktop app)', install: installClaudeCode },
];
 
function parseSelection(answer, tools) {
  if (/^all$/i.test(answer.trim())) return tools;
  const indices = answer
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= tools.length);
  return [...new Set(indices)].map((i) => tools[i - 1]);
}
 
module.exports = async function editor() {
  info('Which coding tool(s) do you want set up? You can pick more than one.');
  TOOLS.forEach((t, i) => info(`  ${i + 1}. ${t.label}`));
  warn('Whichever editor you use, never use the built-in Shopify code editor — you will lose work.');
 
  const answer = await ask('Enter numbers separated by commas (e.g. 1,3), or "all"', { defaultValue: 'all' });
  const selected = parseSelection(answer, TOOLS);
 
  if (!selected.length) {
    warn('No valid tools selected — skipping.');
    return { status: 'skipped' };
  }
 
  const results = [];
  for (const tool of selected) {
    heading(tool.label);
    const result = await tool.install();
    results.push({ tool: tool.label, success: result.success });
  }
 
  const anyFailed = results.some((r) => !r.success);
  const detail = results.map((r) => `${r.tool}: ${r.success ? 'ok' : 'failed'}`).join(', ');
  return { status: anyFailed ? 'failed' : 'ok', detail };
};