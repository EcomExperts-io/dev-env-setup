# EcomExperts Dev Environment Setup

One command to get a new machine (macOS, Windows, or Linux) ready for
EcomExperts development — no more retyping the onboarding doc by hand every
time you're on a new laptop.

Before you start, it's worth watching the two intro videos:
- https://vimeo.com/901241912?share=copy
- https://vimeo.com/901266123?share=copy

## What this does

Installs and configures, in order, checking first and skipping anything you
already have:

1. Homebrew (macOS only)
2. Node.js & npm
3. Git
4. Ruby
5. Shopify CLI — **and a real login check**: since it needs a store to
   verify against, this runs `shopify theme list --store=<store>` (your own
   store, or EcomExperts' shared verification store if you leave it blank),
   which forces the browser-based Shopify login if you aren't logged in yet,
   and won't move on until it actually succeeds (or you explicitly skip it)
6. Your choice of coding tools — pick any combination (multi-select prompt):
   Visual Studio Code, Cursor, and/or Claude Code (installs both the CLI and
   the desktop app)
7. The `Documents/EcomExperts` folder structure (`Clients`, `GitTemplates`,
   `LintingRules`, `GithubKeys`, `Packages`)
8. Your Git identity (name + email), a GitHub SSH key, and a **compulsory
   verification loop**: it walks you through adding the key on
   github.com step by step, then actually tests both that GitHub accepts the
   key *and* that your account has access to the EcomExperts-io org — and
   won't move on until both pass (or you explicitly skip)
9. Husky
10. `CloneSetUp.sh` (cloned from `EcomExperts-io/pipeline-rules`), wired
    onto your PATH so you can run it from anywhere. On macOS/Linux/Git Bash:
    `CloneSetUp.sh <repo-url>`. On Windows PowerShell/cmd, both
    `CloneSetUp <repo-url>` and `CloneSetUp.sh <repo-url>` work — a
    `CloneSetUp.cmd` wrapper handles the first form, and a small PowerShell
    profile shortcut handles the second (Windows has no built-in way to
    execute a `.sh` file directly; without that shortcut, PowerShell would
    just try to *open* the file instead of running it)
11. The shared ESLint / theme-check linting rules
12. Slack desktop app
13. Oh My Zsh (optional, macOS/Linux only)

Time Doctor isn't part of this tool. It has no automatable install path on
any OS — no winget/Homebrew/snap package, and its downloads are gated behind
signing into your company Time Doctor account first, so a step here could
only ever open a browser tab for you to do it manually anyway. That's not
worth a dedicated step; install it yourself once from
https://www.timedoctor.com/download.

It's safe to run more than once — completed steps are detected and skipped,
so if something fails partway through (no internet, a permission prompt you
missed) you can just run it again and it'll pick up where it left off.

The GitHub and Shopify steps are deliberately stricter than the rest: both
require a real human action (adding a key on github.com, completing a
browser login) that no script can do on your behalf, so instead of testing
once and moving on regardless, they explain exactly what to do, wait for
you to confirm you've done it, test for real, and loop back with specific
guidance if it didn't work — rather than silently continuing and letting
the failure surface confusingly several steps later.

## Quickstart

### One-line install (recommended — nothing to download first)

This repo is public, so `bootstrap.sh`/`bootstrap.ps1` can be fetched and
run directly. If there's no local copy of the tool next to the script yet
(which is always true the first time, since nothing's downloaded), it
downloads one itself (to `Documents/EcomExperts/Clients/dev-env-setup`)
before continuing — so this really is the whole thing, start to finish, in
one line:

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Main/bootstrap.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Main/bootstrap.ps1 | iex
```

**Use this Powershell for Beta -version of the tool may have some inconsistencies

```powershell
$env:EE_SETUP_REF = "Develop"
irm https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Develop/bootstrap.ps1 | iex
```


(Branch name is `Main`, capital M — check that's still accurate if this repo's default branch ever changes.)

On Windows, if Node.js had to be installed fresh, don't be surprised if a
second, elevated PowerShell window pops up partway through — a window that
just installed something doesn't automatically see it on PATH, so the
script opens a new one that does and keeps going there automatically.
That's expected, not an error; it only happens on a
machine that didn't already have Node set up.

### Running it from a local copy

If you already have this repo downloaded/cloned, you don't need the
one-liner at all — just run the script directly and it'll skip the
download step since it finds itself already there:

**macOS / Linux** — open Terminal, `cd` into this folder, then:

```bash
./bootstrap.sh
```

**Windows** — just double-click `bootstrap.cmd` in this folder (or run it
from `cmd`/PowerShell/Explorer, whatever's easiest). It launches
`bootstrap.ps1` with execution policy bypassed for that one run only —
nothing persistent or machine-wide changes, and there's no
"scripts are disabled on this system" prompt to deal with first, no matter
what this machine's default policy is set to.

If you'd rather invoke `bootstrap.ps1` directly from an open PowerShell
window instead of using the `.cmd`, that works too — just be aware
PowerShell's execution policy is a real, separate thing from `bootstrap.cmd`,
and depending on this machine's default setting it might refuse to run with
a "scripts are disabled" error. If that happens, run this once (only
affects the current window, nothing permanent) and try again:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\bootstrap.ps1
```

The bootstrap script's only job is making sure Node.js is installed — it
then hands off to the real setup tool (`bin/setup.js`), which does
everything else.

## Naming convention

EcomExperts repos and folders use **PascalCase** — e.g. `MyNewRepo`, not
`my-new-repo`, `my_new_repo`, or `mynewrepo`. Misnaming things breaks
tooling that expects the exact convention.

## Things this can't fully automate

A few steps depend on manual confirmation or on internal links that only
make sense once you're mid-setup — the tool will pause, tell you exactly
what to do, and wait for you:

- Adding your SSH public key to your GitHub account (the tool copies it to
  your clipboard, prints step-by-step instructions, and won't move on until
  it verifies both the key and your EcomExperts-io org access)
- Logging into Shopify in your browser when the CLI prompts for it (the tool
  triggers this automatically and waits for it to complete)
- Downloading EcomExperts' recommended VS Code build if the automatic
  install path isn't available on your machine
- Cursor or the Claude desktop app, only if the download sources they rely on
  ever move or go down (the tool opens the official download page as a
  fallback — this shouldn't normally happen)

If any step fails, it prints the manual fallback command/link — copy the
error into ChatGPT first if you're not sure what went wrong, that's usually
the fastest fix.

## Testing a branch other than Main

The one-liner always self-downloads from `Main` when it needs to fetch a
local copy — that's correct for every real user, but if you're actively
developing this tool and piping in `bootstrap.ps1`/`bootstrap.sh` from a
different branch's raw URL (e.g. `Develop`) to test in-progress changes, the
script itself has no way to know which branch it was fetched from (a piped
script can't see its own source URL). Without an override it'll happily
fetch your branch's `bootstrap.ps1`/`.sh`, then turn around and self-download
the *rest* of the tool from `Main` anyway — silently overwriting your local
checkout with old code and making your in-progress fix look like it didn't
work. Set `EE_SETUP_REF` first to point self-download at the same branch:

```powershell
$env:EE_SETUP_REF = "Develop"
irm https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Develop/bootstrap.ps1 | iex
```

```bash
EE_SETUP_REF=Develop curl -fsSL https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Develop/bootstrap.sh | bash
```

## Re-running / troubleshooting a single step

Just run `./bootstrap.sh` (or `bootstrap.cmd`/`.\bootstrap.ps1` on Windows) again. Every step checks
whether it's already done before doing anything, so re-running the whole
tool is the normal way to retry a step that failed or was skipped.

## Project layout

```
dev-env-setup/
├── bootstrap.sh        # macOS/Linux entry point — also self-downloads the repo when run via the one-liner
├── bootstrap.ps1        # Windows entry point — same self-download behavior
├── bootstrap.cmd         # optional double-click launcher for bootstrap.ps1 — bypasses execution policy automatically
├── bin/setup.js          # Node CLI entry point (called by both bootstraps)
└── src/
    ├── index.js          # orchestrates the steps below, in order
    ├── steps/            # one file per setup step, in run order
    ├── config.js         # folder paths, repo URLs, shared constants
    ├── platform.js       # OS detection
    └── utils.js          # exec/prompt/logging helpers shared by every step
```

No npm dependencies at all — it's plain Node.js, nothing to install before
the tool itself can run.
