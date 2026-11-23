param([string]$ProgramFolder)
$ErrorActionPreference = 'Stop'

try {
    if (!$ProgramFolder) { $ProgramFolder = Read-Host 'Paste the folder containing CT QA Manager.exe' }
    $root = (Resolve-Path -LiteralPath $ProgramFolder.Trim().Trim('"')).Path
    $executable = Join-Path $root 'CT QA Manager.exe'
    $runtime = Join-Path $root 'version'
    $manifest = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'update.json') -Raw | ConvertFrom-Json
    $update = Join-Path $PSScriptRoot 'app'
    $resources = Join-Path $root 'resources'
    $installed = Join-Path $resources 'app'
    if (!(Test-Path -LiteralPath $executable -PathType Leaf) -or !(Test-Path -LiteralPath $runtime -PathType Leaf)) {
        throw 'Select the folder containing the unpacked CT QA Manager.exe.'
    }
    if ((Get-Content -LiteralPath $runtime -Raw).Trim() -ne $manifest.electronVersion) {
        throw 'This update uses a different Electron version. Download the full Windows ZIP.'
    }
    $old = Get-Content -LiteralPath (Join-Path $installed 'package.json') -Raw | ConvertFrom-Json
    $new = Get-Content -LiteralPath (Join-Path $update 'package.json') -Raw | ConvertFrom-Json
    if ($old.productName -ne 'CT QA Manager' -or $new.productName -ne $old.productName -or
        $new.version -ne $manifest.appVersion -or [version]$new.version -le [version]$old.version) {
        throw 'This update requires an earlier version of CT QA Manager.'
    }
    foreach ($file in @('electron/main.cjs', 'electron/preload.cjs', 'dist/client/index.html')) {
        if (!(Test-Path -LiteralPath (Join-Path $update $file) -PathType Leaf)) {
            throw "Update is incomplete. Missing $file."
        }
    }
    if (Get-Process -Name 'CT QA Manager' -ErrorAction SilentlyContinue) {
        throw 'Close CT QA Manager and run the update again.'
    }

    $suffix = [guid]::NewGuid().ToString('N')
    $stage = Join-Path $resources "app-update-$suffix"
    $backup = Join-Path $resources "app-backup-$($old.version)-$suffix"
    try {
        Copy-Item -LiteralPath $update -Destination $stage -Recurse
        Move-Item -LiteralPath $installed -Destination $backup
        try {
            Move-Item -LiteralPath $stage -Destination $installed
        } catch {
            Move-Item -LiteralPath $backup -Destination $installed
            throw
        }
    } finally {
        if (Test-Path -LiteralPath $stage) { Remove-Item -LiteralPath $stage -Recurse -Force }
    }
    Write-Host "Updated CT QA Manager to $($new.version). You can now open the program."
    Write-Host "Previous app files: $backup"
} catch {
    Write-Error $_ -ErrorAction Continue
    exit 1
}
