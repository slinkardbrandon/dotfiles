# Bootstrap nvm_auto after nvm.fish has loaded (conf.d loads alphabetically)
if status is-interactive
    # Activate the highest installed Node version as the default
    set -l nvm_dir (set -q nvm_data && echo $nvm_data || echo ~/.local/share/nvm)
    # Collect installed versions via a for loop — an unmatched glob here is a
    # no-op (zero iterations) rather than a fatal "No matches for wildcard" error.
    set -l vers
    for dir in $nvm_dir/v*
        set -a vers (string replace -r '.*/v' '' -- $dir)
    end
    set -l latest_ver
    if set -q vers[1]
        set latest_ver (printf '%s\n' $vers | sort -V | tail -1)
    end
    if test -n "$latest_ver"
        nvm use --silent $latest_ver
    end

    # Capture as the revert target for nvm_auto
    set -g _nvm_auto_default $nvm_current_version
    nvm_auto
end
