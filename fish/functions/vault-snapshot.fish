function vault-snapshot --description 'Snapshot the Obsidian vault to the git backup remote'
    set -l vault ~/Documents/the-great-vault

    if not test -d $vault/.git
        echo "vault-snapshot: $vault is not a git repo" >&2
        return 1
    end

    if test -z (git -C $vault status --porcelain | string trim)
        echo "Nothing to snapshot."
        return 0
    end

    set -l msg $argv
    if test -z "$msg"
        set msg "Snapshot "(date '+%Y-%m-%d %H:%M')
    end

    git -C $vault add -A
    and git -C $vault commit -m "$msg"
    and git -C $vault push
end
