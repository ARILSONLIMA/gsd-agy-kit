# ==============================================================================
# Test-Kit Antigravity GSD (Windows PowerShell)
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

# Pre-flight Check: verificar se o kit está instalado no TargetDir
$agentsDirCheck = Join-Path $TargetDir ".agents"
$hookPathCheck = Join-Path $agentsDirCheck "hooks\token-guard-pretool.cjs"
if (-not (Test-Path $agentsDirCheck) -or -not (Test-Path $hookPathCheck)) {
    Write-Host "`n🛑 [Pre-flight Check] Workspace nao configurado!" -ForegroundColor Red
    Write-Host "   O diretorio '$TargetDir' nao contem a infraestrutura do kit instalada (.agents/hooks/token-guard-pretool.cjs)." -ForegroundColor Yellow
    Write-Host "`n💡 Para instalar e blindar este projeto, execute:" -ForegroundColor Cyan
    Write-Host "   pwsh $(Join-Path $kitDir 'setup.ps1') -TargetDir '$TargetDir'`n" -ForegroundColor White
    exit 1
}

Write-Host "`n🧪 [Antigravity GSD Kit] Executando bateria de testes automatizados..." -ForegroundColor Cyan

$passed = 0
$failed = 0

function Assert-Test {
    param (
        [string]$Name,
        [bool]$Condition,
        [string]$ErrorDetails = ""
    )
    if ($Condition) {
        Write-Host "   ✅ PASS: $Name" -ForegroundColor Green
        $script:passed++
    } else {
        Write-Host "   ❌ FAIL: $Name" -ForegroundColor Red
        if ($ErrorDetails) {
            Write-Host "      Detalhe: $ErrorDetails" -ForegroundColor Yellow
        }
        $script:failed++
    }
}

# ------------------------------------------------------------------------------
# Teste 1: Conformidade dos Subagentes (Ativos e no Pool)
# ------------------------------------------------------------------------------
$agentsDir = Join-Path $TargetDir ".agents\agents"
$poolDir = Join-Path $TargetDir ".agents\agents-pool"
$allAgents = Get-ChildItem -Path $agentsDir -Filter *.md
$incompatible = $allAgents | Where-Object {
    $content = Get-Content $_.FullName -Raw
    $content -match "-\s+glob" -or $content -match "-\s+grep_search" -or $content -match "-\s+call_mcp_tool" -or (-not ($content -match "ANTIGRAVITY_TOKEN_PROTOCOL_START"))
}

$allPoolAgents = if (Test-Path $poolDir) { Get-ChildItem -Path $poolDir -Filter *.md } else { @() }
$incompatiblePool = $allPoolAgents | Where-Object {
    $content = Get-Content $_.FullName -Raw
    $content -match "-\s+glob" -or $content -match "-\s+grep_search" -or $content -match "-\s+call_mcp_tool" -or (-not ($content -match "ANTIGRAVITY_TOKEN_PROTOCOL_START"))
}

Assert-Test -Name "Todos os agentes ativos ($($allAgents.Count)) e no pool ($($allPoolAgents.Count)) normalizados sem 'glob/grep_search/call_mcp_tool' e com protocolo injetado" `
            -Condition ($incompatible.Count -eq 0 -and $incompatiblePool.Count -eq 0 -and $allAgents.Count -ge 4 -and $allPoolAgents.Count -ge 30) `
            -ErrorDetails "$($incompatible.Count + $incompatiblePool.Count) agentes com incompatibilidades"

# ------------------------------------------------------------------------------
# Teste 2: Hard Gates do Hook - view_file (Cirúrgico, Teto e Documentação)
# ------------------------------------------------------------------------------
$hookPath = Join-Path $TargetDir ".agents\hooks\token-guard-pretool.cjs"

# 2.1: Bloqueio sem linhas em código
$payloadViewFile = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/cmd/api/main.go"}}}'
$resViewNoLines = $payloadViewFile | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia view_file sem StartLine/EndLine em codigo" `
            -Condition ($resViewNoLines.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resViewNoLines.decision)'"

# 2.2: Bloqueio com range > 100 linhas em código
$payloadViewLarge = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/cmd/api/main.go","StartLine":1,"EndLine":150}}}'
$resViewLarge = $payloadViewLarge | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia view_file com range > 100 linhas em codigo" `
            -Condition ($resViewLarge.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resViewLarge.decision)'"

# 2.3: Permissão de leitura cirúrgica <= 100 linhas em código
$payloadViewSurgical = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/cmd/api/main.go","StartLine":1,"EndLine":50}}}'
$resViewSurgical = $payloadViewSurgical | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite view_file cirurgico (<= 100 linhas) em codigo" `
            -Condition ($resViewSurgical.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resViewSurgical.decision)'"

# 2.4: Permissão de leitura em arquivos de documentação/config sem limite de linhas
$payloadViewDoc = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/README.md"}}}'
$resViewDoc = $payloadViewDoc | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite view_file em documentacao (README.md)" `
            -Condition ($resViewDoc.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resViewDoc.decision)'"

# 2.5: Permissão no limite exato de 100 linhas em código
$payloadView100 = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/cmd/api/main.go","StartLine":1,"EndLine":100}}}'
$resView100 = $payloadView100 | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite view_file no teto exato de 100 linhas em codigo" `
            -Condition ($resView100.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resView100.decision)'"

# 2.6: Bloqueio na fronteira de 101 linhas em código
$payloadView101 = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/cmd/api/main.go","StartLine":1,"EndLine":101}}}'
$resView101 = $payloadView101 | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia view_file na fronteira de 101 linhas em codigo" `
            -Condition ($resView101.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resView101.decision)'"

# 2.7: Permissão de leitura em arquivos de configuração (.json) sem StartLine/EndLine
$cfgTarget = Join-Path $TargetDir ".planning\config.json"
$payloadViewJson = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"' + ($cfgTarget -replace '\\', '/') + '"}}}'
$resViewJson = $payloadViewJson | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite view_file em arquivo de configuracao (.json) sem paginacao" `
            -Condition ($resViewJson.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resViewJson.decision)'"


# ------------------------------------------------------------------------------
# Teste 3: Hard Gates do Hook - run_command (Despejo, Testes, Ast-Grep e Windows)
# ------------------------------------------------------------------------------
# 3.1: Bloqueio de comando de despejo (cat/Get-Content)
$payloadCat = '{"toolCall":{"name":"run_command","args":{"CommandLine":"cat cmd/api/main.go"}}}'
$resCat = $payloadCat | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia comando de despejo (cat/Get-Content)" `
            -Condition ($resCat.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resCat.decision)'"

# 3.2: Bloqueio de testes Go com flag prolixa (-v)
$payloadGoTestV = '{"toolCall":{"name":"run_command","args":{"CommandLine":"go test -v ./..."}}}'
$resGoTestV = $payloadGoTestV | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia go test com flag prolixa (-v)" `
            -Condition ($resGoTestV.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resGoTestV.decision)'"

