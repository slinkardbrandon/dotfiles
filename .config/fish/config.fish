# Disable fish greeting on startup
function fish_greeting
end

# Theme settings
set -g pure_color_primary yellow

set -Ux DOTFILES $HOME/.files

set -Ux EDITOR code
set -Ux TZ America/Chicago

# Add dotfiles bin to $PATH
set -U fish_user_paths $fish_user_paths $DOTFILES/bin
set -U fish_user_paths $fish_user_paths /usr/local/sbin
set -U fish_user_paths $fish_user_paths ./node_modules/.bin
