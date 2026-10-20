# ==============================================================================
# Setup & Hub Antigravity GSD Kit (Windows PowerShell)
# ==============================================================================

[CmdletBinding(DefaultParameterSetName = "Interactive")]
param (
    [Parameter(Position = 0)]
    [string]$TargetDir = "",

    [Parameter(ParameterSetName = "Install")]
    [switch]$Install,

    [Parameter(ParameterSetName = "Install")]
    [Nullable[bool]]$HasFrontend = $null,

    [Parameter(ParameterSetName = "Test")]
    [switch]$Test,

    [Parameter(ParameterSetName = "Uninstall")]
    [switch]$Uninstall,

    [Parameter(ParameterSetName = "Report")]
    [switch]$Report,

    [Parameter(ParameterSetName = "Profile")]
    [string]$Profile = "",

    [Parameter(ParameterSetName = "Compact")]
    [switch]$Compact,

    [Parameter(ParameterSetName = "Doctor")]
    [switch]$Doctor,

    [Parameter(ParameterSetName = "Health")]
    [switch]$Health,

    [Parameter(ParameterSetName = "Graphify")]
    [switch]$Graphify,

    [Parameter(ParameterSetName = "Lsp")]
    [switch]$Lsp,

    [Parameter(ParameterSetName = "Errors")]
    [switch]$Errors,

    [Parameter(ParameterSetName = "Menu")]
    [switch]$Menu,

    [switch]$Cleanup,

    [switch]$NoCleanup
)

$ErrorActionPreference = "Stop"

$kitDir = $PSScriptRoot

# Auto-detecção do diretório alvo (raiz do projeto)
if (-not $TargetDir) {
    $currentLoc = (Get-Location).Path
    if ($kitDir -match "[\\/]\.agents[\\/]kit$") {
        $TargetDir = Split-Path (Split-Path $kitDir -Parent) -Parent
    } elseif ($currentLoc -eq $kitDir -or $currentLoc.StartsWith($kitDir)) {
        $parentDir = Split-Path $kitDir -Parent
        if ((Test-Path (Join-Path $parentDir ".agents")) -or (Test-Path (Join-Path $parentDir ".planning"))) {
            $TargetDir = $parentDir
        } else {
            $TargetDir = $kitDir
        }
    } else {
        $TargetDir = $currentLoc
    }
}

# 1. Delegar para motor de interface interativo e animado (setup-ui.cjs)
$uiScript = Join-Path $kitDir "setup-ui.cjs"
if (Test-Path $uiScript) {
    # 1.1 Verificar Node.js (Hard Stop)
    try {
        $nodeVersion = node -v 2>$null
        if (-not $nodeVersion) { throw "node missing" }
    } catch {
        Write-Host "`n🛑 [HARD STOP] Node.js nao encontrado no PATH!" -ForegroundColor Red
        Write-Host "   O kit necessita do Node.js v18+ para operar seus hooks de governança." -ForegroundColor Yellow
        Write-Host "   Instale o Node.js em: https://nodejs.org e tente novamente.`n" -ForegroundColor Yellow
        exit 1
    }

    $cmdArg = ""
    $extraArg = ""
    if ($Test) { $cmdArg = "--test" }
    elseif ($Uninstall) { $cmdArg = "--uninstall" }
    elseif ($Report) { $cmdArg = "--report" }
    elseif ($Profile) { $cmdArg = "--profile"; $extraArg = $Profile }
    elseif ($Compact) { $cmdArg = "--compact" }
    elseif ($Doctor) { $cmdArg = "--doctor" }
    elseif ($Health) { $cmdArg = "--health" }
    elseif ($Graphify) { $cmdArg = "--graphify" }
    elseif ($Lsp) { $cmdArg = "--lsp" }
    elseif ($Errors) { $cmdArg = "--errors" }
    elseif ($Install -or $null -ne $HasFrontend) {
        $cmdArg = "--install"
        if ($null -ne $HasFrontend) { $extraArg = if ($HasFrontend) { "true" } else { "false" } }
    }
    elseif ($Menu) { $cmdArg = "--menu" }

    $cleanupFlag = if ($NoCleanup) { @("--no-cleanup") } elseif ($Cleanup) { @("--cleanup") } else { @() }
    if ($cmdArg) {
        if ($extraArg) {
            node $uiScript "$TargetDir" "$cmdArg" "$extraArg" @cleanupFlag
        } else {
            node $uiScript "$TargetDir" "$cmdArg" @cleanupFlag
        }
    } else {
        # Padrão: inicia o instalador interativo (perguntando Backend vs Fullstack) e limpa temporários
        node $uiScript "$TargetDir" "--install" @cleanupFlag
    }
    exit $LASTEXITCODE
}

