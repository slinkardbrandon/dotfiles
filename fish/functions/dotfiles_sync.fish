function dotfiles_sync --description 'Pull latest dotfiles and run sync'
    set -l prev (pwd)
    cd ~/dotfiles && git pull && bun run sync
    cd $prev
end
