#!/bin/bash

PACKAGES=(
  @vscode/test-electron
  chai @types/chai
  mocha @types/mocha
  sinon-chai @types/sinon-chai
  ts-node
)
npm install --save-dev "${PACKAGES[@]}"
