'use strict';

const fs = require('fs');
const path = require('path');
const { ok, warn, info, run, gitCloneSsh, commandExists, refreshWindowsPath, addDirToWindowsPath } = require('../utils');
const { isWindows, homedir } = require('../platform');
const { DIRS, PIPELINE_RULES_REPO } = require('../config');

function shellRcFiles() {
  // Still useful on Windows for anyone whose actual terminal is Git Bash —
  // but most Windows devs here are in PowerShell/cmd, which never sources
  // .bashrc. That case is handled separately by addToWindowsPath() below.
  if (isWindows) return [path.join(homedir, '.bashrc')];

  const shell = process.env.SHELL || '';
  if (shell.includes('zsh')) return [path.join(homedir, '.zshrc')];
  if (shell.includes('bash')) return [path.join(homedir, '.bashrc')];
  // Unknown shell — write to both so the PATH export is picked up either way.
  return [path.join(homedir, '.bashrc'), path.join(homedir, '.zshrc')];
}

function addToUnixPath(dir) {
  const exportLine = `export PATH="${dir}:$PATH"`;
  const marker = '# Added by EcomExperts dev-setup';
  let addedTo = [];

  for (const rcFile of shellRcFiles()) {
    let content = '';
    try {
      content = fs.readFileSync(rcFile, 'utf8');
    } catch {
      // file may not exist yet — that's fine, we'll create it
    }
    if (content.includes(dir)) continue; // already there
    fs.appendFileSync(rcFile, `\n${marker}\n${exportLine}\n`);
    addedTo.push(rcFile);
  }
  return addedTo;
}

