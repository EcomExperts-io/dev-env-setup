'use strict';

const { ok, warn, info, run, commandExists, ensureUserWritableNpmGlobal } = require('../utils');
const { isMac } = require('../platform');

module.exports = async function shopifyCli() {
  if (commandExists('shopify')) {
    ok('Shopify CLI is already installed.');
    return { status: 'ok' };
  }

  info('Installing Shopify CLI...');
  let result;

  if (isMac) {
    if (!commandExists('brew')) {
      warn('Homebrew isn\'t available.');
      info('Run: npm install -g @shopify/cli @shopify/theme');
      return { status: 'failed', detail: 'brew missing' };
    }
    run('brew tap shopify/shopify');
    result = run('brew install shopify-cli');
  } else {
    // Windows & Linux, per EcomExperts' documented approach. (04-node.js
    // already fixes a root-owned npm global dir up front, but this is
    // cheap and idempotent, so it's safe to make sure again right here.)
    ensureUserWritableNpmGlobal();
    result = run('npm install -g @shopify/cli @shopify/theme');
  }

  if (result.success && commandExists('shopify')) {
    ok('Shopify CLI installed successfully.');
    return { status: 'ok' };
  }

  warn('Shopify CLI install did not complete automatically.');
  info('Try manually: npm install -g @shopify/cli @shopify/theme');
  return { status: 'failed', detail: 'install failed' };
};
