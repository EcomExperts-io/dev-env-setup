'use strict';

const fs = require('fs');
const { ok, info } = require('../utils');
const { DIRS } = require('../config');

module.exports = async function folderStructure() {
  info('EcomExperts keeps a fixed folder layout under Documents/EcomExperts so shared');
  info('Git hooks and linting rules work the same way on every machine.');

  let createdAny = false;
  for (const [key, dir] of Object.entries(DIRS)) {
    if (fs.existsSync(dir)) continue;
    fs.mkdirSync(dir, { recursive: true });
    createdAny = true;
  }

  if (createdAny) {
    ok(`Folder structure ready at ${DIRS.root}`);
  } else {
    ok(`Folder structure already in place at ${DIRS.root}`);
  }

  info('(Client repo folders are created automatically later, when you clone a client repo.)');
  return { status: 'ok' };
};
