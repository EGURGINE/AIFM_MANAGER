param(
  [Parameter(Mandatory=$true)][string]$DeployRoot,
  [Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{7,40}$')][string]$Revision
)
$ErrorActionPreference = 'Stop'
if (-not [IO.Path]::IsPathFullyQualified($DeployRoot)) { throw 'DeployRoot must be absolute.' }
$deployPath = [IO.Path]::GetFullPath($DeployRoot)
$repoPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if ($deployPath.TrimEnd('\') -eq $repoPath.TrimEnd('\') -or $deployPath.StartsWith($repoPath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Persistent deployment must live outside the runner checkout.' }
$envFile = Join-Path $deployPath '.env'
$composeFile = Join-Path $deployPath 'compose.yml'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'Run Initialize-Host.ps1 once and configure .env first.' }
$dockerMode = docker info --format '{{.OSType}}'
if ($LASTEXITCODE -ne 0 -or $dockerMode -ne 'linux') { throw 'Docker Desktop must be running in Linux containers mode.' }
$image = "touchline:$Revision"
docker build --tag $image $repoPath
if ($LASTEXITCODE -ne 0) { throw 'Image build failed; running server unchanged.' }
$stateFile = Join-Path $deployPath 'current-image.txt'
$previousImage = if (Test-Path -LiteralPath $stateFile) { (Get-Content -LiteralPath $stateFile -Raw).Trim() } else { '' }
$previousCompose = if (Test-Path -LiteralPath $composeFile) { Get-Content -LiteralPath $composeFile -Raw } else { '' }
$env:TOUCHLINE_IMAGE = if ($previousImage) { $previousImage } else { $image }
# Stop before copying SQLite/WAL files so the backup is consistent.
if ($previousImage) {
  docker compose --env-file $envFile -f $composeFile stop --timeout 30 app
  if ($LASTEXITCODE -ne 0) { throw 'Could not stop the previous server cleanly.' }
}
$backupPath = Join-Path $deployPath ('backups\' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + $Revision.Substring(0,7))
try {
  New-Item -ItemType Directory -Force -Path $backupPath | Out-Null
  $dataPath = Join-Path $deployPath 'data'
  if (Test-Path -LiteralPath $dataPath) { Copy-Item -LiteralPath $dataPath -Destination (Join-Path $backupPath 'data') -Recurse }
  if ($previousCompose) { [IO.File]::WriteAllText((Join-Path $backupPath 'compose.yml'), $previousCompose) }
  if ($previousImage) { [IO.File]::WriteAllText((Join-Path $backupPath 'image.txt'), $previousImage) }
  Copy-Item -LiteralPath (Join-Path $repoPath 'compose.yml') -Destination $composeFile -Force
  $env:TOUCHLINE_IMAGE = $image
  docker compose --env-file $envFile -f $composeFile up -d --no-build --wait --wait-timeout 90
  if ($LASTEXITCODE -ne 0) { throw 'New container failed health checks.' }
  [IO.File]::WriteAllText($stateFile, $image)
  Write-Host "Deployment healthy: $image"
  Write-Host "Database backup: $backupPath"
} catch {
  if ($previousImage -and $previousCompose) {
    [IO.File]::WriteAllText($composeFile, $previousCompose)
    $env:TOUCHLINE_IMAGE = $previousImage
    docker compose --env-file $envFile -f $composeFile up -d --no-build --wait --wait-timeout 90
    if ($LASTEXITCODE -ne 0) { Write-Warning 'Automatic container rollback failed. Inspect Docker Desktop and the backup directory.' }
    else { Write-Warning 'Previous container restored. Database backup was retained; no destructive database restore was attempted.' }
  }
  throw
}