# 3.3: Bloqueio de reescrita em massa com ast-grep (-r -u)
$payloadAstRewrite = '{"toolCall":{"name":"run_command","args":{"CommandLine":"ast-grep -r -u -p ''fmt.Println($$$)''"}}}'
$resAstRewrite = $payloadAstRewrite | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia ast-grep com reescrita em lote (-r -u)" `
            -Condition ($resAstRewrite.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resAstRewrite.decision)'"

# 3.4: Bloqueio de ast-grep com aspas duplas no Windows
$payloadAstGrepQuotes = '{"toolCall":{"name":"run_command","args":{"CommandLine":"ast-grep run -p \"func `$NAME(`$`$`$) { `$`$`$ }\""}}}'
$resAstQuotes = $payloadAstGrepQuotes | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia ast-grep com aspas duplas e $ no Windows" `
            -Condition ($resAstQuotes.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resAstQuotes.decision)'"

# 3.5: Normalização de caminhos Windows com barras invertidas
$payloadWinPath = '{"toolCall":{"name":"run_command","args":{"CommandLine":"pwsh scripts/test-sanitized.ps1"}}}'
$resWinPath = $payloadWinPath | node $hookPath | ConvertFrom-Json
$winPathNormalized = ($resWinPath.decision -eq "allow") -and ($resWinPath.overwrite.CommandLine -match "scripts\\test-sanitized.ps1")
Assert-Test -Name "Hook PreToolUse normaliza caminhos Windows com barras invertidas" `
            -Condition $winPathNormalized `
            -ErrorDetails "Esperado overwrite com barras invertidas"

# 3.6: Permissão de leitura com cat em documentacao/configuracao (evita falso-positivo)
$payloadCatDoc = '{"toolCall":{"name":"run_command","args":{"CommandLine":"cat README.md"}}}'
$resCatDoc = $payloadCatDoc | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite cat em documentacao (README.md) sem falso-positivo" `
            -Condition ($resCatDoc.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resCatDoc.decision)'"

# 3.7: Permissão de go test sem flag verbosa
$payloadGoTestClean = '{"toolCall":{"name":"run_command","args":{"CommandLine":"go test ./..."}}}'
$resGoTestClean = $payloadGoTestClean | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite execucao normal de go test ./... (sem flag -v)" `
            -Condition ($resGoTestClean.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resGoTestClean.decision)'"

# 3.8: Permissão de ast-grep com aspas simples no Windows
$payloadAstSingle = '{"toolCall":{"name":"run_command","args":{"CommandLine":"ast-grep run -p ''func $NAME()'' --lang go"}}}'
$resAstSingle = $payloadAstSingle | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite ast-grep com aspas simples e variavel no Windows" `
            -Condition ($resAstSingle.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resAstSingle.decision)'"

# 3.9: Normalização de Cwd Windows com barras invertidas
$payloadCwd = '{"toolCall":{"name":"run_command","args":{"CommandLine":"git status","Cwd":"' + ($TargetDir -replace '\\', '/') + '"}}}'
$resCwd = $payloadCwd | node $hookPath | ConvertFrom-Json
$cwdExpected = [System.IO.Path]::GetFullPath($TargetDir)
$cwdNormalized = ($resCwd.decision -eq "allow") -and ($resCwd.overwrite.Cwd -eq $cwdExpected)
Assert-Test -Name "Hook PreToolUse normaliza Cwd Windows para barras invertidas" `
            -Condition $cwdNormalized `
            -ErrorDetails "Esperado overwrite do Cwd com formato nativo Windows"

# 3.10: Interceptação e bloqueio de despejo em aliases de ferramentas (bash/shell)
$payloadBashDump = '{"toolCall":{"name":"bash","args":{"command":"cat cmd/api/main.go"}}}'
$resBashDump = $payloadBashDump | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse intercepta e bloqueia despejo de codigo via alias de ferramenta (bash)" `
            -Condition ($resBashDump.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resBashDump.decision)'"

# 3.11: Bloqueio de go test com flag prolixa estendida (--verbose)
$payloadGoTestVerbose = '{"toolCall":{"name":"run_command","args":{"CommandLine":"go test --verbose ./..."}}}'
$resGoTestVerbose = $payloadGoTestVerbose | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia go test com flag prolixa estendida (--verbose)" `
            -Condition ($resGoTestVerbose.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resGoTestVerbose.decision)'"


# ------------------------------------------------------------------------------
# Teste 4: Hard Gate do Hook - write_to_file (Bloqueio de Sobrescrita Integral)
# ------------------------------------------------------------------------------
$codeFile = Join-Path $TargetDir "cmd\api\main.go"
$payloadOverwrite = '{"toolCall":{"name":"write_to_file","args":{"TargetFile":"' + ($codeFile -replace '\\', '/') + '","Overwrite":true}}}'
$resOverwrite = $payloadOverwrite | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia sobrescrita integral de arquivo de codigo existente" `
            -Condition ($resOverwrite.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resOverwrite.decision)'"

# 4.2: Permissão de criação de novo arquivo de código (arquivo inexistente)
$newCodeTarget = Join-Path $TargetDir "cmd\api\dummy_new_feature_test.go"
$payloadCreateNew = '{"toolCall":{"name":"write_to_file","args":{"TargetFile":"' + ($newCodeTarget -replace '\\', '/') + '","Overwrite":true}}}'
$resCreateNew = $payloadCreateNew | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite criacao de novo arquivo de codigo inexistente com write_to_file" `
            -Condition ($resCreateNew.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resCreateNew.decision)'"

# 4.3: Permissão de sobrescrita em documentação/configuração existente
$readmeTarget = Join-Path $TargetDir "README.md"
$payloadOverwriteDoc = '{"toolCall":{"name":"write_to_file","args":{"TargetFile":"' + ($readmeTarget -replace '\\', '/') + '","Overwrite":true}}}'
$resOverwriteDoc = $payloadOverwriteDoc | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite sobrescrita de documentacao (README.md) existente" `
            -Condition ($resOverwriteDoc.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resOverwriteDoc.decision)'"

# 4.4: Bloqueio de sobrescrita integral via alias de ferramenta (write)
$payloadWriteAlias = '{"toolCall":{"name":"write","args":{"TargetFile":"' + ($codeFile -replace '\\', '/') + '","Overwrite":true}}}'
$resWriteAlias = $payloadWriteAlias | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia sobrescrita integral de arquivo de codigo via alias 'write'" `
            -Condition ($resWriteAlias.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resWriteAlias.decision)'"


# ------------------------------------------------------------------------------
# Teste 5: Hook PreInvocation (Execução Limpa e Auto-Cura)
# ------------------------------------------------------------------------------
$preInvocPath = Join-Path $TargetDir ".agents\hooks\token-guard-preinvocation.cjs"
$resPreInvoc = try { node $preInvocPath 2>$null | ConvertFrom-Json } catch { $null }
Assert-Test -Name "Hook PreInvocation executa limpo sem poluir o chat com banners repetidos" `
            -Condition ($resPreInvoc -ne $null) `
            -ErrorDetails "Falha ao executar token-guard-preinvocation.cjs"

