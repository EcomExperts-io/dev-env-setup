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
# Same self-download-ref override as bootstrap.ps1 (see the comment over
# there for the full story of why this exists) — piped as
# `curl ... | bash`, this script has no way to know which branch's raw URL
# it was actually fetched from, so a hardcoded "Main" here would silently
# overwrite a local checkout with Main's content on every run regardless of
# which branch's one-liner you used. Set EE_SETUP_REF to override when
# testing a branch other than Main:
#   EE_SETUP_REF=Develop curl -fsSL https://raw.githubusercontent.com/EcomExperts-io/dev-env-setup/Develop/bootstrap.sh | bash
REPO_REF="${EE_SETUP_REF:-Main}"

bold() { printf "\033[1m%s\033[0m\n" "$1"; }
info() { printf "  %s\n" "$1"; }

# Last-resort Node.js install for Linux: no root, no package manager, no
# compiling — just Node's own official prebuilt binary tarball extracted
# somewhere user-writable. This exists because the package-manager route
# above can fail for reasons that have nothing to do with Node itself and
# nothing this script can fix: an immutable/read-only root filesystem (e.g.
# SteamOS, whose pacman isn't set up for general package installation the
# way a normal Arch install's is — "failed to synchronize all databases" is
# its usual symptom), no sudo access, a stale/misconfigured mirror, being
# fully offline from the distro's own repos, or simply no supported package
# manager being present at all. Node publishes ready-to-run x64/arm64
# tarballs for exactly this kind of situation, so falling back to one
# avoids getting stuck asking for a manual install over what's usually a
# purely local/environmental package-manager problem.
install_node_from_official_tarball() {
  local arch node_arch version url install_dir tmp_tarball rc_file

  arch="$(uname -m)"
  case "$arch" in
    x86_64) node_arch="x64" ;;
    aarch64|arm64) node_arch="arm64" ;;
    *)
      info "No prebuilt Node.js binary available for this CPU architecture ($arch)."
      return 1
      ;;
  esac

  info "Looking up the current Node.js LTS version..."
  # index.json lists newest-first; the first entry whose "lts" field isn't
  # the literal `false` is the current LTS release. Deliberately avoids
  # needing jq/python here (neither is guaranteed to exist yet at this
  # point) — splitting on the literal sequence "},{" (which only appears at
  # real object boundaries between array elements, never inside a single
  # release's own fields) turns the single-line JSON array into one release
  # per line, plain enough for grep/sed to pick apart. (`tr` can't do this:
  # it maps characters position-by-position, not multi-character sequences
  # — it would split on every single comma, including ones inside a
  # release's own "files" array, which is not what's wanted here.)
  version="$(curl -fsSL https://nodejs.org/dist/index.json 2>/dev/null \
    | sed 's/},{/}\n{/g' \
    | grep '"lts":"' \
    | head -1 \
    | grep -o '"version":"[^"]*"' \
    | cut -d'"' -f4)"
  if [ -z "$version" ]; then
    info "Could not determine the current Node.js LTS version (network issue reaching nodejs.org?)."
    return 1
  fi

  url="https://nodejs.org/dist/${version}/node-${version}-linux-${node_arch}.tar.gz"
  install_dir="$HOME/.ee-dev-setup/node-${version}"
  info "Downloading Node.js ${version} for linux-${node_arch}..."
  tmp_tarball="$(mktemp)"
  if ! curl -fsSL "$url" -o "$tmp_tarball"; then
    info "Download failed: $url"
    rm -f "$tmp_tarball"
    return 1
  fi
  mkdir -p "$install_dir"
  if ! tar -xzf "$tmp_tarball" -C "$install_dir" --strip-components=1; then
    info "Could not extract the downloaded Node.js archive."
    rm -f "$tmp_tarball"
    return 1
  fi
  rm -f "$tmp_tarball"

  export PATH="$install_dir/bin:$PATH"
  if ! command -v node >/dev/null 2>&1; then
    info "Extracted Node.js but couldn't find it on PATH afterward — something's off with the archive layout."
    return 1
  fi

  # Make this stick for future terminal sessions too, not just this run.
  local marker="# Added by EcomExperts dev-setup — Node.js (official tarball fallback)"
  for rc_file in "$HOME/.bashrc" "$HOME/.zshrc"; do
    [ -f "$rc_file" ] || continue
    if ! grep -qF "$marker" "$rc_file" 2>/dev/null; then
      {
        echo ""
        echo "$marker"
        echo "export PATH=\"$install_dir/bin:\$PATH\""
      } >> "$rc_file"
    fi
  done

  info "Node $(node -v) ready (installed to $install_dir, no root needed)."
  return 0
}

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
    # Every branch below is deliberately tolerant of its own failure (`|| true`
    # / explicit if-checks) rather than letting `set -e` kill the whole
    # script here — a package-manager install not working is exactly the
    # case the official-tarball fallback further down exists to recover
    # from, not a reason to give up and demand a manual install.
    if command -v apt-get >/dev/null 2>&1; then
      # A fresh/minimal install (e.g. a bare VM image) may not even have
      # curl yet — the NodeSource setup script below needs it, so make sure
      # it's there first rather than failing on a "curl: command not found"
      # deep inside a piped command.
      if ! command -v curl >/dev/null 2>&1; then
        info "curl not found — installing it first..."
        sudo apt-get update -y || true
        sudo apt-get install -y curl || true
      fi
      curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - || true
      sudo apt-get install -y nodejs || true
    elif command -v dnf >/dev/null 2>&1; then
      if ! command -v curl >/dev/null 2>&1; then
        info "curl not found — installing it first..."
        sudo dnf install -y curl || true
      fi
      curl -fsSL https://rpm.nodesource.com/setup_lts.x | sudo bash - || true
      sudo dnf install -y nodejs || true
    elif command -v pacman >/dev/null 2>&1; then
      sudo pacman -Sy --noconfirm nodejs npm || true
    fi

    if ! command -v node >/dev/null 2>&1; then
      # No supported package manager was found, or the one that was there
      # just didn't work (wrong repo state, no sudo, a read-only root
      # filesystem, offline mirrors, ...) — either way, fall back to
      # Node's own official prebuilt binary instead of giving up here.
      if [ -z "$(command -v apt-get || true)$(command -v dnf || true)$(command -v pacman || true)" ]; then
        info "Could not detect a supported package manager."
      else
        info "The package-manager install didn't get Node.js working."
      fi
      info "Falling back to Node's official prebuilt binary (no root/package manager needed)..."
      install_node_from_official_tarball || true
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

info "Handing off to the setup tool..."
echo ""

exec node "$SCRIPT_DIR/bin/setup.js"