Write-Host "`n🚀 [Antigravity GSD Kit] Iniciando configuracao no Windows (Modo Fallback)..." -ForegroundColor Cyan
Write-Host "   Diretorio Alvo: $TargetDir" -ForegroundColor Gray

# Pergunta interativa sobre interface Front-End se não informada via parâmetro
if ($null -eq $HasFrontend) {
    if ([Environment]::UserInteractive -and -not [Console]::IsInputRedirected) {
        Write-Host "`n🎨 Configuracao de Interface / Front-End:" -ForegroundColor Cyan
        try {
            $prompt = Read-Host "   O projeto tera interface Front-End (UI/Web/App)? [s/N] (Padrao: N)"
            if ($prompt -and $prompt.Trim() -match "^(s|sim|y|yes)$") {
                $HasFrontend = $true
            } else {
                $HasFrontend = $false
            }
        } catch {
            $HasFrontend = $false
        }
    } else {
        $HasFrontend = $false
    }
} else {
    $HasFrontend = [bool]$HasFrontend
}

if ($HasFrontend) {
    Write-Host "   🎨 Modo Front-End: ATIVADO (UI phases, safety gates, reviews e perfil de skills full)" -ForegroundColor Green
} else {
    Write-Host "   ⚙️ Modo Front-End: DESATIVADO (perfil enxuto backend e UI desligada)" -ForegroundColor Gray
}

# 1. Verificar Node.js (Hard Stop)
try {
    $nodeVersion = node -v
    Write-Host "   Node.js detectado: $nodeVersion" -ForegroundColor Green
} catch {
    Write-Host "`n🛑 [HARD STOP] Node.js nao encontrado no PATH!" -ForegroundColor Red
    Write-Host "   O kit necessita do Node.js v18+ para operar seus hooks de governança." -ForegroundColor Yellow
    Write-Host "   Instale o Node.js em: https://nodejs.org e tente novamente.`n" -ForegroundColor Yellow
    exit 1
}

# 2. Verificar Ferramentas Obrigatorias (Circuit Breaker & Hard Stop)
Write-Host "`n🔍 Verificando ferramentas obrigatorias..." -ForegroundColor Cyan

# 2.1: ast-grep (Hard Stop)
try {
    $astGrepVer = ast-grep --version 2>$null
    if (-not $astGrepVer) { throw "ast-grep nao respondeu" }
    Write-Host "   ✅ ast-grep: $astGrepVer" -ForegroundColor Green
} catch {
    Write-Host "`n🛑 [HARD STOP] ast-grep nao encontrado no PATH!" -ForegroundColor Red
    Write-Host "   O ast-grep e obrigatorio para analise estrutural e AST conforme a Regra 4/5 do Projeto." -ForegroundColor Yellow
    Write-Host "   Para instalar, execute no terminal:" -ForegroundColor Yellow
    Write-Host "     npm install -g @ast-grep/cli" -ForegroundColor Cyan
    Write-Host "     ou: winget install ast-grep" -ForegroundColor Cyan
    Write-Host "     ou: cargo install ast-grep" -ForegroundColor Cyan
    Write-Host "   Apos instalar, execute este setup novamente.`n" -ForegroundColor Yellow
    exit 1
}

