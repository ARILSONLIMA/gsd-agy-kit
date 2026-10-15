# ==============================================================================
# Optimize Tokens (Windows PowerShell)
# ==============================================================================

[CmdletBinding()]
param (
    [string]$TargetDir = (Get-Location).Path
)

$ErrorActionPreference = "Stop"

$script = Join-Path $PSScriptRoot "optimize-tokens.cjs"
if (Test-Path $script) {
    node $script $TargetDir
} else {
    Write-Error "Script optimize-tokens.cjs nao encontrado em $script"
}
