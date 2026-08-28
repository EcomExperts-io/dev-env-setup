'use strict';
 
const fs = require('fs');
const { ok, skip, warn, info, run, commandExists, addDirToUnixPath } = require('../utils');
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
 
  // A fresh install doesn't put `brew` on THIS process's PATH by itself —
  // the official installer sets that up for *future* shells (typically via
  // .zprofile), which this already-running process never re-reads. On
  // Apple Silicon in particular that means the very next check below would
  // wrongly report failure even though the install just succeeded, and
  // every step after this one that needs Homebrew (Git, Shopify CLI) would
  // cascade-fail in the same run for the same reason. Same fix bootstrap.sh
  // already does before handing off to this tool (via `brew shellenv`) —
  // needed again here too since a direct `node bin/setup.js` run, or a run
  // where Homebrew genuinely wasn't installed yet when bootstrap.sh checked,
  // never goes through that.
  for (const brewBin of ['/opt/homebrew/bin', '/usr/local/bin']) {
    if (fs.existsSync(`${brewBin}/brew`)) addDirToUnixPath(brewBin);
  }
 
  if (commandExists('brew')) {
    ok('Homebrew installed successfully.');
    return { status: 'ok' };
  }
 
  warn('Homebrew installed but isn\'t on PATH yet in this session.');
  info('Close and reopen your terminal (or follow the "Next steps" printed above), then re-run this tool.');
  return { status: 'failed', detail: 'brew not on PATH after install' };
};