'use strict';

const fs = require('fs');
const path = require('path');
const { ok, warn, info, run, commandExists } = require('../utils');
const { DIRS } = require('../config');

module.exports = async function husky() {
  if (!commandExists('npm')) {
    warn('npm isn\'t available — skipping Husky.');
    return { status: 'skipped' };
  }

  const clientsDir = DIRS.clients;
  const pkgJsonPath = path.join(clientsDir, 'package.json');
  const huskyPath = path.join(clientsDir, 'node_modules', 'husky');

  if (fs.existsSync(huskyPath)) {
    ok('Husky is already installed in the Clients folder.');
    return { status: 'ok' };
  }

  info('Installing Husky in the Clients folder (per EcomExperts convention — not in Packages).');

  if (!fs.existsSync(pkgJsonPath)) {
    run('npm init -y', { cwd: clientsDir, silent: true });
  }

  const result = run('npm install husky --save-dev', { cwd: clientsDir });
  if (result.success && fs.existsSync(huskyPath)) {
    ok('Husky installed.');
    return { status: 'ok' };
  }

  warn('Husky install did not complete automatically.');
  info(`Try manually in ${clientsDir}: npm install husky --save-dev`);
  return { status: 'failed', detail: 'install failed' };
};
