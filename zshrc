source $HOME/.antigen.zsh

# Settings
# Easy toggle of antigen logger
# ANTIGEN_LOG="$HOME/Desktop/antigen.log"

export DOTFILES="$HOME/.files"
export EDITOR=code
export TZ=America/Chicago
export LOCAL_NODE_MODULES_BIN="./node_modules/.bin"

# Go-lang PATH.
export GOPATH="${HOME}/go"

# Add vars to path
export PATH="${PATH}:${GOPATH}/bin"
export PATH="${PATH}:${DOTFILES}/bin"
export PATH="${PATH}:${LOCAL_NODE_MODULES_BIN}"

# Setup antigen bundles
antigen bundle robbyrussell/oh-my-zsh lib/
antigen bundle git
# Guess what to install when running an unknown command.
antigen bundle command-not-found
antigen bundle zsh-users/zsh-syntax-highlighting
antigen bundle zsh-users/zsh-autosuggestions
antigen bundle zsh-users/zsh-completions
antigen bundle zsh-users/zsh-history-substring-search
antigen bundle rupa/z
antigen bundle lukechilds/zsh-nvm

## Theme
antigen theme KalebHawkins/ohmyzsh-IGeek-OSX

antigen apply

# Load aliases.
source ${DOTFILES}/aliases

# Register additional `builtin`commands
eval $(thefuck --alias)