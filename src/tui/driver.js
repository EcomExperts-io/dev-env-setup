'use strict';

// The terminal-UI's IO driver — same method names as utils.js's default
// console driver (log/heading/ok/skip/warn/fail/info/ask/confirm), but
// rendered into a blessed log widget and modal boxes instead of straight to
// stdout/readline. See utils.js's "pluggable IO driver" comment for why this
// is enough to make every existing step file work here completely
// unmodified — none of them know or care which driver is active.

const blessed = require('blessed');

// blessed interprets `{tag}` sequences for styling; anything a step prints
// (a URL, an error message, a literal SSH key comment) could coincidentally
// contain `{` or `}` and must not be treated as markup.
function esc(msg) {
  return blessed.escape(String(msg == null ? '' : msg));
}

function createBlessedDriver(screen, logBox) {
  function line(text) {
    logBox.log(text);
    screen.render();
  }

  const driver = {
    log(msg = '') {
      line(esc(msg));
    },
    heading(msg) {
      line(`\n{cyan-fg}{bold}▸ ${esc(msg)}{/bold}{/cyan-fg}`);
    },
    ok(msg) {
      line(`{green-fg}✔{/green-fg} ${esc(msg)}`);
    },
    skip(msg) {
      line(`{gray-fg}– ${esc(msg)}{/gray-fg}`);
    },
    warn(msg) {
      line(`{yellow-fg}!{/yellow-fg} ${esc(msg)}`);
    },
    fail(msg) {
      line(`{red-fg}✘{/red-fg} ${esc(msg)}`);
    },
    info(msg) {
      line(`{gray-fg}${esc(msg)}{/gray-fg}`);
    },

    // Modal text input — used for ask() (free text, e.g. a Git username) and
    // for things like the coding-tools multi-select ("Enter numbers...").
    ask(question, opts = {}) {
      return new Promise((resolve) => {
        const height = 7;
        const box = blessed.box({
          parent: screen,
          top: 'center',
          left: 'center',
          width: '70%',
          height,
          border: 'line',
          label: ' Input needed ',
          tags: true,
          style: { border: { fg: 'cyan' } },
        });
        blessed.text({
          parent: box,
          top: 0,
          left: 1,
          right: 1,
          height: 2,
          tags: true,
          content: `${esc(question)}${opts.defaultValue ? ` {gray-fg}(default: ${esc(opts.defaultValue)}){/gray-fg}` : ''}`,
        });
        const errorLine = blessed.text({
          parent: box,
          top: 2,
          left: 1,
          right: 1,
          height: 1,
          tags: true,
          content: '',
        });
        const input = blessed.textbox({
          parent: box,
          top: 3,
          left: 1,
          right: 1,
          height: 1,
          inputOnFocus: true,
          style: { fg: 'black', bg: 'white', focus: { fg: 'black', bg: 'white' } },
        });

        const previouslyFocused = screen.focused;

        function cleanupAndResolve(value) {
          box.destroy();
          if (previouslyFocused && previouslyFocused.detached !== true) {
            try {
              previouslyFocused.focus();
            } catch {
              /* previous widget may no longer be focusable — fine to ignore */
            }
          }
          screen.render();
          resolve(value);
        }

        function attempt() {
          input.readInput((err, value) => {
            const trimmed = ((value || '') + '').trim();
            const finalValue = trimmed || opts.defaultValue || '';
            if (opts.validate) {
              const errMsg = opts.validate(finalValue);
              if (errMsg) {
                errorLine.setContent(`{red-fg}${esc(errMsg)}{/red-fg}`);
                input.clearValue();
                screen.render();
                return attempt();
              }
            }
            cleanupAndResolve(finalValue);
          });
          screen.render();
        }

        screen.render();
        attempt();
      });
    },

    // Modal Yes/No — used for confirm().
    confirm(question, defaultYes = true) {
      return new Promise((resolve) => {
        const hint = defaultYes ? '(Y/n)' : '(y/N)';
        const box = blessed.box({
          parent: screen,
          top: 'center',
          left: 'center',
          width: '60%',
          height: 6,
          border: 'line',
          label: ' Confirm ',
          tags: true,
          keys: true,
          style: { border: { fg: 'cyan' } },
        });
        blessed.text({
          parent: box,
          top: 0,
          left: 1,
          right: 1,
          height: 2,
          tags: true,
          content: `${esc(question)} ${hint}`,
        });
        blessed.text({
          parent: box,
          top: 2,
          left: 1,
          right: 1,
          height: 1,
          tags: true,
          content: '{gray-fg}Y = Yes    N = No    Enter = default{/gray-fg}',
        });

        const previouslyFocused = screen.focused;

        function finish(value) {
          box.destroy();
          if (previouslyFocused && previouslyFocused.detached !== true) {
            try {
              previouslyFocused.focus();
            } catch {
              /* previous widget may no longer be focusable — fine to ignore */
            }
          }
          screen.render();
          resolve(value);
        }

        box.key(['y', 'Y'], () => finish(true));
        box.key(['n', 'N'], () => finish(false));
        box.key(['enter'], () => finish(defaultYes));
        box.key(['escape'], () => finish(defaultYes));
        box.focus();
        screen.render();
      });
    },
  };

  return driver;
}

module.exports = { createBlessedDriver };
