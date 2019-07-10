#!/bin/bash

curl -sL https://dl.google.com/go/go1.12.6.darwin-amd64.tar.gz | tar xzv - -C ~/go

mkdir ${GOPATH}
