<#
.SYNOPSIS
    Executa um comando sanitizando e truncando saídas extensas para economizar tokens de contexto.
.EXAMPLE
    pwsh gsd-agy-kit/sanitize-command.ps1 "docker compose logs"
#>
param(
    [Parameter(Mandatory = $true, Position = 0, ValueFromRemainingArguments = $true)]
    [string]$CommandLine
)

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$sanitizerPath = Join-Path $scriptDir "sanitize-output.cjs"

if (-not (Test-Path $sanitizerPath)) {
    Invoke-Expression $CommandLine
    exit $LASTEXITCODE
}

node $sanitizerPath --exec $CommandLine
exit $LASTEXITCODE
