# Builds dist/chrome and dist/firefox from src/ + the per-browser manifests.
$root = $PSScriptRoot
$src = Join-Path $root 'src'

foreach ($browser in @('chrome', 'firefox')) {
    $out = Join-Path $root "dist\$browser"
    if (Test-Path $out) { Remove-Item -Recurse -Force $out }
    New-Item -ItemType Directory -Force $out | Out-Null
    Copy-Item (Join-Path $src '*') $out
    Copy-Item (Join-Path $root "manifest.$browser.json") (Join-Path $out 'manifest.json')
    Write-Host "built dist\$browser"
}
