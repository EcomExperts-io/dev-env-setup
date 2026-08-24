'use strict';

const fs = require('fs');
const path = require('path');
const { ok, warn, info, commandExists, openUrl } = require('../utils');
const { isMac, isWindows, homedir } = require('../platform');

// ---------------------------------------------------------------------------
// Time Doctor desktop app
// ---------------------------------------------------------------------------
//
// Unlike everything else this tool installs, Time Doctor genuinely has no
// automatable silent-install path on any OS as of writing: no winget
// package, no Homebrew cask, no snap/apt/yum repo. Its downloads are also
// gated behind signing into a specific company's Time Doctor account first
// (there's no plain public installer link to fetch), and the vendor
// documents no silent-install flag for scripted deployment. So — unlike
// VS Code/Cursor/Claude desktop, which only fall back to a manual download
// if the automated path happens to fail on a given machine — this step
// can only ever check whether it's already installed, and otherwise hand
// off to a real human to sign in and download it themselves. If EcomExperts
// ever gets a company-specific silent-install MSI URL + INSTALLID from the
// Time Doctor admin dashboard, Windows automation could be wired in here.

function timeDoctorInstalledOnWindows() {
  if (commandExists('timedoctor')) return true;
  const local = process.env.LOCALAPPDATA || path.join(homedir, 'AppData', 'Local');
  const candidates = [
    path.join(local, 'Programs', 'Time Doctor', 'Time Doctor.exe'),
    path.join(local, 'Programs', 'timedoctor', 'Time Doctor.exe'),
  ];
  if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, 'Time Doctor', 'Time Doctor.exe'));
  return candidates.some((p) => fs.existsSync(p));
}

function timeDoctorAlreadyInstalled() {
  if (isMac) return fs.existsSync('/Applications/Time Doctor.app');
  if (isWindows) return timeDoctorInstalledOnWindows();
  return commandExists('timedoctor') || fs.existsSync('/opt/timedoctor');
}

module.exports = async function timeDoctor() {
  if (timeDoctorAlreadyInstalled()) {
    ok('Time Doctor is already installed.');
    return { status: 'ok' };
  }

  warn('Time Doctor can\'t be installed automatically on any OS — the vendor gates downloads behind a company account login and doesn\'t offer a scripted/silent install.');
  info('Opening the download page now — sign in with your EcomExperts Time Doctor account and run the installer: https://www.timedoctor.com/download');
  openUrl('https://www.timedoctor.com/download');
  info('Re-run this tool afterwards (or just this step) and it\'ll detect it and skip automatically.');
  return { status: 'skipped', detail: 'No automated install path — opened the download page for a manual install.' };
};
