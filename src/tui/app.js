'use strict';

// The in-terminal GUI (a "TUI" — think Chris Titus's WinUtil/linutil: a
// full-screen, keyboard-driven checklist that runs inside the terminal
// itself, not a separate window or browser tab).
//
// Deliberately thin: it does NOT reimplement any install logic. It reuses
// the exact same `steps` array and `runStep()`/`utils.js` machinery the
// classic text mode uses — see utils.js's "pluggable IO driver" comment for
// how that's possible without touching any of the 15 step files. This file
// only adds: a checklist screen to pick what to run, a live-updating
// sidebar + log while it runs, and wiring to suspend the full-screen
// display for the brief moments a child process needs the real terminal
// (winget, npm, an installer — see shellOutHook below).

const blessed = require('blessed');
const { runStep, setIoDriver, setShellOutHook } = require('../utils');
const { createBlessedDriver } = require('./driver');

const STATUS_ICON = { pending: '○', running: '●', ok: '✔', skipped: '–', failed: '✘' };
const STATUS_COLOR = { pending: 'gray', running: 'yellow', ok: 'green', skipped: 'gray', failed: 'red' };

async function runTui(steps) {
  const screen = blessed.screen({
    smartCSR: true,
    title: 'EcomExperts Dev Environment Setup',
    fullUnicode: true,
    dockBorders: true,
  });

  // Ctrl-C / q always quits, from anywhere, at any screen.
  screen.key(['C-c'], () => {
    screen.destroy();
    process.exit(130);
  });

  const exitCode = await new Promise((resolve) => {
    runSelectionScreen(screen, steps, (selectedIndexes) => {
      runExecutionScreen(screen, steps, selectedIndexes, resolve);
    });
  });

  screen.destroy();
  process.exitCode = exitCode;
}

// ---------------------------------------------------------------------------
// Screen 1: checklist — pick what to run
// ---------------------------------------------------------------------------

function runSelectionScreen(screen, steps, onContinue) {
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    tags: true,
    border: 'line',
    style: { border: { fg: 'cyan' } },
    content: '{center}{bold}EcomExperts Dev Environment Setup{/bold}{/center}\n{center}{gray-fg}Choose what to run, then press Enter to start{/gray-fg}{/center}',
  });

  const listBox = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    right: 0,
    bottom: 3,
    border: 'line',
    label: ' Steps ',
    tags: true,
    keys: true,
    scrollable: true,
    alwaysScroll: true,
    style: { border: { fg: 'cyan' } },
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    border: 'line',
    tags: true,
    style: { border: { fg: 'cyan' } },
    content: '{center}↑/↓ Move   Space Toggle   A Toggle all   Enter Start   Q Quit{/center}',
  });

  // Steps marked { toggleable: false } (Welcome, Summary) always run and
  // aren't shown as choices — everything else defaults to checked, matching
  // what the classic CLI already does today when someone just says yes to
  // everything.
  const rows = steps
    .map((step, index) => ({ index, name: step[0], toggleable: !(step[2] && step[2].toggleable === false) }))
    .filter((row) => row.toggleable);
  const checked = new Set(rows.map((row) => row.index));
  let cursor = 0;

  function render() {
    const lines = rows.map((row, i) => {
      const box = checked.has(row.index) ? '[x]' : '[ ]';
      const label = `${box} ${row.name}`;
      return i === cursor ? `{inverse}${label}{/inverse}` : label;
    });
    listBox.setContent(lines.join('\n'));
    screen.render();
  }

  listBox.key(['up', 'k'], () => {
    cursor = (cursor - 1 + rows.length) % rows.length;
    render();
  });
  listBox.key(['down', 'j'], () => {
    cursor = (cursor + 1) % rows.length;
    render();
  });
  listBox.key(['space'], () => {
    const idx = rows[cursor].index;
    if (checked.has(idx)) checked.delete(idx);
    else checked.add(idx);
    render();
  });
  listBox.key(['a', 'A'], () => {
    if (checked.size === rows.length) {
      checked.clear();
    } else {
      rows.forEach((row) => checked.add(row.index));
    }
    render();
  });
  listBox.key(['enter'], () => {
    header.destroy();
    listBox.destroy();
    footer.destroy();
    screen.render();
    onContinue(checked);
  });
  listBox.key(['q', 'Q'], () => {
    screen.destroy();
    process.exit(0);
  });

  listBox.focus();
  render();
}