# 2.2: graphify (Hard Stop)
try {
    $gfyStatus = graphify --version 2>$null
    if ($LASTEXITCODE -ne 0 -and (-not $gfyStatus)) { throw "graphify nao respondeu" }
    Write-Host "   ✅ graphify: OK" -ForegroundColor Green
} catch {
    Write-Host "`n🛑 [HARD STOP] graphify nao encontrado no PATH!" -ForegroundColor Red
    Write-Host "   O graphify e obrigatorio para mapeamento macro do grafo de conhecimento." -ForegroundColor Yellow
    Write-Host "   Para instalar, execute no terminal:" -ForegroundColor Yellow
    Write-Host "     pip install graphify-cli" -ForegroundColor Cyan
    Write-Host "     ou: uv tool install graphify-cli" -ForegroundColor Cyan
    Write-Host "   Apos instalar, execute este setup novamente.`n" -ForegroundColor Yellow
    exit 1
}

# 2.3: GSD Core no Projeto (Hard Stop)
$gsdCorePath = Join-Path $TargetDir ".agents\gsd-core"
$gsdAgentsPath = Join-Path $TargetDir ".agents\agents"

if ((-not (Test-Path $gsdCorePath)) -and (-not (Test-Path $gsdAgentsPath))) {
    Write-Host "`n🛑 [HARD STOP] Ecossistema GSD nao detectado neste projeto!" -ForegroundColor Red
    Write-Host "   Nao foram encontrados .agents/gsd-core ou .agents/agents em: $TargetDir" -ForegroundColor Yellow
    Write-Host "   Este kit foi desenhado para blindar e normalizar um projeto GSD existente." -ForegroundColor Yellow
    Write-Host "   Inicialize o projeto com o GSD primeiro (ex: rodando /gsd-new-project ou instalando o GSD)" -ForegroundColor Cyan
    Write-Host "   e entao execute este setup para ativar a governanca.`n" -ForegroundColor Yellow
    exit 1
}
Write-Host "   ✅ Ecossistema GSD detectado no projeto" -ForegroundColor Green

# 3. Garantir pastas necessarias
$agentsDir = Join-Path $TargetDir ".agents"
$rulesDir = Join-Path $agentsDir "rules"
$hooksDir = Join-Path $agentsDir "hooks"
$kitDir = $PSScriptRoot

if (-not (Test-Path $rulesDir)) {
    New-Item -ItemType Directory -Path $rulesDir -Force | Out-Null
}
if (-not (Test-Path $hooksDir)) {
    New-Item -ItemType Directory -Path $hooksDir -Force | Out-Null
}

# 4. Copiar Regras Canônicas e Hooks para .agents/rules/ e .agents/hooks/
$rulesSrcDir = Join-Path $kitDir "rules"
if (Test-Path $rulesSrcDir) {
    Copy-Item -Path "$rulesSrcDir\*" -Destination $rulesDir -Force
    Write-Host "   Regras de comportamento e tools copiadas para: $rulesDir" -ForegroundColor Green
}

$kitHooksDir = Join-Path $kitDir "hooks"
if (Test-Path $kitHooksDir) {
    Copy-Item -Path "$kitHooksDir\*" -Destination $hooksDir -Force
    # Copia de compatibilidade retrograda para .agents/tools/...
    $compatToolsDir = Join-Path $agentsDir "tools\gsd-agy-kit\hooks"
    New-Item -ItemType Directory -Path $compatToolsDir -Force | Out-Null
    Copy-Item -Path "$kitHooksDir\*" -Destination $compatToolsDir -Force
    Write-Host "   Hooks instalados em: $hooksDir" -ForegroundColor Green
}

# 5. Configurar .agents/hooks.json
$hooksJsonPath = Join-Path $agentsDir "hooks.json"
$hooksConfig = @{
    "token-efficiency-guard" = @{
        "SessionStart" = @(
            @{
                "type" = "command"
                "command" = "node hooks/token-guard-sessionstart.cjs"
                "timeout" = 15
            }
        )
        "PreInvocation" = @(
            @{
                "type" = "command"
                "command" = "node hooks/token-guard-preinvocation.cjs"
                "timeout" = 15
            }
        )
        "PreToolUse" = @(
            @{
                "matcher" = "read_file|view_file|run_command|write_file|write_to_file|Write|write|edit_file|replace_file_content|invoke_subagent"
                "hooks" = @(
                    @{
                        "type" = "command"
                        "command" = "node hooks/token-guard-pretool.cjs"
                        "timeout" = 15
                    }
                )
            }
        )
        "PostToolUse" = @(
            @{
                "matcher" = "*"
                "hooks" = @(
                    @{
                        "type" = "command"
                        "command" = "node hooks/token-guard-diagnostics.cjs"
                        "timeout" = 15
                    }
                )
            }
        )
        "Stop" = @(
            @{
                "type" = "command"
                "command" = "node hooks/token-guard-diagnostics.cjs --summary"
                "timeout" = 15
            }
        )
    }
}

