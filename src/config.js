'use strict';

const path = require('path');
const { homedir, isWindows } = require('./platform');

const ROOT_DIR = path.join(homedir, 'Documents', 'EcomExperts');

const DIRS = {
  root: ROOT_DIR,
  clients: path.join(ROOT_DIR, 'Clients'),
  gitTemplates: path.join(ROOT_DIR, 'GitTemplates'),
  lintingRules: path.join(ROOT_DIR, 'LintingRules'),
  githubKeys: path.join(ROOT_DIR, 'GithubKeys'),
  packages: path.join(ROOT_DIR, 'Packages'),
};

const PIPELINE_RULES_REPO = 'git@github.com:EcomExperts-io/pipeline-rules.git';
const VSCODE_CUSTOM_LINK = 'https://share.ecomexperts.io/p9uebG7K';
const INTRO_VIDEOS = [
  'https://vimeo.com/901241912?share=copy',
  'https://vimeo.com/901266123?share=copy',
];

// State file used for idempotency bookkeeping that can't be inferred purely
// by checking the filesystem/PATH (e.g. "user chose to skip Oh My Zsh").
const STATE_FILE = path.join(ROOT_DIR, '.setup-state.json');

module.exports = {
  ROOT_DIR,
  DIRS,
  PIPELINE_RULES_REPO,
  VSCODE_CUSTOM_LINK,
  INTRO_VIDEOS,
  STATE_FILE,
  isWindows,
};
