zmodload zsh/zprof

# Load zgen only if a user types a zgen command
zgen () {
	if [[ ! -s ${ZDOTDIR:-${HOME}}/.zgen/zgen.zsh ]]; then
		git clone --recursive https://github.com/tarjoilija/zgen.git ${ZDOTDIR:-${HOME}}/.zgen
	fi
	source ${ZDOTDIR:-${HOME}}/.zgen/zgen.zsh
	zgen "$@"
}

# if the init scipt doesn't exist
if [[ ! -s ${ZDOTDIR:-${HOME}}/.zgen/init.zsh ]]; then
  echo "Creating a zgen save"

  zgen oh-my-zsh

  # plugins
  zgen oh-my-zsh plugins/git
  zgen oh-my-zsh plugins/command-not-found
  zgen oh-my-zsh plugins/magic-enter

  zgen loadall <<EOPLUGINS
    zsh-users/zsh-syntax-highlighting
    zsh-users/zsh-autosuggestions
    zsh-users/zsh-completions
    rupa/z
    zsh-users/zsh-history-substring-search
    chrissicool/zsh-256color
    unixorn/autoupdate-zgen
    unixorn/bitbucket-git-helpers.plugin.zsh
    djui/alias-tips
EOPLUGINS
  # ^ can't indent this EOPLUGINS

  # theme
  zgen oh-my-zsh themes/arrow

  # save all to init script
  zgen save

  # Compile
  zcompile ${ZDOTDIR:-${HOME}}/.zgen/init.zsh
else
  source ${ZDOTDIR:-${HOME}}/.zgen/init.zsh
fi

# Setup Zgen watcher
ZGEN_RESET_ON_CHANGE=(${HOME}/.zshrc)

# Aliases
export DOTFILES="$HOME/.files"
export EDITOR=code
export TZ=America/Chicago
export LOCAL_NODE_MODULES_BIN="./node_modules/.bin"

# Add vars to path
export PATH="${PATH}:${HOME}/go/bin"
export PATH="${PATH}:${DOTFILES}/bin"
export PATH="${PATH}:${LOCAL_NODE_MODULES_BIN}"

# Load aliases.
source ${DOTFILES}/aliases

# Register additional `builtin`commands
eval $(thefuck --alias)