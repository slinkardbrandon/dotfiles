#!/usr/bin/env bash
echo Installing dev apps


# Install brew
/usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)"

# Install AWS Cli
pip3 install awscli --upgrade --user
