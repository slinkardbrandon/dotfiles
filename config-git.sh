#!/bin/bash

git config --global pull.rebase false
git config --global core.excludesfile $HOME/.gitignore_global
git config --global include.path $HOME/.gitaliases
git config --global push.autoSetupRemote true
