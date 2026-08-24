'use strict';

const { ok, warn, info, capture, commandExists, ensureUserWritableNpmGlobal } = require('../utils');

module.exports = async function node() {
  // If this script is running at all, Node exists — but npm might not on a
  // very unusual install, and it's worth confirming the version out loud.
  const nodeVersion = capture('node -v');
  const npmVersion = commandExists('npm') ? capture('npm -v') : null;

  if (nodeVersion && npmVersion) {
    // System-installed Node (NodeSource's apt/dnf setup, or the distro's own
    // package) commonly leaves npm's global install directory root-owned,
    // which breaks `npm install -g` for later steps (Shopify CLI, etc.)
    // with a confusing EACCES error. Fix that once, here, before anything
    // downstream needs a global npm install.
    const npmFix = ensureUserWritableNpmGlobal();
    if (npmFix.changed) {
      ok(`Node ${nodeVersion} and npm ${npmVersion} are installed.`);
      info('Your npm couldn\'t install global packages without sudo — reconfigured it to use a user-owned global folder instead.');
    } else {
      ok(`Node ${nodeVersion} and npm ${npmVersion} are installed.`);
    }
    return { status: 'ok' };
  }

  if (nodeVersion && !npmVersion) {
    warn('Node is installed but npm was not found — that\'s unusual.');
    info('Try reinstalling Node from https://nodejs.org/en/download/ (npm ships bundled with it).');
    return { status: 'failed', detail: 'npm missing' };
  }

  warn('Could not detect a working Node.js install.');
  info('Download the LTS version from https://nodejs.org/en/download/ and re-run this tool.');
  return { status: 'failed', detail: 'node missing' };
};
