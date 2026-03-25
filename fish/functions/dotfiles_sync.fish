function dotfiles_sync --description 'Pull latest dotfiles and run sync'
    set -l prev (pwd)
    cd ~/dotfiles && git pull && bun run sync
    cd $prev

    # Reload fish config so new aliases/functions are available immediately
    source ~/.config/fish/config.fish
    echo "[✓] Fish config reloaded"
end
