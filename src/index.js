'use strict';

const { runStep, refreshWindowsPath } = require('./utils');
const { isWindows } = require('./platform');

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

// On Windows specifically, the legacy "Windows PowerShell" console host
// (conhost.exe — the classic blue window launched from the Start Menu,
// distinct from the separate Windows Terminal app) only partially supports
// the full-screen VT/ANSI rendering blessed relies on. In testing it showed
// up as genuinely corrupted, overlapping text — not a cosmetic quibble, an
// actively broken-looking screen — while the identical UI renders cleanly
// in Windows Terminal or VS Code's integrated terminal. A broken-looking
// GUI is worse than no GUI, so only offer the TUI there when there's a
// positive signal the terminal is one known to render it well.
function isModernTerminal() {
  if (!isWindows) return true; // macOS/Linux terminal emulators are reliably fine
  if (process.env.WT_SESSION) return true; // Windows Terminal
  if (process.env.TERM_PROGRAM === 'vscode') return true; // VS Code's integrated terminal
  return false;
}

// Default to the terminal UI whenever we're actually attached to a real
// interactive terminal (both stdin and stdout — a TUI needs to read
// keystrokes AND draw a full screen) that's also known to render it well.
// Falls back to the classic prompt-driven CLI for CI, piped output,
// `--cli`, an unsupported Windows console, or if blessed can't start for
// any reason at all — automatically, not as a manual step someone has to
// remember to run.
const canUseTui = Boolean(process.stdout.isTTY) && Boolean(process.stdin.isTTY) && isModernTerminal();

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
