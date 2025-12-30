#!/bin/bash
# macOS/Linux script to run Electron

# Unset ELECTRON_RUN_AS_NODE so Electron runs properly
unset ELECTRON_RUN_AS_NODE
export NODE_ENV=development

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Run electron from node_modules
"$SCRIPT_DIR/node_modules/.bin/electron" .
