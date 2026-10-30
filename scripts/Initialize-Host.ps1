param([Parameter(Mandatory=$true)][string]$DeployRoot)
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($DeployRoot)) { throw 'DeployRoot must be an absolute local path, e.g. C:\Touchline-Server' }
$deployPath = [IO.Path]::GetFullPath($DeployRoot)
if (Test-Path -LiteralPath (Join-Path $deployPath '.env')) { throw 'Existing .env found. Your configuration was not changed.' }
docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0) { throw 'Start Docker Desktop in Linux containers mode first.' }
New-Item -ItemType Directory -Force -Path $deployPath,(Join-Path $deployPath 'data'),(Join-Path $deployPath 'backups') | Out-Null
$keyBytes = New-Object byte[] 24
[Security.Cryptography.RandomNumberGenerator]::Fill($keyBytes)
$joinKey = [Convert]::ToBase64String($keyBytes)
$config = @"
PORT=3210
BIND_ADDRESS=127.0.0.1
PUBLIC_ORIGIN=
COOKIE_SECURE=false
SERVER_JOIN_KEY=$joinKey
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=
"@
[IO.File]::WriteAllText((Join-Path $deployPath '.env'), $config)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot '..\compose.yml') -Destination (Join-Path $deployPath 'compose.yml')
Write-Host "Host directory initialized at $deployPath"
Write-Host 'Edit .env for your shared HTTPS address before inviting friends. The generated room creation key is stored there.'
