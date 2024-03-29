#!/usr/bin/env bash
ROOT="$HOME/.files"

# COLOR_NC='\e[0m' # No Color
# COLOR_WHITE='\e[1;37m'
# COLOR_BLACK='\e[0;30m'
# COLOR_BLUE='\e[0;34m'
# COLOR_LIGHT_BLUE='\e[1;34m'
# COLOR_GREEN='\e[0;32m'
# COLOR_LIGHT_GREEN='\e[1;32m'
# COLOR_CYAN='\e[0;36m'
# COLOR_LIGHT_CYAN='\e[1;36m'
# COLOR_RED='\e[0;31m'
# COLOR_LIGHT_RED='\e[1;31m'
# COLOR_PURPLE='\e[0;35m'
# COLOR_LIGHT_PURPLE='\e[1;35m'
# COLOR_BROWN='\e[0;33m'
# COLOR_YELLOW='\e[1;33m'
# COLOR_GRAY='\e[0;30m'
# COLOR_LIGHT_GRAY='\e[0;37m'

set -e

echo -e "\n========================================="
echo -e "==== Setup Script Reporting for Duty ===="
echo -e "=========================================\n"


setupGitRemote() {
    git init
    git add .
    git remote add origin https://github.com/slinkardbrandon/dotfiles.git
    git remote update
    git checkout master
}

main () {
    if [ -d ~/.files ]; then
        rm -rf "~/.files";
    fi

    if [ ! -d .git ]; then
        setupGitRemote
    fi

    "$ROOT/symlink.sh"

    # If we're on a Mac
    if [[ $(uname -s) == "Darwin" ]]; then

        # Configure OSX preferences
        while true
        do
        read -p "Would you like to configure OSX? [n] " answer
        answer=${answer:-n}

        case $answer in
        [yY]* ) echo -e '\nConfiguring OSX System Settings\n'
                "$ROOT/config-osx.sh"
                break;;
        [nN] )  break;;
        * )     echo "Please enter Y or N.";
                break;;
        esac
        done

    fi

    # Configure Git
    while true
    do
    read -p "Would you like to configure git? [n] " answer
    answer=${answer:-n}

    case $answer in
    [yY]* ) echo -e "\nConfiguring Git\n"
            "$ROOT/config-git.sh"
            break;;

    [nN] )  break;;
    * )     echo "Please enter Y or N.";
            break;;
    esac
    done
}

main

echo -e "\nAll Done!"
echo -e "\nRestarting shell"
exec "$(which $SHELL)"
