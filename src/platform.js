'use strict';

const os = require('os');

const platform = process.platform; // 'darwin' | 'win32' | 'linux' | ...

const isMac = platform === 'darwin';
const isWindows = platform === 'win32';
const isLinux = platform === 'linux';

if (!isMac && !isWindows && !isLinux) {
  console.error(
    `Unsupported platform: "${platform}". This tool supports macOS, Windows, and Linux only.`
  );
  process.exit(1);
}

const osLabel = isMac ? 'macOS' : isWindows ? 'Windows' : 'Linux';

// Best-effort Linux distro / package-manager detection. Only used to decide
// which install commands to try first — every install path still has a
// manual fallback printed if automation fails.
function detectLinuxPackageManager() {
  if (!isLinux) return null;
  const { commandExists } = require('./utils');
  if (commandExists('apt-get')) return 'apt';
  if (commandExists('dnf')) return 'dnf';
  if (commandExists('yum')) return 'yum';
  if (commandExists('pacman')) return 'pacman';
  if (commandExists('zypper')) return 'zypper';
  return null;
}

module.exports = {
  platform,
  isMac,
  isWindows,
  isLinux,
  osLabel,
  homedir: os.homedir(),
  detectLinuxPackageManager,
};
