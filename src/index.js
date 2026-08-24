'use strict';

const { runStep, refreshWindowsPath } = require('./utils');

// Last-resort safety net: if something genuinely unexpected slips past
// every step's own error handling (a rejected promise nobody awaited, a
// truly unanticipated exception), Node's default behavior is to print a
// stack trace and exit — but on Windows, whatever's hosting this process
// doesn't always keep that output on screen long enough to read before the
// window's done with it. Print it plainly and pause on a real keypress
// first, so "the tool just vanished with no error" (confusing and, worse,
// looks like nothing went wrong) can't happen — there's always at least
// one clear line explaining what broke and that a re-run is the fix, since
// every step here is designed to be safely re-run from the top.
function crashSafely(label, err) {
  console.error(`\n${label}:`, (err && err.stack) || err);
  console.error('\nThis was unexpected — every step here is safe to re-run, so running the tool again is the fix.');
  try {
    require('child_process').spawnSync(
      process.platform === 'win32' ? 'powershell.exe' : '/bin/sh',
      process.platform === 'win32' ? ['-NoProfile', '-Command', 'Read-Host "Press Enter to close"'] : ['-c', 'read _ 2>/dev/null || true'],
      { stdio: 'inherit' }
    );
  } catch {
    // best-effort — worst case the window closes without the pause
  }
  process.exit(1);
}

process.on('uncaughtException', (err) => crashSafely('Unexpected error', err));
process.on('unhandledRejection', (err) => crashSafely('Unexpected error (unhandled promise rejection)', err));

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

main().catch((err) => crashSafely('Unexpected error', err));
