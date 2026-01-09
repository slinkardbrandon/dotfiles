#!/usr/bin/env bash

################################################################################
# install.sh
# Main installation script for dotfiles
################################################################################

set -e

# Support non-interactive mode (for piped install)
# Set defaults for interactive prompts
SETUP_KEYS="${SETUP_KEYS:-ask}"
SETUP_MACOS="${SETUP_MACOS:-yes}"

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
    cd "$DOTFILES_DIR"
    if git pull 2>/dev/null; then
        print_success "Dotfiles updated successfully!"
    else
        print_warning "Could not pull latest changes (local modifications present). Continuing with local version..."
    fi
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

# Set up GPG and SSH keys
if [ "$SETUP_KEYS" = "yes" ]; then
    DO_KEYS=true
elif [ "$SETUP_KEYS" = "no" ]; then
    DO_KEYS=false
else
    read -p "Do you want to set up GPG and SSH keys? (y/n) " -n 1 -r
    echo
    [[ $REPLY =~ ^[Yy]$ ]] && DO_KEYS=true || DO_KEYS=false
fi

if [ "$DO_KEYS" = true ]; then
    if [ -f "$DOTFILES_DIR/scripts/setup-keys.sh" ]; then
        print_info "Setting up GPG and SSH keys..."
        bash "$DOTFILES_DIR/scripts/setup-keys.sh"
    else
        print_warning "Key setup script not found, skipping..."
    fi
fi

# Set macOS defaults (always run on macOS)
if [ -f "$DOTFILES_DIR/macos/defaults.sh" ]; then
    print_info "Setting macOS defaults..."
    bash "$DOTFILES_DIR/macos/defaults.sh"
else
    print_warning "macOS defaults script not found, skipping..."
fi

# Configure Dock
if [ -f "$DOTFILES_DIR/scripts/clear-dock.sh" ]; then
    print_info "Configuring Dock..."
    bash "$DOTFILES_DIR/scripts/clear-dock.sh"
else
    print_warning "Dock configuration script not found, skipping..."
fi

print_success "🎉 Dotfiles installation complete!"
echo
print_info "=========================================="
print_info "Next Steps:"
print_info "=========================================="
echo
print_info "1. Restart your terminal or run: exec fish"
print_info "2. Fisher will auto-install plugins on first Fish launch"
print_info "3. Grant accessibility permissions:"
print_info "   - System Settings > Privacy & Security > Accessibility"
print_info "   - Enable Rectangle for window management"
echo
print_info "4. Sign in to your apps:"
print_info "   - 1Password"
print_info "   - VS Code (Settings Sync)"
print_info "   - Chrome"
echo
print_info "5. Default browser:"
print_info "   Chrome should already be set as default"
echo
print_success "Enjoy your new setup!"
