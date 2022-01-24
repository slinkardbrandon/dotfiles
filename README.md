# dotfiles

...files hype

## Note

- If you already have files that live at `~/.files` beware of the script as it will nuke them.
- You may have to run this script a couple times due to both how MacOS installs certain applications and due to the terminal configuration steps

## Install Script

```sh
cd ~/ && rm -rf ~/.files && curl -sL https://github.com/slinkardbrandon/dotfiles/archive/master.tar.gz | tar xz && mv dotfiles-master .files && cd .files && ./setup.sh
```