# ------------------------------------------------------------------------------
# Teste 6: Otimização de Tokens & Dynamic Agent Pool
# ------------------------------------------------------------------------------
$compactArchive = Join-Path $TargetDir ".agents\agents-backup-compact"
$compactRemaining = Get-ChildItem -Path $agentsDir -Filter *.compact.md -ErrorAction SilentlyContinue
$compactClean = (Test-Path $compactArchive) -and ($compactRemaining.Count -eq 0)
Assert-Test -Name "Subagentes .compact.md devidamente arquivados e ausentes do catalogo ativo" `
            -Condition $compactClean `
            -ErrorDetails "Encontrados $($compactRemaining.Count) arquivos .compact.md em $agentsDir"

$agentsGeminiPath = Join-Path $TargetDir ".agents\GEMINI.md"
$agentsGeminiContent = if (Test-Path $agentsGeminiPath) { Get-Content $agentsGeminiPath -Raw } else { "" }
$geminiDeduplicated = ($agentsGeminiContent -match "Regras do Projeto \(Referência Canônica\)")
Assert-Test -Name ".agents/GEMINI.md desduplicado com ponte leve para a raiz" `
            -Condition $geminiDeduplicated `
            -ErrorDetails ".agents/GEMINI.md nao contem ponte canonica enxuta"

$poolDir = Join-Path $TargetDir ".agents\agents-pool"
$poolFiles = if (Test-Path $poolDir) { Get-ChildItem -Path $poolDir -Filter *.md } else { @() }
Assert-Test -Name "Dynamic Agent Pool (.agents/agents-pool/) contem todos os agentes preservados ($($poolFiles.Count))" `
            -Condition ($poolFiles.Count -ge 30) `
            -ErrorDetails "Esperado >= 30 agentes no pool, encontrados $($poolFiles.Count)"

$activeAgentsCount = (Get-ChildItem -Path $agentsDir -Filter *.md).Count
Assert-Test -Name "Catalogo ativo (.agents/agents/) enxuto e consciente de fase ($activeAgentsCount agentes ativos)" `
            -Condition ($activeAgentsCount -le 10) `
            -ErrorDetails "Esperado <= 10 agentes ativos no catalogo enxuto, encontrados $activeAgentsCount"

# ------------------------------------------------------------------------------
# Teste 7: JIT Auto-Promoter do Hook (Ativação Sob Demanda de Subagentes)
# ------------------------------------------------------------------------------
$tempAgentName = "gsd-ui-auditor"
$activeTempPath = Join-Path $agentsDir "$tempAgentName.md"
if (Test-Path $activeTempPath) { Remove-Item $activeTempPath -Force }

$payloadJit = '{"toolCall":{"name":"invoke_subagent","args":{"Subagents":[{"TypeName":"' + $tempAgentName + '"}]}}}'
$resJit = $payloadJit | node $hookPath | ConvertFrom-Json
$jitPromoted = (Test-Path $activeTempPath)
if (Test-Path $activeTempPath) { Remove-Item $activeTempPath -Force }

Assert-Test -Name "Hook PreToolUse promove instantaneamente (JIT) subagente do pool sob demanda" `
            -Condition ($resJit.decision -eq "allow" -and $jitPromoted) `
            -ErrorDetails "Subagente nao foi promovido para $activeTempPath apos chamada invoke_subagent"

# 7.2: Promoção JIT via argumento direto TypeName (sem array Subagents)
$tempDirectAgent = "gsd-code-fixer"
$activeDirectPath = Join-Path $agentsDir "$tempDirectAgent.md"
if (Test-Path $activeDirectPath) { Remove-Item $activeDirectPath -Force }

$payloadJitDirect = '{"toolCall":{"name":"invoke_subagent","args":{"TypeName":"' + $tempDirectAgent + '"}}}'
$resJitDirect = $payloadJitDirect | node $hookPath | ConvertFrom-Json
$jitDirectPromoted = (Test-Path $activeDirectPath)
if (Test-Path $activeDirectPath) { Remove-Item $activeDirectPath -Force }

Assert-Test -Name "Hook PreToolUse promove subagente do pool via argumento direto TypeName" `
            -Condition ($resJitDirect.decision -eq "allow" -and $jitDirectPromoted) `
            -ErrorDetails "Subagente nao foi promovido para $activeDirectPath via TypeName direto"


# ------------------------------------------------------------------------------
# Teste 8: Integridade de Hooks e Git Hooks
# ------------------------------------------------------------------------------
$hooksJsonPath = Join-Path $TargetDir ".agents\hooks.json"
$hooksJsonContent = if (Test-Path $hooksJsonPath) { Get-Content $hooksJsonPath -Raw } else { "" }
$hooksConfigured = ($hooksJsonContent -match "token-efficiency-guard") -and ($hooksJsonContent -match "PreInvocation") -and ($hooksJsonContent -match "PreToolUse") -and ($hooksJsonContent -match "invoke_subagent")
Assert-Test -Name "Configuracao de hooks ativa e com invoke_subagent em .agents/hooks.json" `
            -Condition $hooksConfigured `
            -ErrorDetails "Definicao token-efficiency-guard ou invoke_subagent ausente em $hooksJsonPath"

$gitHooksDir = Join-Path $TargetDir ".git\hooks"
$gitHooksOk = (Test-Path (Join-Path $gitHooksDir "post-merge")) -and (Test-Path (Join-Path $gitHooksDir "post-checkout"))
Assert-Test -Name "Git hooks de auto-cura presentes em .git/hooks/" `
            -Condition $gitHooksOk `
            -ErrorDetails "post-merge ou post-checkout ausentes em $gitHooksDir"

# ------------------------------------------------------------------------------
# Teste 9: Telemetria de Tokens (token-report.cjs / /gsd-tokens)
# ------------------------------------------------------------------------------
$tokenReportPath = Join-Path $kitDir "token-report.cjs"
$tokenReportOk = $false
try {
    $reportOutput = node $tokenReportPath --json 2>$null | ConvertFrom-Json
    if ($reportOutput -ne $null -and ($reportOutput.session -or $reportOutput.metrics)) {
        $tokenReportOk = $true
    }
} catch {}
Assert-Test -Name "Script de telemetria (token-report.cjs) operacional via JSON" `
            -Condition $tokenReportOk `
            -ErrorDetails "Falha ao executar ou converter saida JSON de token-report.cjs"

# ------------------------------------------------------------------------------
# Teste 10: Hard Stop & Pré-requisitos (Node, ast-grep, graphify, gsd-core)
# ------------------------------------------------------------------------------
$nodeOk = (Get-Command node -ErrorAction SilentlyContinue) -ne $null
$astOk = (Get-Command ast-grep -ErrorAction SilentlyContinue) -ne $null
$gfyOk = (Get-Command graphify -ErrorAction SilentlyContinue) -ne $null
$gsdOk = (Test-Path (Join-Path $TargetDir ".agents\gsd-core")) -or (Test-Path (Join-Path $TargetDir ".agents\agents"))

