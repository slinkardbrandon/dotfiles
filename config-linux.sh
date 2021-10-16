#!/usr/bin/env bash
set -e

main () {
  echo -e "📩 Updating package list and checking for updated versions"
  sudo apt -qq update -q

  # Basic Required Installs 
  sudo apt -q install -qqy \
    apt-transport-https \
    curl \
    zsh \
    gdebi-core \
    wget


  # Brave 
  if ! hash brave-browser 2>/dev/null; then
    echo -e "Installing Brave Browser 🦁\n"
    sudo curl -fsSLo /usr/share/keyrings/brave-browser-archive-keyring.gpg https://brave-browser-apt-release.s3.brave.com/brave-browser-archive-keyring.gpg
    echo "deb [signed-by=/usr/share/keyrings/brave-browser-archive-keyring.gpg arch=amd64] https://brave-browser-apt-release.s3.brave.com/ stable main"|sudo tee /etc/apt/sources.list.d/brave-browser-release.list
    sudo apt -q update
    sudo apt -qinstall -y brave-browser
  fi

  # Discord 
  if ! hash discord 2>/dev/null; then
    echo -e "Installing Discord 🎧\n"
    wget -O ~/discord.deb "https://discordapp.com/api/download?platform=linux&format=deb"
    sudo gdebi -n ~/discord.deb 
    sudo apt -q update
    sudo apt -q install -y discord
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


}

main