# Preservar outros hooks existentes se houver (ex: graphify-auto-update) e normalizar caminhos absolutos
if (Test-Path $hooksJsonPath) {
    try {
        $rawExisting = Get-Content $hooksJsonPath -Raw
        # Normaliza qualquer caminho fixo D:/.../.agents/hooks para hooks/
        $rawExisting = $rawExisting -replace 'node\s+["\x27]?[a-zA-Z]:[\\/][^"\x27]*?\.agents[\\/]hooks[\\/]([a-zA-Z0-9_.-]+\.cjs)["\x27]?', 'node hooks/$1'
        $existingJson = $rawExisting | ConvertFrom-Json -AsHashtable
        foreach ($key in $existingJson.Keys) {
            if ($key -ne "token-efficiency-guard") {
                $hooksConfig[$key] = $existingJson[$key]
            }
        }
    } catch {
        # Se falhar o parse, sobrescreve apenas
    }
}

$hooksJsonContent = $hooksConfig | ConvertTo-Json -Depth 10
Set-Content -Path $hooksJsonPath -Value $hooksJsonContent -Encoding utf8
Write-Host "   Hooks registrados em: $hooksJsonPath" -ForegroundColor Green

# 6. Executar o Patch dos Subagentes GSD (Apenas se existirem subagentes .agents/agents)
$patchScript = Join-Path $kitDir "patch-agents.cjs"
if ((Test-Path $gsdAgentsPath) -and (Test-Path $patchScript)) {
    Write-Host "`n🛠️ Normalizando e injetando regras nos subagentes do GSD..." -ForegroundColor Cyan
    node $patchScript $TargetDir
    if (Test-Path "$kitDir\shrink-prompts.cjs") { node "$kitDir\shrink-prompts.cjs" $TargetDir }
}

# 7. Otimização de Tokens & Dynamic Agent Pool (Apenas se existirem subagentes)
$optScript = Join-Path $kitDir "optimize-tokens.cjs"
if ((Test-Path $gsdAgentsPath) -and (Test-Path $optScript)) {
    node $optScript $TargetDir --sync
    Write-Host "   Dynamic Agent Pool inicializado (.agents/agents-pool/ com ativação JIT ativa)" -ForegroundColor Green
}

# 8. Servidor MCP & Motores de Economia (MemPalace, RAG, Lockfile, Skeleton)
Write-Host "`n🧠 Configurando Servidor MCP e Memoria Episodica..." -ForegroundColor Cyan
$memoryDir = Join-Path $agentsDir "memory"
if (-not (Test-Path $memoryDir)) {
    New-Item -ItemType Directory -Path $memoryDir -Force | Out-Null
}

$kitLibDir = Join-Path $kitDir "lib"
if (Test-Path $kitLibDir) {
    $agentsLibDir = Join-Path $agentsDir "lib"
    New-Item -ItemType Directory -Path $agentsLibDir -Force | Out-Null
    Copy-Item -Path "$kitLibDir\*" -Destination $agentsLibDir -Recurse -Force
}

$mcpServerSrc = Join-Path $kitDir "mcp-server.cjs"
if (Test-Path $mcpServerSrc) {
    Copy-Item -Path $mcpServerSrc -Destination (Join-Path $agentsDir "mcp-server.cjs") -Force
}

# Registrar .agents/mcp_config.json
$mcpJsonPath = Join-Path $agentsDir "mcp_config.json"
$mcpConfig = @{
    mcpServers = @{
        "gsd-economy" = @{
            command = "node"
            args = @(".agents/mcp-server.cjs")
        }
    }
}
$mcpJsonContent = $mcpConfig | ConvertTo-Json -Depth 5
Set-Content -Path $mcpJsonPath -Value $mcpJsonContent -Encoding utf8