// ---------------------------------------------------------------------------
// Screen 2: run — live sidebar + scrolling log
// ---------------------------------------------------------------------------

function runExecutionScreen(screen, steps, selectedIndexes, done) {
  const header = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    tags: true,
    border: 'line',
    style: { border: { fg: 'cyan' } },
    content: '{center}{bold}Running setup...{/bold}{/center}',
  });

  const sidebar = blessed.box({
    parent: screen,
    top: 3,
    left: 0,
    width: '35%',
    bottom: 3,
    border: 'line',
    label: ' Steps ',
    tags: true,
    style: { border: { fg: 'cyan' } },
  });

  const logBox = blessed.log({
    parent: screen,
    top: 3,
    left: '35%',
    right: 0,
    bottom: 3,
    border: 'line',
    label: ' Progress ',
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    mouse: true,
    keys: true,
    vi: true,
    scrollbar: { ch: ' ', inverse: true },
    style: { border: { fg: 'cyan' } },
  });

  const footer = blessed.box({
    parent: screen,
    bottom: 0,
    left: 0,
    right: 0,
    height: 3,
    border: 'line',
    tags: true,
    style: { border: { fg: 'cyan' } },
    content: '{center}{gray-fg}Working — please wait. Some steps need your input.{/gray-fg}{/center}',
  });

  const stepStates = steps.map((step) => ({
    name: step[0],
    status: 'pending',
  }));
  steps.forEach((step, i) => {
    const alwaysRuns = step[2] && step[2].toggleable === false;
    if (!alwaysRuns && !selectedIndexes.has(i)) {
      stepStates[i].status = 'skipped';
    }
  });

  function renderSidebar() {
    const lines = stepStates.map((s) => {
      const color = STATUS_COLOR[s.status];
      const icon = STATUS_ICON[s.status];
      return `{${color}-fg}${icon}{/${color}-fg} ${s.name}`;
    });
    sidebar.setContent(lines.join('\n'));
    screen.render();
  }

  // Hand the presentation layer to the TUI: every ok()/warn()/ask()/confirm()
  // call any step makes from here on renders into logBox / a modal, instead
  // of straight to stdout.
  const previousDriver = setIoDriver(createBlessedDriver(screen, logBox));

  // While a step shells out to something with real (inherited) terminal
  // output — winget, npm, a downloaded installer — step out of the
  // alternate screen entirely so that output isn't drawn over/corrupted by
  // blessed's own rendering, then restore the TUI right after. This is
  // blessed's own documented pause()/resume() pair, built for exactly this
  // ("run an external interactive program, then come back").
  const previousShellOutHook = setShellOutHook({
    before() {
      logBox.log('{gray-fg}(running a command — see below){/gray-fg}');
      screen.render();
      screen.program.pause();
    },
    after() {
      screen.program.resume();
      screen.render();
    },
  });

  renderSidebar();
  screen.render();

  (async () => {
    const ctx = { results: [] };
    for (let i = 0; i < steps.length; i++) {
      if (stepStates[i].status === 'skipped') {
        ctx.results.push({ name: steps[i][0], status: 'skipped', detail: 'skipped by choice' });
        continue;
      }
      stepStates[i].status = 'running';
      renderSidebar();
      const [name, fn] = steps[i];
      const result = await runStep(name, fn, ctx);
      stepStates[i].status = result.status;
      renderSidebar();
      ctx.results.push(result);
    }

    setIoDriver(previousDriver);
    setShellOutHook(previousShellOutHook);

    const anyFailed = ctx.results.some((r) => r.status === 'failed');
    header.setContent(`{center}{bold}${anyFailed ? 'Setup finished — some steps need attention' : 'Setup complete'}{/bold}{/center}`);
    footer.setContent('{center}Press any key (or Q) to exit{/center}');
    screen.render();

    screen.onceKey(['escape', 'q', 'Q', 'enter', 'space'], () => done(anyFailed ? 1 : 0));
  })().catch((err) => {
    setIoDriver(previousDriver);
    setShellOutHook(previousShellOutHook);
    logBox.log(`{red-fg}Unexpected error: ${blessed.escape(err.message || String(err))}{/red-fg}`);
    screen.render();
    screen.onceKey(['escape', 'q', 'Q', 'enter'], () => done(1));
  });
}

module.exports = { runTui };
