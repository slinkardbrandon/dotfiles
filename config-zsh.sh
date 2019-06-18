#!/usr/bin/env bash
set -e

setupAntigen () {

  if [ -f ~/.antigen.zsh ]; then 
    echo -e "Looks like antigen is already installed!"
  else
    echo -e "Installing antigen"
    curl -sL https://raw.githubusercontent.com/zsh-users/antigen/master/bin/antigen.zsh > ~/.antigen.zsh
  fi

}

copyZshrc () {
  # Setup antigen before copying in zshrc as I enjoy several antigen bundles :D
  setupAntigen

  echo -e '\nCopying in `.zshrc`\n'
  cp $(pwd)/.zshrc ~/.zshrc

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
      [yY]* ) copyZshrc
              break;;
      [nN] )  break;;
      * )     echo "Please enter Y or N.";
              break;;
      esac
      done

  else
    copyZshrc
  fi
}

main
