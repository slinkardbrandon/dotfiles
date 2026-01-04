# ~/.config/fish/config.fish
# Fish shell configuration

if status is-interactive
    # Commands to run in interactive sessions can go here
end

# Set PATH
set -gx PATH /usr/local/bin /opt/homebrew/bin /opt/homebrew/sbin $PATH
set -gx PATH $HOME/.cargo/bin $PATH
set -gx PATH $HOME/.bun/bin $PATH

# Rancher Desktop
if test -d "$HOME/.rd/bin"
    set -gx PATH $HOME/.rd/bin $PATH
end

# Initialize Starship prompt
if command -v starship >/dev/null 2>&1
    starship init fish | source
end

# NVM - Node Version Manager
# Set default node version if nvm is available
if command -v nvm >/dev/null 2>&1
    nvm use default 2>/dev/null || nvm use 24 2>/dev/null
end

# Load aliases
if test -f ~/.config/fish/aliases.fish
    source ~/.config/fish/aliases.fish
end

# Environment variables
set -gx EDITOR vim
set -gx VISUAL vim

# Bun configuration
set -gx BUN_INSTALL "$HOME/.bun"

# Disable greeting
set fish_greeting
