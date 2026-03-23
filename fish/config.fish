# ~/.config/fish/config.fish
# Fish shell configuration

if status is-interactive
    # Check for dotfiles drift (once per day)
    dotfiles_check

    # Auto-install Fisher if not present
    if not functions -q fisher
        echo "Installing Fisher plugin manager..."
        curl -sL https://raw.githubusercontent.com/jorgebucaran/fisher/main/functions/fisher.fish | source
        fisher install jorgebucaran/fisher
        echo "Fisher installed! Installing plugins..."
        fisher update
    end
end

# Set PATH
# Homebrew (macOS)
if test -d /opt/homebrew/bin
    set -gx PATH /opt/homebrew/bin /opt/homebrew/sbin $PATH
else if test -d /usr/local/bin
    set -gx PATH /usr/local/bin $PATH
end

# Linuxbrew
if test -d /home/linuxbrew/.linuxbrew/bin
    set -gx PATH /home/linuxbrew/.linuxbrew/bin $PATH
end

set -gx PATH $HOME/.local/bin $PATH
set -gx PATH $HOME/.cargo/bin $PATH
set -gx PATH $HOME/.bun/bin $PATH

# Rancher Desktop
if test -d "$HOME/.rd/bin"
    set -gx PATH $HOME/.rd/bin $PATH
end

# Go
if test -d "$HOME/go/bin"
    set -gx PATH $HOME/go/bin $PATH
end

# Initialize Starship prompt
if command -v starship >/dev/null 2>&1
    starship init fish | source
end

# Load aliases
if test -f $HOME/.config/fish/aliases.fish
    source $HOME/.config/fish/aliases.fish
end

# Environment variables
set -gx EDITOR nvim
set -gx VISUAL nvim

# Bun configuration
set -gx BUN_INSTALL "$HOME/.bun"

# Disable greeting
set fish_greeting

# Source machine-local overrides (not tracked in git)
if test -f $HOME/.config/fish/config.local.fish
    source $HOME/.config/fish/config.local.fish
end
