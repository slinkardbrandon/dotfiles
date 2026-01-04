#!/usr/bin/env bash

################################################################################
# install.sh
# Main installation script for dotfiles
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Dotfiles directory
DOTFILES_DIR="$HOME/dotfiles"

# Print functions
print_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running on macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    print_error "This script is designed for macOS only."
    exit 1
fi

print_info "Starting dotfiles installation..."

# Clone or update dotfiles repository
if [ ! -d "$DOTFILES_DIR" ]; then
    print_info "Cloning dotfiles repository..."
    git clone https://github.com/slinkardbrandon/dotfiles.git "$DOTFILES_DIR"
    print_success "Dotfiles cloned successfully!"
else
    print_info "Dotfiles directory already exists. Updating..."
    cd "$DOTFILES_DIR" && git pull
    print_success "Dotfiles updated successfully!"
fi

cd "$DOTFILES_DIR"

# Run bootstrap script (Xcode CLI tools, Homebrew)
if [ -f "$DOTFILES_DIR/bootstrap.sh" ]; then
    print_info "Running bootstrap script..."
    bash "$DOTFILES_DIR/bootstrap.sh"
else
    print_warning "Bootstrap script not found, skipping..."
fi

# Set up Fish shell
if [ -f "$DOTFILES_DIR/scripts/setup-fish.sh" ]; then
    print_info "Setting up Fish shell..."
    bash "$DOTFILES_DIR/scripts/setup-fish.sh"
else
    print_warning "Fish setup script not found, skipping..."
fi

# Create symlinks
if [ -f "$DOTFILES_DIR/scripts/symlink.sh" ]; then
    print_info "Creating symlinks..."
    bash "$DOTFILES_DIR/scripts/symlink.sh"
else
    print_warning "Symlink script not found, skipping..."
fi

# Set macOS defaults
read -p "Do you want to set macOS defaults? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    if [ -f "$DOTFILES_DIR/macos/defaults.sh" ]; then
        print_info "Setting macOS defaults..."
        bash "$DOTFILES_DIR/macos/defaults.sh"
    else
        print_warning "macOS defaults script not found, skipping..."
    fi
fi

print_success "🎉 Dotfiles installation complete!"
print_info "Please restart your terminal or run: exec fish"
