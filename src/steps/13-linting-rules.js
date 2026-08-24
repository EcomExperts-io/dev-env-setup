'use strict';

const fs = require('fs');
const path = require('path');
const { ok, warn, info, run, gitCloneSsh, commandExists } = require('../utils');
const { DIRS, PIPELINE_RULES_REPO } = require('../config');

module.exports = async function lintingRules() {
  if (!commandExists('npm')) {
    warn('npm isn\'t available — skipping linting rules.');
    return { status: 'skipped' };
  }

  const lintingDir = DIRS.lintingRules;
  const pipelineRulesDir = path.join(lintingDir, 'pipeline-rules');
  const eslintPluginPath = path.join(lintingDir, 'node_modules', '@shopify', 'eslint-plugin');
  // Check each package explicitly rather than just "does eslint exist" —
  // eslint itself can get pulled in transitively by @shopify/eslint-plugin
  // without @babel/core or @babel/eslint-parser coming along with it.
  const babelCorePath = path.join(lintingDir, 'node_modules', '@babel', 'core');
  const babelParserPath = path.join(lintingDir, 'node_modules', '@babel', 'eslint-parser');
  const eslintBinPath = path.join(lintingDir, 'node_modules', '.bin', 'eslint');

  let allOk = true;

  if (fs.existsSync(eslintPluginPath)) {
    ok('@shopify/eslint-plugin already installed.');
  } else {
    info('Installing @shopify/eslint-plugin...');
    const r1 = run('npm install @shopify/eslint-plugin --save-dev', { cwd: lintingDir });
    if (r1.success) ok('@shopify/eslint-plugin installed.');
    else allOk = false;
  }

  if (fs.existsSync(babelCorePath) && fs.existsSync(babelParserPath) && fs.existsSync(eslintBinPath)) {
    ok('eslint + Babel parser already installed.');
  } else {
    info('Installing eslint, @babel/core, @babel/eslint-parser...');
    const r2 = run('npm install --save-dev eslint @babel/core @babel/eslint-parser', { cwd: lintingDir });
    if (r2.success) ok('eslint + Babel parser installed.');
    else allOk = false;
  }

  if (fs.existsSync(pipelineRulesDir)) {
    ok('pipeline-rules repo already cloned (controls theme-check, prettier, and ESLint rules).');
  } else if (commandExists('git')) {
    info('Cloning EcomExperts-io/pipeline-rules...');
    const r3 = gitCloneSsh(PIPELINE_RULES_REPO, pipelineRulesDir);
    if (!r3.success) allOk = false;
  } else {
    allOk = false;
  }

  if (allOk) {
    ok('Linting rules are set up.');
    return { status: 'ok' };
  }

  warn('One or more linting-rule installs didn\'t complete automatically.');
  info(`Retry manually in ${lintingDir}:`);
  info('  npm install @shopify/eslint-plugin --save-dev');
  info('  npm install --save-dev eslint @babel/core @babel/eslint-parser');
  info(`  git clone ${PIPELINE_RULES_REPO}`);
  return { status: 'failed', detail: 'one or more installs failed' };
};
