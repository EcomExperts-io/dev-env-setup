'use strict';
 
const { execSync, spawnSync, spawn } = require('child_process');
const readline = require('readline');
const https = require('https');
const zlib = require('zlib');
const fs = require('fs');
const os = require('os');
const path = require('path');
const c = require('./colors');
 
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';
 
// ---------------------------------------------------------------------------
// Open a URL in the default browser
// ---------------------------------------------------------------------------
//
// Shared fallback used by any step that needs to hand the user off to a
// download page it couldn't fully automate (e.g. a vendor with no
// winget/brew/snap package). Kept here so new steps don't have to redefine
// their own copy — 09-editor.js predates this and still carries its own
// local version, left untouched since it's already tested.
function openUrl(url) {
  if (isMac) run(`open "${url}"`, { silent: true });
  else if (isWindows) run(`Start-Process "${url}"`, { silent: true });
  else run(`xdg-open "${url}" 2>/dev/null`, { silent: true });
}
 
// ---------------------------------------------------------------------------
// Windows PATH refresh
// ---------------------------------------------------------------------------
//
// On Windows, this Node process only knows the PATH it was launched with.
// When a step installs something via winget (which writes the new PATH to
// the registry), this process's own `process.env.PATH` never updates —
// so the very next "did that install work?" check can wrongly report
// failure even though the install succeeded, until someone opens a brand
// new terminal. Re-reading PATH from the registry after every install
// sidesteps that entirely, so nobody ever has to restart their terminal
// mid-setup.
function refreshWindowsPath() {
  if (!isWindows) return;
  try {
    const result = spawnSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        '[System.Environment]::GetEnvironmentVariable("Path","Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path","User")',
      ],
      { stdio: 'pipe', encoding: 'utf8' }
    );
    if (result.status === 0 && result.stdout && result.stdout.trim()) {
      process.env.PATH = result.stdout.trim();
      process.env.Path = process.env.PATH; // Windows env lookups are case-insensitive, but be explicit
    }
  } catch {
    // Best-effort — worst case, a check runs against a slightly stale PATH.
  }
}
 
// Add a directory to the persistent Windows User PATH (registry) — needed
// for anything that must be found by a *future* PowerShell/cmd session,
// since editing process.env.PATH only ever affects this one Node process.
// Shared by any step that installs something Windows won't put on PATH by
// itself (e.g. CloneSetUp.sh's folder, the Claude Code CLI's install dir).
function addDirToWindowsPath(dir) {
  if (!isWindows) return false;
  const psCommand = [
    '$target = [System.EnvironmentVariableTarget]::User',
    "$current = [System.Environment]::GetEnvironmentVariable('Path', $target)",
    `$dir = '${dir.replace(/'/g, "''")}'`,
    "$parts = @(); if ($current) { $parts = $current -split ';' }",
    'if ($parts -notcontains $dir) {',
    '  $new = if ($current) { "$current;$dir" } else { $dir }',
    "  [System.Environment]::SetEnvironmentVariable('Path', $new, $target)",
    "  Write-Output 'added'",
    '} else {',
    "  Write-Output 'already-present'",
    '}',
  ].join('; ');
  const result = run(psCommand, { silent: true });
  return result.success;
}
 
// macOS/Linux counterpart to addDirToWindowsPath. A fresh terminal window
// only re-sources ~/.bashrc, not ~/.profile — and it's ~/.profile (on most
// distros) that conditionally adds ~/.local/bin to PATH, and only if that
// directory already existed at login time. Since this tool is often what
// creates ~/.local/bin in the first place (native Claude Code installer,
// the Cursor AppImage wrapper, ...), that directory can go right on being
// invisible to PATH forever, in *every* future terminal, not just this run
// — `command -v <tool>` fails, the tool looks "not installed" even though
// the file is sitting right there, and a re-run just downloads it again.
// This fixes both: it updates this process's own PATH immediately (so an
// immediate commandExists() check in the same run succeeds) and appends an
// export line to the shell rc file so future terminals see it too.
function addDirToUnixPath(dir) {
  if (isWindows) return false;
  if (!process.env.PATH.split(path.delimiter).includes(dir)) {
    process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
  }
  const marker = `# Added by EcomExperts dev-setup (${dir})`;
  const exportLine = `export PATH="${dir}:$PATH"`;
  const home = os.homedir();
  const shell = process.env.SHELL || '';
  const rcFiles = shell.includes('zsh')
    ? [path.join(home, '.zshrc')]
    : shell.includes('bash')
      ? [path.join(home, '.bashrc')]
      : [path.join(home, '.bashrc'), path.join(home, '.zshrc')];
  for (const rcFile of rcFiles) {
    let content = '';
    try {
      content = fs.readFileSync(rcFile, 'utf8');
    } catch {
      // file may not exist yet — that's fine, we'll create it
    }
    if (content.includes(dir)) continue;
    try {
      fs.appendFileSync(rcFile, `\n${marker}\n${exportLine}\n`);
    } catch {
      // best-effort — the current process still has it on PATH either way
    }
  }
  return true;
}
 
// ---------------------------------------------------------------------------
// Logging & prompts
// ---------------------------------------------------------------------------
 
