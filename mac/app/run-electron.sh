#!/bin/bash
# Run Electron for macOS development

# Clear ELECTRON_RUN_AS_NODE if set
unset ELECTRON_RUN_AS_NODE

# Set development environment
export NODE_ENV=development

# Run Electron
./node_modules/.bin/electron .
