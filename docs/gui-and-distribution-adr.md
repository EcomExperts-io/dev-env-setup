# ADR-001: Adding an In-Terminal UI and One-Command Distribution to dev-env-setup

**Status:** Accepted (terminal-UI architecture) — implemented; distribution questions below still open
**Date:** 2026-08-24 (revised same day — see "Revision note")
**Deciders:** Mujtaba (EcomExperts) + whoever owns the GitHub org/repo policy for EcomExperts-io

## Revision note

The first version of this document proposed a browser-based GUI (a local
web server + your default browser). After reviewing it, the actual ask was
a **terminal UI** — a full-screen, keyboard-driven interface that runs
inside the terminal itself, in the style of Chris Titus's WinUtil/linutil:
a checklist with arrow keys and checkboxes, not a browser tab. That's a
meaningfully different (and simpler) architecture, so this document has
been rewritten around it rather than patched. The distribution section
(single command, public-vs-private repo) is unaffected by the pivot and is
carried over as-is.

## Context

`dev-env-setup` currently works like this: a person downloads a zip, unzips
it, and runs `./bootstrap.sh` or `.\bootstrap.ps1` in a terminal. That
script makes sure Node.js exists, then hands off to a Node CLI wizard
(`bin/setup.js`) that walks through ~15 steps — folder structure, Git,
Ruby, Shopify CLI + login verification, a choice of coding tools, GitHub
SSH + verification, Husky, `CloneSetUp.sh`, linting rules, Oh My Zsh —
using colored terminal output and `readline`-based prompts, one line at a
time.

That CLI wizard represents a real amount of hard-won, OS-specific
knowledge: Windows PATH staleness across process boundaries, PowerShell's
argument-mangling of empty strings, NSIS vs Inno Setup silent-install
flags, curl not existing on minimal Linux images, npm's root-owned global
directory on system-installed Node, AppImages needing a `.desktop` entry to
be visible at all, and more. None of that logic should be thrown away or
rewritten — it needed to be **reused as-is**.

The ask had two parts:

1. **A GUI**, specifically an in-terminal one — a full-screen checklist
   interface like WinUtil/linutil, not a separate window or browser tab.
2. **A single command, per OS, that anyone can run** — hosted on GitHub —
   that launches it.

## Goals

- Reuse the existing step logic (`src/steps/*.js`, `src/utils.js`) as-is,
  without a rewrite.
- A full-screen, keyboard-driven checklist: pick what to run, watch it run,
  answer the occasional question in a small popup instead of a raw prompt.
- Still works exactly as it does today from a plain terminal, for CI,
  screen readers, or anyone who just prefers that.
- No separate window, browser, or GUI toolkit — the whole experience stays
  inside the same terminal the person already has open.

## Non-Goals (explicitly out of scope)

- **A hosted website that configures your computer just by visiting it.**
  Not technically possible and shouldn't be implied by "hit that URL." A
  browser page can't install Git or generate SSH keys on your machine by
  itself. What *is* achievable, and what this document (and the earlier
  version of it) proposes, is a one-line command that downloads and runs a
  script on the user's own machine — the "URL" is where the *installer
  script* lives, not a remote control panel.
- A browser-based GUI (the previous version of this decision) — superseded
  by the terminal-UI approach below per the actual request.
