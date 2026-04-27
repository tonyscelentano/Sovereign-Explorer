# convert_icons.ps1
# Bulk converts .ico files to .webp using a simple move/rename approach if WebP is preferred.
# For a "real" conversion, we'd use FFmpeg or Magick, but for now we'll scaffold the logic
# to ensure the app handles the .ico fallback correctly.

param (
    [string]$PackPath
)

if (-not (Test-Path "$PackPath\ico")) {
    Write-Host "No 'ico' folder found in $PackPath" -ForegroundColor Red
    return
}

$webpDir = New-Item -ItemType Directory -Force -Path "$PackPath\webp"

Get-ChildItem -Path "$PackPath\ico\*.ico" | ForEach-Object {
    $newName = $_.BaseName + ".webp"
    $target = Join-Path $webpDir.FullName $newName
    
    # Placeholder for actual conversion logic
    # In a real environment, we'd use: ffmpeg -i $_.FullName $target
    Write-Host "Ready to convert: $($_.Name) -> $newName" -ForegroundColor Cyan
}

Write-Host "Scaffold complete. Ready for WebP migration." -ForegroundColor Green
