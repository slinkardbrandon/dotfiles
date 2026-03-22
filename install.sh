#!/usr/bin/env bash

################################################################################
# install.sh
# One-liner entry point: clones dotfiles and runs bootstrap.sh
# Usage: curl -fsSL https://raw.githubusercontent.com/slinkardbrandon/dotfiles/main/install.sh | bash
################################################################################

set -e

DOTFILES_DIR="$HOME/dotfiles"

# Clone or update dotfiles
if [ ! -d "$DOTFILES_DIR" ]; then
  echo "Cloning dotfiles..."
  git clone https://github.com/slinkardbrandon/dotfiles.git "$DOTFILES_DIR"
else
  echo "Dotfiles directory exists. Pulling latest..."
  cd "$DOTFILES_DIR" && git pull 2>/dev/null || echo "Could not pull (local changes). Continuing..."
fi

# Hand off to bootstrap.sh (which installs bun and runs setup.ts)
exec bash "$DOTFILES_DIR/bootstrap.sh" "$@"