Assert-Test -Name "Hard Stop Setup: Node.js presente" -Condition $nodeOk
Assert-Test -Name "Hard Stop Setup: ast-grep presente" -Condition $astOk
Assert-Test -Name "Hard Stop Setup: graphify presente" -Condition $gfyOk
Assert-Test -Name "Hard Stop Setup: gsd-core presente no projeto" -Condition $gsdOk

# ------------------------------------------------------------------------------
# Teste 11: Defaults Enxutos e Governança no .planning/config.json
# ------------------------------------------------------------------------------
$configPath = Join-Path $TargetDir ".planning\config.json"
if (Test-Path $configPath) {
    $rawCfg = try { Get-Content $configPath -Raw | ConvertFrom-Json } catch { $null }
    $cfgOk = ($rawCfg -ne $null) -and `
             ($rawCfg.response_language -eq "pt-BR") -and `
             ($rawCfg.workflow.compact_content -eq $true) -and `
             ($rawCfg.workflow.auto_prune_state -eq $true) -and `
             ($rawCfg.workflow.code_review -eq $true) -and `
             ($rawCfg.plan_review.source_grounding_authority -eq "ast-grep") -and `
             ($rawCfg.graphify.enabled -eq $true)
    Assert-Test -Name "Defaults enxutos e governanca em .planning/config.json validados" `
                -Condition $cfgOk `
                -ErrorDetails "Configuracoes esperadas de governanca nao encontradas em $configPath"
}

# ------------------------------------------------------------------------------
# Teste 12: Dynamic Skill Pool (.agents/skills-pool/) & JIT Auto-Promoter
# ------------------------------------------------------------------------------
$skillsPoolDir = Join-Path $TargetDir ".agents\skills-pool"
$activeSkillsDir = Join-Path $TargetDir ".agents\skills"
$poolSkills = if (Test-Path $skillsPoolDir) { Get-ChildItem -Path $skillsPoolDir -Directory } else { @() }
$activeSkills = if (Test-Path $activeSkillsDir) { Get-ChildItem -Path $activeSkillsDir -Directory } else { @() }

Assert-Test -Name "Dynamic Skill Pool (.agents/skills-pool/) preservado ($($poolSkills.Count) skills no pool)" `
            -Condition ($poolSkills.Count -ge 30) `
            -ErrorDetails "Esperado >= 30 skills no pool, encontradas $($poolSkills.Count)"

Assert-Test -Name "Catalogo de skills ativo (.agents/skills/) enxuto e consciente de fase ($($activeSkills.Count) ativas)" `
            -Condition ($activeSkills.Count -le 25) `
            -ErrorDetails "Esperado <= 25 skills ativas na fase, encontradas $($activeSkills.Count)"

# Teste JIT de skill via view_file
$tempSkillName = "gsd-spike"
$activeTempSkill = Join-Path $activeSkillsDir $tempSkillName
$poolTempSkill = Join-Path $skillsPoolDir $tempSkillName
if (Test-Path $activeTempSkill) { Remove-Item $activeTempSkill -Recurse -Force }

$payloadSkillJit = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"' + ($poolTempSkill -replace '\\', '/') + '/SKILL.md"}}}'
$resSkillJit = $payloadSkillJit | node $hookPath | ConvertFrom-Json
$skillPromoted = (Test-Path $activeTempSkill)

Assert-Test -Name "Hook PreToolUse promove instantaneamente (JIT) skill do pool sob demanda e redireciona caminho" `
            -Condition ($resSkillJit.decision -eq "allow" -and $skillPromoted -and ($resSkillJit.overwrite.AbsolutePath -match "skills")) `
            -ErrorDetails "Skill nao foi promovida para $activeTempSkill ou caminho nao foi redirecionado"

# ------------------------------------------------------------------------------
# Teste 13: Motor de UI do Instalador (setup-ui.cjs)
# ------------------------------------------------------------------------------
$setupUiPath = Join-Path $kitDir "setup-ui.cjs"
$uiSyntaxOk = $false
try {
    node --check $setupUiPath 2>$null
    $uiSyntaxOk = ($LASTEXITCODE -eq 0)
} catch {}

Assert-Test -Name "Motor de UI do instalador (setup-ui.cjs) presente e sintaticamente valido" `
            -Condition ($uiSyntaxOk -and (Test-Path $setupUiPath)) `
            -ErrorDetails "setup-ui.cjs ausente ou com erro de sintaxe"

# ------------------------------------------------------------------------------
# Teste 14: Deduplicação de Leituras Recentes no view_file
# ------------------------------------------------------------------------------
$dummyCodeFile = Join-Path $TargetDir ".agents\temp-dedup-test.go"
Set-Content -Path $dummyCodeFile -Value "package test`nfunc Hello() { println(`"ok`") }`n"
$payloadRead1 = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"' + ($dummyCodeFile -replace '\\', '/') + '","StartLine":1,"EndLine":2}}}'
$resRead1 = $payloadRead1 | node $hookPath | ConvertFrom-Json
$resRead2 = $payloadRead1 | node $hookPath | ConvertFrom-Json
Remove-Item -Path $dummyCodeFile -Force -ErrorAction SilentlyContinue

Assert-Test -Name "Hook PreToolUse bloqueia releituras redundantes imediatas (Deduplicacao de Contexto)" `
            -Condition ($resRead1.decision -eq "allow" -and $resRead2.decision -eq "deny" -and ($resRead2.reason -match "DEDUPLICA")) `
            -ErrorDetails "Segunda leitura identica em sequencia nao foi bloqueada para economia de tokens"

# Teste de leitura de trecho adjacente diferente (sem falso-positivo)
$dummyCodeFile2 = Join-Path $TargetDir ".agents\temp-dedup-diff.go"
Set-Content -Path $dummyCodeFile2 -Value "package test`nfunc Line1() {}`nfunc Line2() {}`nfunc Line3() {}`nfunc Line4() {}`n"
$payloadReadDiff1 = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"' + ($dummyCodeFile2 -replace '\\', '/') + '","StartLine":1,"EndLine":2}}}'
$payloadReadDiff2 = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"' + ($dummyCodeFile2 -replace '\\', '/') + '","StartLine":3,"EndLine":4}}}'
$resReadDiff1 = $payloadReadDiff1 | node $hookPath | ConvertFrom-Json
$resReadDiff2 = $payloadReadDiff2 | node $hookPath | ConvertFrom-Json
Remove-Item -Path $dummyCodeFile2 -Force -ErrorAction SilentlyContinue

Assert-Test -Name "Hook PreToolUse permite leitura de ranges distintos do mesmo arquivo sem falso-positivo" `
            -Condition ($resReadDiff1.decision -eq "allow" -and $resReadDiff2.decision -eq "allow") `
            -ErrorDetails "Leitura de trecho diferente foi indevidamente bloqueada pela deduplicacao"

