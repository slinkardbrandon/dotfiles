#!/usr/bin/env bash
set -e

cloneZGen () {

  if [ -f ${HOME}/.zgen/zgen.zsh ]; then
    echo -e "Looks like zgen is already cloned!"
  else
    echo -e "Cloning zgen"
    git clone https://github.com/tarjoilija/zgen.git "${HOME}/.zgen"
  fi

}

setupZsh () {
  if [[ $(uname -s) == "Linux" ]]; then
    sudo apt install zsh
  fi

  # Setup zgen before copying in zshrc as I enjoy several zgen bundles :D
  cloneZGen

  echo -e '\nCopying in `.zshrc`\n'

  ln -sf $(pwd)/zshrc ~/.zshrc

  echo -e 'Applying changes from zshrc';
  # Switch to using zsh from bash
  zsh

  # Apply the zshrc configuration
  source ~/.zshrc
}

main () {
  if [ -f ~/.zshrc ]; then
    echo -e '\nA `.zshrc` already exists in the home directory.';
    while true
      do
      read -p "Would you like to overwrite it? [n] " answer
      answer=${answer:-n}

      case $answer in
      [yY]* ) setupZsh
              break;;
      [nN] )  break;;
      * )     echo "Please enter Y or N.";
              break;;
      esac
      done

  else
    setupZsh
  fi
}

main