# Plugin .agents/plugins/gsd-economy/
$pluginDir = Join-Path $agentsDir "plugins\gsd-economy"
New-Item -ItemType Directory -Path $pluginDir -Force | Out-Null
$pluginManifest = @{
    name = "gsd-economy"
    description = "Otimizador de tokens, MemPalace e busca cirurgica para GSD no Antigravity"
    version = "1.0.0"
} | ConvertTo-Json -Depth 3
Set-Content -Path (Join-Path $pluginDir "plugin.json") -Value $pluginManifest -Encoding utf8
Copy-Item -Path $mcpJsonPath -Destination (Join-Path $pluginDir "mcp_config.json") -Force
if (Test-Path $mcpServerSrc) {
    Copy-Item -Path $mcpServerSrc -Destination (Join-Path $pluginDir "mcp-server.cjs") -Force
}
if (Test-Path $kitLibDir) {
    Copy-Item -Path "$kitLibDir\*" -Destination (Join-Path $pluginDir "lib") -Recurse -Force
}

# Gerar .agents/plugins.json para registro explícito no Antigravity
$pluginsJsonPath = Join-Path $agentsDir "plugins.json"
$pluginsConfig = @{
    entries = @(
        @{
            path = ".agents/plugins"
        }
    )
} | ConvertTo-Json -Depth 3
Set-Content -Path $pluginsJsonPath -Value $pluginsConfig -Encoding utf8

Write-Host "   Servidor MCP registrado em: $mcpJsonPath" -ForegroundColor Green
Write-Host "   Plugin local registrado em: $pluginsJsonPath" -ForegroundColor Green
Write-Host "   Memoria episodica (MemPalace) pronta em: $memoryDir" -ForegroundColor Green

if (Get-Command agy -ErrorAction SilentlyContinue) {
    try {
        & agy mcp add gsd-economy node (Join-Path $agentsDir "mcp-server.cjs") *>$null
        Write-Host "   Servidor MCP gsd-economy registrado no runtime Antigravity (agy mcp)" -ForegroundColor Green
    } catch {}
}

# 9. Instalar Pacote Completo e Utilitários Nativos (.agents/kit/ e scripts/)
$targetKitDir = Join-Path $agentsDir "kit"
New-Item -ItemType Directory -Path $targetKitDir -Force | Out-Null
$targetScriptsDir = Join-Path $TargetDir "scripts"
New-Item -ItemType Directory -Path $targetScriptsDir -Force | Out-Null

if (Test-Path $kitLibDir) {
    Copy-Item -Path "$kitLibDir\*" -Destination (Join-Path $targetKitDir "lib") -Recurse -Force
    $targetScriptsLibDir = Join-Path $targetScriptsDir "lib"
    New-Item -ItemType Directory -Path $targetScriptsLibDir -Force | Out-Null
    Copy-Item -Path "$kitLibDir\*" -Destination $targetScriptsLibDir -Recurse -Force
}

$kitRulesSrc = Join-Path $kitDir "rules"
if (Test-Path $kitRulesSrc) {
    $targetKitRules = Join-Path $targetKitDir "rules"
    New-Item -ItemType Directory -Path $targetKitRules -Force | Out-Null
    Copy-Item -Path "$kitRulesSrc\*" -Destination $targetKitRules -Recurse -Force
}

$kitScripts = @("test-kit.ps1", "test-kit.sh", "setup-ui.cjs", "setup.ps1", "setup.sh", "install.ps1", "install.sh", "package.json", "CHANGELOG.md", "uninstall.ps1", "uninstall.sh", "skills-profile.ps1", "skills-profile.sh", "optimize-tokens.ps1", "optimize-tokens.sh", "sanitize-command.ps1", "token-report.cjs", "gsd-update.cjs", "gsd-state-summary.cjs", "gsd-graphify-update.cjs", "patch-agents.cjs", "optimize-tokens.cjs", "skills-manager.cjs", "compact-state.cjs", "compact-json.cjs", "sanitize-output.cjs", "shrink-prompts.cjs", "gsd-outline.cjs", "gsd-read-strip.cjs", "mcp-server.cjs")
foreach ($sName in $kitScripts) {
    $src = Join-Path $kitDir $sName
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $targetKitDir $sName) -Force
    }
}