# Teste de invalidação de deduplicação após alteração do arquivo no disco (mtime atualizado)
$dummyMtimeFile = Join-Path $TargetDir ".agents\temp-dedup-mtime.go"
Set-Content -Path $dummyMtimeFile -Value "package test`nfunc OldCode() {}`n"
$payloadMtime1 = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"' + ($dummyMtimeFile -replace '\\', '/') + '","StartLine":1,"EndLine":2}}}'
$resMtime1 = $payloadMtime1 | node $hookPath | ConvertFrom-Json

Start-Sleep -Milliseconds 50
Set-Content -Path $dummyMtimeFile -Value "package test`nfunc NewCode() {}`n"
(Get-Item $dummyMtimeFile).LastWriteTime = (Get-Date).AddSeconds(2)

$resMtime2 = $payloadMtime1 | node $hookPath | ConvertFrom-Json
Remove-Item -Path $dummyMtimeFile -Force -ErrorAction SilentlyContinue

Assert-Test -Name "Hook PreToolUse invalida deduplicacao e permite releitura quando arquivo e modificado no disco" `
            -Condition ($resMtime1.decision -eq "allow" -and $resMtime2.decision -eq "allow") `
            -ErrorDetails "Releitura apos modificacao de mtime foi indevidamente bloqueada"



# ------------------------------------------------------------------------------
# Teste 15: Auto-Limitador de Comandos Prolixos (git log / docker logs / npm list)
# ------------------------------------------------------------------------------
$payloadGitLog = '{"toolCall":{"name":"run_command","args":{"CommandLine":"git log"}}}'
$resGitLog = $payloadGitLog | node $hookPath | ConvertFrom-Json
$gitLogOverwritten = ($resGitLog.decision -eq "allow") -and ($resGitLog.overwrite.CommandLine -match "git log -n 20")

Assert-Test -Name "Hook PreToolUse auto-limita comandos prolixos (git log -> git log -n 20)" `
            -Condition $gitLogOverwritten `
            -ErrorDetails "Comando git log nao foi reescrito com limitador -n 20"

$payloadGci = '{"toolCall":{"name":"run_command","args":{"CommandLine":"Get-ChildItem -Recurse"}}}'
$resGci = $payloadGci | node $hookPath | ConvertFrom-Json
$gciOverwritten = ($resGci.decision -eq "allow") -and ($resGci.overwrite.CommandLine -match "-Depth 3")

Assert-Test -Name "Hook PreToolUse auto-limita varreduras recursivas (Get-ChildItem -Recurse -> -Depth 3)" `
            -Condition $gciOverwritten `
            -ErrorDetails "Comando Get-ChildItem -Recurse nao foi limitado com -Depth 3"

# Auto-limitação de docker logs
$payloadDocker = '{"toolCall":{"name":"run_command","args":{"CommandLine":"docker logs api-service"}}}'
$resDocker = $payloadDocker | node $hookPath | ConvertFrom-Json
$dockerLimited = ($resDocker.decision -eq "allow") -and ($resDocker.overwrite.CommandLine -match "docker logs --tail 100 api-service")
Assert-Test -Name "Hook PreToolUse auto-limita logs do Docker (docker logs -> --tail 100)" `
            -Condition $dockerLimited `
            -ErrorDetails "Comando docker logs nao foi reescrito com --tail 100"

# Auto-limitação de npm list
$payloadNpm = '{"toolCall":{"name":"run_command","args":{"CommandLine":"npm list"}}}'
$resNpm = $payloadNpm | node $hookPath | ConvertFrom-Json
$npmLimited = ($resNpm.decision -eq "allow") -and ($resNpm.overwrite.CommandLine -match "npm list --depth=0")
Assert-Test -Name "Hook PreToolUse auto-limita listagem de dependencias (npm list -> --depth=0)" `
            -Condition $npmLimited `
            -ErrorDetails "Comando npm list nao foi reescrito com --depth=0"

# Idempotência: comando que já possui limitador não recebe novo em duplicidade
$payloadGitLimited = '{"toolCall":{"name":"run_command","args":{"CommandLine":"git log -n 5"}}}'
$resGitLimited = $payloadGitLimited | node $hookPath | ConvertFrom-Json
$gitIdempotent = ($resGitLimited.decision -eq "allow") -and (-not $resGitLimited.overwrite)
Assert-Test -Name "Hook PreToolUse preserva comandos que ja possuem limitador (idempotencia)" `
            -Condition $gitIdempotent `
            -ErrorDetails "Comando git log -n 5 foi indevidamente reescrito"

# Auto-limitação de docker compose logs
$payloadDockerCompose = '{"toolCall":{"name":"run_command","args":{"CommandLine":"docker compose logs api-service"}}}'
$resDockerCompose = $payloadDockerCompose | node $hookPath | ConvertFrom-Json
$dockerComposeLimited = ($resDockerCompose.decision -eq "allow") -and ($resDockerCompose.overwrite.CommandLine -match "docker compose logs --tail 100 api-service")
Assert-Test -Name "Hook PreToolUse auto-limita logs do Docker Compose (docker compose logs -> --tail 100)" `
            -Condition $dockerComposeLimited `
            -ErrorDetails "Comando docker compose logs nao foi reescrito com --tail 100"

# Auto-limitação de pnpm list
$payloadPnpm = '{"toolCall":{"name":"run_command","args":{"CommandLine":"pnpm list"}}}'
$resPnpm = $payloadPnpm | node $hookPath | ConvertFrom-Json
$pnpmLimited = ($resPnpm.decision -eq "allow") -and ($resPnpm.overwrite.CommandLine -match "pnpm list --depth=0")
Assert-Test -Name "Hook PreToolUse auto-limita listagem de dependencias pnpm (pnpm list -> --depth=0)" `
            -Condition $pnpmLimited `
            -ErrorDetails "Comando pnpm list nao foi reescrito com --depth=0"

# Auto-limitação de comandos prolixos via alias de ferramenta (shell)
$payloadShellLim = '{"toolCall":{"name":"shell","args":{"CommandLine":"git log"}}}'
$resShellLim = $payloadShellLim | node $hookPath | ConvertFrom-Json
$shellLimited = ($resShellLim.decision -eq "allow") -and ($resShellLim.overwrite.CommandLine -match "git log -n 20")
Assert-Test -Name "Hook PreToolUse auto-limita comandos prolixos via alias de ferramenta (shell)" `
            -Condition $shellLimited `
            -ErrorDetails "Comando git log via shell nao foi reescrito com -n 20"


# ------------------------------------------------------------------------------
# Teste 16: State Compactor (compact-state.cjs)
# ------------------------------------------------------------------------------
$compactStatePath = Join-Path $kitDir "compact-state.cjs"
$compactStateOk = $false
try {
    node --check $compactStatePath 2>$null
    $compactStateOk = ($LASTEXITCODE -eq 0)
} catch {}

Assert-Test -Name "State Compactor (compact-state.cjs) presente e sintaticamente valido" `
            -Condition ($compactStateOk -and (Test-Path $compactStatePath)) `
            -ErrorDetails "compact-state.cjs ausente ou invalido"