- Rewriting the install logic in a different language to get a "native"
  TUI toolkit (e.g. Rust + ratatui, which is literally what powers Chris
  Titus's own `linutil`). See Option D below for why that's a bad trade
  here specifically, even though it's the right call when starting from
  scratch with no existing logic to preserve.

## Decision

Keep the Node.js core exactly as it is today. Add a **terminal UI built
with `blessed`** (a mature, pure-JavaScript library for full-screen
terminal interfaces — no native compilation, so it installs the same way
on Windows/Mac/Linux with no build toolchain required), launched by the
same `bootstrap.sh`/`bootstrap.ps1` entry points that already exist.
Concretely, this is already implemented:

1. `bootstrap.sh`/`bootstrap.ps1` still make sure Node.js exists, then now
   also run `npm install` once (only `blessed` — see Options below) before
   handing off, so the terminal UI's one dependency is there automatically.
   If that install fails for any reason, the tool doesn't stop — it falls
   back to plain text mode on its own.
2. `bin/setup.js` now auto-detects: if both stdin and stdout are a real
   interactive terminal, it opens the full-screen checklist UI; otherwise
   (CI, piped output, or if the UI dependency isn't available) it uses the
   classic line-by-line wizard, unchanged from before. `--tui`/`--gui` and
   `--cli` flags force either mode explicitly.
3. **None of the 15 step files were touched.** Every step already talked
   to a small set of shared functions in `utils.js`
   (`ok`/`warn`/`info`/`ask`/`confirm`/...) rather than to `console.log`
   or `readline` directly — so those functions were made pluggable (an "IO
   driver") in one place, in `utils.js`, and the terminal UI supplies a
   different driver that renders into a scrolling log widget and pops a
   small modal box for questions instead. Every step file works with
   either driver with zero changes. This is a materially smaller, safer
   refactor than the one the browser-GUI version of this plan called for.

## Options Considered

### Option A: Hand-rolled, zero-dependency TUI (raw ANSI + readline)

| Dimension | Assessment |
|---|---|
| Complexity | High — full-screen rendering, cursor positioning, keyboard raw-mode handling, and redraw-on-resize all have to be built and debugged from scratch |
| Reuses existing step logic | Yes, via the same IO-driver approach |
| New dependency | None — stays fully zero-dependency |
| Distribution impact | None — no `npm install` step needed at all |
| Risk | High — terminal handling (raw mode, ANSI quirks across Windows Terminal/cmd/iTerm/various Linux terminals) is exactly the kind of long-tail, OS-specific pain this project has already spent most of its effort fighting for *other* tools; doing it again here, for the UI itself this time, is a lot of surface area to get right |

**Pros:** Nothing new to install, stays in line with the project's zero-dependency philosophy so far.
**Cons:** Meaningfully more code to write and maintain, more edge cases to get right, and less visually polished, for a part of the tool (rendering) that isn't where this project's hard-won expertise actually is.

### Option B: `blessed` — a small, mature terminal-UI library (chosen)

| Dimension | Assessment |
|---|---|
| Complexity | Low–Medium — `blessed` provides full-screen layout, scrollable logs, modal boxes, and keyboard handling out of the box |
| Reuses existing step logic | Yes, via the IO-driver refactor (already done) |
| New dependency | One (`blessed`), pure JavaScript — no native/compiled bindings, so no `node-gyp`/build-toolchain requirement on the user's machine |
| Distribution impact | Bootstrap scripts run `npm install` once; auto-installed, with an automatic fallback to plain text if that fails |
| Team familiarity | Same as today (still just Node + JS) |
| Maturity | Old but stable and extremely widely used — the terminal-UI library underneath many popular CLI tools |

**Pros:** Small, focused addition; keeps 100% of the existing install logic untouched; handles the genuinely hard part (terminal rendering across OSes) so this project doesn't have to re-litigate it; still lets the tool run from a single command per OS.
**Cons:** One dependency to install (mitigated by the automatic install + automatic fallback); `blessed` itself is a mature but not actively-developed project (acceptable — it's stable, and the surface area we use from it is small and well-trodden).

### Option C: Another Node TUI/prompt library (e.g. `enquirer`, `inquirer`)

| Dimension | Assessment |
|---|---|
| Complexity | Low for simple sequential prompts, but these libraries are built for "ask one question, then the next," not a persistent full-screen checklist + live sidebar + log that Chris Titus-style tools have |
| Fit for "checklist + live status + log" UI | Poor — would need real workarounds to fake a persistent multi-pane screen |
| New dependency | One, similar footprint to `blessed` |

**Pros:** Nicer default styling for simple linear prompts.
**Cons:** Wrong shape of tool for what was actually asked for (a full-screen, multi-pane checklist), not just a styling preference.

### Option D: Rewrite in Rust with `ratatui` (what `linutil` itself is built with)

| Dimension | Assessment |
|---|---|
| Complexity | Very high |
| Reuses existing step logic | **No** — every step file and every OS-specific workaround (PATH refresh, the `ssh-keygen` empty-string bug, NSIS-vs-Inno flag detection, `verifyWithRetry`'s GitHub/Shopify loops) would need to be re-implemented and re-debugged from scratch in Rust |
| Distribution | A compiled binary is arguably an even cleaner "one file, any OS" story than a Node script — this is `ratatui`'s genuine advantage |
| Team familiarity | Low — nobody on this project has touched Rust; adds a whole new toolchain |

**Pros:** This is genuinely how the tool that inspired the request is built, and if this project were starting from zero today, it might be a reasonable choice.
**Cons:** This project isn't starting from zero — it has a large amount of tested, OS-specific Node logic. Throwing that away to match the *implementation language* of the inspiration, rather than just its *look and feel* (which `blessed` reproduces perfectly well), would re-introduce every bug this whole effort already fixed, one at a time, in a new language, for no corresponding benefit to the actual user experience.

## Trade-off Analysis

Same core argument as the original version of this document, just applied
to a different presentation layer: **the hard part of this project was
never "render a nice-looking screen"** — it was correctly detecting and
working around a long tail of OS-specific installer quirks. Option D
throws that away entirely for no user-visible benefit (a `blessed`-based
terminal UI looks and behaves the same as a `ratatui`-based one, from the
user's chair). Option A keeps everything in Node but re-invents a
non-trivial, cross-OS-fragile piece of engineering (terminal raw-mode
handling) that a small, mature library already solves. Option B is the
only one that gets the actual visual/interaction goal with the least new
risk and the least code to maintain.

## The "single command, any OS" distribution model

Unchanged from the original plan and unaffected by the terminal-vs-browser
pivot. Being honest about what "single command" can mean: Windows
PowerShell and Unix shells have different piping syntax, so this is
realistically **one line per OS** — the same shape as rustup, Deno, Bun,
nvm, and Homebrew itself, all of which publish a different one-liner for
Windows vs. Unix and still market themselves as "one command to install."

- **macOS / Linux:**
  ```bash
  curl -fsSL https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/main/bootstrap.sh | bash
  ```
- **Windows (PowerShell):**
  ```powershell
  irm https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/main/bootstrap.ps1 | iex
  ```

Both scripts already do the "make sure Node exists, then install the UI
dependency" work end to end — nothing further needs to change in them for
this to work, once the hosting question below is resolved.

*A genuinely OS-agnostic single line* is possible via a polyglot script
(a file that's simultaneously valid `sh` and valid PowerShell). It's a neat
trick some installers use, but adds real fragility and is harder for the
next engineer to read and maintain. Recommendation: don't do this unless
there's a strong reason to — two clearly-documented one-liners is the
better trade.

## Open Question: the private-repo chicken-and-egg problem

Still the most important thing to decide before this can actually be used
by a brand-new hire, and still a decision for EcomExperts, not a technical
one to make unilaterally.

`curl`/`irm`-ing a raw file from a **private** GitHub repo requires
authentication — plain `curl -fsSL https://raw.githubusercontent.com/...`
on a private repo returns a 404. That's a real problem here specifically,
because:

- The people most likely to run this one-liner are **brand-new hires on a
  brand-new machine** who don't have GitHub access configured yet.
- Part of what this tool *does* is set up their GitHub SSH access in the
  first place.
- If the repo hosting the installer itself requires GitHub auth to fetch,
  that's a circular dependency: you need GitHub access to get the tool
  that sets up your GitHub access.

Options to resolve this:

1. **Make the `dev-env-setup` repo itself public.** It contains no secrets
   or client data — it's setup automation (install Git, generate an SSH
   key locally, print instructions). The private `pipeline-rules` repo
   (linting rules, `CloneSetUp.sh`) stays private and is only cloned
   *after* this tool has helped the user get their own SSH key added to
   GitHub — already how the flow works today. Simplest fix, costs nothing
   sensitive.
2. **Keep everything private**, and distribute a short-lived read-only
   token via an internal wiki/Slack pinned message instead of a public URL.
   Works, but "anyone can run" isn't quite true anymore (needs an internal
   doc lookup first), and tokens expire/rotate, so pinned instructions go
   stale.
3. **Host just the bootstrap entry point publicly** (a public gist,
   GitHub Pages, or a tiny public "installer" repo) while the rest stays
   private, with the public bootstrap script carrying/prompting for a
   token to pull the private rest. More moving parts than #1 for no clear
   benefit.

**Recommendation: Option 1** — make `dev-env-setup` public. It's internal
tooling, not IP, and it removes the chicken-and-egg problem entirely. This
still needs a real decision from whoever owns EcomExperts-io's GitHub org
policy.

## Architecture

```mermaid
flowchart TD
    A["Person runs one line\n(bootstrap.sh or bootstrap.ps1)\nfrom curl/irm"] --> B["Bootstrap script:\nensures Node.js exists,\nnpm-installs the UI dependency (blessed)"]
    B --> C["node bin/setup.js"]
    C --> D{"stdin & stdout\nboth a real terminal?"}
    D -- yes --> E["Terminal UI (src/tui/app.js)\nfull-screen checklist, then live sidebar + log"]
    D -- no / --cli / blessed unavailable --> F["Classic wizard\n(unchanged from today)"]
    E --> G["Same 15 step files\n(01-welcome.js ... 15-summary.js)\ncalling utils.js's ok()/ask()/confirm()/..."]
    F --> G
    G --> H["utils.js's pluggable IO driver:\nconsole driver (F) or blessed driver (E)\ndecides where those calls actually render"]
```

The step files never know which branch they're in — same functions, same
call sites, different driver underneath.

## Implementation notes (what actually changed)

This is smaller than the browser-GUI version of this plan required, and is
already done:

1. **`src/utils.js`** — the logging functions (`log`/`heading`/`ok`/`skip`/
   `warn`/`fail`/`info`) and the prompt functions (`ask`/`confirm`) now
   delegate to a swappable `currentDriver` object instead of calling
   `console.log`/`readline` directly. `setIoDriver()`/`getIoDriver()` are
   exported. The default driver (`consoleDriver`) is byte-for-byte the
   original behavior. A second mechanism, `setShellOutHook()`, lets the
   active UI step out of the way for the brief moments a step shells out to
   something with real inherited terminal output (`npm install`, `winget`,
   a downloaded installer) — the terminal UI uses `blessed`'s own built-in
   `program.pause()`/`resume()` for this, which is the library's documented
   mechanism for exactly this situation.
2. **`src/tui/driver.js`** — the `blessed`-backed IO driver: renders
   `ok`/`warn`/`fail`/etc. into a scrolling log widget, and implements
   `ask`/`confirm` as small modal boxes (a text input, or a Yes/No box)
   that resolve a `Promise` once answered.
3. **`src/tui/app.js`** — the two screens: a checklist (every step except
   the structural "Welcome"/"Summary" ones, all pre-checked, Space to
   toggle, Enter to start) and a run screen (a step-status sidebar next to
   a live log), both built on the unmodified `runStep()` from `utils.js`.
4. **`src/index.js`** — picks a driver based on `--cli`/`--tui`/`--gui`
   flags, or auto-detects based on whether stdin/stdout are real
   interactive terminals, with an automatic fall-through to the classic
   wizard if the terminal UI can't start for any reason.
5. **`bootstrap.sh`/`bootstrap.ps1`** — run `npm install` once (idempotent
   — skipped if already installed) before handing off, non-fatal on
   failure.
6. **Zero changes to any of the 15 step files.** None of them called
   `console.log`/`readline` directly to begin with, so the entire
   presentation layer swap happened in `utils.js` and two new files.

This was smoke-tested end-to-end in a real pseudo-terminal (checklist
navigation, toggling a step off and confirming it's genuinely skipped —
not just hidden, a text-input prompt mid-run, and the final pass/fail
summary) — but "does this look and feel right on an actual Windows
Terminal / iTerm / GNOME Terminal window, on an actual keyboard" still
needs the same kind of real-machine pass every other step in this project
has gone through, especially:
   - Windows terminal rendering (`blessed` is pure JS and doesn't need a
     compiler, which is the main cross-platform risk category; historically
     Windows console rendering has been the one place `blessed`-style
     libraries occasionally need small nudges — this hasn't come up yet in
     testing here, but wasn't testable end-to-end without a real Windows
     terminal window either)
   - What it looks like when a step shells out to `winget`/`npm` mid-run
     (the "step out of the full-screen UI, run the command with real
     output, then come back" transition) — logically sound and unit-tested
     against a fake terminal, but the visual transition itself needs eyes
     on a real terminal

## Open Questions (need a decision, not assumptions)

1. **Public vs. private repo** (see dedicated section above) — recommend public, needs sign-off. Unaffected by the terminal-UI pivot.
2. **Always-latest `main` vs. tagged releases** for the one-liner. Worth pinning to a tag once this is actually distributed this way, the way rustup/nvm do.
3. **Keep the `--cli` fallback long-term, not just as an error fallback?** Recommend yes — it's free (it's the pre-existing behavior, untouched) and covers CI, accessibility, and personal preference.
4. **Any telemetry/error reporting?** Same open question as before — right now, a failure is only visible to the person hitting it.
5. ~~Zero-dependency GUI server, or one small dependency?~~ Resolved by this revision: one small dependency (`blessed`), auto-installed, with automatic fallback if that install fails.

## Consequences

**Gets easier:**
- New hires get a guided, checklist-driven experience instead of a wall of scrolling text, without losing anything — everything the CLI already did (verification loops, retries, multi-select) works identically underneath.
- The classic CLI keeps working unchanged for anyone who needs it.
- Future install-logic bug fixes apply to both modes automatically, since they share the same step files.

**Gets harder:**
- One more thing to sanity-check per change to a step file's prompts: does a new `ask()`/`confirm()` call still read sensibly in a small modal box, not just as a terminal line.
- The public-repo decision still has to actually get made and owned by someone — the distribution half of this plan can't finish without it.
- Real-terminal testing (Windows Terminal, iTerm, GNOME Terminal, tmux/screen sessions) is a new category of "did this actually render right" that the plain CLI never needed.

**Will need to revisit:**
- Whether the coding-tools multi-select (`09-editor.js`) should eventually become native checkboxes in the checklist screen itself, rather than a modal text-input ("enter numbers separated by commas") — works fine as-is today, but a natural follow-up polish item.
- Distribution/versioning strategy (Open Question 2) once real usage shows how often `main` actually changing mid-flight matters in practice.

## Action Items

1. [x] Add the `blessed` dependency and wire up automatic install in both bootstrap scripts.
2. [x] Refactor `utils.js` to a pluggable IO driver (behavior-preserving for the classic CLI).
3. [x] Build the terminal UI: checklist screen, live run screen, modal ask/confirm.
4. [x] Auto-detect terminal UI vs. classic CLI in `src/index.js`, with automatic fallback.
5. [x] Smoke-test the full flow (navigation, toggling, prompts, pass/fail) in a real pseudo-terminal.
6. [ ] Real-machine pass on Windows Terminal, macOS Terminal/iTerm, and a Linux terminal — the same kind of hands-on testing every other step in this project has already gone through.
7. [ ] Get a decision on public vs. private repo hosting (blocks a brand-new hire from being able to use the one-liner at all).
8. [ ] Decide on tagged-release vs. always-`main` distribution.
9. [ ] Publish the two one-liners once 7–8 are resolved.
