# ==============================================================================
# Skills Profile Manager (Windows PowerShell)
# ==============================================================================

[CmdletBinding()]
param (
    [string]$Profile = "",
    [string]$Enable = "",
    [string]$Disable = "",
    [switch]$Sync,
    [switch]$Status,
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$script = Join-Path $PSScriptRoot "skills-manager.cjs"
if (-not (Test-Path $script)) {
    Write-Error "Script skills-manager.cjs nao encontrado em $script"
    exit 1
}

if ($Sync) {
    node $script sync "" $TargetDir
} elseif ($Profile) {
    node $script profile $Profile $TargetDir
} elseif ($Enable) {
    node $script enable $Enable $TargetDir
} elseif ($Disable) {
    node $script disable $Disable $TargetDir
} else {
    node $script status $TargetDir
}