// Git for Windows ships its own bash.exe. commandExists('bash') covers the
// common case where it ended up on PATH; otherwise fall back to the usual
// install locations.
function findGitBash() {
  if (commandExists('bash')) return 'bash';
  const candidateDirs = [
    process.env['ProgramFiles'],
    process.env['ProgramFiles(x86)'],
    process.env['ProgramW6432'],
    process.env['LocalAppData'] ? path.join(process.env['LocalAppData'], 'Programs') : null,
  ].filter(Boolean);
  for (const dir of candidateDirs) {
    const candidate = path.join(dir, 'Git', 'bin', 'bash.exe');
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

// PowerShell/cmd can't run a raw .sh file directly even once it's on PATH —
// there's no file association for that extension, which is exactly the
// "not recognized" error this fixes. This wrapper forwards to Git's bundled
// bash so `CloneSetUp <repo-url>` works from an ordinary Windows prompt.
function writeWindowsWrapper(gitTemplatesDir, scriptFilename) {
  const bash = findGitBash();
  if (!bash) return { success: false };
  const scriptPath = path.join(gitTemplatesDir, scriptFilename);
  const wrapperPath = path.join(gitTemplatesDir, 'CloneSetUp.cmd');
  const bashInvoke = bash === 'bash' ? 'bash' : `"${bash}"`;
  fs.writeFileSync(wrapperPath, `@echo off\r\n${bashInvoke} "${scriptPath}" %*\r\n`);
  return { success: true, wrapperPath };
}

// The .cmd wrapper above fixes `CloneSetUp <repo-url>`, but people naturally
// keep typing `CloneSetUp.sh <repo-url>` too (it's the file's actual name,
// and what the original doc showed). PowerShell can't execute a `.sh` file
// itself, so — even once it's on PATH — it falls back to ShellExecute'ing
// it as a generic document (opening it in whatever app Windows associates
// with `.sh`) instead of running it, silently dropping the arguments.
// Rather than touch the system-wide `.sh` file association (which would
// change how *every* .sh file behaves, e.g. double-clicking one in
// Explorer), this defines a PowerShell function named `CloneSetUp.sh` in
// the user's own profile — PowerShell resolves functions before it ever
// looks at files on PATH, so this quietly wins over the file every time,
// in any PowerShell window, and forwards arguments correctly.
function windowsPowerShellProfilePaths() {
  return [
    path.join(homedir, 'Documents', 'WindowsPowerShell', 'Microsoft.PowerShell_profile.ps1'), // Windows PowerShell 5.1
    path.join(homedir, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1'), // PowerShell 7+
  ];
}

function ensureWindowsPowerShellShortcuts(wrapperCmdPath) {
  const marker = '# Added by EcomExperts dev-setup — CloneSetUp forwarding';
  // No quotes around the function names below — PowerShell's `function`
  // keyword needs a bare name token right after it ("function Foo { }");
  // a quoted string there ("function \"Foo\" { }") is a parse error, not
  // just a style choice. (A dot in an unquoted name like CloneSetUp.sh is
  // fine — PowerShell command/function names allow it unquoted.) This
  // used to ship with quotes, which broke every PowerShell window on a
  // machine that had already run this step — see the marker-scan repair
  // below for how an already-broken profile gets fixed on a re-run instead
  // of being permanently stuck once the marker makes it look "done".
  const block = [
    marker,
    'function CloneSetUp.sh {',
    `    & "${wrapperCmdPath}" @args`,
    '}',
    'function CloneSetUp {',
    `    & "${wrapperCmdPath}" @args`,
    '}',
    '',
  ].join('\r\n');

  const updated = [];
  for (const profilePath of windowsPowerShellProfilePaths()) {
    try {
      fs.mkdirSync(path.dirname(profilePath), { recursive: true });
      let content = '';
      try {
        content = fs.readFileSync(profilePath, 'utf8');
      } catch {
        // profile doesn't exist yet — fine, it'll be created
      }
      if (content.includes(marker)) {
        // Already added — but if it's the old broken (quoted-name) version
        // from before this fix, replace just that block rather than
        // leaving a permanently-parse-broken profile in place forever.
        if (/function\s+"CloneSetUp/.test(content)) {
          const startIdx = content.indexOf(marker);
          const afterMarker = content.slice(startIdx + marker.length);
          const closeIdx = afterMarker.lastIndexOf('}');
          if (closeIdx !== -1) {
            const before = content.slice(0, startIdx);
            const after = afterMarker.slice(closeIdx + 1);
            fs.writeFileSync(profilePath, before + block + after);
            updated.push(profilePath);
          }
        }
        continue;
      }
      const separator = content && !content.endsWith('\n') ? '\r\n' : '';
      fs.appendFileSync(profilePath, separator + block);
      updated.push(profilePath);
    } catch {
      // Best-effort — if a profile can't be written, `CloneSetUp` (the
      // .cmd wrapper) still works fine on its own.
    }
  }
  return updated;
}

module.exports = async function cloneSetup() {
  const pipelineRulesDir = path.join(DIRS.lintingRules, 'pipeline-rules');
  const cloneSetupSrc = path.join(pipelineRulesDir, 'CloneSetUp.sh');
  const cloneSetupDest = path.join(DIRS.gitTemplates, 'CloneSetUp.sh');

  if (!commandExists('git')) {
    warn('Git isn\'t installed yet — skipping CloneSetUp.sh.');
    return { status: 'skipped' };
  }

  if (!fs.existsSync(pipelineRulesDir)) {
    info('Cloning EcomExperts-io/pipeline-rules (this also provides the linting rules used later)...');
    const result = gitCloneSsh(PIPELINE_RULES_REPO, pipelineRulesDir);
    if (!result.success) {
      warn('Could not clone pipeline-rules — check that your GitHub SSH key was added and is active.');
      info(`Try manually: git clone ${PIPELINE_RULES_REPO} "${pipelineRulesDir}"`);
      return { status: 'failed', detail: 'clone failed' };
    }
  } else {
    ok('pipeline-rules already cloned.');
  }

  if (!fs.existsSync(cloneSetupSrc)) {
    warn('pipeline-rules was cloned but CloneSetUp.sh wasn\'t found inside it.');
    info('Ask your lead if the script has moved in that repo.');
    return { status: 'failed', detail: 'CloneSetUp.sh missing from repo' };
  }

  fs.copyFileSync(cloneSetupSrc, cloneSetupDest);
  try {
    fs.chmodSync(cloneSetupDest, 0o755);
  } catch {
    // chmod is a no-op on some Windows filesystems — harmless; the .cmd
    // wrapper below is what actually matters for running it there.
  }
  ok(`CloneSetUp.sh is ready in ${DIRS.gitTemplates}`);

  if (isWindows) {
    const wrapper = writeWindowsWrapper(DIRS.gitTemplates, 'CloneSetUp.sh');
    if (wrapper.success) {
      ok('Created CloneSetUp.cmd so it runs from PowerShell/cmd (not just Git Bash).');

      const updatedProfiles = ensureWindowsPowerShellShortcuts(wrapper.wrapperPath);
      if (updatedProfiles.length) {
        ok('Added a PowerShell profile shortcut — typing CloneSetUp.sh now works too, not just CloneSetUp.');
      }
    } else {
      warn('Could not find Git\'s bundled bash.exe to wrap CloneSetUp.sh for PowerShell/cmd.');
      info(`You can still run it from Git Bash: bash "${cloneSetupDest}" <repo-ssh-url>`);
    }

    const addedWindowsPath = addDirToWindowsPath(DIRS.gitTemplates);
    if (addedWindowsPath) {
      refreshWindowsPath();
      ok(`Added ${DIRS.gitTemplates} to your Windows PATH.`);
    } else {
      warn('Could not update your Windows PATH automatically.');
      info(`Add this folder to PATH manually: ${DIRS.gitTemplates}`);
    }
    const addedBashrc = addToUnixPath(DIRS.gitTemplates); // also covers Git Bash users
    if (addedBashrc.length) {
      ok(`Also added it to ${addedBashrc.join(', ')} for Git Bash.`);
    }

    if (!commandExists('CloneSetUp')) {
      info('If it isn\'t found yet, open a new PowerShell/cmd window — PATH and profile changes only apply to new sessions.');
    }
    info('From now on, clone EcomExperts repos with either: CloneSetUp <repo-ssh-url>  or  CloneSetUp.sh <repo-ssh-url>');
    return { status: 'ok' };
  }

  const addedTo = addToUnixPath(DIRS.gitTemplates);
  if (addedTo.length) {
    ok(`Added GitTemplates to your PATH in ${addedTo.join(', ')}`);
    info('Restart your terminal (or run `source` on that file) for this to take effect.');
  } else {
    ok('GitTemplates is already on your PATH.');
  }

  info('From now on, clone EcomExperts repos with: CloneSetUp.sh <repo-ssh-url>');
  return { status: 'ok' };
};