# 16.2: Teste Funcional do State Compactor (compact-state.cjs) com mock de metricas historicas
$mockPlanningDir = Join-Path $TargetDir ".agents\temp-compactor-test"
$mockStateFile = Join-Path $mockPlanningDir ".planning\STATE.md"
$mockArchiveFile = Join-Path $mockPlanningDir ".planning\STATE-ARCHIVE.md"
$mockPlanParent = Split-Path $mockStateFile -Parent
if (-not (Test-Path $mockPlanParent)) {
    New-Item -ItemType Directory -Path $mockPlanParent -Force | Out-Null
}

$mockStateContent = "### Performance Metrics`n| Phase | Plans | Total | Avg/Plan |`n|---|---|---|---|`n| Phase 01 | 3 | 12m | 4m |`n| Phase 02 | 4 | 20m | 5m |`n| Phase 03 | 2 | 10m | 5m |`n| Phase 04 | 5 | 25m | 5m |`n| Phase 05 | 3 | 15m | 5m |`n| Phase 06 | 2 | 8m | 4m |`n| Phase 07 | 4 | 18m | 4.5m |`n| Phase 08 | 3 | 12m | 4m |`n| Phase 09 | 2 | 10m | 5m |`n`n"
Set-Content -Path $mockStateFile -Value $mockStateContent -Encoding utf8
$compactFuncRes = try { node $compactStatePath "$mockPlanningDir" --json | ConvertFrom-Json } catch { $null }
$compactStatePassed = ($compactFuncRes -ne $null) -and ($compactFuncRes.success -eq $true) -and ($compactFuncRes.compacted -eq $true) -and ($compactFuncRes.bytesSaved -gt 0) -and (Test-Path $mockArchiveFile)
Remove-Item -Path $mockPlanningDir -Recurse -Force -ErrorAction SilentlyContinue

Assert-Test -Name "State Compactor (compact-state.cjs) arquiva metricas historicas (>8 linhas) e preserva ativas" `
            -Condition $compactStatePassed `
            -ErrorDetails "Falha no teste funcional do compact-state.cjs com mock"

# ------------------------------------------------------------------------------
# Teste 17: JSON Stream Compact (compact-json.cjs)
# ------------------------------------------------------------------------------
$compactJsonPath = Join-Path $kitDir "compact-json.cjs"
$compactJsonResult = '{"a":1,"b":null}' | node $compactJsonPath | ConvertFrom-Json
$compactJsonOk = ($compactJsonResult.a -eq 1) -and ($compactJsonResult.b -eq $null)

Assert-Test -Name "JSON Stream Compact (compact-json.cjs) operacional e filtrando nulos" `
            -Condition $compactJsonOk `
            -ErrorDetails "compact-json.cjs falhou na filtragem de JSON"

# ------------------------------------------------------------------------------
# Teste 18: Output Sanitizer (sanitize-output.cjs)
# ------------------------------------------------------------------------------
$sanitizerPath = Join-Path $kitDir "sanitize-output.cjs"
$testOutput = (1..80 | ForEach-Object { "Linha de teste $_" }) -join "`n"
$sanitizedOut = $testOutput | node $sanitizerPath
$sanitizedOk = ($sanitizedOut -match "TOKEN GUARD") -and ($sanitizedOut -match "Linha de teste 1")

Assert-Test -Name "Output Sanitizer (sanitize-output.cjs) trunca saidas extensas com log preservado" `
            -Condition $sanitizedOk `
            -ErrorDetails "sanitize-output.cjs nao truncou saida de 80 linhas adequadamente"

# 18.2: Teste Funcional do Sanitize Command (sanitize-command.ps1 / sanitize-output.cjs --exec)
$sanitizeCmdPath = Join-Path $kitDir "sanitize-command.ps1"
$sanitizeCmdOk = $false
try {
    $sanOutput = & $sanitizeCmdPath "node -e `"for(let i=1;i<=80;i++)console.log('Linha '+i)`""
    if ($sanOutput -match "TOKEN GUARD" -and $sanOutput -match "Linha 1" -and $sanOutput -match "Linha 80") {
        $sanitizeCmdOk = $true
    }
} catch {}

Assert-Test -Name "Sanitizador de Comandos (sanitize-command.ps1) trunca execucao em lote e exibe banner" `
            -Condition $sanitizeCmdOk `
            -ErrorDetails "sanitize-command.ps1 falhou ao truncar saida com banner TOKEN GUARD"


# ------------------------------------------------------------------------------
# Teste 19: Preservacao de URLs na Normalizacao Windows
# ------------------------------------------------------------------------------
$payloadUrl = '{"toolCall":{"name":"run_command","args":{"CommandLine":"curl https://api.com/v1/resource -o D:/temp/out.json"}}}'
$resUrl = $payloadUrl | node $hookPath | ConvertFrom-Json
$urlPreserved = ($resUrl.decision -eq "allow") -and `
                ($resUrl.overwrite.CommandLine -match "https://api\.com/v1/resource") -and `
                (-not ($resUrl.overwrite.CommandLine -match "https:\\")) -and `
                ($resUrl.overwrite.CommandLine -match "D:\\temp\\out\.json")

Assert-Test -Name "Hook PreToolUse preserva URLs HTTP/HTTPS enquanto normaliza letras de drive Windows" `
            -Condition $urlPreserved `
            -ErrorDetails "A normalizacao de caminhos corrompeu a URL https:// ou falhou ao normalizar D:\"

# ------------------------------------------------------------------------------
# Teste 20: Gate Universal de Linguagens (.vue, .cs, .php, .sql)
# ------------------------------------------------------------------------------
$payloadVue = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/src/Component.vue"}}}'
$resVue = $payloadVue | node $hookPath | ConvertFrom-Json
$vueBlocked = ($resVue.decision -eq "deny") -and ($resVue.reason -match "PROTEÇÃO DE TOKENS")

$payloadCs = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"D:/apps/backend/src/Service.cs"}}}'
$resCs = $payloadCs | node $hookPath | ConvertFrom-Json
$csBlocked = ($resCs.decision -eq "deny") -and ($resCs.reason -match "PROTEÇÃO DE TOKENS")

Assert-Test -Name "Hook PreToolUse bloqueia view_file sem paginacao em linguagens universais (.vue e .cs)" `
            -Condition ($vueBlocked -and $csBlocked) `
            -ErrorDetails "Arquivos .vue ou .cs nao foram tratados como codigo pelo gate"

# ------------------------------------------------------------------------------
# Teste 21: Higienizacao de URIs file:/// no view_file
# ------------------------------------------------------------------------------
$payloadFileUri = '{"toolCall":{"name":"view_file","args":{"AbsolutePath":"file:///D:/apps/backend/README.md"}}}'
$resFileUri = $payloadFileUri | node $hookPath | ConvertFrom-Json
$fileUriOk = ($resFileUri.decision -eq "allow")

Assert-Test -Name "Hook PreToolUse higieniza e aceita URIs com prefixo file:///" `
            -Condition $fileUriOk `
            -ErrorDetails "Caminho com prefixo file:/// falhou ao ser processado"

