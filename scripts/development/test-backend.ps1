$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$rootDir = (Get-Item "$scriptDir\..\..").FullName
$backendDir = "$rootDir\backend"
$pytest = "$backendDir\.venv\Scripts\pytest.exe"

Set-Location $backendDir
& $pytest -v tests