function makeRl() {
  return readline.createInterface({ input: process.stdin, output: process.stdout });
}
 
function ask(question, { defaultValue, validate } = {}) {
  return new Promise((resolve) => {
    const rl = makeRl();
    const suffix = defaultValue ? c.dim(` (${defaultValue})`) : '';
    const doAsk = () => {
      rl.question(`${c.bold('?')} ${question}${suffix}: `, (answer) => {
        const value = answer.trim() || defaultValue || '';
        if (validate) {
          const errMsg = validate(value);
          if (errMsg) {
            console.log(c.red(`  ${errMsg}`));
            return doAsk();
          }
        }
        rl.close();
        resolve(value);
      });
    };
    doAsk();
  });
}
 
async function confirm(question, defaultYes = true) {
  const hint = defaultYes ? 'Y/n' : 'y/N';
  const answer = await ask(`${question} (${hint})`, {});
  if (!answer) return defaultYes;
  return /^y(es)?$/i.test(answer.trim());
}
 
function log(msg = '') {
  console.log(msg);
}
 
function heading(msg) {
  console.log('\n' + c.bold(c.cyan(`▸ ${msg}`)));
}
 
function ok(msg) {
  console.log(c.green('  ✔ ') + msg);
}
 
function skip(msg) {
  console.log(c.gray('  – ') + c.gray(msg));
}
 
function warn(msg) {
  console.log(c.yellow('  ! ') + msg);
}
 
function fail(msg) {
  console.log(c.red('  ✘ ') + msg);
}
 
function info(msg) {
  console.log(c.dim('  ' + msg));
}
 
// ---------------------------------------------------------------------------
// Shell execution
// ---------------------------------------------------------------------------
 
