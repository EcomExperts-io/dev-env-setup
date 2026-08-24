'use strict';

const {
  ok,
  warn,
  info,
  run,
  commandExists,
  downloadFile,
  fetchJson,
  runInstaller,
  tempInstallerPath,
} = require('../utils');
const { isMac, isWindows, isLinux, detectLinuxPackageManager } = require('../platform');

async function installOnWindows() {
  // Try winget first — it's fastest when it works.
  if (commandExists('winget')) {
    info('Trying winget...');
    const result = run(
      'winget install --id Git.Git -e --source winget --accept-package-agreements --accept-source-agreements'
    );
    if (result.success && commandExists('git')) return { success: true };
    warn('winget didn\'t get Git installed — falling back to a direct download.');
  }

  // winget can silently fail when driven non-interactively even though it
  // works fine typed by hand, so don't depend on it: download the official
  // Git for Windows installer directly and run its silent-install flags.
  try {
    info('Downloading the official Git for Windows installer...');
    const release = await fetchJson('https://api.github.com/repos/git-for-windows/git/releases/latest');
    const asset = (release.assets || []).find((a) => /64-bit\.exe$/i.test(a.name));
    if (!asset) throw new Error('Could not find a 64-bit installer in the latest release');
    const dest = tempInstallerPath(asset.name);
    await downloadFile(asset.browser_download_url, dest);
    info('Running the installer silently...');
    const installResult = runInstaller(dest, ['/VERYSILENT', '/NORESTART', '/NOCANCEL', '/SP-']);
    return { success: installResult.success && commandExists('git') };
  } catch (err) {
    warn(`Direct download install failed: ${err.message || err}`);
    return { success: false };
  }
}

module.exports = async function git() {
  if (commandExists('git')) {
    ok('Git is already installed.');
    return { status: 'ok' };
  }

  info('Installing Git...');
  let success = false;

  if (isMac) {
    if (!commandExists('brew')) {
      warn('Homebrew isn\'t available, so Git can\'t be auto-installed.');
      info('Install manually: https://git-scm.com/downloads');
      return { status: 'failed', detail: 'brew missing' };
    }
    const result = run('brew install git');
    success = result.success && commandExists('git');
  } else if (isWindows) {
    success = (await installOnWindows()).success;
  } else if (isLinux) {
    const pm = detectLinuxPackageManager();
    const commands = {
      apt: 'sudo apt-get update && sudo apt-get install -y git',
      dnf: 'sudo dnf install -y git',
      yum: 'sudo yum install -y git',
      pacman: 'sudo pacman -Sy --noconfirm git',
      zypper: 'sudo zypper install -y git',
    };
    if (!pm || !commands[pm]) {
      warn('Could not detect a supported package manager.');
      info('Install Git manually: https://git-scm.com/downloads');
      return { status: 'failed', detail: 'no package manager' };
    }
    const result = run(commands[pm]);
    success = result.success && commandExists('git');
  }

  if (success) {
    ok('Git installed successfully.');
    return { status: 'ok' };
  }

  warn('Git install did not complete automatically.');
  info('Install manually: https://git-scm.com/downloads, then re-run this tool.');
  return { status: 'failed', detail: 'install failed' };
};
