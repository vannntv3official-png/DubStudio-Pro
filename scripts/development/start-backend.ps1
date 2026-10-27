$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Get-Item "$scriptDir\..\..").FullName
$backendDir = "$rootDir\backend"
$venvPython = "$backendDir\.venv\Scripts\python.exe"

if (!(Test-Path $venvPython)) {
    Write-Host "Creating virtual environment in $backendDir..." -ForegroundColor Cyan
    Set-Location $backendDir
    uv venv --python 3.12 .venv
    uv pip install -r requirements.txt
}

Write-Host "Starting DubStudio AI Backend..." -ForegroundColor Green
Set-Location $backendDir
& $venvPython -m app.main