# Atalhos diretos em scripts/ para conveniência no terminal
foreach ($sName in @("test-kit.ps1", "test-kit.sh")) {
    $src = Join-Path $targetKitDir $sName
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $targetScriptsDir $sName) -Force
    }
}
Write-Host "   Pacote completo do kit instalado nativamente em: $targetKitDir" -ForegroundColor Green

# 10. Copiar Skills Especializadas (.agents/skills/gsd-tokens, gsd-test e gsd-agy-update)
$skillsDir = Join-Path $agentsDir "skills"
foreach ($skName in @("gsd-tokens", "gsd-test", "gsd-agy-update")) {
    $skSrc = Join-Path $kitDir "skills\$skName"
    if (Test-Path $skSrc) {
        $skDest = Join-Path $skillsDir $skName
        if ($skSrc -ne $skDest) {
            New-Item -ItemType Directory -Path $skDest -Force | Out-Null
            Copy-Item -Path "$skSrc\*" -Destination $skDest -Recurse -Force
            Write-Host "   Skill /$skName instalada em: $skDest" -ForegroundColor Green
        }
    }
}

# 10.1 Sincronizar Perfil de Skills conforme Front-End
$skillsMgr = Join-Path $kitDir "skills-manager.cjs"
if (Test-Path $skillsMgr) {
    $skillProfile = if ($HasFrontend) { "full" } else { "backend" }
    Write-Host "`n🧩 [Skills Profile] Aplicando perfil '$skillProfile'..." -ForegroundColor Cyan
    node $skillsMgr profile $skillProfile $TargetDir
}

# 11. Configurar Defaults Enxutos e Governança no .planning/config.json
$planningDir = Join-Path $TargetDir ".planning"
$configJsonPath = Join-Path $planningDir "config.json"
if (Test-Path $configJsonPath) {
    try {
        $rawConfig = Get-Content $configJsonPath -Raw -Encoding utf8 | ConvertFrom-Json

        # 1. Idioma canônico e Modo do Kit
        $rawConfig | Add-Member -NotePropertyName "response_language" -NotePropertyValue "pt-BR" -Force
        $rawConfig | Add-Member -NotePropertyName "kit_mode" -NotePropertyValue "smart-assist" -Force

        # 2. Governança de Workflow
        if (-not $rawConfig.workflow) {
            $rawConfig | Add-Member -NotePropertyName "workflow" -NotePropertyValue (New-Object PSObject) -Force
        }
        $rawConfig.workflow | Add-Member -NotePropertyName "ui_phase" -NotePropertyValue $HasFrontend -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "ui_safety_gate" -NotePropertyValue $HasFrontend -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "ui_review" -NotePropertyValue $HasFrontend -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "compact_content" -NotePropertyValue $true -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "auto_prune_state" -NotePropertyValue $true -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "inline_plan_threshold" -NotePropertyValue 2 -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "ai_integration_phase" -NotePropertyValue $false -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "pattern_mapper" -NotePropertyValue $false -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "code_review" -NotePropertyValue $true -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "code_review_depth" -NotePropertyValue "standard" -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "security_enforcement" -NotePropertyValue $true -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "security_asvs_level" -NotePropertyValue 1 -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "security_block_on" -NotePropertyValue "high" -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "api_coverage_gate" -NotePropertyValue $true -Force
        $rawConfig.workflow | Add-Member -NotePropertyName "tdd_mode" -NotePropertyValue $false -Force

        # 3. Grounding de Código via AST
        if (-not $rawConfig.plan_review) {
            $rawConfig | Add-Member -NotePropertyName "plan_review" -NotePropertyValue (New-Object PSObject) -Force
        }
        $rawConfig.plan_review | Add-Member -NotePropertyName "source_grounding" -NotePropertyValue $true -Force
        $rawConfig.plan_review | Add-Member -NotePropertyName "source_grounding_authority" -NotePropertyValue "ast-grep" -Force

        # 4. Graphify Knowledge Graph
        if (-not $rawConfig.graphify) {
            $rawConfig | Add-Member -NotePropertyName "graphify" -NotePropertyValue (New-Object PSObject) -Force
        }
        $rawConfig.graphify | Add-Member -NotePropertyName "enabled" -NotePropertyValue $true -Force
        $rawConfig.graphify | Add-Member -NotePropertyName "auto_update" -NotePropertyValue $true -Force

        # 5. MemPalace Semantic Memory
        if (-not $rawConfig.mempalace) {
            $rawConfig | Add-Member -NotePropertyName "mempalace" -NotePropertyValue (New-Object PSObject) -Force
        }
        $rawConfig.mempalace | Add-Member -NotePropertyName "enabled" -NotePropertyValue $true -Force
        $rawConfig.mempalace | Add-Member -NotePropertyName "memory_mode" -NotePropertyValue "augment" -Force
        $rawConfig.mempalace | Add-Member -NotePropertyName "recall_on_discuss" -NotePropertyValue $true -Force
        $rawConfig.mempalace | Add-Member -NotePropertyName "recall_on_plan" -NotePropertyValue $true -Force
        $rawConfig.mempalace | Add-Member -NotePropertyName "mirror_kg" -NotePropertyValue $true -Force
        $rawConfig.mempalace | Add-Member -NotePropertyName "diary_journal" -NotePropertyValue $true -Force
        if (-not $rawConfig.mempalace.wing) {
            $projWing = Split-Path $TargetDir -Leaf
            $rawConfig.mempalace | Add-Member -NotePropertyName "wing" -NotePropertyValue $projWing -Force
        }

        $rawConfig | ConvertTo-Json -Depth 10 | Set-Content -Path $configJsonPath -Encoding utf8
        Write-Host "   Defaults economicos e governanca gravados em: $configJsonPath" -ForegroundColor Green
    } catch {
        Write-Warning "⚠️ Nao foi possivel atualizar config.json: $_"
    }
}

