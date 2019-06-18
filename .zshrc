source ~/.antigen.zsh

# Settings
# Easy toggle of antigen logger
# ANTIGEN_LOG="~/Desktop/antigen.log"

export DOTFILES="~/.files"
export EDITOR=code
export TZ=America/Chicago
export LOCAL_NODE_MODULES_BIN="./node_modules/.bin"
export PATH=$PATH:~/go/bin

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

# Register additional `builtin`commands
eval $(thefuck --alias)

# Functions

## Prettify the interface to online reference manuals
function man() {
     env \
         LESS_TERMCAP_mb=$(printf "\e[1;31m") \
         LESS_TERMCAP_md=$(printf "\e[1;36m") \
         LESS_TERMCAP_me=$(printf "\e[0m") \
         LESS_TERMCAP_se=$(printf "\e[0m") \
         LESS_TERMCAP_so=$(printf "\e[1;44;33m") \
         LESS_TERMCAP_ue=$(printf "\e[0m") \
         LESS_TERMCAP_us=$(printf "\e[1;32m") \
         PAGER="${commands[less]:-$PAGER}" \
         _NROFF_U=1 \
         PATH="$HOME/bin:$PATH" \
             man "$@"
}
# Create a branch from the most recent 'develop' branch
function branch() { git fetch && git checkout develop && git pull && git checkout -b "$@" ;}

# Squash all commits that are not current with the 'develop' branch
function squash() {
  local BRANCH="$(git branch | grep \* | cut -d ' ' -f2)"

  git fetch;
  git checkout develop
  git pull;
  echo "Checking out $BRANCH"
  git checkout $BRANCH
  git reset --soft develop;
  git add .;
  git commit -m $@;
}

# Git add
function ga() {
  git add $@;
}

# Git commit
function gc() {
  git commit -m $@;
}

# Git status
function gs() {
  git status;
}

# Move an npm package to dependencies
function npmProd() {
  npm uninstall $@;
  npm i $@;
}

# Move a npm package to dev dependencies
function npmDev() {
  npm uninstall $@;
  npm i -D $@;
}

# Build and run a docker image, tag it based on current working directory
# Optionally accepts a single argument of port.
# Example:
# drun 9000:9001 => map port 9001 of the docker container to port 9000 of the working machine
function drun() {
  # Use parameter expansion magic to get the current folder
  local dir=${PWD##*/}
  local runningImages=$(docker ps --filter "ancestor=${dir}" --format "{{.ID}}")

  echo "Stopping running images matching name: ${dir}"
  echo "Stopped container(s): $(docker stop ${runningImages})\n"

  # Build the image, tag it based on current folder and run the image as a container
  docker build -t ${dir} .

  if [ $# -eq 0 ]
  then
    docker run -idt ${dir}
  else
    docker run -idt -p $1 ${dir}
  fi
}

# Stop and remove all docker containers
alias ddestroy='docker stop $(docker ps -a -q) && docker rm $(docker ps -a -q)'


# Aliases

## Kill all running docker containers
alias dnuke='docker stop $(docker ps -a -q) > /dev/null'

## Jump to dotfiles.
alias dotfiles="cd ${DOTFILES}"

## Get my IP Address.
alias ip="curl ifconfig.co"

# Spooky witch knows all
alias witch="which"
