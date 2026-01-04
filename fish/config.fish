# ~/.config/fish/config.fish
# Fish shell configuration

if status is-interactive
    # Commands to run in interactive sessions can go here

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
