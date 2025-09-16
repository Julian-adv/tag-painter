param(
    [string]$Owner = 'Julian-adv',
    [string]$Repo = 'tag-painter',
    [string]$Token = $env:GITHUB_TOKEN,
    [switch]$DebugLog
)

$ErrorActionPreference = 'Stop'

function Write-DebugLog {
    param([string]$Message)
    if ($DebugLog) {
        Write-Host "[DEBUG] $Message" -ForegroundColor DarkGray
    }
}

function Get-Headers {
    param([string]$Token)
    $headers = @{ 
        'User-Agent' = 'tag-painter-updater';
        'Accept' = 'application/vnd.github+json'
    }
    if ($Token -and $Token.Trim()) {
        $headers['Authorization'] = "Bearer $Token"
    }
    return $headers
}

function Get-LatestZipUrl {
    param(
        [string]$Owner,
        [string]$Repo,
        [hashtable]$Headers
    )
    $releaseApi = "https://api.github.com/repos/$Owner/$Repo/releases/latest"
    Write-Host "Fetching latest release info from $releaseApi"
    $release = Invoke-RestMethod -Uri $releaseApi -Headers $Headers
    Write-DebugLog ("Release tag: {0}; assets: {1}" -f $release.tag_name, ($release.assets | Measure-Object | Select-Object -ExpandProperty Count))
    $asset = $release.assets | Where-Object { $_.browser_download_url -match '\.zip$' } | Select-Object -First 1
    if ($asset) {
        Write-DebugLog ("Selected asset: {0}" -f $asset.browser_download_url)
        return $asset.browser_download_url
    }
    if ($release.zipball_url) {
        Write-DebugLog ("Selected zipball_url: {0}" -f $release.zipball_url)
        return $release.zipball_url
    }
    throw 'Could not determine a ZIP download URL from latest release.'
}

function Get-LatestReleaseInfo {
    param(
        [string]$Owner,
        [string]$Repo,
        [hashtable]$Headers
    )
    $releaseApi = "https://api.github.com/repos/$Owner/$Repo/releases/latest"
    Write-Host "Fetching latest release info from $releaseApi"
    return (Invoke-RestMethod -Uri $releaseApi -Headers $Headers)
}

