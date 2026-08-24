'use strict';

const { log, colors: c } = require('../utils');
const { DIRS } = require('../config');

module.exports = async function summary(ctx) {
  const results = ctx.results;
  const ok = results.filter((r) => r.status === 'ok');
  const skipped = results.filter((r) => r.status === 'skipped');
  const failed = results.filter((r) => r.status === 'failed');

  log('\n' + c.bold(c.cyan('=======================================')));
  log(c.bold(c.cyan('  Setup summary')));
  log(c.bold(c.cyan('=======================================')));
  log(`${c.green(`${ok.length} completed`)} · ${c.gray(`${skipped.length} skipped`)} · ${failed.length ? c.red(`${failed.length} need attention`) : '0 need attention'}`);

  if (failed.length) {
    log('\n' + c.yellow('Steps that need a manual look:'));
    for (const step of failed) {
      log(`  ${c.red('✘')} ${step.name}${step.detail ? c.gray(` — ${step.detail}`) : ''}`);
    }
    log('\nRe-run this tool any time — completed steps are skipped automatically, so it only retries what\'s left.');
  } else {
    log('\n' + c.green('Everything is set up! 🎉'));
  }

  log(`\nYour EcomExperts workspace: ${DIRS.root}`);
  log('Next: clone a client repo with  CloneSetUp.sh <repo-ssh-url>  from inside the Clients folder.');
  log(c.dim('\nStuck on something? Paste the exact error into ChatGPT first — it\'s usually the fastest fix.\n'));

  return { status: 'ok' };
};