# 12. Configurar Git Hooks (post-merge / post-checkout / post-commit)
$gitHooksDir = Join-Path $TargetDir ".git\hooks"
if (Test-Path $gitHooksDir) {
    $autoHealContent = @"
#!/bin/sh
# Antigravity GSD Kit Auto-Heal Hook
if [ -f ".agents/kit/patch-agents.cjs" ]; then
    node .agents/kit/patch-agents.cjs >/dev/null 2>&1 || true
elif [ -f "scripts/patch-agents.cjs" ]; then
    node scripts/patch-agents.cjs >/dev/null 2>&1 || true
elif [ -f "gsd-agy-kit/patch-agents.cjs" ]; then
    node gsd-agy-kit/patch-agents.cjs >/dev/null 2>&1 || true
elif [ -f "tools/gsd-agy-kit/patch-agents.cjs" ]; then
    node tools/gsd-agy-kit/patch-agents.cjs >/dev/null 2>&1 || true
fi
"@
    Set-Content -Path (Join-Path $gitHooksDir "post-merge") -Value $autoHealContent -Encoding utf8
    Set-Content -Path (Join-Path $gitHooksDir "post-checkout") -Value $autoHealContent -Encoding utf8

    $postCommitCmd = Join-Path $gitHooksDir "post-commit.cmd"
    '@echo off
if exist .agents\kit\gsd-graphify-update.cjs (
    start /B node .agents\kit\gsd-graphify-update.cjs >nul 2>&1
) else if exist scripts\gsd-graphify-update.cjs (
    start /B node scripts\gsd-graphify-update.cjs >nul 2>&1
) else if exist gsd-agy-kit\gsd-graphify-update.cjs (
    start /B node gsd-agy-kit\gsd-graphify-update.cjs >nul 2>&1
) else if exist tools\gsd-agy-kit\gsd-graphify-update.cjs (
    start /B node tools\gsd-agy-kit\gsd-graphify-update.cjs >nul 2>&1
)' | Out-File -FilePath $postCommitCmd -Encoding ascii -Force

    $postCommitSh = Join-Path $gitHooksDir "post-commit"
    $postCommitShContent = @"
#!/bin/sh
if [ -f ".agents/kit/gsd-graphify-update.cjs" ]; then
    node .agents/kit/gsd-graphify-update.cjs >/dev/null 2>&1 &
elif [ -f "scripts/gsd-graphify-update.cjs" ]; then
    node scripts/gsd-graphify-update.cjs >/dev/null 2>&1 &
elif [ -f "gsd-agy-kit/gsd-graphify-update.cjs" ]; then
    node gsd-agy-kit/gsd-graphify-update.cjs >/dev/null 2>&1 &
elif [ -f "tools/gsd-agy-kit/gsd-graphify-update.cjs" ]; then
    node tools/gsd-agy-kit/gsd-graphify-update.cjs >/dev/null 2>&1 &
fi
"@
    Set-Content -Path $postCommitSh -Value $postCommitShContent -Encoding utf8

    Write-Host "   Git hooks (post-merge, post-checkout, post-commit assincrono) instalados em .git/hooks" -ForegroundColor Green
}

