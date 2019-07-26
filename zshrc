
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

  # Pressing tab after the various commands should autofill authors, branches
  # and tags depending on context.
  zgen oh-my-zsh plugins/git-extras

  zgen oh-my-zsh plugins/jira
  zgen oh-my-zsh plugins/command-not-found

  zgen loadall <<EOPLUGINS
    # Installs nvm
    lukechilds/zsh-nvm

    # This package provides syntax highlighting for the shell zsh. It enables highlighting
    # of commands whilst they are typed at a zsh prompt into an interactive terminal.
    # This helps in reviewing commands before running them, particularly in catching
    # syntax errors.
    zsh-users/zsh-syntax-highlighting

    # It suggests commands as you type based on history and completions.
    zsh-users/zsh-autosuggestions

    # This projects aims at gathering/developing new completion scripts that are
    # not available in Zsh yet. The scripts may be contributed to the Zsh project
    # when stable enough.
    zsh-users/zsh-completions

    # Tracks your most used directories, based on 'frecency'.
    # After  a  short  learning  phase, z will take you to the most 'frecent'
    # directory that matches ALL of the regexes given on the command line, in
    # order.
    rupa/z

    # This is a clean-room implementation of the Fish shell's history search feature,
    # where you can type in any part of any command from history and then press
    # chosen keys, such as the UP and DOWN arrows, to cycle through matches.
    zsh-users/zsh-history-substring-search

    # Auto update zgen and bundles
    # Set ZGEN_PLUGIN_UPDATE_DAYS before calling the bundle if you don't want the default value of 7 days.
    # Set ZGEN_SYSTEM_UPDATE_DAYS before calling the bundle if you don't want the default value of 7 days.
    unixorn/autoupdate-zgen

    # Adds Bitbucket helper scripts
    # git-bb-create-pull-request
    # git-bb-list-pull-requests
    unixorn/bitbucket-git-helpers.plugin.zsh

    # A Zsh plugin to help remembering those shell aliases and Git aliases you once defined.
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
export JIRA_URL="https://jira.cl.glhec.org"

# Add vars to path
export PATH="${PATH}:${HOME}/go/bin"
export PATH="${PATH}:${DOTFILES}/bin"
export PATH="${PATH}:${LOCAL_NODE_MODULES_BIN}"

# Load aliases.
source ${DOTFILES}/aliases

# Register additional `builtin`commands
eval $(thefuck --alias)