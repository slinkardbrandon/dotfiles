# ~/.config/fish/aliases.fish
# Fish shell aliases

################################################################################
# Git Aliases (Minimal)
################################################################################

alias g='git'
alias ga='git add'
alias gc='git commit'
alias gp='git push'

################################################################################
# Directory Navigation
################################################################################

alias ..='cd ..'
alias ...='cd ../..'
alias ....='cd ../../..'

################################################################################
# List Commands (using eza if available, fallback to ls)
################################################################################

if command -v eza >/dev/null 2>&1
    alias ls='eza'
    alias ll='eza -l'
    alias la='eza -la'
    alias lt='eza --tree'
    alias l='eza -lah'
else
    alias ll='ls -lh'
    alias la='ls -lah'
    alias l='ls -lah'
end

################################################################################
# Other Useful Aliases
################################################################################

# Cat with syntax highlighting (using bat if available)
if command -v bat >/dev/null 2>&1
    alias cat='bat'
end

# Vim -> Neovim
if command -v nvim >/dev/null 2>&1
    alias vim='nvim'
    alias v='nvim'
end

# Quick edits
alias reload='source ~/.config/fish/config.fish'
alias fishconfig='$EDITOR ~/.config/fish/config.fish'

# Network
alias ip='curl ifconfig.me'
# Local IP: platform-aware
switch (uname)
    case Darwin
        alias localip='ipconfig getifaddr en0'
    case '*'
        alias localip='hostname -I | awk \'{print $1}\''
end

# System
alias cleanup='find . -type f -name "*.DS_Store" -ls -delete'

# Docker shortcuts
alias d='docker'
alias dc='docker compose'
alias dps='docker ps'
alias dpsa='docker ps -a'

# Yarn/npm shortcuts
alias y='yarn'
alias n='npm'

# Lazygit
alias lg='lazygit'

# Source machine-local aliases (not tracked in git)
if test -f $HOME/.config/fish/aliases.local.fish
    source $HOME/.config/fish/aliases.local.fish
end
