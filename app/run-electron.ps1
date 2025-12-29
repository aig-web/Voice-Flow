# Clear ELECTRON_RUN_AS_NODE so Electron runs properly
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:NODE_ENV = "development"

# Run electron from node_modules
& "$PSScriptRoot\node_modules\electron\dist\electron.exe" .
