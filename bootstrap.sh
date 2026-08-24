#!/usr/bin/env bash
# EcomExperts dev environment bootstrap — macOS & Linux
#
# This script's only job is to make sure Node.js exists, then it hands off
# to the real setup tool (a Node CLI) for everything else. Safe to re-run.
#
# Works two ways:
#   - From inside an already-downloaded copy of this repo (the traditional
#     way): just run ./bootstrap.sh
#   - As a single command, with nothing downloaded yet:
#       curl -fsSL https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Main/bootstrap.sh | bash
#     There's no local checkout to find next to the script in that case
#     (it's being read straight off stdin) — this script notices that and
#     downloads one itself first (the repo is public, so no login/token is
#     needed), then carries on exactly as it would from a real checkout.

set -euo pipefail

REPO_OWNER="EcomExperts-io"
REPO_NAME="dev-env-setup"
REPO_REF="Main"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }

bold "EcomExperts dev-setup — bootstrap"

# ${BASH_SOURCE[0]:-.} (rather than a bare ${BASH_SOURCE[0]}) matters here:
# under `set -u`, a piped `curl ... | bash` run has no real BASH_SOURCE to
# read, and this is exactly the case that needs a default instead of
# crashing on an unbound variable.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-.}")" && pwd)"

if [ ! -f "$SCRIPT_DIR/bin/setup.js" ]; then
  info "No local copy of the setup tool found next to this script — downloading one..."
  INSTALL_DIR="$HOME/Documents/EcomExperts/Clients/$REPO_NAME"
  mkdir -p "$INSTALL_DIR"
  tmp_tarball="$(mktemp)"
  curl -fsSL "https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_REF}.tar.gz" -o "$tmp_tarball"
  tar -xzf "$tmp_tarball" -C "$INSTALL_DIR" --strip-components=1
  rm -f "$tmp_tarball"
  SCRIPT_DIR="$INSTALL_DIR"
  info "Downloaded to $INSTALL_DIR"
fi

OS="$(uname -s)"

if [ "$OS" = "Darwin" ]; then
  if ! command -v brew >/dev/null 2>&1; then
    info "Homebrew not found — installing it first (Node needs it on Mac)..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    # Apple Silicon Homebrew lives at /opt/homebrew, Intel at /usr/local.
    if [ -x /opt/homebrew/bin/brew ]; then
      eval "$(/opt/homebrew/bin/brew shellenv)"
    elif [ -x /usr/local/bin/brew ]; then
      eval "$(/usr/local/bin/brew shellenv)"
    fi
  fi

  if ! command -v node >/dev/null 2>&1; then
    info "Node.js not found — installing via Homebrew..."
    brew install node
  fi
elif [ "$OS" = "Linux" ]; then
  if ! command -v node >/dev/null 2>&1; then
    info "Node.js not found — installing..."
    if command -v apt-get >/dev/null 2>&1; then
      # A fresh/minimal install (e.g. a bare VM image) may not even have
      # curl yet — the NodeSource setup script below needs it, so make sure
      # it's there first rather than failing on a "curl: command not found"
      # deep inside a piped command.
      if ! command -v curl >/dev/null 2>&1; then
        info "curl not found — installing it first..."
        sudo apt-get update -y
        sudo apt-get install -y curl
      fi
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
      sudo apt-get install -y nodejs
    elif command -v dnf >/dev/null 2>&1; then
      if ! command -v curl >/dev/null 2>&1; then
        info "curl not found — installing it first..."
        sudo dnf install -y curl
      fi
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash -
      sudo dnf install -y nodejs
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm nodejs npm
    else
      echo "Could not detect a supported package manager."
      echo "Install Node.js manually from https://nodejs.org/en/download/, then re-run this script."
      exit 1
    fi
  fi
else
  echo "Unsupported OS: $OS. This bootstrap supports macOS and Linux (use bootstrap.ps1 on Windows)."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js still isn't available. Install it manually from https://nodejs.org/en/download/ and re-run this script."
  exit 1
fi

info "Node $(node -v) ready."

# The setup tool's terminal UI (the full-screen, arrow-key checklist) needs
# one small dependency (blessed). Install it automatically here so nobody
# ever has to run `npm install` by hand — same "fully automatic" principle
# as everything else in this script. If it fails for any reason (offline,
# locked-down machine, npm registry unreachable), don't abort the whole
# setup over it: the tool detects a missing dependency itself and falls
# back to its plain text mode automatically.
if [ -f "$SCRIPT_DIR/package.json" ] && [ ! -d "$SCRIPT_DIR/node_modules/blessed" ]; then
  info "Installing the terminal UI dependency (one-time)..."
  ( cd "$SCRIPT_DIR" && npm install --omit=dev --no-audit --no-fund ) || {
    echo "  Note: couldn't install the terminal UI dependency automatically."
    echo "  The setup tool still works fine — it'll use its plain text mode instead."
  }
fi

info "Handing off to the setup tool..."
echo ""

exec node "$SCRIPT_DIR/bin/setup.js"
