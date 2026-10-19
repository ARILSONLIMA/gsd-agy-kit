# ==============================================================================
# Antigravity GSD Kit - One-Line Remote Installer (Windows PowerShell)
# Uso:
#   irm https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"

$RepoOwner = if ($env:GSD_REPO_OWNER) { $env:GSD_REPO_OWNER } else { "ARILSONLIMA" }
$RepoName = if ($env:GSD_REPO_NAME) { $env:GSD_REPO_NAME } else { "gsd-agy-kit" }
$RepoBranch = if ($env:GSD_REPO_BRANCH) { $env:GSD_REPO_BRANCH } else { "main" }
$RepoUrl = "https://github.com/$RepoOwner/$RepoName.git"
$ZipUrl = "https://github.com/$RepoOwner/$RepoName/archive/refs/heads/$RepoBranch.zip"

$TargetDir = (Get-Location).Path
$TmpDir = Join-Path $TargetDir ".gsd-agy-kit-tmp"

try {
    $nodeVer = node -v 2>$null
    if (-not $nodeVer) { throw "missing" }
} catch {
    Write-Host "`n🛑 [HARD STOP] Node.js nao encontrado no PATH!" -ForegroundColor Red
    Write-Host "   O Antigravity GSD Kit necessita do Node.js v18+ para operar." -ForegroundColor Yellow
    Write-Host "   Instale em: https://nodejs.org e tente novamente.`n" -ForegroundColor Yellow
    return
}

try {
    Write-Host "`n⬇️  Baixando Antigravity GSD Kit ($RepoOwner/$RepoName@$RepoBranch)..." -ForegroundColor Cyan
    if (Test-Path $TmpDir) {
        Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }

    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if ($gitCmd) {
        git clone --depth 1 --branch $RepoBranch --quiet $RepoUrl $TmpDir
    } else {
        New-Item -ItemType Directory -Path $TmpDir -Force | Out-Null
        $zipFile = Join-Path $TmpDir "kit.zip"
        Invoke-WebRequest -Uri $ZipUrl -OutFile $zipFile -UseBasicParsing
        Expand-Archive -Path $zipFile -DestinationPath $TmpDir -Force
        $extractedSub = Get-ChildItem -Path $TmpDir -Directory | Select-Object -First 1
        if ($extractedSub) {
            Get-ChildItem -Path $extractedSub.FullName -Force | Move-Item -Destination $TmpDir -Force
            Remove-Item -Path $extractedSub.FullName -Recurse -Force
        }
        Remove-Item -Path $zipFile -Force -ErrorAction SilentlyContinue
    }

    $installArgs = @($TargetDir, "--install")
    if ($env:GSD_FRONTEND -eq "true" -or $env:GSD_FRONTEND -eq "1") {
        $installArgs += "true"
    } elseif ($env:GSD_FRONTEND -eq "false" -or $env:GSD_FRONTEND -eq "0") {
        $installArgs += "false"
    }
    $installArgs += "--cleanup"

    $uiScript = Join-Path $TmpDir "setup-ui.cjs"
    node $uiScript @installArgs
} finally {
    if (Test-Path $TmpDir) {
        Remove-Item -Path $TmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}
