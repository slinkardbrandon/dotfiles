#!/usr/bin/env bash
echo Installing desktop apps

set -e

brew cask install \
  slack \
  virtualbox

# brew "node@12"
# brew "jq"
# brew "git"
# brew "thefuck"

cask "postico"

mas "Numbers", id: 409203825
mas "Pages", id: 409201541