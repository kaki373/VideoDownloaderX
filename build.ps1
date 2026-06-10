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

# Distribution packages: zip for Chrome, xpi (= zip) for Firefox.
$release = Join-Path $root 'release'
New-Item -ItemType Directory -Force $release | Out-Null

$chromeZip = Join-Path $release 'VideoDownloaderX-chrome.zip'
if (Test-Path $chromeZip) { Remove-Item -Force $chromeZip }
Compress-Archive -Path (Join-Path $root 'dist\chrome\*') -DestinationPath $chromeZip
Write-Host "packaged release\VideoDownloaderX-chrome.zip"

$firefoxXpi = Join-Path $release 'VideoDownloaderX-firefox.xpi'
$firefoxZip = "$firefoxXpi.zip"
if (Test-Path $firefoxXpi) { Remove-Item -Force $firefoxXpi }
if (Test-Path $firefoxZip) { Remove-Item -Force $firefoxZip }
Compress-Archive -Path (Join-Path $root 'dist\firefox\*') -DestinationPath $firefoxZip
Rename-Item $firefoxZip $firefoxXpi
Write-Host "packaged release\VideoDownloaderX-firefox.xpi"