# ------------------------------------------------------------------------------
# Teste 22: Preservacao de URLs remotas com extensao .ps1
# ------------------------------------------------------------------------------
$payloadPs1Url = '{"toolCall":{"name":"run_command","args":{"CommandLine":"curl https://example.com/deploy/setup.ps1"}}}'
$resPs1Url = $payloadPs1Url | node $hookPath | ConvertFrom-Json
$ps1UrlOk = ($resPs1Url.decision -eq "allow") -and `
            (-not ($resPs1Url.overwrite.CommandLine -match "https:\\")) -and `
            ($resPs1Url.overwrite.CommandLine -match "https://example\.com/deploy/setup\.ps1" -or (-not $resPs1Url.overwrite))

Assert-Test -Name "Hook PreToolUse preserva integralmente URLs remotas terminadas em .ps1" `
            -Condition $ps1UrlOk `
            -ErrorDetails "A URL https://.../setup.ps1 foi indevidamente corrompida com contrabarras"

# ------------------------------------------------------------------------------
# Teste 23: Excecao de write_to_file para arquivos temporarios/scratch
# ------------------------------------------------------------------------------
$dummyScratch = Join-Path $TargetDir ".agents\.cache\scratch\test.go"
$dummyScratchDir = Split-Path $dummyScratch -Parent
if (-not (Test-Path $dummyScratchDir)) { New-Item -ItemType Directory -Path $dummyScratchDir -Force | Out-Null }
Set-Content -Path $dummyScratch -Value "package main"
$payloadScratch = '{"toolCall":{"name":"write_to_file","args":{"TargetFile":"' + ($dummyScratch -replace '\\', '/') + '","Overwrite":true}}}'
$resScratch = $payloadScratch | node $hookPath | ConvertFrom-Json
Remove-Item -Path $dummyScratch -Force -ErrorAction SilentlyContinue

Assert-Test -Name "Hook PreToolUse permite sobrescrita de write_to_file em pastas efemeras/scratch" `
            -Condition ($resScratch.decision -eq "allow") `
            -ErrorDetails "Sobrescrita legitima em pasta temporaria scratch foi bloqueada"

# ------------------------------------------------------------------------------
# Teste 24: Operacao do Skill Surface Manager (skills-manager.cjs)
# ------------------------------------------------------------------------------
$skillsMgrPath = Join-Path $kitDir "skills-manager.cjs"
$skillsStatusOk = $false
try {
    $mgrOutput = node $skillsMgrPath status "$TargetDir" 2>$null
    if ($mgrOutput -match "Status do Catálogo de Skills" -and $mgrOutput -match "Skills Ativas") {
        $skillsStatusOk = $true
    }
} catch {}

Assert-Test -Name "Skill Surface Manager (skills-manager.cjs) operacional exibindo status e tokens" `
            -Condition $skillsStatusOk `
            -ErrorDetails "skills-manager.cjs falhou ao executar comando status"

# ------------------------------------------------------------------------------
# Teste 25: Extrator de Estado do GSD (gsd-state-summary.cjs)
# ------------------------------------------------------------------------------
$stateSummaryPath = Join-Path $kitDir "gsd-state-summary.cjs"
$stateSummaryOk = $false
try {
    $sumJson = node $stateSummaryPath 2>$null | ConvertFrom-Json
    if ($sumJson -ne $null -and $null -ne $sumJson.phase_number -and $sumJson.phase_status) {
        $stateSummaryOk = $true
    }
} catch {}

Assert-Test -Name "Extrator de Estado GSD (gsd-state-summary.cjs) operacional gerando JSON estruturado" `
            -Condition $stateSummaryOk `
            -ErrorDetails "gsd-state-summary.cjs falhou ao retornar phase_number e phase_status validos"

# ------------------------------------------------------------------------------
# Teste 26: Integridade Sintatica dos Utilitarios do Kit (patch-agents & graphify-update)
# ------------------------------------------------------------------------------
$patchAgentsPath = Join-Path $kitDir "patch-agents.cjs"
$graphifyUpdatePath = Join-Path $kitDir "gsd-graphify-update.cjs"
$syntaxOk = $false
try {
    node --check $patchAgentsPath 2>$null
    $patchOk = ($LASTEXITCODE -eq 0)
    node --check $graphifyUpdatePath 2>$null
    $gfyOk = ($LASTEXITCODE -eq 0)
    $syntaxOk = ($patchOk -and $gfyOk)
} catch {}

Assert-Test -Name "Utilitarios de manutencao (patch-agents.cjs e gsd-graphify-update.cjs) sintaticamente validos" `
            -Condition $syntaxOk `
            -ErrorDetails "patch-agents.cjs ou gsd-graphify-update.cjs possuem erro de sintaxe"

# 26.2: Teste Funcional Unitário do Normalizador de Agentes (patch-agents.cjs)
$patchFuncOk = $false
$tempAgentDir = Join-Path $TargetDir ".agents\temp-agent-patch-test"
if (-not (Test-Path $tempAgentDir)) { New-Item -ItemType Directory -Path $tempAgentDir -Force | Out-Null }
$tempAgentFile = Join-Path $tempAgentDir "dummy-patch-agent.md"
$tempAgentRaw = @"
---
name: dummy-patch-agent
description: Agente de Teste
tools:
  - glob
  - grep_search
  - write_file
  - run_command
---

# Instruções do Agente
Texto original do agente.
"@
Set-Content -Path $tempAgentFile -Value $tempAgentRaw -Encoding utf8

