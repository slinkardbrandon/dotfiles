#!/usr/bin/env bash

################################################################################
# bootstrap.sh
# Minimal shim: install Bun (if needed), install deps, run setup
################################################################################

set -e

DOTFILES_DIR="$(cd "$(dirname "$0")" && pwd)"

# Ensure bun's install location is in PATH for this session
export PATH="$HOME/.bun/bin:$PATH"

# Cache sudo credentials upfront, keep alive in background
echo "This setup needs sudo for some steps (installing packages, setting shell, etc.)"
sudo -v
while true; do sudo -n true; sleep 55; kill -0 "$$" || exit; done 2>/dev/null &
SUDO_KEEPALIVE_PID=$!
trap "kill $SUDO_KEEPALIVE_PID 2>/dev/null" EXIT

# Ensure unzip is available (needed for Bun installer)
if ! command -v unzip &>/dev/null && [[ "$OSTYPE" != "darwin"* ]]; then
  echo "Installing unzip..."
  sudo apt install -y unzip
fi

# Install Bun if not present
if ! command -v bun &>/dev/null; then
  echo "Installing Bun..."
  curl -fsSL https://bun.sh/install | bash
fi

# Install dependencies
cd "$DOTFILES_DIR"
bun install

# Run setup
bun run setup.ts "$@"
