# Bootstrap nvm_auto after nvm.fish has loaded (conf.d loads alphabetically)
if status is-interactive
    # Activate the highest installed Node version as the default
    set -l nvm_dir (set -q nvm_data && echo $nvm_data || echo ~/.local/share/nvm)
    set -l latest_ver (ls -d $nvm_dir/v* 2>/dev/null | sort -V | tail -1 | string replace -r '.*/v' '')
    if test -n "$latest_ver"
        nvm use --silent $latest_ver
    end

    # Capture as the revert target for nvm_auto
    set -g _nvm_auto_default $nvm_current_version
    nvm_auto
end