// On Windows, several real commands this tool runs (npm, npx, RubyInstaller's
// ridk) ship a .cmd file alongside a .ps1 shim of the same name — and
// PowerShell's own bare-name command resolution prefers the .ps1 over the
// .cmd, which drags totally ordinary commands like `npm install` under
// PowerShell's script-execution-policy check even though nothing here is
// "our" script. -ExecutionPolicy Bypass below covers the common case, but on
// a machine where IT enforces the policy via Group Policy
// (MachinePolicy/UserPolicy) — routine on managed company laptops — that
// scope always wins over any command-line override, and Bypass silently
// does nothing at all. The real fix is to never let PowerShell resolve the
// bare name in the first place: explicitly targeting the .cmd file sidesteps
// script-execution-policy entirely, since running a .cmd through its own
// interpreter isn't a PowerShell "script" and the policy just doesn't apply
// to it — regardless of scope, regardless of who set it. (ridk.ps1 itself
// confirms this is safe: for every subcommand except its two PowerShell-only
// ones, "enable"/"use", it just forwards straight to ridk.cmd anyway.)
function forceCmdShims(cmd) {
  // Only rewrite npm/npx/ridk when they stand alone as their own token (at
  // the start of the string, or after whitespace/a shell separator like
  // && ; |, and followed by whitespace/a quote/end-of-string) — never when
  // they're glued to other characters, e.g. inside a path component like
  // "...\.npm-global" or "...\npm.cmd", which must be left untouched.
  return cmd.replace(/(^|[\s;&|(])(npm|npx|ridk)(?=[\s"']|$)(?!\.(?:cmd|ps1|exe))/gi, '$1$2.cmd');
}
 
/**
 * Run a command, streaming stdio to the terminal. Returns true on success,
 * false on non-zero exit (never throws) unless opts.throwOnError is true.
 */
function run(cmd, opts = {}) {
  const shell = isWindows ? 'powershell.exe' : '/bin/bash';
  // -NoProfile avoids a slower start and any interference from a user's
  // PowerShell profile script.
  const shellArgs = isWindows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', forceCmdShims(cmd)]
    : ['-c', cmd];
  try {
    // Two independent knobs, since a command can need either or both:
    //   - opts.timeoutMs: never let a command hang the whole tool forever —
    //     important for anything that *might* be waiting on a prompt we
    //     don't know about.
    //   - opts.autoConfirmInput: feed canned stdin input (e.g. "Y\n") to
    //     auto-answer a yes/no prompt a command might throw up, while still
    //     showing its real output (unlike opts.silent, which hides output).
    const usingAutoConfirm = typeof opts.autoConfirmInput === 'string';
    const stdio = usingAutoConfirm ? ['pipe', 'inherit', 'inherit'] : opts.silent ? 'pipe' : 'inherit';
 
    const result = spawnSync(shell, shellArgs, {
      stdio,
      input: usingAutoConfirm ? opts.autoConfirmInput : undefined,
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      encoding: 'utf8',
      timeout: opts.timeoutMs,
    });
    // Any command here might have just installed something (winget, an
    // installer script, npm -g, ...) that changed PATH system-wide. Refresh
    // our view of it so the next commandExists()/run() call — usually the
    // "did that actually work?" check right after this one — sees it.
    refreshWindowsPath();
    const timedOut = result.error && result.error.code === 'ETIMEDOUT';
    if (timedOut) {
      return { success: false, status: result.status, timedOut: true, stdout: result.stdout, stderr: result.stderr };
    }
    if (result.error) throw result.error;
    if (result.status !== 0) {
      if (opts.throwOnError) {
        throw new Error(`Command failed (${result.status}): ${cmd}`);
      }
      return { success: false, status: result.status, stdout: result.stdout, stderr: result.stderr };
    }
    return { success: true, status: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    if (opts.throwOnError) throw err;
    return { success: false, status: -1, error: err };
  }
}
 
/**
 * Like run(), but for a command that isn't waiting on a person — something
 * fully unattended (no ask()/prompt in play) that can still occasionally
 * just hang, e.g. RubyInstaller's DevKit setup stalling out mid-way through
 * verifying MSYS2/pacman package signatures against a slow or unreachable
 * keyserver. A single long timeout doesn't help there: whatever it's stuck
 * on typically doesn't resolve itself no matter how long you wait, but
 * killing it and starting clean often does, since it's usually a transient
 * network hiccup rather than a real, permanent failure. So instead of one
 * opts.timeoutMs-long wait, this makes several shorter attempts — killing
 * and re-running the whole command from scratch each time one stalls out —
 * before finally giving up.
 *
 * This can't just be run() with a timeout, though (an earlier version of
 * this tried exactly that, and it didn't actually work): run() uses
 * spawnSync's built-in `timeout`, which only ever signals the ONE process
 * it directly spawned (powershell.exe on Windows) — not whatever THAT
 * process spawned underneath it. `ridk install 3` is powershell -> bash ->
 * pacman -> gpg, several layers deep, and on Windows especially, killing
 * just the top of that chain leaves everything under it running orphaned
 * in the background — including whatever pacman/gpg lock file it was
 * holding, which then makes an immediate retry hang again just as fast, on
 * the same lock. So this spawns the process itself (async, so it can watch
 * it directly) and on a stall, kills the WHOLE process tree — `taskkill
 * /T /F` on Windows, the whole process group via a negative pid on
 * Unix — before trying again.
 *
 * opts.timeoutMs is the per-attempt limit (default 5 minutes) and
 * opts.maxAttempts is how many times to retry a stall before giving up
 * (default 3) — so the worst-case total wait is bounded at
 * timeoutMs * maxAttempts, same order of magnitude as one long timeout
 * would have been, just with actual retries instead of one long shot.
 * Returns a Promise of the same result shape run() does; only ever
 * resolves timedOut: true if every attempt stalled out.
 */
function runWithTimeoutRetry(cmd, opts = {}) {
  const timeoutMs = opts.timeoutMs || 5 * 60 * 1000;
  const maxAttempts = opts.maxAttempts || 3;
  const usingAutoConfirm = typeof opts.autoConfirmInput === 'string';
  const captureOutput = !!opts.silent && !usingAutoConfirm;
 
  const shell = isWindows ? 'powershell.exe' : '/bin/bash';
  const shellArgs = isWindows
    ? ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', forceCmdShims(cmd)]
    : ['-c', cmd];
  const stdio = usingAutoConfirm ? ['pipe', 'inherit', 'inherit'] : captureOutput ? ['ignore', 'pipe', 'pipe'] : 'inherit';
 
  function killTree(pid) {
    if (isWindows) {
      spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      try {
        process.kill(-pid, 'SIGKILL'); // negative pid = whole process group (needs detached: true below)
      } catch {
        try {
          process.kill(pid, 'SIGKILL');
        } catch {
          // already gone — fine
        }
      }
    }
  }
 
  return new Promise((resolve) => {
    const runAttempt = (attemptNum) => {
      if (attemptNum > 1) {
        warn(`Still stuck after ${Math.round(timeoutMs / 60000)} min with no response — killing the whole process tree and trying again (attempt ${attemptNum}/${maxAttempts})...`);
      }
 
      let settled = false;
      let stalledThisAttempt = false;
      let stdout = '';
      let stderr = '';
 
      const child = spawn(shell, shellArgs, {
        stdio,
        cwd: opts.cwd,
        env: { ...process.env, ...(opts.env || {}) },
        detached: !isWindows,
      });
 
      if (captureOutput) {
        if (child.stdout) child.stdout.on('data', (d) => (stdout += d));
        if (child.stderr) child.stderr.on('data', (d) => (stderr += d));
      }
      if (usingAutoConfirm && child.stdin) {
        child.stdin.write(opts.autoConfirmInput);
        child.stdin.end();
      }
 
      const timer = setTimeout(() => {
        stalledThisAttempt = true;
        killTree(child.pid);
      }, timeoutMs);
 
      child.on('error', (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ success: false, status: -1, error: err });
      });
 
      child.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        refreshWindowsPath();
        if (stalledThisAttempt) {
          if (attemptNum < maxAttempts) {
            runAttempt(attemptNum + 1);
          } else {
            resolve({ success: false, status: code, timedOut: true, stdout, stderr });
          }
          return;
        }
        resolve({ success: code === 0, status: code, stdout, stderr });
      });
    };
 
    runAttempt(1);
  });
}
 
/**
 * Run a command by invoking the executable directly with an argv array —
 * no shell in between. This matters on Windows specifically: PowerShell's
 * `-Command "..."` re-tokenizes the whole string, and an empty quoted
 * argument (e.g. ssh-keygen's `-N ""` for "no passphrase") can get silently
 * dropped in that process, corrupting the argument list the target program
 * actually receives. Passing args as a real array sidesteps that entirely.
 */
function runDirect(command, args = [], opts = {}) {
  try {
    const result = spawnSync(command, args, {
      stdio: opts.silent ? 'pipe' : 'inherit',
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      encoding: 'utf8',
      timeout: opts.timeoutMs,
    });
    refreshWindowsPath();
    if (result.error) return { success: false, error: result.error };
    return { success: result.status === 0, status: result.status, stdout: result.stdout, stderr: result.stderr };
  } catch (err) {
    return { success: false, error: err };
  }
}
 
/** Run a command and capture stdout quietly (no streaming). */
function capture(cmd, opts = {}) {
  try {
    const out = execSync(cmd, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env || {}) },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return out.trim();
  } catch (err) {
    return null;
  }
}
 
