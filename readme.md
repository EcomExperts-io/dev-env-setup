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
13. Time Doctor desktop app — the one exception to full automation (see
    below); it just checks whether it's already installed and, if not,
    opens the download page for you
14. Oh My Zsh (optional, macOS/Linux only)

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

(Branch name is `Main`, capital M — check that's still accurate if this repo's default branch ever changes.)

On Windows, if Node.js (or npm) had to be installed fresh, don't be
surprised if a second, elevated PowerShell window pops up partway through —
a window that just installed something doesn't automatically see it on
PATH, so the script opens a new one that does and keeps going there
automatically. That's expected, not an error; it only happens on a
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

### Terminal UI

When you run it in a terminal that renders it well, it opens a full-screen,
keyboard-driven UI right there in the terminal — a checklist of what to set
up (↑/↓ to move, Space to toggle, Enter to start), then a live sidebar +
scrolling log while it runs, same idea as tools like Chris Titus's WinUtil,
just running inside your terminal instead of a separate window. Any
question the setup needs to ask (your Git email, whether to install Oh My
Zsh, ...) pops up as a small box right there rather than interrupting the
log.

On macOS/Linux, any normal terminal works. On Windows, this needs Windows
Terminal or VS Code's integrated terminal — the classic "Windows
PowerShell" console app (the blue window launched straight from the Start
Menu, as opposed to Windows Terminal) doesn't render it cleanly, so the
tool detects that and automatically uses the classic plain-text wizard
there instead of showing a broken-looking screen. Windows Terminal comes
pre-installed on Windows 11 and is a free Microsoft Store install on
Windows 10, and is worth having anyway.

If your terminal can't support the full UI for any other reason either
(piped output, some CI runners, or the one small UI dependency couldn't be
installed automatically), it falls back on its own to the classic
plain-text, line-by-line wizard — nothing to do on your end, it just works
either way. You can also choose explicitly:

```bash
node bin/setup.js --tui   # force the terminal UI
node bin/setup.js --cli   # force the classic plain-text wizard
```

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
- Windows Ruby installs when `winget` isn't available (RubyInstaller needs
  a manual download + wizard)
- Time Doctor, on every machine: unlike everything else in this list, there's
  no winget package, Homebrew cask, or snap for it, and its downloads are
  gated behind signing into your company Time Doctor account first — there's
  no plain installer link a script can fetch, and the vendor documents no
  silent-install flag. The tool checks whether it's already installed and,
  if not, opens the download page for you to sign in and install by hand;
  re-run the tool afterwards and it'll detect it and skip

If any step fails, it prints the manual fallback command/link — copy the
error into ChatGPT first if you're not sure what went wrong, that's usually
the fastest fix.

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
    ├── index.js          # picks terminal-UI or classic mode, orchestrates the steps below
    ├── steps/            # one file per setup step, in run order — unaware of which mode is active
    ├── tui/              # the full-screen terminal UI (checklist + live run screen)
    ├── config.js         # folder paths, repo URLs, shared constants
    ├── platform.js       # OS detection
    └── utils.js          # exec/prompt/logging helpers, pluggable so tui/ can take over presentation
```

Almost no npm dependencies are required to run this: it's plain Node.js plus
one small package (`blessed`) for the terminal UI, which the bootstrap
scripts install automatically the first time. Every step's actual install
logic — the part that took real work to get right — has zero dependencies
either way; `blessed` only touches how things are displayed.
