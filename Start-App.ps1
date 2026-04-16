param(
    [switch]$BuildFrontend
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendDir = Join-Path $root "frontend"
$backendDir = Join-Path $root "backend"
$venvPython = Join-Path $backendDir ".venv\Scripts\python.exe"

if ($BuildFrontend) {
    Push-Location $frontendDir
    try {
        npm install
        npm run build
    }
    finally {
        Pop-Location
    }
}

$pythonExe = if (Test-Path $venvPython) { $venvPython } else { "py -3.13" }

Push-Location $backendDir
try {
    if ($pythonExe -eq "py -3.13") {
        py -3.13 -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
    }
    else {
        & $pythonExe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
    }
}
finally {
    Pop-Location
}
