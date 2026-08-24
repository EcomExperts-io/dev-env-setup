'use strict';

const fs = require('fs');
const path = require('path');
const {
  ok,
  warn,
  info,
  ask,
  run,
  runDirect,
  capture,
  commandExists,
  verifyWithRetry,
} = require('../utils');
const { isMac, isWindows, isLinux, homedir } = require('../platform');

const SSH_DIR = path.join(homedir, '.ssh');
const PRIVATE_KEY = path.join(SSH_DIR, 'id_rsa');
const PUBLIC_KEY = path.join(SSH_DIR, 'id_rsa.pub');
const VERIFY_REPO = 'git@github.com:EcomExperts-io/pipeline-rules.git';

function copyToClipboard(text) {
  try {
    if (isMac) {
      const { spawnSync } = require('child_process');
      spawnSync('pbcopy', { input: text });
      return true;
    }
    if (isWindows) {
      const { spawnSync } = require('child_process');
      spawnSync('clip', { input: text });
      return true;
    }
    if (isLinux) {
      const { spawnSync } = require('child_process');
      if (commandExists('xclip')) {
        spawnSync('xclip', ['-selection', 'clipboard'], { input: text });
        return true;
      }
      if (commandExists('wl-copy')) {
        spawnSync('wl-copy', { input: text });
        return true;
      }
    }
  } catch {
    // fall through
  }
  return false;
}

async function ensureGitIdentity() {
  const existingName = capture('git config --global user.name');
  const existingEmail = capture('git config --global user.email');
  if (existingName && existingEmail) {
    ok(`Git already configured as ${existingName} <${existingEmail}>`);
    return existingEmail;
  }

  info('Setting your global Git identity (used for every commit you make).');
  const name = await ask('Your full name for Git commits', { defaultValue: existingName });
  const email = await ask('Your EcomExperts email for Git commits', {
    defaultValue: existingEmail,
    validate: (v) => (/\S+@\S+\.\S+/.test(v) ? null : 'That doesn\'t look like a valid email.'),
  });
  run(`git config --global user.name "${name}"`);
  run(`git config --global user.email "${email}"`);
  ok(`Git identity set to ${name} <${email}>`);
  return email;
}

/**
 * Two-stage check: is this key recognized by GitHub at all, and separately,
 * does it actually have access to the EcomExperts-io org. These fail for
 * different reasons and need different advice, so they're kept distinct
 * rather than collapsed into one generic pass/fail.
 */
function testGithubAccess() {
  const authResult = run('ssh -T git@github.com -o StrictHostKeyChecking=accept-new', { silent: true });
  const authOutput = `${authResult.stdout || ''}${authResult.stderr || ''}`;
  if (!/successfully authenticated/i.test(authOutput)) {
    return {
      success: false,
      stage: 'auth',
      message:
        'GitHub doesn\'t recognize this key yet. Double-check it was pasted in full (no missing characters) at https://github.com/settings/keys, and that you clicked "Add SSH key".',
    };
  }

  const repoResult = run(`git ls-remote ${VERIFY_REPO} HEAD`, {
    silent: true,
    env: { GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new' },
  });
  if (!repoResult.success) {
    return {
      success: false,
      stage: 'org-access',
      message:
        'Your key works, but this GitHub account doesn\'t have access to the EcomExperts-io organization yet. Ask your lead to invite you, then try again.',
    };
  }

  return { success: true, stage: 'done' };
}

module.exports = async function githubSsh() {
  if (!commandExists('git')) {
    warn('Git isn\'t installed yet — can\'t configure GitHub SSH.');
    return { status: 'skipped' };
  }

  const email = await ensureGitIdentity();

  const hasKeyPair = fs.existsSync(PRIVATE_KEY) && fs.existsSync(PUBLIC_KEY);
  if (!hasKeyPair) {
    info('Generating a new SSH key pair for GitHub...');
    fs.mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
    // Invoked directly with a real argv array (not a shell string) — on
    // Windows, PowerShell's own command parsing can silently swallow the
    // empty `""` argument -N needs for "no passphrase", corrupting the
    // whole argument list and making ssh-keygen fail with a usage dump.
    const keygenResult = runDirect('ssh-keygen', [
      '-t', 'rsa',
      '-b', '4096',
      '-C', email,
      '-f', PRIVATE_KEY,
      '-N', '',
    ]);
    if (!keygenResult.success || !fs.existsSync(PUBLIC_KEY)) {
      warn('SSH key generation failed.');
      info(`Try manually: ssh-keygen -t rsa -b 4096 -C "${email}"`);
      return { status: 'failed', detail: 'ssh-keygen failed' };
    }
    ok('SSH key pair generated.');
  } else {
    ok('An SSH key pair already exists.');
  }

  // Best-effort: start the agent and add the key. Not fatal if it fails —
  // GitHub over SSH still works without an agent for a single key.
  if (isWindows) {
    run('Get-Service ssh-agent | Set-Service -StartupType Manual; Start-Service ssh-agent', { silent: true });
    runDirect('ssh-add', [PRIVATE_KEY], { silent: true });
  } else {
    run(`eval "$(ssh-agent -s)" >/dev/null 2>&1; ssh-add "${PRIVATE_KEY}" >/dev/null 2>&1`, { silent: true });
  }

  const publicKey = fs.readFileSync(PUBLIC_KEY, 'utf8').trim();
  const copied = copyToClipboard(publicKey);

  const { verified, skipped } = await verifyWithRetry({
    instructions() {
      info('\nHere\'s what to do, step by step:');
      info('  1. Go to https://github.com/settings/keys');
      info('  2. Click "New SSH key"');
      info('  3. Give it any title (e.g. your computer\'s name)');
      info('  4. Paste in the key below as the "Key" value, then click "Add SSH key"');
      info(`\n${publicKey}\n`);
      if (copied) ok('(That key is already copied to your clipboard, so you can just paste.)');
      else warn('Could not copy that to your clipboard automatically — copy the text above manually.');
      info('  5. Ask your lead to confirm you\'ve been invited to the EcomExperts-io GitHub org, if you haven\'t already.');
    },
    promptMessage: 'Once you\'ve added the key above, press Enter to test it (or type "skip" to continue without verifying)',
    testingMessage: 'Testing your GitHub connection and EcomExperts-io org access...',
    successMessage: 'GitHub SSH connection and EcomExperts-io org access confirmed.',
    test: async () => testGithubAccess(),
    onFailure: (result) => warn(result.message),
  });

  if (verified) return { status: 'ok' };
  if (skipped) return { status: 'failed', detail: 'skipped by user' };
  return { status: 'failed', detail: 'connection unverified' };
};
