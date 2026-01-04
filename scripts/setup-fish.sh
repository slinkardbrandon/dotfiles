#!/usr/bin/env bash

################################################################################
# setup-fish.sh
# Install and configure Fish shell
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if fish is installed
if ! command -v fish &> /dev/null; then
    print_info "Fish not found. Installing via Homebrew..."
    brew install fish
fi

FISH_PATH=$(which fish)
print_info "Fish shell found at: $FISH_PATH"

# Add fish to allowed shells if not already there
if ! grep -q "$FISH_PATH" /etc/shells; then
    print_info "Adding Fish to /etc/shells..."
    echo "$FISH_PATH" | sudo tee -a /etc/shells
    print_success "Fish added to allowed shells"
else
    print_success "Fish already in /etc/shells"
fi

# Set fish as default shell
if [ "$SHELL" != "$FISH_PATH" ]; then
    print_info "Setting Fish as default shell..."
    chsh -s "$FISH_PATH"
    print_success "Fish is now the default shell"
else
    print_success "Fish is already the default shell"
fi

# Install Fisher plugin manager
print_info "Installing Fisher plugin manager..."
fish -c "curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher" || true

# Install Fisher plugins from fish_plugins file
if [ -f "$HOME/dotfiles/fish/fish_plugins" ]; then
    print_info "Installing Fisher plugins..."
    fish -c "fisher update" || true
    print_success "Fisher plugins installed!"
fi

print_success "Fish shell setup complete!"
