param(
  [Parameter(Mandatory=$true)][string]$Installer,
  [Parameter(Mandatory=$true)][string]$GameDirectory,
  [switch]$PrepareOnly
)
$ErrorActionPreference = 'Stop'
if (Get-Process -Name fm -ErrorAction SilentlyContinue) { throw 'Close Football Manager before installing the bridge.' }
$gamePath = (Resolve-Path -LiteralPath $GameDirectory).Path
if ((Split-Path $gamePath -Leaf) -ne 'Football Manager 26') { throw 'This verified loader/plugin bundle is for FM26 only. FM27 uses the external screen collector until bridge compatibility is verified.' }
if (-not (Test-Path -LiteralPath (Join-Path $gamePath 'fm.exe'))) { throw 'The selected folder does not contain fm.exe.' }
$installerPath = (Resolve-Path -LiteralPath $Installer).Path
$expectedInstaller = '3AABC4BBD6D7D7384122F48CA98D77A80374A46EE42FA2257B8C5CDAAAF88FF4'
if ((Get-FileHash -LiteralPath $installerPath -Algorithm SHA256).Hash -ne $expectedInstaller) { throw 'This helper supports the verified AIFM 1.2.4 installer only.' }
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$localRoot = Join-Path $projectRoot '.local\bridge'
$stage = Join-Path $localRoot ('stage-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force -Path $stage | Out-Null
$zip = Join-Path $localRoot 'BepInExPack_FootballManager26-6.0.738.zip'
$expectedZip = '045FBF3339A8BEB3FEBA9E0CC6B660E859B1F036D0E81F398BB75019B8F7C243'
if (-not (Test-Path -LiteralPath $zip) -or (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $expectedZip) {
  Invoke-WebRequest -Uri 'https://thunderstore.io/package/download/BepInEx/BepInExPack_FootballManager26/6.0.738/' -OutFile $zip
}
if ((Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash -ne $expectedZip) { throw 'Loader checksum mismatch. No game files were changed.' }
Expand-Archive -LiteralPath $zip -DestinationPath $stage
$payload = Join-Path $stage 'BepInExPack'
if (-not (Test-Path -LiteralPath $payload)) { throw 'Unexpected loader archive layout.' }
$extract = Join-Path $stage 'source'
New-Item -ItemType Directory -Path $extract | Out-Null
tar -xf $installerPath -C $extract resources/bridge/FMMediaDeskBridge.dll
if ($LASTEXITCODE -ne 0) { throw 'Could not extract the supplied bridge.' }
$bridge = Join-Path $extract 'resources\bridge\FMMediaDeskBridge.dll'
if (-not (Test-Path -LiteralPath $bridge)) { throw 'Bridge DLL missing from installer.' }
$pluginDirectory = Join-Path $payload 'BepInEx\plugins\FMMediaDeskBridge'
New-Item -ItemType Directory -Force -Path $pluginDirectory | Out-Null
Copy-Item -LiteralPath $bridge -Destination (Join-Path $pluginDirectory 'FMMediaDeskBridge.dll')
# The supplied AIFM package uses Unity Doorstop's version.dll proxy for FM26.
$winhttp = Join-Path $payload 'winhttp.dll'
if (Test-Path -LiteralPath $winhttp) { Rename-Item -LiteralPath $winhttp -NewName 'version.dll' }
$configFile = Join-Path $payload 'BepInEx\config\BepInEx.cfg'
if (Test-Path -LiteralPath $configFile) {
  $configText = Get-Content -LiteralPath $configFile -Raw
  $configText = [regex]::Replace($configText, '(\[Logging\.Console\][\s\S]*?\n\s*Enabled\s*=\s*)true', '${1}false')
  [IO.File]::WriteAllText($configFile, $configText)
}
$installFiles = @(Get-ChildItem -LiteralPath $payload -File -Recurse | ForEach-Object {
  $relative = [IO.Path]::GetRelativePath($payload, $_.FullName)
  $destination = [IO.Path]::GetFullPath((Join-Path $gamePath $relative))
  if (-not $destination.StartsWith($gamePath.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase)) { throw 'Unsafe archive path.' }
  if (Test-Path -LiteralPath $destination) { throw "Existing file conflict: $destination. No game files were changed." }
  [PSCustomObject]@{ Source=$_.FullName; Relative=$relative; Destination=$destination; SHA256=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }
})
if (Test-Path -LiteralPath (Join-Path $gamePath 'winhttp.dll')) { throw 'An existing winhttp.dll proxy was found. Inspect other game mods before installing.' }
$plan = [PSCustomObject]@{ GameDirectory=$gamePath; PreparedAt=[DateTime]::UtcNow.ToString('o'); LoaderVersion='6.0.738'; InstallerSHA256=$expectedInstaller; Files=$installFiles }
$manifestPath = Join-Path $localRoot 'install-manifest.json'
$plan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $localRoot 'prepared-manifest.json') -Encoding utf8
if ($PrepareOnly) { Write-Output "Verified install plan: $($installFiles.Count) new files. Game folder unchanged."; exit 0 }
if (Get-Process -Name fm -ErrorAction SilentlyContinue) { throw 'FM started while preparing the installation. Close it and retry.' }
# All destinations were checked for conflicts before the first write.
foreach ($file in $installFiles) {
  New-Item -ItemType Directory -Force -Path ([IO.Path]::GetDirectoryName($file.Destination)) | Out-Null
  Copy-Item -LiteralPath $file.Source -Destination $file.Destination
}
$plan | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $manifestPath -Encoding utf8
foreach ($file in $installFiles) {
  if ((Get-FileHash -LiteralPath $file.Destination -Algorithm SHA256).Hash -ne $file.SHA256) { throw "Installed file did not verify: $($file.Relative)" }
}
Write-Output "Installed and verified $($installFiles.Count) bridge/loader files."
Write-Output "Game folder: $gamePath"
Write-Output "Manifest: $manifestPath"
Write-Output 'The bridge starts with FM. Load a save, then check http://127.0.0.1:47831/status.'
