function dotfiles_check --description 'Check for uncommitted dotfiles changes'
    set -l dotfiles_dir "$HOME/dotfiles"

    if not test -d "$dotfiles_dir/.git"
        return
    end

    # Only check once per day (store last check timestamp)
    set -l stamp_file "$dotfiles_dir/.last-drift-check"
    set -l now (date +%s)

    if test -f "$stamp_file"
        set -l last_check (cat "$stamp_file")
        set -l diff (math "$now - $last_check")
        # Skip if checked within the last 24 hours
        if test "$diff" -lt 86400
            return
        end
    end

    echo "$now" > "$stamp_file"

    # Check for uncommitted changes
    set -l changes (git -C "$dotfiles_dir" status --porcelain 2>/dev/null)
    if test -n "$changes"
        set -l count (echo "$changes" | wc -l | string trim)
        echo ""
        set_color yellow
        echo "  dotfiles: $count uncommitted change(s)"
        set_color normal
        echo "  cd ~/dotfiles && git diff"
        echo ""
    end

    # Check if behind remote
    git -C "$dotfiles_dir" fetch --quiet 2>/dev/null
    set -l behind (git -C "$dotfiles_dir" rev-list --count HEAD..@{upstream} 2>/dev/null)
    if test -n "$behind" -a "$behind" -gt 0
        set_color cyan
        echo "  dotfiles: $behind commit(s) behind remote"
        set_color normal
        echo "  cd ~/dotfiles && git pull"
        echo ""
    end

    set -l ahead (git -C "$dotfiles_dir" rev-list --count @{upstream}..HEAD 2>/dev/null)
    if test -n "$ahead" -a "$ahead" -gt 0
        set_color yellow
        echo "  dotfiles: $ahead unpushed commit(s)"
        set_color normal
        echo "  cd ~/dotfiles && git push"
        echo ""
    end
end