try {
    $patchScriptResult = node -e "
        const { patchAgentFile } = require(process.argv[1]);
        const changed = patchAgentFile(process.argv[2], process.argv[3]);
        process.stdout.write(changed ? 'OK' : 'FAIL');
    " "$patchAgentsPath" "$tempAgentFile" "$TargetDir"

    if ($patchScriptResult -eq "OK") {
        $patchedContent = Get-Content -Path $tempAgentFile -Raw
        $toolsNormalized = ($patchedContent -notmatch "-\s+glob") -and `
                           ($patchedContent -notmatch "-\s+grep_search") -and `
                           ($patchedContent -match "-\s+write_to_file") -and `
                           ($patchedContent -match "ANTIGRAVITY_TOKEN_PROTOCOL_START")
        if ($toolsNormalized) { $patchFuncOk = $true }
    }
} catch {}
Remove-Item -Path $tempAgentDir -Recurse -Force -ErrorAction SilentlyContinue

Assert-Test -Name "Normalizador de Agentes (patch-agents.cjs) remove ferramentas legadas e injeta protocolo cirurgico" `
            -Condition $patchFuncOk `
            -ErrorDetails "patchAgentFile falhou ao normalizar frontmatter ou injetar protocolo"

# 26.3: Validação de não-interferência de gsd-graphify-update.cjs para comandos regulares
$gfyNonCommitOk = $false
try {
    $gfyPayload = '{"toolCall":{"name":"run_command","args":{"CommandLine":"git status"}}}'
    $gfyProc = $gfyPayload | node $graphifyUpdatePath 2>$null
    $gfyNonCommitOk = ($LASTEXITCODE -eq 0)
} catch {}

Assert-Test -Name "Hook Graphify Update (gsd-graphify-update.cjs) ignora comandos que nao sao commit com saida limpa" `
            -Condition $gfyNonCommitOk `
            -ErrorDetails "gsd-graphify-update.cjs nao retornou codigo 0 para git status"

# ------------------------------------------------------------------------------
# Teste 27: Validacao Sintatica Integral de Scripts PowerShell (.ps1) e Shell (.sh)
# ------------------------------------------------------------------------------
$ps1Files = @("setup.ps1", "uninstall.ps1", "skills-profile.ps1", "sanitize-command.ps1", "optimize-tokens.ps1", "test-kit.ps1")
$ps1AllValid = $true
foreach ($ps1 in $ps1Files) {
    $fullPs1 = Join-Path $kitDir $ps1
    if (Test-Path $fullPs1) {
        $parseErrors = $null
        [System.Management.Automation.Language.Parser]::ParseFile($fullPs1, [ref]$null, [ref]$parseErrors) | Out-Null
        if ($parseErrors.Count -gt 0) { $ps1AllValid = $false; break }
    } else {
        $ps1AllValid = $false; break
    }
}

Assert-Test -Name "Todos os scripts PowerShell do kit ($($ps1Files.Count) scripts .ps1) com sintaxe valida via AST" `
            -Condition $ps1AllValid `
            -ErrorDetails "Um ou mais scripts .ps1 possuem erro de sintaxe PowerShell"

$shFiles = @("setup.sh", "uninstall.sh", "skills-profile.sh", "optimize-tokens.sh", "test-kit.sh")
$shAllPresent = $true
foreach ($sh in $shFiles) {
    $fullSh = Join-Path $kitDir $sh
    if (-not (Test-Path $fullSh) -or (Get-Item $fullSh).Length -eq 0) {
        $shAllPresent = $false; break
    }
}

Assert-Test -Name "Todos os scripts Shell do kit ($($shFiles.Count) scripts .sh) presentes e íntegros" `
            -Condition $shAllPresent `
            -ErrorDetails "Um ou mais scripts .sh ausentes ou vazios"

# ------------------------------------------------------------------------------
# Teste 28: Integridade das Regras e Skills Canonicas Empacotadas
# ------------------------------------------------------------------------------
$rulesDir = Join-Path $kitDir "rules"
$expectedRules = @("ast-grep.md", "gopls.md", "graphify.md", "idioma.md", "token-protocol.md")
$rulesAllOk = $true
foreach ($rule in $expectedRules) {
    $rulePath = Join-Path $rulesDir $rule
    if (-not (Test-Path $rulePath) -or (Get-Item $rulePath).Length -lt 50) {
        $rulesAllOk = $false; break
    }
}

Assert-Test -Name "Regras canonicas em rules/ ($($expectedRules.Count) regras) presentes e validas" `
            -Condition $rulesAllOk `
            -ErrorDetails "Regras canonicas ausentes ou corrompidas em $rulesDir"

$gsdTokensSkill = Join-Path $kitDir "skills\gsd-tokens\SKILL.md"
$skillOk = (Test-Path $gsdTokensSkill) -and ((Get-Content $gsdTokensSkill -Raw) -match "name:\s*gsd-tokens")

Assert-Test -Name "Skill canônica de tokens (skills/gsd-tokens/SKILL.md) presente com frontmatter valido" `
            -Condition $skillOk `
            -ErrorDetails "skills/gsd-tokens/SKILL.md ausente ou sem frontmatter valido"



# ------------------------------------------------------------------------------
# Testes das Novas Funcionalidades (Otimização de Tokens Avançada)
# ------------------------------------------------------------------------------

$shrinkScript = Join-Path $kitDir "shrink-prompts.cjs"
Assert-Test -Name "Script de minificação (shrink-prompts.cjs) presente" `
            -Condition (Test-Path $shrinkScript) `
            -ErrorDetails "shrink-prompts.cjs não encontrado na raiz do kit"

$outlineScript = Join-Path $kitDir "gsd-outline.cjs"
Assert-Test -Name "Script de skeleton (gsd-outline.cjs) presente" `
            -Condition (Test-Path $outlineScript) `
            -ErrorDetails "gsd-outline.cjs não encontrado na raiz do kit"

$stripScript = Join-Path $kitDir "gsd-read-strip.cjs"
Assert-Test -Name "Script de read-strip (gsd-read-strip.cjs) presente" `
            -Condition (Test-Path $stripScript) `
            -ErrorDetails "gsd-read-strip.cjs não encontrado na raiz do kit"

# Testa se o hook token-guard-pretool.cjs tem os novos gates
$pretoolHook = Join-Path $kitDir "hooks\token-guard-pretool.cjs"
$pretoolContent = Get-Content $pretoolHook -Raw -Encoding utf8
$hasStateGate = $pretoolContent -match "STATE.md Blocker"
$hasOutlineHint = $pretoolContent -match "gsd-outline"

Assert-Test -Name "Hook PreToolUse bloqueia STATE.md e sugere state_summary" `
            -Condition $hasStateGate `
            -ErrorDetails "Bloqueio de STATE.md não encontrado no token-guard-pretool"

Assert-Test -Name "Hook PreToolUse sugere gsd-outline.cjs ao rejeitar view_file de código" `
            -Condition $hasOutlineHint `
            -ErrorDetails "Sugestão de gsd-outline não encontrada no token-guard-pretool"

# ------------------------------------------------------------------------------
# Teste MCP Server Dual-Mode CLI (mcp-server.cjs)
# ------------------------------------------------------------------------------
$mcpBinPath = Join-Path $kitDir "mcp-server.cjs"
if (Test-Path (Join-Path $agentsDir "mcp-server.cjs")) {
    $mcpBinPath = Join-Path $agentsDir "mcp-server.cjs"
}
$mcpCliOk = $false
try {
    $toolsOut = node $mcpBinPath tools 2>$null
    $skelOut = node $mcpBinPath skeleton $mcpBinPath 2>$null
    if ($toolsOut -match "mempalace_recall" -and $skelOut -match "Skeleton Outline") {
        $mcpCliOk = $true
    }
} catch {}

Assert-Test -Name "Servidor MCP Dual-Mode atende chamadas diretas de CLI (tools e skeleton)" `
            -Condition $mcpCliOk `
            -ErrorDetails "mcp-server.cjs falhou ao responder aos comandos CLI 'tools' ou 'skeleton'"

# ------------------------------------------------------------------------------
# Resumo Final
# ------------------------------------------------------------------------------
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
if ($failed -eq 0) {
    Write-Host "🎉 SUCESSO TOTAL: Todos os $passed testes passaram com exito!" -ForegroundColor Green
    Write-Host "   O kit esta 100% blindado e operacional para este workspace.`n" -ForegroundColor Gray
} else {
    Write-Host "⚠️ ATENCAO: $failed testes falharam de um total de $($passed + $failed)." -ForegroundColor Red
}



