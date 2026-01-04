#!/usr/bin/env bash

################################################################################
# symlink.sh
# Create symlinks for dotfiles
################################################################################

set -e

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
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

DOTFILES_DIR="$HOME/dotfiles"

# Function to create symlink with backup
create_symlink() {
    local source="$1"
    local target="$2"
    
    # Create parent directory if it doesn't exist
    mkdir -p "$(dirname "$target")"
    
    if [ -e "$target" ] || [ -L "$target" ]; then
        if [ -L "$target" ]; then
            print_info "Removing existing symlink: $target"
            rm "$target"
        else
            print_warning "Backing up existing file: $target -> $target.backup"
            mv "$target" "$target.backup"
        fi
    fi
    
    ln -s "$source" "$target"
    print_success "Created symlink: $target -> $source"
}

print_info "Creating symlinks..."

# Fish configuration
if [ -f "$DOTFILES_DIR/fish/config.fish" ]; then
    create_symlink "$DOTFILES_DIR/fish/config.fish" "$HOME/.config/fish/config.fish"
fi

if [ -f "$DOTFILES_DIR/fish/aliases.fish" ]; then
    create_symlink "$DOTFILES_DIR/fish/aliases.fish" "$HOME/.config/fish/aliases.fish"
fi

# Symlink fish_plugins for Fisher
if [ -f "$DOTFILES_DIR/fish/fish_plugins" ]; then
    create_symlink "$DOTFILES_DIR/fish/fish_plugins" "$HOME/.config/fish/fish_plugins"
fi

# Symlink fish functions
if [ -d "$DOTFILES_DIR/fish/functions" ]; then
    for func in "$DOTFILES_DIR/fish/functions"/*.fish; do
        if [ -f "$func" ]; then
            create_symlink "$func" "$HOME/.config/fish/functions/$(basename "$func")"
        fi
    done
fi

# Git configuration
if [ -f "$DOTFILES_DIR/git/.gitconfig" ]; then
    create_symlink "$DOTFILES_DIR/git/.gitconfig" "$HOME/.gitconfig"
fi

if [ -f "$DOTFILES_DIR/git/.gitignore_global" ]; then
    create_symlink "$DOTFILES_DIR/git/.gitignore_global" "$HOME/.gitignore_global"
fi

# Alacritty configuration
if [ -f "$DOTFILES_DIR/alacritty/alacritty.toml" ]; then
    create_symlink "$DOTFILES_DIR/alacritty/alacritty.toml" "$HOME/.config/alacritty/alacritty.toml"
fi

print_success "All symlinks created!"

# Install Fisher plugin manager and plugins
print_info "Installing Fisher plugin manager and plugins..."
if command -v fish &> /dev/null; then
    # Install Fisher first
    fish -c "curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source && fisher install jorgebucaran/fisher" 2>/dev/null || print_warning "Fisher installation failed"
    # Then install plugins from fish_plugins
    fish -c "fisher update" 2>/dev/null || print_warning "Fisher plugins installation failed - run 'fisher update' manually after restarting shell"
    print_success "Fisher and plugins installed!"
fi
