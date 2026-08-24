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
  if (commandExists('winget')) {
    info('Trying winget...');
    const result = run(
      'winget install --id RubyInstallerTeam.RubyWithDevKit -e --source winget --accept-package-agreements --accept-source-agreements'
    );
    if (result.success && commandExists('ruby')) return { success: true };
    warn('winget didn\'t get Ruby installed — falling back to a direct download.');
  }

  try {
    info('Downloading the official RubyInstaller (with DevKit)...');
    const release = await fetchJson('https://api.github.com/repos/oneclick/rubyinstaller2/releases/latest');
    // Prefer the DevKit x64 build — it bundles the MSYS2/MinGW toolchain
    // native gems (and the Shopify CLI) need to compile.
    const asset =
      (release.assets || []).find((a) => /devkit.*x64\.exe$/i.test(a.name)) ||
      (release.assets || []).find((a) => /x64\.exe$/i.test(a.name));
    if (!asset) throw new Error('Could not find a 64-bit installer in the latest release');
    const dest = tempInstallerPath(asset.name);
    await downloadFile(asset.browser_download_url, dest);
    info('Running the installer silently (this can take a minute)...');
    const installResult = runInstaller(dest, [
      '/VERYSILENT',
      '/SUPPRESSMSGBOXES',
      '/NORESTART',
      '/TASKS=modpath',
    ]);
    if (!installResult.success || !commandExists('ruby')) return { success: false };

    // The DevKit installer normally pauses at the end to ask which MSYS2
    // components to set up. `ridk install 3` picks that option (MSYS2 +
    // the MinGW dev toolchain) without the interactive menu, but the
    // underlying pacman step can still throw up its own "Proceed? [Y/n]"
    // confirmation and can take a while downloading the toolchain — so
    // this feeds an automatic "yes", keeps output visible instead of
    // hiding it, and gives up after 15 minutes rather than hanging forever
    // if something really is stuck waiting on input we didn't anticipate.
    if (commandExists('ridk')) {
      info('Finishing DevKit setup (MSYS2 build tools) — this can take several minutes, output below:');
      const ridkResult = run('ridk install 3', {
        autoConfirmInput: 'Y\n'.repeat(10),
        timeoutMs: 15 * 60 * 1000,
      });
      if (ridkResult.timedOut) {
        warn('DevKit build-tools setup was still running after 15 minutes, so it was stopped.');
        info('Ruby itself is installed and usable. If a later step fails needing to compile a native gem,');
        info('open a new terminal and run: ridk install 3');
      } else if (!ridkResult.success) {
        warn('DevKit build-tools setup didn\'t finish cleanly (non-fatal — Ruby itself is installed).');
        info('If a later step fails needing to compile a native gem, run: ridk install 3');
      }
    }
    return { success: true };
  } catch (err) {
    warn(`Direct download install failed: ${err.message || err}`);
    return { success: false };
  }
}

module.exports = async function ruby() {
  if (commandExists('ruby')) {
    ok('Ruby is already installed.');
    return { status: 'ok' };
  }

  info('Installing Ruby (needed for the Shopify CLI)...');

  if (isMac) {
    if (!commandExists('brew')) {
      warn('Homebrew isn\'t available.');
      info('Run: curl -sL https://raw.githubusercontent.com/Shopify/shopify-cli/master/scripts/install.sh | bash');
      return { status: 'failed', detail: 'brew missing' };
    }
    const result = run('brew install ruby');
    if (result.success && commandExists('ruby')) {
      ok('Ruby installed successfully.');
      return { status: 'ok' };
    }
    warn('Automatic Ruby install failed.');
    info('Try manually: curl -sL https://raw.githubusercontent.com/Shopify/shopify-cli/master/scripts/install.sh | bash');
    return { status: 'failed', detail: 'brew install ruby failed' };
  }

  if (isWindows) {
    const { success } = await installOnWindows();
    if (success) {
      ok('Ruby installed successfully.');
      return { status: 'ok' };
    }
    warn('Automatic Ruby install failed on Windows.');
    info('Download RubyInstaller (with Devkit) from https://rubyinstaller.org/downloads/');
    info('During setup, tick "Add Ruby executables to your PATH".');
    return { status: 'failed', detail: 'install failed' };
  }

  if (isLinux) {
    const pm = detectLinuxPackageManager();
    const commands = {
      apt: 'sudo apt-get update && sudo apt-get install -y ruby-full build-essential',
      dnf: 'sudo dnf install -y ruby ruby-devel gcc make',
      yum: 'sudo yum install -y ruby ruby-devel gcc make',
      pacman: 'sudo pacman -Sy --noconfirm ruby base-devel',
      zypper: 'sudo zypper install -y ruby ruby-devel gcc make',
    };
    if (pm && commands[pm]) {
      const result = run(commands[pm]);
      if (result.success && commandExists('ruby')) {
        ok('Ruby installed successfully.');
        return { status: 'ok' };
      }
    }
    warn('Automatic Ruby install failed or no supported package manager found.');
    info('Build from source per https://www.ruby-lang.org/en/documentation/installation/, then re-run this tool.');
    return { status: 'failed', detail: 'install failed' };
  }

  return { status: 'failed', detail: 'unreachable' };
};
