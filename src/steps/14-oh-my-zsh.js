'use strict';

const fs = require('fs');
const path = require('path');
const { ok, skip, warn, info, confirm, run, commandExists, ensureCurlOnLinux } = require('../utils');
const { isMac, isLinux, homedir, detectLinuxPackageManager } = require('../platform');

// Oh My Zsh's own installer refuses to run at all if zsh itself isn't
// installed ("Zsh is not installed. Please install zsh first.") — this
// tool never installed zsh as a prerequisite, so on a minimal machine
// without it, the install predictably failed. Install it first if needed.
function ensureZsh() {
  if (commandExists('zsh')) return true;
  if (isMac) {
    if (commandExists('brew')) run('brew install zsh');
  } else if (isLinux) {
    const pm = detectLinuxPackageManager();
    const commands = {
      apt: 'sudo apt-get update -y && sudo apt-get install -y zsh',
      dnf: 'sudo dnf install -y zsh',
      yum: 'sudo yum install -y zsh',
      pacman: 'sudo pacman -Sy --noconfirm zsh',
      zypper: 'sudo zypper install -y zsh',
    };
    if (pm && commands[pm]) run(commands[pm]);
  }
  return commandExists('zsh');
}

module.exports = async function ohMyZsh() {
  if (!isMac && !isLinux) {
    skip('Oh My Zsh isn\'t available on Windows.');
    return { status: 'skipped' };
  }

  const shell = process.env.SHELL || '';
  const ohMyZshDir = path.join(homedir, '.oh-my-zsh');

  if (fs.existsSync(ohMyZshDir)) {
    ok('Oh My Zsh is already installed.');
    return { status: 'ok' };
  }

  if (!shell.includes('zsh')) {
    info('Oh My Zsh boosts productivity on Zsh — your default shell isn\'t Zsh right now, so this is optional.');
  }

  const wantsIt = await confirm('Install Oh My Zsh? (optional, Mac/Linux only)', true);
  if (!wantsIt) {
    skip('Skipped Oh My Zsh by choice.');
    return { status: 'skipped' };
  }

  if (!commandExists('zsh')) {
    info('Zsh isn\'t installed yet — installing it first (Oh My Zsh requires it)...');
    if (!ensureZsh()) {
      warn('Could not install zsh automatically.');
      info('Install it manually (e.g. `sudo apt-get install zsh`), then re-run this tool.');
      return { status: 'failed', detail: 'zsh missing' };
    }
    ok('zsh installed.');
  }

  ensureCurlOnLinux();
  const result = run(
    'CHSH=no RUNZSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"'
  );

  if (result.success && fs.existsSync(ohMyZshDir)) {
    ok('Oh My Zsh installed.');
    return { status: 'ok' };
  }

  warn('Oh My Zsh install did not complete automatically.');
  info('See https://ohmyz.sh for manual instructions.');
  return { status: 'failed', detail: 'install failed' };
};
