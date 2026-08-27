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
    // Homebrew 6.0.0 (mid-2026) added "tap trust": by default it now
    // refuses to load any formula from a third-party tap — including
    // Shopify's own official one — until that formula (or the whole tap)
    // is explicitly trusted, exactly the "Refusing to load formula ...
    // from untrusted tap" + "Run `brew trust --formula ...`" error this
    // caused before this fix. Trusting just the one formula we need (not
    // the whole tap) ahead of time avoids ever hitting that error in the
    // first place. This is a no-op success-wise on an older Homebrew that
    // predates the feature (an unrecognized `brew trust` command just
    // fails harmlessly, silenced here so it doesn't look like a real
    // problem) and does nothing if the formula is already trusted.
    run('brew trust --formula shopify/shopify/shopify-cli', { silent: true });
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