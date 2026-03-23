function nvm_auto --on-variable PWD --description 'Auto-switch Node version on cd via .nvmrc'
    test ! -t 0 && return

    set -l nvmrc (_nvm_find_up $PWD .nvmrc)
    or set nvmrc (_nvm_find_up $PWD .node-version)

    if test -n "$nvmrc"
        read -l ver <$nvmrc
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