/** Check whether a CLI command/binary is available on PATH. */
function commandExists(cmd) {
  if (isWindows) {
    refreshWindowsPath();
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Get-Command ${cmd} -ErrorAction SilentlyContinue`],
      {
        stdio: 'pipe',
        encoding: 'utf8',
        env: process.env,
      }
    );
    return result.status === 0 && result.stdout.trim().length > 0;
  }
  const result = spawnSync('/bin/bash', ['-c', `command -v ${cmd}`], {
    stdio: 'pipe',
    encoding: 'utf8',
  });
  return result.status === 0 && result.stdout.trim().length > 0;
}
 
// Every Windows step that installs something (Git, Ruby, VS Code, Cursor,
// the Claude desktop app, Slack) tries winget first, because a winget
// package is independently validated by winget-pkgs' own CI to actually
// install silently — a much safer bet than guessing an installer's real
// flags ourselves. All of that only helps on a machine that actually HAS
// winget, though, and plenty don't: it ships via the Microsoft Store app
// ("App Installer"), so it's commonly missing on a managed/locked-down
// company machine with Store access restricted, and on Windows Sandbox,
// whose minimal image doesn't include it either. Rather than let every one
// of those steps quietly fall back to a less-reliable direct-download path
// (or, for something like Slack which has no such fallback at all, give up
// and open a browser tab) on any machine like that, bootstrap winget itself
// first — Microsoft's own currently-documented method for exactly this
// (see "Install winget on Windows Sandbox" in their WinGet docs), using the
// official Microsoft.WinGet.Client PowerShell module instead of us chasing
// the right msixbundle/dependency/license files by hand. Memoized so only
// the first Windows step that needs winget pays for the bootstrap attempt;
// everything after it just sees winget already there (or already given up
// on, if it genuinely isn't reachable on this machine/network).
let wingetBootstrapAttempted = false;
 
function ensureWinget() {
  if (!isWindows) return false;
  if (commandExists('winget')) return true;
  if (wingetBootstrapAttempted) return commandExists('winget');
  wingetBootstrapAttempted = true;
 
  // This whole attempt is a nice-to-have, not something any step actually
  // depends on — every caller already has its own fallback for winget being
  // unavailable (a direct-download install, or in Slack's case, opening the
  // browser page). So no matter what goes wrong in here — PSGallery being
  // unreachable, a cmdlet throwing, anything — this must degrade back to
  // "winget still isn't available" and let the caller's existing fallback
  // handle it, never take down the rest of the tool with it.
  try {
    info('winget isn\'t available on this machine — bootstrapping it via Microsoft\'s official WinGet PowerShell module (no Microsoft Store needed)...');
 
    // Building blocks shared by both attempts below.
    //  - Trusting PSGallery up front avoids Install-Module's "Untrusted
    //    repository, are you sure? [Y/N]" confirmation — without this, that
    //    prompt just sits there forever on inherited stdio with nothing
    //    (and nobody) answering it, since this isn't an interactive step.
    //  - TLS 1.2 is forced explicitly because PowerShell 5.1 on an older
    //    Windows image doesn't always default to it, which otherwise fails
    //    silently against PSGallery/NuGet with no useful error at all.
    //  - The whole thing is wrapped in its own try/catch so a terminating
    //    error partway through (e.g. NuGet provider install failing) prints
    //    one clear warning line instead of the runaway PowerShell error
    //    output a semicolon-chained -Command would otherwise produce.
    const scriptFor = (scope) =>
      [
        "$ProgressPreference = 'SilentlyContinue'",
        'try {',
        '  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12',
        `  Install-PackageProvider -Name NuGet -Force -Scope ${scope} -ErrorAction Stop | Out-Null`,
        "  if (-not (Get-PSRepository -Name PSGallery -ErrorAction SilentlyContinue | Where-Object { $_.InstallationPolicy -eq 'Trusted' })) {",
        "    Set-PSRepository -Name PSGallery -InstallationPolicy Trusted -ErrorAction SilentlyContinue",
        '  }',
        `  Install-Module -Name Microsoft.WinGet.Client -Force -Repository PSGallery -Scope ${scope} -Confirm:$false -ErrorAction Stop | Out-Null`,
        scope === 'AllUsers' ? '  Repair-WinGetPackageManager -AllUsers' : '  Repair-WinGetPackageManager',
        '} catch {',
        '  Write-Warning $_.Exception.Message',
        '}',
      ].join('\n');
 
    // Try the all-users (machine-wide) install first — needs this process
    // to already be elevated, which it normally is by the time a Windows
    // step gets this far. A shorter, bounded timeout here on purpose: this
    // is a bonus setup step, not one worth tying up the whole tool over if
    // something about this specific machine/network makes it hang.
    run(scriptFor('AllUsers'), { timeoutMs: 3 * 60 * 1000 });
    refreshWindowsPath();
 
    if (!commandExists('winget')) {
      // Not elevated (or the machine-wide attempt otherwise failed) — retry
      // entirely per-user, which needs no admin rights at all.
      run(scriptFor('CurrentUser'), { timeoutMs: 3 * 60 * 1000 });
      refreshWindowsPath();
    }
 
    if (commandExists('winget')) {
      ok('winget is now available.');
      return true;
    }
    warn('Could not bootstrap winget on this machine — steps that use it will fall back to their own direct-download paths.');
    return false;
  } catch (err) {
    warn(`Bootstrapping winget hit an unexpected error (${err && err.message ? err.message : err}) — steps that use it will fall back to their own direct-download paths.`);
    return false;
  }
}
 
// A fresh/minimal Linux install (a bare VM image, for instance) may not
// have curl preinstalled at all — bootstrap.sh now handles that for the
// Node.js install itself, but several later steps (Claude Code CLI, Oh My
// Zsh, the Claude desktop apt repo) also pipe a script through curl. Failing
// deep inside `curl ... | bash` with a bare "command not found" is a much
// more confusing error than just installing curl first, so any step that's
// about to do that should call this first.
function ensureCurlOnLinux() {
  if (isWindows) return; // these steps use PowerShell's `irm` on Windows instead
  if (commandExists('curl')) return;
  if (commandExists('apt-get')) {
    run('sudo apt-get update -y', { silent: true });
    run('sudo apt-get install -y curl');
  } else if (commandExists('dnf')) {
    run('sudo dnf install -y curl');
  } else if (commandExists('yum')) {
    run('sudo yum install -y curl');
  } else if (commandExists('pacman')) {
    run('sudo pacman -Sy --noconfirm curl');
  } else if (commandExists('zypper')) {
    run('sudo zypper install -y curl');
  }
  // If none of the above matched (or the install failed), the caller's own
  // curl command will fail with its own clear error — nothing more to do.
}
 
// Node installed via a system package manager (NodeSource's apt/dnf setup,
// or the distro's own `nodejs` package) puts npm's global install directory
// somewhere root-owned (typically /usr/lib/node_modules) — so a plain
// `npm install -g <pkg>` fails with EACCES for the normal user this tool
// runs as. The fix isn't `sudo npm install -g` per package (npm's own docs
// warn against that — it leaves root-owned files in the user's npm cache
// and can quietly break *future* unprivileged installs); it's to point npm
// at a user-owned global prefix once, which is npm's own documented fix.
// Homebrew-installed Node on macOS is already user-owned, so this is a
// no-op there in practice.
function ensureUserWritableNpmGlobal() {
  if (isWindows) return { changed: false }; // npm's default global dir on Windows is already per-user
  if (!commandExists('npm')) return { changed: false };
 
  const currentPrefix = capture('npm config get prefix') || '';
  const home = os.homedir();
  if (currentPrefix.startsWith(home)) return { changed: false }; // already user-owned
 
  try {
    fs.accessSync(currentPrefix, fs.constants.W_OK);
    return { changed: false }; // current prefix is writable as-is
  } catch {
    // not writable — the classic "system Node, root-owned global dir" case
  }
 
  const newPrefix = path.join(home, '.npm-global');
  const binDir = path.join(newPrefix, 'bin');
  try {
    fs.mkdirSync(binDir, { recursive: true });
  } catch {
    return { changed: false };
  }
  const setResult = run(`npm config set prefix "${newPrefix}"`, { silent: true });
  if (!setResult.success) return { changed: false };
 
  // Make it usable immediately in this same process, not just future shells.
  if (!process.env.PATH.split(path.delimiter).includes(binDir)) {
    process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
  }
 
  // Persist it for future terminals too.
  const marker = '# Added by EcomExperts dev-setup — user-writable npm global prefix';
  const exportLine = `export PATH="${binDir}:$PATH"`;
  const shell = process.env.SHELL || '';
  const rcFiles = shell.includes('zsh')
    ? [path.join(home, '.zshrc')]
    : shell.includes('bash')
      ? [path.join(home, '.bashrc')]
      : [path.join(home, '.bashrc'), path.join(home, '.zshrc')];
  for (const rcFile of rcFiles) {
    let content = '';
    try {
      content = fs.readFileSync(rcFile, 'utf8');
    } catch {
      // file may not exist yet — that's fine, we'll create it
    }
    if (content.includes(binDir)) continue;
    try {
      fs.appendFileSync(rcFile, `\n${marker}\n${exportLine}\n`);
    } catch {
      // best-effort — the current process still has it on PATH either way
    }
  }
 
  return { changed: true, binDir };
}
 
// ---------------------------------------------------------------------------
// Direct downloads (fallback path when a package manager is unreliable)
// ---------------------------------------------------------------------------
//
// winget can be flaky in ways that are hard to detect from the outside: it
// can work fine when a person types the exact same command by hand, yet
// fail silently (or half-succeed) when driven non-interactively from a
// script. Rather than depend on that, install steps fall back to
// downloading the vendor's own installer directly and running it with its
// documented silent-install flags — the same approach winget itself uses
// under the hood, minus the extra layer that was misbehaving.
 
/** Download a URL to a local file, following redirects. Returns the path. */
function downloadFile(url, destPath, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
    const request = https.get(url, { headers: { 'User-Agent': 'ecomexperts-dev-setup' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(downloadFile(res.headers.location, destPath, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} downloading ${url}`));
      }
      const file = fs.createWriteStream(destPath);
      res.pipe(file);
      file.on('finish', () => file.close(() => resolve(destPath)));
      file.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(60000, () => request.destroy(new Error('Download timed out')));
  });
}
 
