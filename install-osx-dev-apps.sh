#!/usr/bin/env bash
echo Installing dev apps

# Install brew
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

brew bundle

# Setup fish

# Create symlinks necessary for proper fish config
ln -sf $(pwd)/.config/fish/config.fish $HOME/.config/config.fish
ln -sf $(pwd)/.config/fish/fishfile $HOME/.config/fish/fishfile
ln -sf $(pwd)/.config/fish/functions/* $HOME/.config/fish/functions/

# Install fish
curl https://git.io/fisher --create-dirs -sLo $XDG_CONFIG_HOME/fish/functions/fisher.fish

# Commit fishfile changes to fisher, gg
fish -c fisher

# Add fish to default shells list
sudo bash -c 'echo "/usr/local/bin/fish" >> /etc/shells'

# Change fish to default shell
chsh -s /usr/local/bin/fish
