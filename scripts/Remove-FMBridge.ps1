param([string]$Manifest = (Join-Path $PSScriptRoot '..\.local\bridge\install-manifest.json'))
$ErrorActionPreference = 'Stop'
if (Get-Process -Name fm -ErrorAction SilentlyContinue) { throw 'Close FM first.' }
$plan = Get-Content -LiteralPath $Manifest -Raw | ConvertFrom-Json
$gamePath = (Resolve-Path -LiteralPath $plan.GameDirectory).Path
if (-not (Test-Path -LiteralPath (Join-Path $gamePath 'fm.exe'))) { throw 'Original game folder not found.' }
foreach ($file in $plan.Files) {
  $target = [IO.Path]::GetFullPath((Join-Path $gamePath $file.Relative))
  if (-not $target.StartsWith($gamePath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($target) -eq 'fm.exe') { throw 'Unsafe removal target in manifest.' }
  if (Test-Path -LiteralPath $target) {
    if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash -eq $file.SHA256) { Remove-Item -LiteralPath $target }
    else { Write-Warning "Preserved changed file: $target" }
  }
}
Write-Output 'Removed only unchanged files from this install. Game-generated caches and modified files were preserved.'
