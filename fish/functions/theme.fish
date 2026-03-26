function theme --description 'Switch terminal color theme'
    if test (count $argv) -eq 0
        bun run --cwd ~/dotfiles theme.ts
        return
    end
    bun run --cwd ~/dotfiles theme.ts $argv[1]
end
