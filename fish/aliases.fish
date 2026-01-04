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
# List Commands (using exa if available, fallback to ls)
################################################################################

if command -v exa >/dev/null 2>&1
    alias ls='exa'
    alias ll='exa -l'
    alias la='exa -la'
    alias lt='exa --tree'
    alias l='exa -lah'
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

# Quick edits
alias reload='source ~/.config/fish/config.fish'
alias fishconfig='$EDITOR ~/.config/fish/config.fish'

# Network
alias ip='curl ifconfig.me'
alias localip='ipconfig getifaddr en0'

# System
alias cleanup='find . -type f -name "*.DS_Store" -ls -delete'

# Docker shortcuts
alias d='docker'
alias dc='docker-compose'
alias dps='docker ps'
alias dpsa='docker ps -a'

# Yarn/npm shortcuts
alias y='yarn'
alias n='npm'
