'use strict';

const { log, confirm, colors: c } = require('../utils');
const { osLabel } = require('../platform');
const { INTRO_VIDEOS } = require('../config');

module.exports = async function welcome() {
  log(c.bold(c.cyan('\n=======================================')));
  log(c.bold(c.cyan('  EcomExperts — Dev Environment Setup')));
  log(c.bold(c.cyan('=======================================')));
  log(`\nDetected OS: ${c.bold(osLabel)}`);
  log('\nThis will get your machine ready for EcomExperts development:');
  log('  Homebrew (Mac) · Node & npm · Git · Ruby · Shopify CLI · VS Code');
  log('  Folder structure · GitHub SSH keys · Husky · CloneSetUp.sh · Linting rules');
  log(
    `\n${c.yellow('Note:')} some things you already have installed will just be detected and skipped.`
  );
  log(`${c.yellow('Tip:')} if any step errors out, paste the error into ChatGPT before asking your lead — it's usually fast to fix.`);
  log('\nIntro videos (optional, worth watching first):');
  for (const url of INTRO_VIDEOS) log(`  - ${url}`);
  log(
    `\n${c.bold('Naming convention reminder:')} EcomExperts repos/folders use PascalCase (e.g. MyNewRepo), not kebab-case or snake_case.`
  );

  const proceed = await confirm('\nReady to start?', true);
  if (!proceed) {
    log('\nNo problem — run this again whenever you\'re ready.');
    process.exit(0);
  }
  return { status: 'ok' };
};
