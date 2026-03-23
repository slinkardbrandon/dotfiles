function nvm_auto --on-variable PWD --description 'Auto-switch Node version on cd via .nvmrc'
    test ! -t 0 && return

    # Walk up from PWD looking for .nvmrc or .node-version
    set -l dir $PWD
    set -l ver ""
    while test -n "$dir"
        if test -f "$dir/.nvmrc"
            read ver <"$dir/.nvmrc"
            break
        else if test -f "$dir/.node-version"
            read ver <"$dir/.node-version"
            break
        end
        set dir (string replace -r '/[^/]*$' '' $dir)
    end

    if test -n "$ver"
        if test "$ver" != "$nvm_current_version"
            if not nvm use --silent $ver 2>/dev/null
                echo "nvm: Node $ver not installed — installing..."
                nvm install $ver
            end
        end
    else if set -q nvm_current_version
        and set -q nvm_default_version
        and test "$nvm_current_version" != "$nvm_default_version"
        nvm use --silent $nvm_default_version
    end
end
