$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Push-Location $backendDir
try {
    py -3.13 -m venv --clear .venv
    .\.venv\Scripts\python.exe -m pip install --upgrade pip
    .\.venv\Scripts\python.exe -m pip install -r requirements.txt
}
finally {
    Pop-Location
}

Push-Location $frontendDir
try {
    npm install
}
finally {
    Pop-Location
}

Write-Host "Setup finished. Run .\Start-App.ps1 -BuildFrontend from the project root."
