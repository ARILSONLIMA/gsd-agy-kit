# ==============================================================================
# Uninstall Antigravity GSD Kit (Windows PowerShell)
# ==============================================================================

[CmdletBinding()]
param (
    [string]$TargetDir = ""
)

$ErrorActionPreference = "Continue"

$kitDir = $PSScriptRoot

if (-not $TargetDir) {
    $currentLoc = (Get-Location).Path
    if ($currentLoc -eq $kitDir -or $currentLoc.StartsWith($kitDir)) {
        $TargetDir = Split-Path $kitDir -Parent
    } else {
        $TargetDir = $currentLoc
    }
}

Write-Host "`n🧹 [Antigravity GSD Kit] Iniciando desinstalacao e reversao..." -ForegroundColor Yellow

$agentsDir = Join-Path $TargetDir ".agents"
$hooksJsonPath = Join-Path $agentsDir "hooks.json"

# 1. Remover hooks do hooks.json
if (Test-Path $hooksJsonPath) {
    try {
        $existingJson = Get-Content $hooksJsonPath -Raw | ConvertFrom-Json -AsHashtable
        if ($existingJson.ContainsKey("token-efficiency-guard")) {
            $existingJson.Remove("token-efficiency-guard")
            $updatedContent = $existingJson | ConvertTo-Json -Depth 10
            Set-Content -Path $hooksJsonPath -Value $updatedContent -Encoding utf8
            Write-Host "   ✅ 'token-efficiency-guard' removido de: $hooksJsonPath" -ForegroundColor Green
        }
    } catch {
        Write-Warning "⚠️ Nao foi possivel editar ${hooksJsonPath}: $_"
    }
}

# 2. Remover arquivos e diretórios de hooks instalados
$filesToRemove = @(
    (Join-Path $agentsDir "hooks\token-guard-preinvocation.cjs"),
    (Join-Path $agentsDir "hooks\token-guard-pretool.cjs"),
    (Join-Path $agentsDir "rules\token-protocol.md"),
    (Join-Path $agentsDir "rules\ast-grep.md"),
    (Join-Path $agentsDir "rules\graphify.md"),
    (Join-Path $agentsDir "rules\idioma.md"),
    (Join-Path $agentsDir ".last-heal-check"),
    (Join-Path $agentsDir ".health-cache"),
    (Join-Path $agentsDir ".jit-promotions.json"),
    (Join-Path $agentsDir ".last-synced-phase"),
    (Join-Path $agentsDir ".cache"),
    (Join-Path $agentsDir "kit"),
    (Join-Path $agentsDir "skills\gsd-tokens")
)

foreach ($file in $filesToRemove) {
    if (Test-Path $file) {
        Remove-Item -Path $file -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Removido: $file" -ForegroundColor Green
    }
}

# 3. Remover pasta de compatibilidade se existir
$compatDirs = @(
    (Join-Path $agentsDir "tools\gsd-agy-kit"),
    (Join-Path $agentsDir "gsd-agy-kit")
)
foreach ($cd in $compatDirs) {
    if (Test-Path $cd) {
        Remove-Item -Path $cd -Recurse -Force -ErrorAction SilentlyContinue
        Write-Host "   ✅ Pasta de compatibilidade removida: $cd" -ForegroundColor Green
    }
}

# 4. Remover Git Hooks criados pelo kit
$gitHooks = @(
    (Join-Path $TargetDir ".git\hooks\post-merge"),
    (Join-Path $TargetDir ".git\hooks\post-checkout"),
    (Join-Path $TargetDir ".git\hooks\post-commit"),
    (Join-Path $TargetDir ".git\hooks\post-commit.cmd")
)
foreach ($gh in $gitHooks) {
    if (Test-Path $gh) {
        $ghContent = Get-Content $gh -Raw -ErrorAction SilentlyContinue
        if ($ghContent -match "gsd-agy-kit|gsd-graphify-update|patch-agents") {
            Remove-Item -Path $gh -Force -ErrorAction SilentlyContinue
            Write-Host "   ✅ Git hook removido: $gh" -ForegroundColor Green
        }
    }
}

# 5. Limpar Protocol Block injetado nos subagentes
$subagentsDir = Join-Path $agentsDir "agents"
if (Test-Path $subagentsDir) {
    $agentsFiles = Get-ChildItem -Path $subagentsDir -Filter *.md
    $cleanedCount = 0
    foreach ($af in $agentsFiles) {
        $content = Get-Content $af.FullName -Raw
        if ($content -match "<!-- ANTIGRAVITY_TOKEN_PROTOCOL_START -->") {
            $cleaned = $content -replace "(?s)<!-- ANTIGRAVITY_TOKEN_PROTOCOL_START -->.*?<!-- ANTIGRAVITY_TOKEN_PROTOCOL_END -->\r?\n?", ""
            Set-Content -Path $af.FullName -Value $cleaned.Trim() -Encoding utf8
            $cleanedCount++
        }
    }
    Write-Host "   ✅ Limpos $cleanedCount subagentes (protocolo removido)." -ForegroundColor Green
}

# 6. Restaurar backup original dos subagentes se presente
$originalBackupDir = Join-Path $agentsDir ".backup-original-gsd"
if (Test-Path $originalBackupDir) {
    Copy-Item -Path (Join-Path $originalBackupDir "*") -Destination $subagentsDir -Recurse -Force
    Remove-Item -Path $originalBackupDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Subagentes originais restaurados com fidelidade a partir do snapshot de backup." -ForegroundColor Green
}

# 7. Restaurar todas as skills arquivadas em skills-pool de volta para skills/
$skillsPoolDir = Join-Path $agentsDir "skills-pool"
$activeSkillsDir = Join-Path $agentsDir "skills"
if (Test-Path $skillsPoolDir) {
    $poolSkills = Get-ChildItem -Path $skillsPoolDir -Directory
    foreach ($ps in $poolSkills) {
        $destSkill = Join-Path $activeSkillsDir $ps.Name
        if (-not (Test-Path $destSkill)) {
            Copy-Item -Path $ps.FullName -Destination $destSkill -Recurse -Force
        }
    }
    Remove-Item -Path $skillsPoolDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Todas as skills do pool restauradas para .agents/skills/." -ForegroundColor Green
}

# 8. Restaurar subagentes remanescentes de agents-pool se nao restaurados por backup
$agentsPoolDir = Join-Path $agentsDir "agents-pool"
if (Test-Path $agentsPoolDir) {
    $poolAgents = Get-ChildItem -Path $agentsPoolDir -Filter *.md
    foreach ($pa in $poolAgents) {
        $destAgent = Join-Path $subagentsDir $pa.Name
        if (-not (Test-Path $destAgent)) {
            Copy-Item -Path $pa.FullName -Destination $destAgent -Force
        }
    }
    Remove-Item -Path $agentsPoolDir -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "   ✅ Todos os subagentes do pool restaurados para .agents/agents/." -ForegroundColor Green
}

Write-Host "`n✅ [Antigravity GSD Kit] Desinstalacao concluida com sucesso!`n" -ForegroundColor Green
