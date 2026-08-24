'use strict';

const { runStep, refreshWindowsPath } = require('./utils');

// Make sure we start with the freshest possible view of PATH — the
// bootstrap script already does this before handing off, but this covers
// anyone who runs `node bin/setup.js` directly.
refreshWindowsPath();

// 'Welcome' and 'Summary' are structural (an intro message, a final report)
// rather than something to opt in/out of — { toggleable: false } tells the
// terminal UI's checklist screen to always run them without listing them as
// a choice. Every other step defaults to checked there, same as "yes to
// everything" in the classic CLI.
const steps = [
  ['Welcome', require('./steps/01-welcome'), { toggleable: false }],
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
  ['Summary', require('./steps/15-summary'), { toggleable: false }],
];

async function runClassic() {
  const ctx = { results: [] };
  for (const [name, fn] of steps) {
    const result = await runStep(name, fn, ctx);
    ctx.results.push(result);
  }
  const anyFailed = ctx.results.some((r) => r.status === 'failed');
  process.exit(anyFailed ? 1 : 0);
}

const args = process.argv.slice(2);
const forceCli = args.includes('--cli');
const forceTui = args.includes('--tui') || args.includes('--gui');

// Default to the terminal UI whenever we're actually attached to a real
// interactive terminal (both stdin and stdout — a TUI needs to read
// keystrokes AND draw a full screen). Falls back to the classic prompt-driven
// CLI for CI, piped output, `--cli`, or if blessed can't start for any
// reason at all — automatically, not as a manual step someone has to
// remember to run.
const canUseTui = Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY);

async function main() {
  if (forceCli) {
    return runClassic();
  }
  if (forceTui || canUseTui) {
    try {
      const { runTui } = require('./tui/app');
      await runTui(steps);
      return;
    } catch (err) {
      console.error('Could not start the terminal UI (' + (err.message || err) + ').');
      console.error('Continuing in plain text mode instead...\n');
      // fall through to the classic CLI below
    }
  }
  return runClassic();
}

main().catch((err) => {
  console.error('\nUnexpected error:', err);
  process.exit(1);
});
