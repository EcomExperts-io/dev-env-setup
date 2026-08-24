'use strict';

const fs = require('fs');
const path = require('path');
const { ok, warn, info, run, commandExists, ensureWinget, openUrl } = require('../utils');
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

async function installSlackLinux() {
  if (commandExists('snap')) {
    info('Trying snap...');
    const result = run('sudo snap install slack');
    if (result.success && commandExists('slack')) return { success: true };
    warn('snap didn\'t get Slack installed via the default (strict) confinement — retrying with --classic...');
    const classicResult = run('sudo snap install slack --classic');
    if (classicResult.success && commandExists('slack')) return { success: true };
    warn('snap install of Slack failed both ways.');
  }
  return { success: commandExists('slack') };
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
