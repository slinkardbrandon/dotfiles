#!/usr/bin/env bash
set -e

setupDependencies() {
  if brew ls --versions myformula > /dev/null; then
    echo -e 'Brew is not currently installed. You can install it by executing\033[0;36m /usr/bin/ruby -e "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/master/install)" \033[0m'
    exit 1;
  fi

  echo "Checking for installed dependencies of Ckb-Next"

  if brew list -1 | grep -q "^${cmake}\$"; then
    echo "Installing CMake"
    brew install cmake
  fi

  if brew list -1 | grep -q "^${qt5}\$"; then
    echo "Installing qt5"
    brew install qt5
  fi

  if brew list -1 | grep -q "^${quazip}\$"; then
    echo "Installing quazip"
    brew install quazip
  fi
}

setupCorsairUtilities() {
  echo Installing Corsair Utilities
  local workingDirectory=$(pwd)

  echo Installing ckb-next [https://github.com/ckb-next/ckb-next]
  curl -L https://github.com/ckb-next/ckb-next/archive/v0.4.0.tar.gz | tar xz && cd ckb-next-0.4.0 && ./quickinstall

  cd $workingDirectory
  rm -rf ckb-next-0.4.0
}

main() {
  setupDependencies
  setupCorsairUtilities
}

main