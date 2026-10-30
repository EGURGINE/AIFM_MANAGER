param(
  [Parameter(Mandatory=$true)][string]$OutputPath,
  [Parameter(Mandatory=$true)][string]$GameExecutable,
  [switch]$WithOcr
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
$expectedExe = [IO.Path]::GetFullPath($GameExecutable)
$process = Get-Process -Name fm -ErrorAction SilentlyContinue | Where-Object {
  $_.MainWindowHandle -ne [IntPtr]::Zero -and $_.Path -and [String]::Equals($_.Path, $expectedExe, [StringComparison]::OrdinalIgnoreCase)
} | Select-Object -First 1
if (-not $process) { @{ok=$false;reason='fm_not_running'} | ConvertTo-Json -Compress; exit 0 }
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class TouchlineWindow {
  [StructLayout(LayoutKind.Sequential)] public struct Rect { public int Left, Top, Right, Bottom; }
  [StructLayout(LayoutKind.Sequential)] public struct Point { public int X, Y; }
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr window, uint flags);
  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr window);
  [DllImport("user32.dll")] public static extern bool GetClientRect(IntPtr window, out Rect rect);
  [DllImport("user32.dll")] public static extern bool ClientToScreen(IntPtr window, ref Point point);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
}
'@
$null = [TouchlineWindow]::SetProcessDPIAware()
$handle = $process.MainWindowHandle
$foreground = [TouchlineWindow]::GetAncestor([TouchlineWindow]::GetForegroundWindow(), 2)
if ($foreground -ne $handle -or [TouchlineWindow]::IsIconic($handle)) { @{ok=$false;reason='fm_not_foreground'} | ConvertTo-Json -Compress; exit 0 }
$rect = New-Object TouchlineWindow+Rect
$point = New-Object TouchlineWindow+Point
$null = [TouchlineWindow]::GetClientRect($handle,[ref]$rect)
$null = [TouchlineWindow]::ClientToScreen($handle,[ref]$point)
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$left = [Math]::Max($point.X,$bounds.Left)
$top = [Math]::Max($point.Y,$bounds.Top)
$width = [Math]::Min($point.X+$rect.Right,$bounds.Right)-$left
$height = [Math]::Min($point.Y+$rect.Bottom,$bounds.Bottom)-$top
if ($width -lt 200 -or $height -lt 200) { @{ok=$false;reason='window_too_small'} | ConvertTo-Json -Compress; exit 0 }
$bitmap = New-Object System.Drawing.Bitmap($width,$height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
try { $graphics.CopyFromScreen($left,$top,0,0,$bitmap.Size) } finally { $graphics.Dispose() }
$scale = [Math]::Min(1,1600.0/[Math]::Max($width,$height))
$result = New-Object System.Drawing.Bitmap([int]($width*$scale),[int]($height*$scale))
$resize = [System.Drawing.Graphics]::FromImage($result)
try {
  $resize.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $resize.DrawImage($bitmap,0,0,$result.Width,$result.Height)
  $result.Save($OutputPath,[System.Drawing.Imaging.ImageFormat]::Png)
} finally { $resize.Dispose(); $bitmap.Dispose(); $result.Dispose() }
$text = ''
$ocrError = ''
if ($WithOcr) {
  try {
    Add-Type -AssemblyName System.Runtime.WindowsRuntime
    $null = [Windows.Storage.StorageFile,Windows.Storage,ContentType=WindowsRuntime]
    $null = [Windows.Graphics.Imaging.BitmapDecoder,Windows.Graphics.Imaging,ContentType=WindowsRuntime]
    $null = [Windows.Media.Ocr.OcrEngine,Windows.Foundation,ContentType=WindowsRuntime]
    $asTask = [System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object { $_.Name -eq 'AsTask' -and $_.IsGenericMethod -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation`1' } | Select-Object -First 1
    function Await-WinRT($Operation,[Type]$ResultType) {
      $task = $asTask.MakeGenericMethod($ResultType).Invoke($null,@($Operation))
      $task.Wait()
      return $task.Result
    }
    $storage = Await-WinRT ([Windows.Storage.StorageFile]::GetFileFromPathAsync($OutputPath)) ([Windows.Storage.StorageFile])
    $stream = Await-WinRT ($storage.OpenAsync([Windows.Storage.FileAccessMode]::Read)) ([Windows.Storage.Streams.IRandomAccessStream])
    try {
      $decoder = Await-WinRT ([Windows.Graphics.Imaging.BitmapDecoder]::CreateAsync($stream)) ([Windows.Graphics.Imaging.BitmapDecoder])
      $software = Await-WinRT ($decoder.GetSoftwareBitmapAsync()) ([Windows.Graphics.Imaging.SoftwareBitmap])
      try {
        $engine = [Windows.Media.Ocr.OcrEngine]::TryCreateFromUserProfileLanguages()
        if (-not $engine) { throw 'Windows OCR language is unavailable.' }
        $ocr = Await-WinRT ($engine.RecognizeAsync($software)) ([Windows.Media.Ocr.OcrResult])
        $text = $ocr.Text
      } finally { $software.Dispose() }
    } finally { $stream.Dispose() }
  } catch { $ocrError = $_.Exception.Message }
}
@{ok=$true;path=$OutputPath;text=$text;ocrError=$ocrError} | ConvertTo-Json -Compress