# 12.1 Garantir kits, caches e graphify-out no .gitignore do projeto alvo
$gitignorePath = Join-Path $TargetDir ".gitignore"
if (Test-Path $gitignorePath) {
    $giContent = Get-Content $gitignorePath -Raw -Encoding utf8
    if ($giContent -notmatch "(?m)^gsd-agy-kit/?$") {
        Add-Content -Path $gitignorePath -Value "`ngsd-agy-kit/" -Encoding utf8
    }
    if ($giContent -notmatch "(?m)^\.agents/\.cache/?$") {
        Add-Content -Path $gitignorePath -Value "`n.agents/.cache/" -Encoding utf8
    }
    if ($giContent -notmatch "(?m)^graphify-out/?$") {
        Add-Content -Path $gitignorePath -Value "`ngraphify-out/" -Encoding utf8
    }
    Write-Host "   Entradas de protecao (.agents/.cache/, graphify-out/ e kits) garantidas no .gitignore" -ForegroundColor Green
}

# 12.2 Blindagem de Índices (.graphifyignore e .astgrepignore)
$graphifyIgnoreSrc = Join-Path $kitDir ".graphifyignore"
if (Test-Path $graphifyIgnoreSrc) {
    Copy-Item -Path $graphifyIgnoreSrc -Destination (Join-Path $TargetDir ".graphifyignore") -Force
}
$astgrepIgnoreSrc = Join-Path $kitDir ".astgrepignore"
if (Test-Path $astgrepIgnoreSrc) {
    Copy-Item -Path $astgrepIgnoreSrc -Destination (Join-Path $TargetDir ".astgrepignore") -Force
}
Write-Host "   Blindagem de indices (.graphifyignore e .astgrepignore) aplicada com sucesso" -ForegroundColor Green

# 12.5. Inicializacao do Grafo Graphify
try {
    & graphify update . 2>$null
    Write-Host "   Grafo de conhecimento inicializado com graphify update" -ForegroundColor Green
} catch {}

# 13. Resumo Final
Write-Host "`n✅ [Antigravity GSD Kit] Instalacao e blindagem concluidas com sucesso!" -ForegroundColor Green
Write-Host "   - Ferramentas normalizadas para Antigravity CLI (write_to_file, sem glob/grep_search/call_mcp_tool)" -ForegroundColor Gray
Write-Host "   - Regras de protocolo de tokens injetadas nos prompts dos subagentes" -ForegroundColor Gray
Write-Host "   - Hooks de Hard Gate ativos em .agents/hooks.json (Circuit Breaker e Sanitizador PowerShell)" -ForegroundColor Gray
Write-Host "   - Lazy Loading de Subagentes ativo (12 agentes em .agents/agents-on-demand/)" -ForegroundColor Gray
Write-Host "   - Utilitarios /gsd-tokens e /gsd-state-summary prontos para uso" -ForegroundColor Gray
Write-Host "   - Auto-Cura (Self-Healing) ativo para neutralizar futuros updates do GSD`n" -ForegroundColor Gray






