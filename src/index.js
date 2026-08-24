'use strict';

const { runStep, refreshWindowsPath } = require('./utils');

// Make sure we start with the freshest possible view of PATH — the
// bootstrap script already does this before handing off, but this covers
// anyone who runs `node bin/setup.js` directly.
refreshWindowsPath();

const steps = [
  ['Welcome', require('./steps/01-welcome')],
  ['Folder structure', require('./steps/02-folder-structure')],
  ['Homebrew', require('./steps/03-homebrew')],
  ['Node & npm', require('./steps/04-node')],
  ['Git', require('./steps/05-git')],
  ['Ruby', require('./steps/06-ruby')],
  ['Shopify CLI', require('./steps/07-shopify-cli')],
  ['Shopify login', require('./steps/08-shopify-login')],
  ['Coding tools (editor / AI assistant)', require('./steps/09-editor')],
  ['GitHub SSH access', require('./steps/10-github-ssh')],
  ['Husky', require('./steps/11-husky')],
  ['CloneSetUp.sh', require('./steps/12-clone-setup')],
  ['Linting rules', require('./steps/13-linting-rules')],
  ['Slack', require('./steps/16-slack')],
  ['Time Doctor', require('./steps/17-timedoctor')],
  ['Oh My Zsh', require('./steps/14-oh-my-zsh')],
  ['Summary', require('./steps/15-summary')],
];

async function main() {
  const ctx = { results: [] };
  for (const [name, fn] of steps) {
    const result = await runStep(name, fn, ctx);
    ctx.results.push(result);
  }
  const anyFailed = ctx.results.some((r) => r.status === 'failed');
  process.exit(anyFailed ? 1 : 0);
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
