#!/usr/bin/env bash
set -e

main () {
  echo -e "Applying debian specific settings"
  setxkbmap -option caps:escape

  echo -e "📩 Updating package list and checking for updated versions"
  sudo apt -qq update -q

  # Basic Required Installs
  sudo apt -q install -qqy \
    apt-transport-https \
    vim \
    jq \
    python3-pip \
    curl \
    zsh \
    gdebi-core \
    wget \
    thefuck \
    exfat-utils \
    network-manager-vpnc \
    network-manager-vpnc-gnome \
    openconnect

  # Significantly alter the key repeat interval and initial delay before repeats occur.
  gsettings set org.gnome.desktop.peripherals.keyboard repeat-interval 15
  gsettings set org.gnome.desktop.peripherals.keyboard delay 225

  # Install Fira Code
  if [ $(ls -A ~/.local/share/fonts | grep Fira |  wc -l) -eq 0 ]; then
    mkdir -p ~/.local/share/fonts
    ## Original Link Seems broken, using one from the wayback machine
    ## https://github.com/tonsky/FiraCode/blob/master/distr/ttf/FiraCode-$type.ttf?raw=true"
    for type in Bold Light Medium Regular Retina; do wget -O ~/.local/share/fonts/FiraCode-$type.ttf "https://web.archive.org/web/20201023175352/https://raw.githubusercontent.com/tonsky/FiraCode/master/distr/ttf/FiraCode-$type.ttf"; done
    fc-cache -f
  fi

  # Brave 
  if ! hash brave-browser 2>/dev/null; then
    echo -e "Installing Brave Browser 🦁\n"
    sudo curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg arch=amd64] https://brave-browser-apt-release.s3.brave.com/ stable main"|sudo tee /etc/apt/sources.list.d/brave-browser-release.list
    echo -e "Updating Apt List\n"
    sudo apt -q update
    echo -e "Actuually installing brave\n";
    sudo apt -q install -y brave-browser
  fi

  # Discord 
  if ! hash discord 2>/dev/null; then
    echo -e "Installing Discord 🎧\n"
    wget -O ~/discord.deb "https://discordapp.com/api/download?platform=linux&format=deb"
    sudo gdebi -n ~/discord.deb 
    sudo apt -q update
    sudo apt -q install -y discord
  fi

  # Spotify
  if ! hash spotify 2>/dev/null; then
    echo -e "Installing Spotify 🎶\n"
    curl -sS https://download.spotify.com/debian/pubkey_0D811D58.gpg | sudo apt-key add -
    echo "deb http://repository.spotify.com stable non-free" | sudo tee /etc/apt/sources.list.d/spotify.list
    sudo apt -qq update
    sudo apt -qq install -y spotify-client
  fi

  # VSCode
  if ! hash code 2>/dev/null; then
    echo -e "Installing Visual Studio Code 🖥️\n"

    wget -qO- https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor > packages.microsoft.gpg
    sudo install -o root -g root -m 644 packages.microsoft.gpg /etc/apt/trusted.gpg.d/
    sudo sh -c 'echo "deb [arch=amd64,arm64,armhf signed-by=/etc/apt/trusted.gpg.d/packages.microsoft.gpg] https://packages.microsoft.com/repos/code stable main" > /etc/apt/sources.list.d/vscode.list'
    rm -f packages.microsoft.gpg

    sudo apt -q update
    sudo apt -q install -y code
    # Prefer settings sync nowadays
    # [ -d "${d}" ] && mkdir -p ~/.config/Code
    # cat $HOME/.files/vscode/keybindings.json > ~/.config/Code/User/keybindings.json
  fi

  # 1Password
  if ! hash 1password 2>/dev/null; then
    echo -e "Installing 1Password 🛡️\n"
    curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/keyrings/1password-archive-keyring.gpg
    echo 'deb [arch=amd64 signed-by=/usr/share/keyrings/1password-archive-keyring.gpg] https://downloads.1password.com/linux/debian/amd64 stable main' | sudo tee /etc/apt/sources.list.d/1password.list
    sudo mkdir -p /etc/debsig/policies/AC2D62742012EA22/
    curl -sS https://downloads.1password.com/linux/debian/debsig/1password.pol | sudo tee /etc/debsig/policies/AC2D62742012EA22/1password.pol
    sudo mkdir -p /usr/share/debsig/keyrings/AC2D62742012EA22
    curl -sS https://downloads.1password.com/linux/keys/1password.asc | sudo gpg --dearmor --output /usr/share/debsig/keyrings/AC2D62742012EA22/debsig.gpg

    sudo apt -q update
    sudo apt -q install -y 1password
  fi

    # Microsoft Teams
  if ! hash teams 2>/dev/null; then
    echo -e "TODO: Installing Microsoft Teams \n"

    curl https://packages.microsoft.com/keys/microsoft.asc | sudo apt-key add -
    sudo sh -c 'echo "deb [arch=amd64] https://packages.microsoft.com/repos/ms-teams stable main" > /etc/apt/sources.list.d/teams.list'
    sudo apt update
    sudo apt -q install -y teams
  fi


  if ! hash nvm 2>/dev/null; then
    echo "Installing nvm"
    wget -qO- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash

    nvm install 14
    nvm alias default 14
    nvm use 14
  fi

}

main
