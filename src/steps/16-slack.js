'use strict';
 
const fs = require('fs');
const path = require('path');
const {
  ok,
  warn,
  info,
  run,
  commandExists,
  ensureWinget,
  openUrl,
  fetchBuffer,
  downloadFile,
  tempInstallerPath,
  installDebPackagePortable,
} = require('../utils');
const { isMac, isWindows, homedir } = require('../platform');
 
// ---------------------------------------------------------------------------
// Slack desktop app
// ---------------------------------------------------------------------------
//
// Slack publishes a real winget package (SlackTechnologies.Slack), a
// Homebrew cask (slack), and a Linux snap (slack) — all confirmed current
// and actively maintained, so this doesn't need any of the direct-download
// fallback machinery the editor step needs for less cooperative vendors.
 
function slackInstalledOnWindows() {
  if (commandExists('slack')) return true;
  const local = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  return fs.existsSync(path.join(local, 'slack', 'slack.exe'));
}
 
async function installSlackWindows() {
  if (ensureWinget()) {
    info('Trying winget...');
    const result = run(
      'winget install --id SlackTechnologies.Slack -e --source winget --accept-package-agreements --accept-source-agreements'
    );
    if (result.success && slackInstalledOnWindows()) return { success: true };
    warn('winget didn\'t get Slack installed.');
  }
  return { success: slackInstalledOnWindows() };
}
 
async function installSlackMac() {
  if (commandExists('brew')) {
    const result = run('brew install --cask slack');
    if (result.success) return { success: true };
    warn('Homebrew cask install for Slack failed.');
  }
  return { success: fs.existsSync('/Applications/Slack.app') };
}
 
// Slack's official Linux downloads page always links to the CURRENT
// version's .deb, with the version baked into the URL — there's no plain
// "latest" alias, so the version has to be discovered fresh each time
// rather than hardcoded. The download-instructions page itself is where
// that finished, versioned URL actually lives (confirmed by reading it:
// https://slack.com/downloads/instructions/linux?ddl=1&build=deb), so this
// just fetches that page as plain text and pulls the URL back out with a
// regex — no separate "check the latest version" step needed.
async function findLatestSlackDebUrl() {
  const buf = await fetchBuffer('https://slack.com/downloads/instructions/linux?ddl=1&build=deb');
  const html = buf.toString('utf8');
  const match = html.match(
    /https:\/\/downloads\.slack-edge\.com\/desktop-releases\/linux\/x64\/[\w.\-]+\/slack-desktop-[\w.\-]+-amd64\.deb/
  );
  if (!match) throw new Error('Could not find the current Slack .deb download URL on Slack\'s own download page');
  return match[0];
}
 
// Last-resort Slack install for Linux: no snap needed. Slack only publishes
// an official snap for Linux (no AppImage/tarball) — a dead end on a
// distro where snap isn't usable (SteamOS's confinement/immutable root
// makes snapd unreliable even if it were installed, and there's no snap
// there by default anyway). Slack does also publish .deb/.rpm downloads
// though, and a .deb is just a plain archive — installDebPackagePortable
// pulls it apart directly, no dpkg/apt/snap involved at all.
async function installSlackLinuxPortable() {
  try {
    info('Looking up the current Slack package (no snap needed)...');
    const url = await findLatestSlackDebUrl();
    info('Downloading Slack...');
    const dest = tempInstallerPath('slack-desktop.deb');
    await downloadFile(url, dest);
    info('Extracting (no dpkg/apt/snap needed)...');
    const result = await installDebPackagePortable({ debPath: dest, installDirName: 'slack' });
    return { success: result.success && commandExists(result.command) };
  } catch (err) {
    warn(`Package-manager-free install failed: ${err.message || err}`);
    return { success: false };
  }
}
 
async function installSlackLinux() {
  if (commandExists('snap')) {
    info('Trying snap...');
    const result = run('sudo snap install slack');
    if (result.success && commandExists('slack')) return { success: true };
    warn('snap didn\'t get Slack installed via the default (strict) confinement — retrying with --classic...');
    const classicResult = run('sudo snap install slack --classic');
    if (classicResult.success && commandExists('slack')) return { success: true };
    warn('snap install of Slack failed both ways — trying another way.');
  } else {
    info('No snap on this system — trying a package-manager-free install instead...');
  }
  return installSlackLinuxPortable();
}
 
async function installSlack() {
  const alreadyInstalled = isWindows
    ? slackInstalledOnWindows()
    : isMac
    ? fs.existsSync('/Applications/Slack.app')
    : commandExists('slack');
 
  if (alreadyInstalled) {
    ok('Slack is already installed.');
    return { success: true };
  }
 
  let result;
  if (isMac) result = await installSlackMac();
  else if (isWindows) result = await installSlackWindows();
  else result = await installSlackLinux();
 
  if (result.success) {
    ok('Slack installed successfully.');
    return { success: true };
  }
 
  warn('Automatic Slack install wasn\'t possible on this machine.');
  info('Opening the download page — pick your OS and run the installer: https://slack.com/downloads');
  openUrl('https://slack.com/downloads');
  return { success: false };
}
 
module.exports = async function slack() {
  const result = await installSlack();
  return { status: result.success ? 'ok' : 'failed' };
};