try {
    # Ensure TLS 1.2 for older PowerShell environments.
    try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}
    
    # Ensure tempRoot exists even if we early-return (for finally cleanup guard)
    $tempRoot = ''

    Write-DebugLog ("Params: Owner={0} Repo={1} TokenSet={2}" -f $Owner, $Repo, ([bool]$Token))
    $headers = Get-Headers -Token $Token
    Write-DebugLog ("Headers set: Accept, User-Agent{0}" -f ($(if ($Token) { ', Authorization' } else { '' })))

    # Determine local target dir (for reading current version) before network download
    $cwd = (Get-Location).Path
    $tpDir = Join-Path $cwd 'tag-painter'
    if (Test-Path -LiteralPath $tpDir -PathType Container) {
        $targetDir = $tpDir
        Write-Host "Detected release layout. Target: $targetDir"
    } else {
        $targetDir = $cwd
        Write-Host "Target directory: $targetDir"
    }
    Write-DebugLog ("cwd={0}; targetDir={1}" -f $cwd, $targetDir)

    # Read current local version from package.json if available
    $pkgPath = Join-Path $targetDir 'package.json'
    $currentVersion = ''
    if (Test-Path -LiteralPath $pkgPath -PathType Leaf) {
        try {
            $pkg = Get-Content -LiteralPath $pkgPath -Raw | ConvertFrom-Json -Depth 32
            $currentVersion = '' + $pkg.version
        } catch {
            Write-DebugLog ("Failed to read local package.json: {0}" -f $_)
        }
    }

    # Get latest release info and compare versions
    $latest = Get-LatestReleaseInfo -Owner $Owner -Repo $Repo -Headers $headers
    $latestVersion = '' + ($latest.tag_name -replace '^[vV]', '')
    if ($currentVersion -and ($currentVersion -eq $latestVersion)) {
        Write-Host ("Already up to date. Version {0}" -f $currentVersion) -ForegroundColor Green
        return
    }

    # Proceed to download if upgrade is available or local version missing
    $downloadUrl = Get-LatestZipUrl -Owner $Owner -Repo $Repo -Headers $headers
    Write-DebugLog ("Download URL: {0}" -f $downloadUrl)

    $tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("tag-painter-update-" + [IO.Path]::GetRandomFileName())
    $null = New-Item -ItemType Directory -Path $tempRoot
    $zipPath = Join-Path $tempRoot 'release.zip'
    $extractDir = Join-Path $tempRoot 'extracted'
    $null = New-Item -ItemType Directory -Path $extractDir

    Write-Host "Downloading: $downloadUrl"
    Invoke-WebRequest -Uri $downloadUrl -Headers $headers -OutFile $zipPath -MaximumRedirection 10

    Write-Host "Extracting to: $extractDir"
    Expand-Archive -Path $zipPath -DestinationPath $extractDir -Force

    # Determine the actual root inside the extracted archive (GitHub zips usually have one top folder)
    $subdirs = Get-ChildItem -LiteralPath $extractDir -Directory -Force
    if ($DebugLog) { Write-DebugLog ("Extracted subdirs: {0}" -f (($subdirs | Select-Object -ExpandProperty Name) -join ', ')) }
    if ($subdirs.Count -eq 1) {
        $srcRoot = $subdirs[0].FullName
    } else {
        $srcRoot = $extractDir
    }
    Write-DebugLog ("Source root selected: {0}" -f $srcRoot)

    # Decide destination (targetDir already computed above); re-emit message for clarity
    if ($targetDir -eq $tpDir) {
        Write-Host "Detected release layout. Updating: $targetDir"
    } else {
        Write-Host "Updating current directory: $targetDir"
    }

    # Exclude updater and wrapper scripts and VCS metadata if copying from a repo/zipball root
    $exclude = @('update.ps1','update.sh','start.ps1','start.sh','.git')
    # If the archive root contains a tag-painter folder and the target is tag-painter,
    # copy from that folder instead of copying the folder itself.
    $copyRoot = $srcRoot
    if ((Split-Path -Leaf $targetDir) -eq 'tag-painter') {
        $maybeTp = Join-Path $srcRoot 'tag-painter'
        if (Test-Path -LiteralPath $maybeTp -PathType Container) {
            $copyRoot = $maybeTp
        }
    }
    Write-DebugLog ("Copy root: {0}" -f $copyRoot)

    function Copy-DataDirWithPreserve {
        param(
            [string]$SrcDataDir,
            [string]$DstDataDir
        )
        $preserveNames = @('wildcards.yaml','settings.json','prompts.json')
        if (-not (Test-Path -LiteralPath $DstDataDir -PathType Container)) {
            $null = New-Item -ItemType Directory -Path $DstDataDir -Force
        }
        $files = Get-ChildItem -LiteralPath $SrcDataDir -Recurse -File -Force
        foreach ($f in $files) {
            $rel = $f.FullName.Substring($SrcDataDir.Length).TrimStart([IO.Path]::DirectorySeparatorChar, [IO.Path]::AltDirectorySeparatorChar)
            $dst = Join-Path $DstDataDir $rel
            $dstDir = Split-Path -Parent $dst
            if (-not (Test-Path -LiteralPath $dstDir -PathType Container)) {
                $null = New-Item -ItemType Directory -Path $dstDir -Force
            }

            $isPreserve = $preserveNames -contains $f.Name
            if ($isPreserve -and (Test-Path -LiteralPath $dst -PathType Leaf)) {
                try {
                    $srcHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $f.FullName).Hash
                    $dstHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $dst).Hash
                } catch {
                    $srcHash = ''
                    $dstHash = 'x'
                }
                if ($srcHash -ne $dstHash) {
                    Write-Host ("Preserving user file (no overwrite): data/{0}" -f $f.Name)
                    continue
                }
            }
            if ($DebugLog) { Write-DebugLog ("Copy data file: {0} -> {1}" -f $f.FullName, $dst) }
            Copy-Item -LiteralPath $f.FullName -Destination $dst -Force
        }
    }

    $items = Get-ChildItem -LiteralPath $copyRoot -Force
    Write-DebugLog ("Items to copy: {0}" -f ($items.Count))
    foreach ($item in $items) {
        if ($exclude -contains $item.Name) { continue }
        $dest = Join-Path -Path $targetDir -ChildPath $item.Name

        if ($item.PSIsContainer -and $item.Name -ieq 'build' -and (Test-Path -LiteralPath $dest -PathType Container)) {
            Write-Host 'Replacing existing build directory...'
            Remove-Item -LiteralPath $dest -Recurse -Force
        }

        if ($item.PSIsContainer -and $item.Name -ieq 'data') {
            if ($DebugLog) { Write-DebugLog ("Copy (data with preserve): {0} -> {1}" -f $item.FullName, $dest) }
            Copy-DataDirWithPreserve -SrcDataDir $item.FullName -DstDataDir $dest
            continue
        }

        if (Test-Path -LiteralPath $dest) {
            if ($DebugLog) { Write-DebugLog ("Copy (overlay): {0} -> {1}" -f $item.FullName, $dest) }
            Copy-Item -LiteralPath $item.FullName -Destination $dest -Recurse -Force
        } else {
            if ($DebugLog) { Write-DebugLog ("Copy (new): {0} -> {1}" -f $item.FullName, (Join-Path $targetDir $item.Name)) }
            Copy-Item -LiteralPath $item.FullName -Destination $targetDir -Recurse -Force
        }
    }

    # If the archive contains a top-level update.ps1 and we are running from a release folder,
    # defer replacing the current updater until after this process exits (Windows lock semantics).
    # Look for updater at the archive root, not inside tag-painter folder
    $extractedTopUpdater = Join-Path $extractDir 'update.ps1'
    $currentUpdater = Join-Path $cwd 'update.ps1'
    if ((Test-Path -LiteralPath $extractedTopUpdater -PathType Leaf) -and (Test-Path -LiteralPath $currentUpdater -PathType Leaf)) {
        Write-DebugLog ("Found extracted updater at: {0}" -f $extractedTopUpdater)
        try {
            $oldHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $currentUpdater).Hash
            $newHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $extractedTopUpdater).Hash
        } catch {
            $oldHash = ''; $newHash = 'x'
        }

        if ($oldHash -ne $newHash) {
            Write-DebugLog ("Updater differs. Scheduling replacement. old={0} new={1}" -f $oldHash, $newHash)
            $stagedUpdater = Join-Path $tempRoot 'update.ps1.new'
            Copy-Item -LiteralPath $extractedTopUpdater -Destination $stagedUpdater -Force

            $helper = Join-Path $tempRoot 'apply-self-update.ps1'
            @"
param([int]
      $TargetPid,
      [string]
      $Src,
      [string]
      $Dest)
try { Wait-Process -Id $TargetPid -ErrorAction SilentlyContinue } catch {}
Start-Sleep -Seconds 1
Move-Item -Force -LiteralPath $Src -Destination $Dest
"@ | Set-Content -LiteralPath $helper -Encoding UTF8

            Write-Host 'Staging updater self-update after exit...'
            Start-Process -WindowStyle Hidden -FilePath pwsh -ArgumentList @('-NoProfile','-ExecutionPolicy','Bypass','-File', $helper, '-TargetPid', $PID, '-Src', $stagedUpdater, '-Dest', $currentUpdater) | Out-Null
        } else {
            Write-DebugLog 'Updater is identical; no replacement scheduled.'
        }
    }

    Write-Host 'Update complete.'
}
catch {
    Write-Error $_
    exit 1
}
finally {
    if ($null -ne $tempRoot -and $tempRoot -ne '' -and (Test-Path -LiteralPath $tempRoot)) {
        try { Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue } catch {}
    }
}
