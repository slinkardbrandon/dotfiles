#!/usr/bin/env bash
if [ !$(which -s cmake) ]; then
  echo -e "CMake is not currently installed. You can install it by executing\033[0;36m brew install cmake \033[0m"
  exit 1;
fi

echo Installing Corsair Utilities

echo Installing ckb-next [https://github.com/ckb-next/ckb-next]
curl -L https://github.com/ckb-next/ckb-next/archive/v0.4.0.tar.gz | tar xz && cd ckb-next-0.4.0 && ./quickinstall