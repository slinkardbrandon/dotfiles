
# Settings
# Easy toggle of antigen logger
# ANTIGEN_LOG="~/Desktop/antigen.log"

export DOTFILES="${HOME}/.files"
export EDITOR=code
export TZ=America/Chicago

# Is antigen installed?
if [ ! -d "${HOME}/.antigen" ]; then
  # Nope! Install it.
  curl -L git.io/antigen > "${HOME}/.antigen.zsh"
fi

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
