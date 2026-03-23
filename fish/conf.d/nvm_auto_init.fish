# Bootstrap nvm_auto after nvm.fish has loaded (conf.d loads alphabetically)
if status is-interactive
    # Capture whatever version nvm.fish activated as our "home" default
    set -g _nvm_auto_default $nvm_current_version
    nvm_auto
end
