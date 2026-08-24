'use strict';

const fs = require('fs');
const path = require('path');
const { STATE_FILE } = require('./config');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return {};
  }
}

function writeState(partial) {
  const current = readState();
  const next = { ...current, ...partial };
  try {
    fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
    fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2));
  } catch {
    // Non-fatal — state is a convenience, not a requirement.
  }
  return next;
}

module.exports = { readState, writeState };
