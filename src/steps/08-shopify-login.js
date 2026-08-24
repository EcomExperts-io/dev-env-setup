'use strict';

const { ok, warn, info, ask, run, commandExists, verifyWithRetry } = require('../utils');

const DEFAULT_VERIFY_STORE = 'legendsocks-com';

// Modern Shopify CLI (v3+) has no standalone "login" command — auth happens
// lazily, the first time you run a command that actually talks to a store,
// which pops open a browser for you to log in. `theme list` is a good
// verification command: it needs real auth, doesn't require a local theme
// project (unlike `theme dev`), and is read-only.
function testShopifyLogin(store) {
  info(`Running: shopify theme list --store=${store}`);
  info('(If a browser window opens asking you to log in, complete that there — this will wait.)');
  const result = run(`shopify theme list --store=${store}`, { timeoutMs: 5 * 60 * 1000 });
  if (result.timedOut) {
    return { success: false, message: 'That timed out after 5 minutes — the browser login may not have completed.' };
  }
  if (!result.success) {
    return {
      success: false,
      message: `Couldn't list themes on "${store}". Either the login didn't complete, or this account doesn't have access to that store.`,
    };
  }
  return { success: true };
}

module.exports = async function shopifyLogin() {
  if (!commandExists('shopify')) {
    warn('Shopify CLI isn\'t installed yet — can\'t verify login.');
    return { status: 'skipped' };
  }

  const storeInput = await ask(
    `Shopify store to verify your login against (blank = EcomExperts' shared verification store, ${DEFAULT_VERIFY_STORE})`,
    {}
  );
  const store = storeInput.trim() || DEFAULT_VERIFY_STORE;

  const { verified, skipped } = await verifyWithRetry({
    instructions() {
      info('\nNext, we\'ll confirm you\'re actually logged into a real Shopify account (not just that the CLI is installed).');
      info(`This runs a real command against "${store}" — if you're not logged in yet, Shopify will open a`);
      info('browser window for you to log into your Shopify/Partner account. Complete that, then come back here.');
    },
    promptMessage: 'Press Enter to run the login/verification check now (or type "skip" to continue without verifying)',
    testingMessage: `Verifying Shopify login against ${store}...`,
    successMessage: `Shopify login verified — able to list themes on ${store}.`,
    test: async () => testShopifyLogin(store),
    onFailure: (result) => warn(result.message),
  });

  if (verified) return { status: 'ok' };
  if (skipped) return { status: 'failed', detail: 'skipped by user' };
  return { status: 'failed', detail: 'login unverified' };
};