/** Fetch and JSON-parse a URL, following redirects (e.g. GitHub's releases API). */
function fetchJson(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
    const request = https.get(
      url,
      { headers: { 'User-Agent': 'ecomexperts-dev-setup', Accept: 'application/vnd.github+json' } },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          return resolve(fetchJson(res.headers.location, redirectsLeft - 1));
        }
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (err) {
            reject(err);
          }
        });
      }
    );
    request.on('error', reject);
    request.setTimeout(30000, () => request.destroy(new Error('Request timed out')));
  });
}
 
/** Fetch a URL and resolve with the raw response body as a Buffer, following redirects. */
function fetchBuffer(url, redirectsLeft = 5) {
  return new Promise((resolve, reject) => {
    if (redirectsLeft < 0) return reject(new Error('Too many redirects'));
    const request = https.get(url, { headers: { 'User-Agent': 'ecomexperts-dev-setup' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        return resolve(fetchBuffer(res.headers.location, redirectsLeft - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    request.on('error', reject);
    request.setTimeout(30000, () => request.destroy(new Error('Request timed out')));
  });
}
 
// ---------------------------------------------------------------------------
// Installing straight from a plain Debian apt repo, without apt or dpkg
// ---------------------------------------------------------------------------
//
// A few tools (Slack, the Claude desktop app) only publish official Linux
// builds through a package manager (apt repo, snap) — no plain "download
// and run" tarball/AppImage the way VS Code and Cursor do. That's a real
// dead end on a distro whose package manager isn't usable for general
// installs (SteamOS's pacman being the concrete case this exists for — see
// the matching note in bootstrap.sh — but the same applies to any Linux
// without a working apt/snap). Since a .deb is just a plain archive (an
// `ar` file containing a data.tar.* with the actual files, standard Debian
// binary package format, nothing proprietary), it can be pulled apart and
// installed into a normal user-writable location without dpkg or apt ever
// being involved — the same idea as the Node.js/VS Code tarball fallbacks,
// just with an extra unwrapping step first.
 
function maybeGunzip(buf) {
  // gzip magic bytes (0x1f 0x8b) — Packages indexes are almost always
  // served gzip-compressed (Packages.gz); this makes decompression
  // transparent regardless of which variant a given repo actually returns.
  if (buf.length > 2 && buf[0] === 0x1f && buf[1] === 0x8b) return zlib.gunzipSync(buf);
  return buf;
}
 
/**
 * Look up a package's exact current download path from a standard Debian
 * repository's Packages index — a plain HTTPS GET, no apt/dpkg needed.
 * `repoBaseUrl` is the URL as it appears in a sources.list line, before the
 * trailing " <suite> <component>" — e.g. for
 * "deb [...] https://downloads.claude.ai/claude-desktop/apt/stable stable main"
 * that's "https://downloads.claude.ai/claude-desktop/apt/stable".
 */
async function findAptPackageDownloadUrl({ repoBaseUrl, suite, component, arch, packageName }) {
  const base = `${repoBaseUrl}/dists/${suite}/${component}/binary-${arch}`;
  let raw;
  try {
    raw = maybeGunzip(await fetchBuffer(`${base}/Packages.gz`));
  } catch {
    raw = maybeGunzip(await fetchBuffer(`${base}/Packages`));
  }
  const text = raw.toString('utf8');
  // Packages files are a sequence of deb822 stanzas separated by a blank
  // line — split on that, then find the stanza for our package by name.
  const stanzas = text.split(/\n\s*\n/);
  for (const stanza of stanzas) {
    const nameMatch = stanza.match(/^Package:\s*(.+)$/m);
    if (!nameMatch || nameMatch[1].trim() !== packageName) continue;
    const filenameMatch = stanza.match(/^Filename:\s*(.+)$/m);
    if (!filenameMatch) continue;
    const versionMatch = stanza.match(/^Version:\s*(.+)$/m);
    return {
      url: `${repoBaseUrl}/${filenameMatch[1].trim()}`,
      version: versionMatch ? versionMatch[1].trim() : null,
    };
  }
  return null;
}
 
/**
 * Pull one member out of a plain Unix `ar` archive — the container format
 * .deb files use — without needing the `ar` binary installed (not a safe
 * assumption on a minimal/locked-down distro). Just enough of the format to
 * find a member by name prefix and return its raw bytes: an 8-byte magic
 * header, then repeated 60-byte member headers (name, mtime, uid, gid,
 * mode, size, end-marker) each followed by that many bytes of data, padded
 * to an even offset.
 */
function extractArMember(arFilePath, nameStartsWith) {
  const buf = fs.readFileSync(arFilePath);
  const MAGIC = '!<arch>\n';
  if (buf.toString('binary', 0, MAGIC.length) !== MAGIC) {
    throw new Error(`${arFilePath} doesn't look like a valid ar archive (bad magic)`);
  }
  let offset = MAGIC.length;
  while (offset + 60 <= buf.length) {
    const header = buf.toString('binary', offset, offset + 60);
    const name = header.slice(0, 16).trim().replace(/\/$/, '');
    const size = parseInt(header.slice(48, 58).trim(), 10);
    if (!Number.isFinite(size)) break; // corrupt/unexpected — bail rather than loop forever
    const dataStart = offset + 60;
    if (name.startsWith(nameStartsWith)) {
      return buf.subarray(dataStart, dataStart + size);
    }
    offset = dataStart + size + (size % 2); // members are 2-byte aligned
  }
  return null;
}
 
/**
 * Install a .deb package's payload into a private, user-writable location
 * — no dpkg/apt involved at all. Extracts the package's full data.tar.*
 * tree, then finds the .desktop entry it ships to discover the actual
 * command it wants to run and its icon (far more reliable than guessing
 * each vendor's internal layout — e.g. whether the real binary lives under
 * /usr/bin or /usr/lib/<name>/ — by hand), and wires up a wrapper on PATH
 * plus a corrected desktop entry pointing at the extracted files.
 */
async function installDebPackagePortable({ debPath, installDirName }) {
  const dataMember = extractArMember(debPath, 'data.tar');
  if (!dataMember) throw new Error('Could not find a data.tar.* member inside the .deb — unexpected package format');
 
  const rootDir = path.join(os.homedir(), '.local', 'share', 'ecomexperts-dev-setup', installDirName, 'root');
  fs.mkdirSync(rootDir, { recursive: true });
  const dataTarPath = tempInstallerPath(`${installDirName}-data.tar`);
  fs.writeFileSync(dataTarPath, dataMember);
 
  // tar autodetects gzip/xz/zstd compression from the file itself, so this
  // works regardless of which one dpkg used for this particular package.
  const extractResult = run(`tar -xf "${dataTarPath}" -C "${rootDir}"`, { silent: true });
  if (!extractResult.success) throw new Error('Could not extract the package payload (data.tar.*) — tar failed');
 
  const desktopSearch = run(
    `find "${rootDir}/usr/share/applications" -maxdepth 1 -name '*.desktop' 2>/dev/null | head -1`,
    { silent: true }
  );
  const desktopFilePath = (desktopSearch.stdout || '').trim();
  if (!desktopFilePath || !fs.existsSync(desktopFilePath)) {
    throw new Error('Extracted the package but could not find its .desktop entry to determine how to run it');
  }
  const desktopContent = fs.readFileSync(desktopFilePath, 'utf8');
  const execMatch = desktopContent.match(/^Exec=(.+)$/m);
  if (!execMatch) throw new Error("The package's .desktop entry has no Exec= line");
 
  // Exec= lines look like "/usr/bin/slack %U" or "slack-desktop %U" — take
  // just the command token (first word) and its bare filename; the actual
  // binary is somewhere under the extracted tree (often a symlink chain
  // from /usr/bin/<name> into /usr/lib/<name>/<name>), which a plain
  // recursive search for that exact filename finds either way, without
  // needing to know this vendor's specific internal layout in advance.
  const execCommand = execMatch[1].trim().split(/\s+/)[0].replace(/^"|"$/g, '');
  const execBaseName = path.basename(execCommand);
 
  // -type f matters here: a plain name search also matches the containing
  // directory itself when a vendor lays things out as /usr/lib/<name>/<name>
  // (both share the basename), and would wrongly "find" that directory
  // instead of the actual executable inside it. Restricting to regular
  // files skips both that and any symlink whose target (often an absolute
  // "/usr/lib/..." path baked in at package-build time) wouldn't resolve
  // correctly from inside our own private extraction root anyway.
  const findBinary = run(`find "${rootDir}" -type f -name "${execBaseName}" 2>/dev/null | head -1`, { silent: true });
  const realBinaryPath = (findBinary.stdout || '').trim();
  if (!realBinaryPath || !fs.existsSync(realBinaryPath)) {
    throw new Error(`Extracted the package but couldn't locate its "${execBaseName}" executable inside it`);
  }
  fs.chmodSync(realBinaryPath, 0o755);
 
  const wrapperDir = path.join(os.homedir(), '.local', 'bin');
  fs.mkdirSync(wrapperDir, { recursive: true });
  const wrapperPath = path.join(wrapperDir, execBaseName);
  fs.writeFileSync(wrapperPath, `#!/bin/sh\nexec "${realBinaryPath}" "$@"\n`);
  fs.chmodSync(wrapperPath, 0o755);
  addDirToUnixPath(wrapperDir);
 
  const desktopEntryDir = path.join(os.homedir(), '.local', 'share', 'applications');
  fs.mkdirSync(desktopEntryDir, { recursive: true });
  const rewrittenDesktop = desktopContent
    .replace(/^Exec=.*$/m, `Exec="${wrapperPath}" %U`)
    .replace(/^TryExec=.*$/m, `TryExec=${wrapperPath}`);
  fs.writeFileSync(path.join(desktopEntryDir, `${installDirName}.desktop`), rewrittenDesktop);
  run(`update-desktop-database "${desktopEntryDir}"`, { silent: true }); // best-effort, fine if missing
 
  return { success: true, command: execBaseName, binaryPath: realBinaryPath };
}
 
/** Run a downloaded installer directly (no shell layer in between) and refresh PATH after. */
function runInstaller(exePath, args = []) {
  try {
    const result = spawnSync(exePath, args, { stdio: 'inherit' });
    refreshWindowsPath();
    if (result.error) return { success: false, error: result.error };
    return { success: result.status === 0, status: result.status };
  } catch (err) {
    return { success: false, error: err };
  }
}
 
/** A temp file path safe to download an installer to. */
function tempInstallerPath(filename) {
  return path.join(os.tmpdir(), filename);
}
 
/**
 * git clone over SSH, without ever hitting GitHub's "are you sure you want
 * to continue connecting" host-key prompt. Without this, cloning fails
 * outright the first time a script runs it (no TTY to prompt on) and only
 * works interactively if a human is there to type "yes" — which defeats
 * the point of an unattended setup tool.
 */
function gitCloneSsh(repoUrl, destDir, opts = {}) {
  return run(`git clone --depth 1 "${repoUrl}" "${destDir}"`, {
    ...opts,
    env: { ...(opts.env || {}), GIT_SSH_COMMAND: 'ssh -o StrictHostKeyChecking=accept-new' },
  });
}
 
// ---------------------------------------------------------------------------
// Verification loops (for steps that need a real human action — adding an
// SSH key, completing a browser login — that no script can do on its own)
// ---------------------------------------------------------------------------
 
/**
 * Walks the person through a manual step, then actually verifies it worked
 * before moving on — instead of testing once, printing a warning, and
 * silently continuing regardless of the result (which just pushes the same
 * failure downstream to whatever needed this to work).
 *
 * opts.instructions() is called once up front to explain what to do.
 * opts.test() is called each attempt and must return { success, message }.
 * opts.onFailure(result) is called between attempts to explain what to fix.
 * Loops until test() succeeds or the person explicitly types "skip".
 */
async function verifyWithRetry(opts) {
  if (opts.instructions) opts.instructions();
  for (;;) {
    const answer = await ask(opts.promptMessage || 'Press Enter to test now (or type "skip" to continue without verifying)', {});
    if (/^skip$/i.test(answer.trim())) {
      warn('Skipping verification — you can re-run this tool later to check again.');
      return { verified: false, skipped: true };
    }
    info(opts.testingMessage || 'Testing...');
    const result = await opts.test();
    if (result.success) {
      ok(opts.successMessage || 'Verified.');
      return { verified: true, skipped: false, result };
    }
    if (opts.onFailure) opts.onFailure(result);
    else warn(result.message || 'That didn\'t work.');
  }
}
 
// ---------------------------------------------------------------------------
// Step runner
// ---------------------------------------------------------------------------
 
/**
 * Runs a step function, catching errors so one failure never aborts the
 * whole run. Returns a result object used for the final summary.
 */
async function runStep(name, fn, ctx) {
  heading(name);
  try {
    const result = await fn(ctx);
    return { name, status: (result && result.status) || 'ok', detail: result && result.detail };
  } catch (err) {
    fail(`Something went wrong: ${err.message || err}`);
    info('You can re-run this tool later — completed steps will be skipped automatically.');
    return { name, status: 'failed', detail: err.message || String(err) };
  }
}
 
module.exports = {
  log,
  heading,
  ok,
  skip,
  warn,
  fail,
  info,
  run,
  runWithTimeoutRetry,
  runDirect,
  openUrl,
  capture,
  commandExists,
  ensureWinget,
  refreshWindowsPath,
  addDirToWindowsPath,
  addDirToUnixPath,
  ensureCurlOnLinux,
  ensureUserWritableNpmGlobal,
  downloadFile,
  fetchJson,
  fetchBuffer,
  findAptPackageDownloadUrl,
  extractArMember,
  installDebPackagePortable,
  runInstaller,
  tempInstallerPath,
  gitCloneSsh,
  ask,
  confirm,
  verifyWithRetry,
  runStep,
  colors: c,
};