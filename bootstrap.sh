#!/usr/bin/env bash

################################################################################
# bootstrap.sh
# Install Xcode Command Line Tools and Homebrew
################################################################################

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

# Install Xcode Command Line Tools
if xcode-select -p &> /dev/null; then
    print_success "Xcode Command Line Tools already installed"
else
    print_info "Installing Xcode Command Line Tools..."
    xcode-select --install
    
    # Wait for installation to complete
    print_warning "Please complete the Xcode installation dialog..."
    until xcode-select -p &> /dev/null; do
        sleep 5
    done
    
    print_success "Xcode Command Line Tools installed!"
fi

# Agree to Xcode license (only if full Xcode is installed)
if command -v xcodebuild &> /dev/null && xcodebuild -version &> /dev/null; then
    if ! sudo xcodebuild -license status &> /dev/null; then
        print_info "Accepting Xcode license..."
        sudo xcodebuild -license accept
    fi
fi

# Install Homebrew
if command -v brew &> /dev/null; then
    print_success "Homebrew already installed"
    print_info "Updating Homebrew..."
    brew update
else
    print_info "Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add Homebrew to PATH for current session
    if [[ $(uname -m) == 'arm64' ]]; then
        export PATH="/opt/homebrew/bin:$PATH"
    else
        export PATH="/usr/local/bin:$PATH"
    fi

    print_success "Homebrew installed!"
fi

# Verify Homebrew is available
if ! command -v brew &> /dev/null; then
    print_error "Homebrew installation failed or not in PATH"
    print_error "Please install Homebrew manually: https://brew.sh"
    exit 1
fi

print_success "Homebrew is ready"

# Install packages from Brewfile
DOTFILES_DIR="${DOTFILES_DIR:-$HOME/dotfiles}"
if [ -f "$DOTFILES_DIR/Brewfile" ]; then
    print_info "Installing packages from Brewfile..."
    brew bundle --file="$DOTFILES_DIR/Brewfile"
    print_success "All packages installed from Brewfile"
else
    print_warning "Brewfile not found, skipping package installation"
fi

print_info "Node.js will be managed via NVM (installed via Fish plugin)"

# Post-install configuration
print_info "Configuring installed tools..."

# Set Chrome as default browser
if command -v defaultbrowser &> /dev/null; then
    defaultbrowser chrome 2>/dev/null || true
    print_success "Set Chrome as default browser"
fi

# Initialize git-lfs
if command -v git-lfs &> /dev/null; then
    git lfs install
    print_success "Git LFS initialized"
fi

print_success "Bootstrap complete!"
