'use strict';

const { ok, skip, warn, info, run, commandExists } = require('../utils');
const { isMac } = require('../platform');

module.exports = async function homebrew() {
  if (!isMac) {
    skip('Not on macOS — Homebrew isn\'t needed.');
    return { status: 'skipped' };
  }

  if (commandExists('brew')) {
    ok('Homebrew is already installed.');
    return { status: 'ok' };
  }

  info('Installing Homebrew (this may ask for your Mac password)...');
  const result = run(
    '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"'
  );

  if (!result.success) {
    warn('Homebrew install did not finish automatically.');
    info('Install it manually: https://brew.sh, then re-run this tool.');
    return { status: 'failed', detail: 'Homebrew install script failed' };
  }

  if (commandExists('brew')) {
    ok('Homebrew installed successfully.');
    return { status: 'ok' };
  }

  warn('Homebrew installed but isn\'t on PATH yet in this session.');
  info('Close and reopen your terminal (or follow the "Next steps" printed above), then re-run this tool.');
  return { status: 'failed', detail: 'brew not on PATH after install' };
};
