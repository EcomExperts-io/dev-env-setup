'use strict';

// Zero-dependency ANSI color helpers. Falls back to plain text when the
// terminal doesn't support color (e.g. piped output, some CI runners).

const supportsColor =
  process.stdout.isTTY && process.env.TERM !== 'dumb' && !process.env.NO_COLOR;

function wrap(open, close) {
  return (str) => (supportsColor ? `\x1b[${open}m${str}\x1b[${close}m` : String(str));
}

module.exports = {
  bold: wrap(1, 22),
  dim: wrap(2, 22),
  red: wrap(31, 39),
  green: wrap(32, 39),
  yellow: wrap(33, 39),
  blue: wrap(34, 39),
  magenta: wrap(35, 39),
  cyan: wrap(36, 39),
  gray: wrap(90, 39),
};
