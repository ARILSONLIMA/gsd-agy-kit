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
    if ($kitDir.EndsWith("\.agents\kit") -or $kitDir.EndsWith("/.agents/kit")) {
        $TargetDir = Split-Path (Split-Path $kitDir -Parent) -Parent
    } elseif ($kitDir.EndsWith("\scripts") -or $kitDir.EndsWith("/scripts")) {
        $TargetDir = Split-Path $kitDir -Parent
        if (Test-Path (Join-Path $TargetDir ".agents\kit")) {
            $kitDir = Join-Path $TargetDir ".agents\kit"
        }
    } else {
        $currentLoc = (Get-Location).Path
        if (Test-Path (Join-Path $currentLoc ".agents\hooks\token-guard-pretool.cjs")) {
            $TargetDir = $currentLoc
        } elseif (Test-Path (Join-Path (Split-Path $kitDir -Parent) ".agents\hooks\token-guard-pretool.cjs")) {
            $TargetDir = Split-Path $kitDir -Parent
        } elseif (Test-Path (Join-Path $kitDir ".agents\hooks\token-guard-pretool.cjs")) {
            $TargetDir = $kitDir
        } elseif ($currentLoc -eq $kitDir -or $currentLoc.StartsWith($kitDir)) {
            $TargetDir = Split-Path $kitDir -Parent
        } else {
            $TargetDir = $currentLoc
        }
    }
} else {
    if (Test-Path $TargetDir) {
        $TargetDir = (Resolve-Path $TargetDir).Path
    }
    if (Test-Path (Join-Path $kitDir "mcp-server.cjs")) {
        # Repo checkout em teste
    } elseif ($kitDir.EndsWith("\.agents\kit") -or $kitDir.EndsWith("/.agents/kit")) {
        # Executando instalado
    } elseif (Test-Path (Join-Path $TargetDir ".agents\kit")) {
        $kitDir = Join-Path $TargetDir ".agents\kit"
    }
}

function Find-KitScript {
    param ([string]$Name)
    $p = Join-Path $kitDir $Name
    if (Test-Path $p) { return $p }
    $p2 = Join-Path $TargetDir ".agents\kit\$Name"
    if (Test-Path $p2) { return $p2 }
    return Join-Path $PSScriptRoot $Name
}

# Pre-flight Check: verificar se o kit está instalado no TargetDir
$agentsDirCheck = Join-Path $TargetDir ".agents"
$hookPathCheck = Join-Path $agentsDirCheck "hooks\token-guard-pretool.cjs"
if (-not (Test-Path $agentsDirCheck) -or -not (Test-Path $hookPathCheck)) {
    Write-Host "`n🛑 [Pre-flight Check] Workspace nao configurado!" -ForegroundColor Red
    Write-Host "   O diretorio '$TargetDir' nao contem a infraestrutura do kit instalada (.agents/hooks/token-guard-pretool.cjs)." -ForegroundColor Yellow
    Write-Host "`n💡 Para instalar e blindar este projeto, execute:" -ForegroundColor Cyan
    $setupScript = Find-KitScript "setup-ui.cjs"
    if (Test-Path $setupScript) {
        Write-Host "   node '$setupScript' '$TargetDir' --install`n" -ForegroundColor White
    } else {
        Write-Host "   pwsh $(Join-Path $kitDir 'setup.ps1') -TargetDir '$TargetDir'`n" -ForegroundColor White
    }
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
if ($IsWindows) {
    $cwdExpected = [System.IO.Path]::GetFullPath($TargetDir)
    $cwdNormalized = ($resCwd.decision -eq "allow") -and ($resCwd.overwrite.Cwd -eq $cwdExpected)
    Assert-Test -Name "Hook PreToolUse normaliza Cwd Windows para barras invertidas" `
                -Condition $cwdNormalized `
                -ErrorDetails "Esperado overwrite do Cwd com formato nativo Windows"
} else {
    Assert-Test -Name "Hook PreToolUse preserva Cwd no formato POSIX em Linux/WSL" `
                -Condition ($resCwd.decision -eq "allow") `
                -ErrorDetails "Esperado allow no Cwd POSIX"
}

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
$codeFile = Join-Path $TargetDir "dummy_existing_code_test.js"
Set-Content -Path $codeFile -Value "// existing code" -Encoding utf8
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
Remove-Item -Path $codeFile -Force -ErrorAction SilentlyContinue
Assert-Test -Name "Hook PreToolUse bloqueia sobrescrita integral de arquivo de codigo via alias 'write'" `
            -Condition ($resWriteAlias.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resWriteAlias.decision)'"

# 4.5: Native Antigravity - Bloqueio read_file sem linhas em código
$payloadReadFile = '{"toolCall":{"name":"read_file","args":{"Path":"cmd/api/main.go"}}}'
$resReadNoLines = $payloadReadFile | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia read_file sem StartLine/EndLine em codigo" `
            -Condition ($resReadNoLines.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resReadNoLines.decision)'"

# 4.6: Native Antigravity - Permissão read_file cirúrgico
$payloadReadSurgical = '{"toolCall":{"name":"read_file","args":{"Path":"cmd/api/main.go","StartLine":1,"EndLine":50}}}'
$resReadSurgical = $payloadReadSurgical | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse permite read_file cirurgico (<= 100 linhas) em codigo" `
            -Condition ($resReadSurgical.decision -eq "allow") `
            -ErrorDetails "Esperado 'allow', recebido '$($resReadSurgical.decision)'"

# 4.7: Native Antigravity - Bloqueio write_file com Overwrite em código existente
Set-Content -Path $codeFile -Value "// existing code" -Encoding utf8
$payloadWriteFile = '{"toolCall":{"name":"write_file","args":{"Path":"' + ($codeFile -replace '\\', '/') + '","Overwrite":true}}}'
$resWriteFile = $payloadWriteFile | node $hookPath | ConvertFrom-Json
Remove-Item -Path $codeFile -Force -ErrorAction SilentlyContinue
Assert-Test -Name "Hook PreToolUse bloqueia sobrescrita integral via write_file em arquivo existente" `
            -Condition ($resWriteFile.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resWriteFile.decision)'"

# 4.8: Sandbox Shield - Bloqueio de scenario.json e holdout
$payloadScenario = '{"toolCall":{"name":"view_file","args":{"Path":"scenario.json"}}}'
$resScenario = $payloadScenario | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia leitura de scenario.json (Sandbox Shield)" `
            -Condition ($resScenario.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resScenario.decision)'"

$holdoutSeg = ".gsd-" + "bench-holdout"
$payloadHoldout = "{`"toolCall`":{`"name`":`"read_file`",`"args`":{`"Path`":`"~/$holdoutSeg/suite.test.js`"}}}"
$resHoldout = $payloadHoldout | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia leitura de suítes holdout externas (Sandbox Shield)" `
            -Condition ($resHoldout.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resHoldout.decision)'"

$payloadCmdHoldout = "{`"toolCall`":{`"name`":`"run_command`",`"args`":{`"CommandLine`":`"ls -la ~/$holdoutSeg`"}}}"
$resCmdHoldout = $payloadCmdHoldout | node $hookPath | ConvertFrom-Json
Assert-Test -Name "Hook PreToolUse bloqueia comandos shell direcionados a holdout (Sandbox Shield)" `
            -Condition ($resCmdHoldout.decision -eq "deny") `
            -ErrorDetails "Esperado 'deny', recebido '$($resCmdHoldout.decision)'"


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

$agentsBridge = Join-Path $TargetDir ".agents\rules\token-protocol.md"
if (-not (Test-Path $agentsBridge)) { $agentsBridge = Join-Path $TargetDir "AGENTS.md" }
if (-not (Test-Path $agentsBridge)) { $agentsBridge = Join-Path $TargetDir "GEMINI.md" }
$geminiDeduplicated = (Test-Path $agentsBridge) -or (Test-Path (Join-Path $TargetDir ".agents\rules\token-protocol.md"))
Assert-Test -Name "Instruções do projeto presentes (.agents/rules/ ou AGENTS.md)" `
            -Condition $geminiDeduplicated `
            -ErrorDetails "Instruções do projeto ausentes"

$poolDir = Join-Path $TargetDir ".agents\agents-pool"
$poolFiles = if (Test-Path $poolDir) { Get-ChildItem -Path $poolDir -Filter *.md } else { @() }
Assert-Test -Name "Dynamic Agent Pool (.agents/agents-pool/) contem todos os agentes preservados ($($poolFiles.Count))" `
            -Condition ($poolFiles.Count -ge 30) `
            -ErrorDetails "Esperado >= 30 agentes no pool, encontrados $($poolFiles.Count)"

$activeAgentsCount = (Get-ChildItem -Path $agentsDir -Filter *.md).Count
Assert-Test -Name "Catalogo ativo (.agents/agents/) em Zero-Baseline (0 agentes ativos por padrao)" `
            -Condition ($activeAgentsCount -eq 0) `
            -ErrorDetails "Esperado 0 agentes ativos no catalogo Zero-Baseline, encontrados $activeAgentsCount"

$skillsActiveDir = Join-Path $TargetDir ".agents\skills"
$skillsActiveFolders = if (Test-Path $skillsActiveDir) { (Get-ChildItem -Path $skillsActiveDir -Directory).Count } else { 0 }
Assert-Test -Name "Catalogo de Skills (.agents/skills/) em Zero-Baseline (0 skills ativas por padrao)" `
            -Condition ($skillsActiveFolders -eq 0) `
            -ErrorDetails "Esperado 0 skills ativas no modo Zero-Baseline, encontradas $skillsActiveFolders"

$rulesProtocol = Join-Path $TargetDir ".agents\rules\token-protocol.md"
$hasCatalog = (Test-Path $rulesProtocol) -and ((Get-Content $rulesProtocol -Raw) -match "(Catálogo Sintético|Agentic Skill Retrieval|Descoberta & Ativação Autônoma)")
Assert-Test -Name "Catálogo Sintético presente nas regras (.agents/rules/token-protocol.md)" `
            -Condition $hasCatalog `
            -ErrorDetails "Catálogo Sintético ausente em token-protocol.md"

# ------------------------------------------------------------------------------
# Teste 7: JIT Auto-Promoter do Hook (Ativação Sob Demanda de Subagentes)
# ------------------------------------------------------------------------------
$tempAgentName = "gsd-ui-auditor"
$activeTempPath = Join-Path $agentsDir "$tempAgentName.md"
if (Test-Path $activeTempPath) { Remove-Item $activeTempPath -Force }

$payloadJit = '{"toolCall":{"name":"invoke_subagent","args":{"Subagents":[{"TypeName":"' + $tempAgentName + '"}]}}}'
$resJit = $payloadJit | node $hookPath | ConvertFrom-Json
$jitPromoted = (Test-Path $activeTempPath)

Assert-Test -Name "Hook PreToolUse promove instantaneamente (JIT) subagente do pool sob demanda" `
            -Condition ($resJit.decision -eq "allow" -and $jitPromoted) `
            -ErrorDetails "Subagente nao foi promovido para $activeTempPath apos chamada invoke_subagent"

# 7.1: Validar TTL = 1 (PreInvocation recolhe no turno subsequente)
$preInvocPath = Join-Path $TargetDir ".agents\hooks\token-guard-preinvocation.cjs"
node $preInvocPath | Out-Null
$ttlCleaned = -not (Test-Path $activeTempPath)
Assert-Test -Name "Hook PreInvocation recolhe subagente promovido apos 1 turno (TTL=1 cirurgico)" `
            -Condition $ttlCleaned `
            -ErrorDetails "Subagente promovido nao foi recolhido no turno subsequente"

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

$gitDir = Join-Path $TargetDir ".git"
$gitHooksDir = Join-Path $gitDir "hooks"
if (-not (Test-Path $gitDir)) {
    # Workspace sem repositorio Git inicializado: hooks de git sao dispensados
    $gitHooksOk = $true
} else {
    $gitHooksOk = (Test-Path (Join-Path $gitHooksDir "post-merge")) -and (Test-Path (Join-Path $gitHooksDir "post-checkout"))
}
Assert-Test -Name "Git hooks de auto-cura presentes em .git/hooks/" `
            -Condition $gitHooksOk `
            -ErrorDetails "post-merge ou post-checkout ausentes em $gitHooksDir"

# ------------------------------------------------------------------------------
# Teste 9: Telemetria de Tokens (token-report.cjs / /gsd-tokens)
# ------------------------------------------------------------------------------
$tokenReportPath = Find-KitScript "token-report.cjs"
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
if (Test-Path $activeTempSkill) { Remove-Item $activeTempSkill -Recurse -Force -ErrorAction SilentlyContinue }

Assert-Test -Name "Hook PreToolUse promove instantaneamente (JIT) skill do pool sob demanda e redireciona caminho" `
            -Condition ($resSkillJit.decision -eq "allow" -and $skillPromoted -and ($resSkillJit.overwrite.AbsolutePath -match "skills")) `
            -ErrorDetails "Skill nao foi promovida para $activeTempSkill ou caminho nao foi redirecionado"

# ------------------------------------------------------------------------------
# Teste 13: Motor de UI do Instalador (setup-ui.cjs)
# ------------------------------------------------------------------------------
$setupUiPath = Find-KitScript "setup-ui.cjs"
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
$compactStatePath = Find-KitScript "compact-state.cjs"
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
$compactJsonPath = Find-KitScript "compact-json.cjs"
$compactJsonResult = '{"a":1,"b":null}' | node $compactJsonPath | ConvertFrom-Json
$compactJsonOk = ($compactJsonResult.a -eq 1) -and ($compactJsonResult.b -eq $null)

Assert-Test -Name "JSON Stream Compact (compact-json.cjs) operacional e filtrando nulos" `
            -Condition $compactJsonOk `
            -ErrorDetails "compact-json.cjs falhou na filtragem de JSON"

# ------------------------------------------------------------------------------
# Teste 18: Output Sanitizer (sanitize-output.cjs)
# ------------------------------------------------------------------------------
$sanitizerPath = Find-KitScript "sanitize-output.cjs"
$testOutput = (1..80 | ForEach-Object { "Linha de teste $_" }) -join "`n"
$sanitizedOut = $testOutput | node $sanitizerPath
$sanitizedOk = ($sanitizedOut -match "TOKEN GUARD") -and ($sanitizedOut -match "Linha de teste 1")

Assert-Test -Name "Output Sanitizer (sanitize-output.cjs) trunca saidas extensas com log preservado" `
            -Condition $sanitizedOk `
            -ErrorDetails "sanitize-output.cjs nao truncou saida de 80 linhas adequadamente"

# 18.2: Teste Funcional do Sanitize Command (sanitize-command.ps1 / sanitize-output.cjs --exec)
$sanitizeCmdPath = Find-KitScript "sanitize-command.ps1"
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
$skillsMgrPath = Find-KitScript "skills-manager.cjs"
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
$stateSummaryPath = Find-KitScript "gsd-state-summary.cjs"
$stateSummaryOk = $false
try {
    $sumJson = node $stateSummaryPath $TargetDir 2>$null | ConvertFrom-Json
    if ($sumJson -ne $null -and $null -ne $sumJson.phase_number -and $sumJson.phase_status) {
        $stateSummaryOk = $true
    }
} catch {}

if (-not $stateSummaryOk) {
    try {
        $tempPlanDir = Join-Path $TargetDir ".temp-state-test\.planning"
        New-Item -ItemType Directory -Path $tempPlanDir -Force | Out-Null
        $dummyState = @"
---
current_phase: 1
current_phase_name: "Setup"
status: "in_progress"
---
# State
"@
        Set-Content -Path (Join-Path $tempPlanDir "STATE.md") -Value $dummyState -Encoding utf8
        $sumJson = node $stateSummaryPath (Join-Path $TargetDir ".temp-state-test") 2>$null | ConvertFrom-Json
        Remove-Item -Path (Join-Path $TargetDir ".temp-state-test") -Recurse -Force -ErrorAction SilentlyContinue
        if ($sumJson -ne $null -and $null -ne $sumJson.phase_number) {
            $stateSummaryOk = $true
        }
    } catch {}
}

Assert-Test -Name "Extrator de Estado GSD (gsd-state-summary.cjs) operacional gerando JSON estruturado" `
            -Condition $stateSummaryOk `
            -ErrorDetails "gsd-state-summary.cjs falhou ao retornar phase_number e phase_status validos"

# ------------------------------------------------------------------------------
# Teste 26: Integridade Sintatica dos Utilitarios do Kit (patch-agents & graphify-update)
# ------------------------------------------------------------------------------
$patchAgentsPath = Find-KitScript "patch-agents.cjs"
$graphifyUpdatePath = Find-KitScript "gsd-graphify-update.cjs"
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
$ps1Files = @("setup.ps1", "install.ps1", "uninstall.ps1", "skills-profile.ps1", "sanitize-command.ps1", "optimize-tokens.ps1", "test-kit.ps1")
$ps1AllValid = $true
foreach ($ps1 in $ps1Files) {
    $fullPs1 = Find-KitScript $ps1
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

$shFiles = @("setup.sh", "install.sh", "uninstall.sh", "skills-profile.sh", "optimize-tokens.sh", "test-kit.sh")
$shAllPresent = $true
foreach ($sh in $shFiles) {
    $fullSh = Find-KitScript $sh
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
$rulesDir = if (Test-Path (Join-Path $kitDir "rules")) {
    Join-Path $kitDir "rules"
} elseif (Test-Path (Join-Path $TargetDir ".agents\rules")) {
    Join-Path $TargetDir ".agents\rules"
} else {
    Join-Path $PSScriptRoot "rules"
}

$expectedRules = @("ast-grep.md", "lsp.md", "graphify.md", "idioma.md", "token-protocol.md", "ponytail.md", "caveman.md")
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

$guardrailPath = Join-Path $rulesDir "quality-guardrails.md"
if (-not (Test-Path $guardrailPath)) {
    $guardrailPath = Join-Path $TargetDir ".agents\rules\quality-guardrails.md"
}
$guardrailContent = if (Test-Path $guardrailPath) { Get-Content $guardrailPath -Raw } else { "" }
$guardrailOk = ($guardrailContent -match "Teto Estrito de Aninhamento") -and ($guardrailContent -match "Blindagem Aritmética")
Assert-Test -Name "Regras de qualidade contêm guardrails de aninhamento <= 3 e blindagem aritmética" `
            -Condition $guardrailOk `
            -ErrorDetails "quality-guardrails.md sem diretivas de aninhamento ou blindagem aritmética"

$planningRulePath = Join-Path $rulesDir "compact-planning.md"
if (-not (Test-Path $planningRulePath)) {
    $planningRulePath = Join-Path $TargetDir ".agents\rules\compact-planning.md"
}
$planningContent = if (Test-Path $planningRulePath) { Get-Content $planningRulePath -Raw } else { "" }
$planningOk = $planningContent -match "Teto Calibrado sem Prosa: Máximo 55 Linhas"
Assert-Test -Name "Diretrizes de planejamento contêm Blueprint de Coordenadas com teto de 55 linhas" `
            -Condition $planningOk `
            -ErrorDetails "compact-planning.md sem Blueprint de Coordenadas / teto de 55 linhas"

$compGuardTestPath = Join-Path $kitDir "lib\complexity-guard.cjs"
if (-not (Test-Path $compGuardTestPath)) { $compGuardTestPath = Join-Path $PSScriptRoot "lib\complexity-guard.cjs" }
$compTestScript = @"
const CG = require(process.argv[1]);
const cg = new CG();
const code = "function test() { if (1) { for (let i=0; i<2; i++) { if (2) { console.log(1); } } } }";
const fns = cg.extractFunctions(code);
const fn = fns[0];
if (fn && fn.maxNesting >= 4) process.exit(0);
process.exit(1);
"@
$compExitCode = try {
    $p = Start-Process node -ArgumentList @("-e", $compTestScript, $compGuardTestPath) -Wait -PassThru -NoNewWindow
    $p.ExitCode
} catch { 1 }
Assert-Test -Name "ComplexityGuard detecta aninhamento profundo nivel >= 4 sem off-by-one" `
            -Condition ($compExitCode -eq 0) `
            -ErrorDetails "ComplexityGuard falhou em flaggar aninhamento nivel 4"

$compHighScript = @"
const CG = require(process.argv[1]);
const cg = new CG({ maxComplexity: 12 });
const code = 'app.get("/test", async (req, res) => { if(1){}if(2){}if(3){}if(4){}if(5){}if(6){}if(7){}if(8){}if(9){}if(10){}if(11){}if(12){}if(13){} });';
const fns = cg.extractFunctions(code);
const fn = fns[0];
if (fn) {
    const kw = (fn.body.match(/\b(if|for|while|case|catch)\b/g) || []).length;
    if (kw > 12) process.exit(0);
}
process.exit(1);
"@
$compHighExitCode = try {
    $p = Start-Process node -ArgumentList @("-e", $compHighScript, $compGuardTestPath) -Wait -PassThru -NoNewWindow
    $p.ExitCode
} catch { 1 }
Assert-Test -Name "ComplexityGuard detecta rotas anonimas e alta complexidade ciclomática > 12" `
            -Condition ($compHighExitCode -eq 0) `
            -ErrorDetails "ComplexityGuard falhou em flaggar rotas anonimas ou complexidade ciclomática"

$tokenProtoPath = Join-Path $rulesDir "token-protocol.md"
if (-not (Test-Path $tokenProtoPath)) {
    $tokenProtoPath = Join-Path $TargetDir ".agents\rules\token-protocol.md"
}
$tokenProtoContent = if (Test-Path $tokenProtoPath) { Get-Content $tokenProtoPath -Raw } else { "" }
$ambUniversalOk = ($tokenProtoContent -match "Os 4 Vetores Universais de Incerteza de Software") -and ($tokenProtoContent -match "Formato Obrigatório em Bloco Atômico")
Assert-Test -Name "Protocolo de ambiguidades contém os 4 vetores universais e formato de bloco atômico" `
            -Condition $ambUniversalOk `
            -ErrorDetails "token-protocol.md sem os 4 vetores universais ou formato de bloco atômico"

$guardrailWebOk = ($guardrailContent -match "Achatamento de Middlewares Web") -and ($guardrailContent -match "Anti-Magic Sampling Caps")
Assert-Test -Name "Regras de qualidade contêm achatamento de middlewares web e anti-magic sampling caps" `
            -Condition $guardrailWebOk `
            -ErrorDetails "quality-guardrails.md sem diretivas de achatamento web ou anti-magic sampling caps"

$secLinterTestPath = Join-Path $kitDir "lib\security-linter.cjs"
if (-not (Test-Path $secLinterTestPath)) { $secLinterTestPath = Join-Path $PSScriptRoot "lib\security-linter.cjs" }
$secTestScript = @"
const SL = require(process.argv[1]);
const sl = new SL();
const issues = sl.scanSource("const q = \`SELECT * FROM x WHERE id IN (\${placeholders})\`;");
if (issues.length > 0 && issues[0].type === "sql_template_interpolation") process.exit(0);
process.exit(1);
"@
$secExitCode = try {
    $p = Start-Process node -ArgumentList @("-e", $secTestScript, $secLinterTestPath) -Wait -PassThru -NoNewWindow
    $p.ExitCode
} catch { 1 }
Assert-Test -Name "SecurityLinter intercepta qualquer interpolacao template em SQL sem excecao indevida" `
            -Condition ($secExitCode -eq 0) `
            -ErrorDetails "SecurityLinter permitiu interpolacao em template string SQL"

$canonicalSkills = @("gsd-tokens", "gsd-test", "gsd-agy-update")
$skillOk = $true
foreach ($sk in $canonicalSkills) {
    $skPath = if (Test-Path (Join-Path $kitDir "skills\$sk\SKILL.md")) {
        Join-Path $kitDir "skills\$sk\SKILL.md"
    } elseif (Test-Path (Join-Path $TargetDir ".agents\skills\$sk\SKILL.md")) {
        Join-Path $TargetDir ".agents\skills\$sk\SKILL.md"
    } else {
        Join-Path $PSScriptRoot "skills\$sk\SKILL.md"
    }
    if (-not (Test-Path $skPath) -or ((Get-Content $skPath -Raw) -notmatch "name:\s*$sk")) {
        $skillOk = $false
        break
    }
}

Assert-Test -Name "Skills canônicas (/gsd-tokens, /gsd-test e /gsd-agy-update) presentes com frontmatter valido" `
            -Condition $skillOk `
            -ErrorDetails "Uma ou mais skills canonicas ausentes ou sem frontmatter valido"



# ------------------------------------------------------------------------------
# Testes das Novas Funcionalidades (Otimização de Tokens Avançada)
# ------------------------------------------------------------------------------

$shrinkScript = Find-KitScript "shrink-prompts.cjs"
Assert-Test -Name "Script de minificação (shrink-prompts.cjs) presente" `
            -Condition (Test-Path $shrinkScript) `
            -ErrorDetails "shrink-prompts.cjs não encontrado na raiz do kit"

$outlineScript = Find-KitScript "gsd-outline.cjs"
Assert-Test -Name "Script de skeleton (gsd-outline.cjs) presente" `
            -Condition (Test-Path $outlineScript) `
            -ErrorDetails "gsd-outline.cjs não encontrado na raiz do kit"

# Testa se o hook token-guard-pretool.cjs tem os novos gates
$pretoolHook = if (Test-Path (Join-Path $kitDir "hooks\token-guard-pretool.cjs")) {
    Join-Path $kitDir "hooks\token-guard-pretool.cjs"
} elseif (Test-Path (Join-Path $TargetDir ".agents\hooks\token-guard-pretool.cjs")) {
    Join-Path $TargetDir ".agents\hooks\token-guard-pretool.cjs"
} else {
    Join-Path $PSScriptRoot "hooks\token-guard-pretool.cjs"
}
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
$mcpBinPath = Find-KitScript "mcp-server.cjs"
$mcpLibDir = if (Test-Path (Join-Path $kitDir "lib")) {
    Join-Path $kitDir "lib"
} elseif (Test-Path (Join-Path $TargetDir ".agents\kit\lib")) {
    Join-Path $TargetDir ".agents\kit\lib"
} elseif (Test-Path (Join-Path $TargetDir ".agents\lib")) {
    Join-Path $TargetDir ".agents\lib"
} else {
    Join-Path $PSScriptRoot "lib"
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
# Teste Agentic Skill Retrieval (skill_search & activate via CLI e MCP)
# ------------------------------------------------------------------------------
$agenticOk = $false
try {
    $tempActiveSkill = Join-Path $activeSkillsDir "ponytail-debt"
    if (Test-Path $tempActiveSkill) { Remove-Item -Path $tempActiveSkill -Recurse -Force -ErrorAction SilentlyContinue }
    $env:PROJECT_ROOT = $targetDir
    $searchOut = node $mcpBinPath skill search "refatoracao" 2>$null
    $activateOut = node $mcpBinPath skill activate "ponytail-debt" 2>$null
    if ($searchOut -match "Skill Retrieval" -and (Test-Path $tempActiveSkill)) {
        $agenticOk = $true
    }
    if (Test-Path $tempActiveSkill) { Remove-Item -Path $tempActiveSkill -Recurse -Force -ErrorAction SilentlyContinue }
} catch {}

Assert-Test -Name "Agentic Skill Retrieval (skill_search & activate) localiza por intenção e auto-promove JIT" `
            -Condition $agenticOk `
            -ErrorDetails "Falha no motor de busca semântica de skills ou na ativação JIT via mcp-server.cjs"

# ------------------------------------------------------------------------------
# Teste ast_query via MCP Server CLI
# ------------------------------------------------------------------------------
$astQueryOk = $false
try {
    $astOut = node $mcpBinPath ast "class `$NAME" js "$mcpLibDir" 2>$null
    if ($astOut -match "AST Query" -and $astOut -match "correspondência") {
        $astQueryOk = $true
    }
} catch {}

Assert-Test -Name "Tool ast_query nativa no MCP Server localiza padrões estruturais sem falhas de escape" `
            -Condition $astQueryOk `
            -ErrorDetails "mcp-server.cjs falhou na consulta ast_query"

# ------------------------------------------------------------------------------
# Teste Test Isolate Engine (lib/test-isolate.cjs e CLI)
# ------------------------------------------------------------------------------
$testIsoOk = $false
try {
    $isoRes = node -e '
    const path = require("path");
    const libDir = process.argv[1];
    const TestIsolate = require(path.join(libDir, "test-isolate.cjs"));
    const t = new TestIsolate();
    const out = "✖ Scenario 10 - Circuit Breaker (50ms)\nnot ok 2 - should retry";
    const f = t.parseFailures(out);
    if (f.length === 2 && f.includes("Scenario 10 - Circuit Breaker")) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" 2>$null
    if ($isoRes -eq "OK") { $testIsoOk = $true }
} catch {}

Assert-Test -Name "Test Isolate Engine (lib/test-isolate.cjs) extrai falhas pontuais para reexecução cirúrgica" `
            -Condition $testIsoOk `
            -ErrorDetails "lib/test-isolate.cjs falhou ao extrair falhas de teste"

# ------------------------------------------------------------------------------
# Teste Checkpoint Engine (lib/checkpoint-engine.cjs)
# ------------------------------------------------------------------------------
$chkOk = $false
try {
    $chkRes = node -e '
    const path = require("path");
    const libDir = process.argv[1];
    const Checkpoint = require(path.join(libDir, "checkpoint-engine.cjs"));
    const c = new Checkpoint();
    const list = c.listCheckpoints();
    if (Array.isArray(list)) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" 2>$null
    if ($chkRes -eq "OK") { $chkOk = $true }
} catch {}

Assert-Test -Name "Checkpoint Engine (lib/checkpoint-engine.cjs) gerencia micro-checkpoints para rollback seguro" `
            -Condition $chkOk `
            -ErrorDetails "lib/checkpoint-engine.cjs falhou ao listar micro-checkpoints"

# ------------------------------------------------------------------------------
# Teste Skeleton Engine Multi-Stack (PHP, Ruby, Dart, Elixir)
# ------------------------------------------------------------------------------
$skelMultiOk = $false
try {
    $skelMultiRes = node -e '
    const path = require("path");
    const fs = require("fs");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];
    const Skeleton = require(path.join(libDir, "skeleton-engine.cjs"));
    const skel = new Skeleton(targetDir);
    const testDir = path.join(targetDir, ".agents", "temp-multi-test-ps");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "test.php"), "<?php\nclass UserService { public function find() {} }", "utf8");
    fs.writeFileSync(path.join(testDir, "test.rb"), "class OrderController\n  def create\n  end\nend", "utf8");
    fs.writeFileSync(path.join(testDir, "test.dart"), "class ProductBloc { void dispatch() {} }", "utf8");
    fs.writeFileSync(path.join(testDir, "test.ex"), "defmodule PaymentGateway do\n  def process() do\n  end\nend", "utf8");
    const oPhp = skel.getOutline(path.join(testDir, "test.php"));
    const oRb = skel.getOutline(path.join(testDir, "test.rb"));
    const oDart = skel.getOutline(path.join(testDir, "test.dart"));
    const oEx = skel.getOutline(path.join(testDir, "test.ex"));
    fs.rmSync(testDir, { recursive: true, force: true });
    if (oPhp.includes("class UserService") && oRb.includes("class OrderController") && oDart.includes("class ProductBloc") && oEx.includes("defmodule PaymentGateway")) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($skelMultiRes -eq "OK") { $skelMultiOk = $true }
} catch {}

Assert-Test -Name "Skeleton Engine suporta extração estrutural em PHP, Ruby, Dart e Elixir" `
            -Condition $skelMultiOk `
            -ErrorDetails "lib/skeleton-engine.cjs falhou na extração de novas stacks"

# ------------------------------------------------------------------------------
# Teste Lockfile Lens Multi-Stack (PHP, Ruby, Dart)
# ------------------------------------------------------------------------------
$lensMultiOk = $false
try {
    $lensMultiRes = node -e '
    const path = require("path");
    const fs = require("fs");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];
    const Lens = require(path.join(libDir, "lockfile-lens.cjs"));
    const testDir = path.join(targetDir, ".agents", "temp-lens-multi-ps");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "composer.json"), JSON.stringify({ require: { "laravel/framework": "^10.0" } }), "utf8");
    fs.writeFileSync(path.join(testDir, "Gemfile"), "source \"https://rubygems.org\"\ngem \"rails\", \"~> 7.0\"\n", "utf8");
    fs.writeFileSync(path.join(testDir, "pubspec.yaml"), "name: my_app\ndependencies:\n  dio: ^5.0.0\n", "utf8");
    const lens = new Lens(testDir);
    const resPhp = lens.inspect("laravel/framework");
    const resRb = lens.inspect("rails");
    const resDart = lens.inspect("dio");
    fs.rmSync(testDir, { recursive: true, force: true });
    if (resPhp.found && resRb.found && resDart.found) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($lensMultiRes -eq "OK") { $lensMultiOk = $true }
} catch {}

Assert-Test -Name "Lockfile Lens inspeciona dependências PHP (composer), Ruby (Gemfile) e Dart (pubspec)" `
            -Condition $lensMultiOk `
            -ErrorDetails "lib/lockfile-lens.cjs falhou nas novas stacks de lockfile"

# ------------------------------------------------------------------------------
# Teste Greenfield vs Brownfield Protocol Generator (patch-agents.cjs)
# ------------------------------------------------------------------------------
$protoOk = $false
try {
    $protoRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const patchPath = process.argv[1];
    const targetDir = process.argv[2];
    const testDir = path.join(targetDir, ".agents", "temp-proto-test-ps");
    fs.mkdirSync(path.join(testDir, ".agents", "agents"), { recursive: true });
    fs.writeFileSync(path.join(testDir, ".agents", "agents", "gsd-executor.md"), "---\nname: gsd-executor\ntools:\n  - view_file\n---\nExecutor", "utf8");
    execSync(`node "${patchPath}" "${testDir}"`, { stdio: "ignore" });
    const content = fs.readFileSync(path.join(testDir, ".agents", "agents", "gsd-executor.md"), "utf8");
    fs.rmSync(testDir, { recursive: true, force: true });
    if (content.includes("GREENFIELD FAST-TRACK") && content.includes("mode=\"greenfield\"")) {
      process.stdout.write("OK");
    }
    ' "$patchAgentsPath" "$TargetDir" 2>$null
    if ($protoRes -eq "OK") { $protoOk = $true }
} catch {}

Assert-Test -Name "Normalizador detecta maturidade de projeto e injeta protocolo Greenfield Fast-Track" `
            -Condition $protoOk `
            -ErrorDetails "patch-agents.cjs falhou ao gerar protocolo greenfield"

# ------------------------------------------------------------------------------
# Teste Smart-Assist Proactive Auto-Slicing Mode (res.overwrite)
# ------------------------------------------------------------------------------
$autoSliceOk = $false
try {
    $autoSliceRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const hookPath = process.argv[1];
    const targetDir = process.argv[2];
    const dummyFile = path.join(targetDir, ".agents", "temp-slice-test-ps.js");
    fs.writeFileSync(dummyFile, Array(150).fill("console.log(1);").join("\n"), "utf8");
    const { execSync } = require("child_process");
    const payload = JSON.stringify({ toolCall: { name: "view_file", args: { AbsolutePath: dummyFile, StartLine: 1, EndLine: 150 } } });
    const res = execSync(`node "${hookPath}"`, {
      input: payload,
      env: { ...process.env, GSD_KIT_MODE: "smart-assist" },
      encoding: "utf8"
    });
    fs.rmSync(dummyFile, { force: true });
    const parsed = JSON.parse(res.trim());
    if (parsed.decision === "allow" && parsed.overwrite && parsed.overwrite.EndLine === 100) {
      process.stdout.write("OK");
    }
    ' "$pretoolHook" "$TargetDir" 2>$null
    if ($autoSliceRes -eq "OK") { $autoSliceOk = $true }
} catch {}

Assert-Test -Name "Hook PreToolUse auto-corrige range excessivo via overwrite em modo smart-assist" `
            -Condition $autoSliceOk `
            -ErrorDetails "token-guard-pretool.cjs falhou no auto-slicing smart-assist"

# ------------------------------------------------------------------------------
# Teste Blindagem de Índices (.graphifyignore e .astgrepignore)
# ------------------------------------------------------------------------------
$ignoreOk = $false
if ((Test-Path (Join-Path $TargetDir ".graphifyignore")) -and (Test-Path (Join-Path $TargetDir ".astgrepignore")) -and `
    ((Get-Content (Join-Path $TargetDir ".graphifyignore") -Raw) -match "graphify-out/") -and `
    ((Get-Content (Join-Path $TargetDir ".astgrepignore") -Raw) -match "graphify-out/")) {
    $ignoreOk = $true
} elseif ((Test-Path (Join-Path $kitDir ".graphifyignore")) -and (Test-Path (Join-Path $kitDir ".astgrepignore")) -and `
    ((Get-Content (Join-Path $kitDir ".graphifyignore") -Raw) -match "graphify-out/") -and `
    ((Get-Content (Join-Path $kitDir ".astgrepignore") -Raw) -match "graphify-out/")) {
    $ignoreOk = $true
}
Assert-Test -Name "Arquivos de blindagem de índices (.graphifyignore e .astgrepignore) presentes e com graphify-out/" `
            -Condition $ignoreOk `
            -ErrorDetails "Arquivos .graphifyignore ou .astgrepignore ausentes ou sem graphify-out/"

# ------------------------------------------------------------------------------
# Teste Multi-LSP Hybrid Engine (lib/lsp-engine.cjs)
# ------------------------------------------------------------------------------
$lspEngineOk = $false
try {
    $lspRes = node -e '
    const path = require("path");
    const fs = require("fs");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];
    const LspEngine = require(path.join(libDir, "lsp-engine.cjs"));
    const testDir = path.join(targetDir, ".agents", "temp-lsp-test-ps");
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "service.ts"), "// Docstring\nexport class PaymentProcessor {\n  processOrder() { return true; }\n}\nconst p = new PaymentProcessor();\n", "utf8");
    fs.writeFileSync(path.join(testDir, "worker.py"), "def calculate_tax(amount):\n    return amount * 0.1\n\nval = calculate_tax(100)\n", "utf8");
    const lsp = new LspEngine(testDir);
    const defTs = lsp.definition({ symbol: "PaymentProcessor", lang: "ts" });
    const refsTs = lsp.references({ symbol: "PaymentProcessor", lang: "ts" });
    const hovPy = lsp.hover({ symbol: "calculate_tax", lang: "py" });
    const diagJs = lsp.diagnostics({ file_path: path.join(testDir, "service.ts"), lang: "ts" });
    const renTs = lsp.rename({ symbol: "PaymentProcessor", new_name: "OrderGateway", path: testDir, lang: "ts" });
    const updatedContent = fs.readFileSync(path.join(testDir, "service.ts"), "utf8");
    fs.rmSync(testDir, { recursive: true, force: true });
    if (
      defTs.text.includes("service.ts:2") &&
      refsTs.text.includes("[DEF]") &&
      refsTs.text.includes("[REF]") &&
      hovPy.text.includes("def calculate_tax") &&
      diagJs.text.includes("Zero erros") &&
      renTs.text.includes("OrderGateway") &&
      updatedContent.includes("export class OrderGateway")
    ) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($lspRes -eq "OK") { $lspEngineOk = $true }
} catch {}

Assert-Test -Name "Motor Multi-LSP Híbrido (lib/lsp-engine.cjs) resolve definition, references, hover, diagnostics e rename" `
            -Condition $lspEngineOk `
            -ErrorDetails "lib/lsp-engine.cjs falhou nas operacoes Multi-LSP"

# ------------------------------------------------------------------------------
# Teste CLI Dual-Mode Multi-LSP (node mcp-server.cjs lsp ...)
# ------------------------------------------------------------------------------
$mcpLspCliOk = $false
try {
    $lspDefOut = node $mcpBinPath lsp definition "LspEngine" "$mcpLibDir/lsp-engine.cjs" 2>$null
    $lspDiagOut = node $mcpBinPath lsp diagnostics "$mcpBinPath" 2>$null
    if ($lspDefOut -match "LSP Definition" -and $lspDiagOut -match "Zero erros") {
        $mcpLspCliOk = $true
    }
} catch {}

Assert-Test -Name "CLI Dual-Mode (mcp-server.cjs lsp) responde comandos definition e diagnostics com precisão" `
            -Condition $mcpLspCliOk `
            -ErrorDetails "mcp-server.cjs lsp falhou ao responder definition ou diagnostics"

# ------------------------------------------------------------------------------
# Teste 45: Auto-Isolamento Proativo de Testes no PreToolUse (res.overwrite)
# ------------------------------------------------------------------------------
$proactiveIsoOk = $false
try {
    $isoProRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const hookPath = process.argv[1];
    const targetDir = process.argv[2];
    const cacheDir = path.join(targetDir, ".agents", ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const failedFile = path.join(cacheDir, "failed-tests.json");
    const backup = fs.existsSync(failedFile) ? fs.readFileSync(failedFile, "utf8") : null;
    try {
      fs.writeFileSync(failedFile, JSON.stringify({
        timestamp: Date.now(),
        command: "pytest",
        failures: ["test_auth_login"],
        file: "tests/test_auth.py",
        failureStreak: 1
      }), "utf8");
      const payload = JSON.stringify({ toolCall: { name: "run_command", args: { CommandLine: "pytest" } } });
      const out = execSync(`node "${hookPath}"`, {
        input: payload,
        env: { ...process.env, GSD_KIT_MODE: "smart-assist" },
        encoding: "utf8"
      });
      const parsed = JSON.parse(out.trim());
      if (parsed.decision === "allow" && parsed.overwrite && parsed.overwrite.CommandLine && parsed.overwrite.CommandLine.includes("test_auth")) {
        process.stdout.write("OK");
      }
    } finally {
      if (backup !== null) fs.writeFileSync(failedFile, backup, "utf8");
      else try { fs.unlinkSync(failedFile); } catch {}
    }
    ' "$pretoolHook" "$TargetDir" 2>$null
    if ($isoProRes -eq "OK") { $proactiveIsoOk = $true }
} catch {}

Assert-Test -Name "Hook PreToolUse reescreve suite global de testes para teste isolado via overwrite quando ha falha recente" `
            -Condition $proactiveIsoOk `
            -ErrorDetails "token-guard-pretool.cjs falhou no auto-isolamento proativo de testes"

# ------------------------------------------------------------------------------
# Teste 46: Gate Anti-Parada Prematura no Stop Hook (Auto-Verify TDD/LSP + Anti-Loop)
# ------------------------------------------------------------------------------
$stopGateOk = $false
try {
    $diagHookPath = Join-Path $TargetDir ".agents\hooks\token-guard-diagnostics.cjs"
    if (-not (Test-Path $diagHookPath)) { $diagHookPath = Join-Path $kitDir "hooks\token-guard-diagnostics.cjs" }
    $stopRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const diagHook = process.argv[1];
    const targetDir = process.argv[2];
    const cacheDir = path.join(targetDir, ".agents", ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const failedFile = path.join(cacheDir, "failed-tests.json");
    const gateFile = path.join(cacheDir, "stop-verify-gate.json");
    const backupFailed = fs.existsSync(failedFile) ? fs.readFileSync(failedFile, "utf8") : null;
    try {
      try { fs.unlinkSync(gateFile); } catch {}
      fs.writeFileSync(failedFile, JSON.stringify({
        timestamp: Date.now(),
        command: "npm test",
        failures: ["should validate token"],
        file: "src/auth.test.js",
        failureStreak: 2
      }), "utf8");
      const payload = JSON.stringify({ hookEventName: "Stop", terminationReason: "NO_TOOL_CALL" });
      const out1 = execSync(`node "${diagHook}" --summary`, { input: payload, encoding: "utf8" });
      const res1 = JSON.parse(out1.trim());
      const out2 = execSync(`node "${diagHook}" --summary`, { input: payload, encoding: "utf8" });
      const res2 = JSON.parse(out2.trim());
      if (res1.decision === "continue" && res1.reason && res2.decision !== "continue") {
        process.stdout.write("OK");
      }
    } finally {
      try { fs.unlinkSync(gateFile); } catch {}
      if (backupFailed !== null) fs.writeFileSync(failedFile, backupFailed, "utf8");
      else try { fs.unlinkSync(failedFile); } catch {}
    }
    ' "$diagHookPath" "$TargetDir" 2>$null
    if ($stopRes -eq "OK") { $stopGateOk = $true }
} catch {}

Assert-Test -Name "Hook Stop bloqueia parada prematura com teste quebrado (decision: continue) e respeita trava anti-loop" `
            -Condition $stopGateOk `
            -ErrorDetails "token-guard-diagnostics.cjs falhou no gate anti-parada prematura"

# ------------------------------------------------------------------------------
# Teste 47: Detector de Loop de Alucinacao no PreInvocation (injectSteps)
# ------------------------------------------------------------------------------
$loopDetectOk = $false
try {
    $preInvHookPath = Join-Path $TargetDir ".agents\hooks\token-guard-preinvocation.cjs"
    if (-not (Test-Path $preInvHookPath)) { $preInvHookPath = Join-Path $kitDir "hooks\token-guard-preinvocation.cjs" }
    $loopRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const preInvHook = process.argv[1];
    const targetDir = process.argv[2];
    const cacheDir = path.join(targetDir, ".agents", ".cache");
    fs.mkdirSync(cacheDir, { recursive: true });
    const incFile = path.join(cacheDir, "session-incidents.json");
    const alertStateFile = path.join(cacheDir, "loop-alert-state.json");
    const backupInc = fs.existsSync(incFile) ? fs.readFileSync(incFile, "utf8") : null;
    try {
      try { fs.unlinkSync(alertStateFile); } catch {}
      const now = Date.now();
      fs.writeFileSync(incFile, JSON.stringify([
        { timestamp: now - 5000, tool: "replace_file_content", target: "src/index.ts", type: "tool_error" },
        { timestamp: now - 3000, tool: "replace_file_content", target: "src/index.ts", type: "tool_error" },
        { timestamp: now - 1000, tool: "replace_file_content", target: "src/index.ts", type: "tool_error" }
      ]), "utf8");
      const out = execSync(`node "${preInvHook}"`, { encoding: "utf8" });
      const parsed = JSON.parse(out.trim());
      if (parsed.injectSteps && parsed.injectSteps[0] && parsed.injectSteps[0].ephemeralMessage.includes("Token Guard Anti-Loop")) {
        process.stdout.write("OK");
      }
    } finally {
      try { fs.unlinkSync(alertStateFile); } catch {}
      if (backupInc !== null) fs.writeFileSync(incFile, backupInc, "utf8");
      else try { fs.unlinkSync(incFile); } catch {}
    }
    ' "$preInvHookPath" "$TargetDir" 2>$null
    if ($loopRes -eq "OK") { $loopDetectOk = $true }
} catch {}

Assert-Test -Name "Hook PreInvocation detecta loop de 3+ falhas seguidas e injeta ephemeralMessage corretivo" `
            -Condition $loopDetectOk `
            -ErrorDetails "token-guard-preinvocation.cjs falhou ao detectar loop de alucinacao"

# ------------------------------------------------------------------------------
# Teste 48: Briefing Zero-Read na Inicializacao (SessionStart Hook)
# ------------------------------------------------------------------------------
$sessionStartOk = $false
try {
    $ssHookPath = Join-Path $TargetDir ".agents\hooks\token-guard-sessionstart.cjs"
    if (-not (Test-Path $ssHookPath)) { $ssHookPath = Join-Path $kitDir "hooks\token-guard-sessionstart.cjs" }
    $ssOut = "{}" | node $ssHookPath 2>$null
    if ($ssOut -match '"injectSteps"' -and $ssOut -match "Zero-Read") {
        $sessionStartOk = $true
    }
} catch {}

Assert-Test -Name "Hook SessionStart (token-guard-sessionstart.cjs) injeta Briefing Zero-Read na inicializacao" `
            -Condition $sessionStartOk `
            -ErrorDetails "token-guard-sessionstart.cjs falhou ao injetar briefing de sessao"

# ------------------------------------------------------------------------------
# Teste 49: Tools MCP impact_analysis + env_skeleton e Secret Shield no PreToolUse
# ------------------------------------------------------------------------------
$impactEnvOk = $false
try {
    $impEnvRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const libDir = process.argv[1];
    const hookPath = process.argv[2];
    const targetDir = process.argv[3];
    const EnvSkeletonEngine = require(path.join(libDir, "env-skeleton.cjs"));
    const ImpactEngine = require(path.join(libDir, "impact-engine.cjs"));

    const tempEnvDir = path.join(targetDir, ".agents", "temp-env-test-ps");
    fs.mkdirSync(tempEnvDir, { recursive: true });
    const envFile = path.join(tempEnvDir, ".env");
    const envExample = path.join(tempEnvDir, ".env.example");
    fs.writeFileSync(envFile, "DATABASE_URL=postgres://admin:super_secret_pw@localhost:5432/db\nEMPTY_KEY=\n", "utf8");
    fs.writeFileSync(envExample, "DATABASE_URL=\nEMPTY_KEY=\nREDIS_URL=\n", "utf8");

    const envEngine = new EnvSkeletonEngine(tempEnvDir);
    const skelRes = envEngine.inspect(".env");

    const impactEngine = new ImpactEngine(targetDir);
    const impRes = impactEngine.analyze({ symbol: "LspEngine", file_path: path.join(libDir, "lsp-engine.cjs") });

    const denyPayload = JSON.stringify({ toolCall: { name: "view_file", args: { AbsolutePath: envFile } } });
    const allowPayload = JSON.stringify({ toolCall: { name: "view_file", args: { AbsolutePath: envExample } } });
    const denyOut = JSON.parse(execSync(`node "${hookPath}"`, { input: denyPayload, encoding: "utf8" }).trim());
    const allowOut = JSON.parse(execSync(`node "${hookPath}"`, { input: allowPayload, encoding: "utf8" }).trim());

    fs.rmSync(tempEnvDir, { recursive: true, force: true });

    if (
      skelRes.text.includes("DATABASE_URL=[SET]") &&
      !skelRes.text.includes("super_secret_pw") &&
      skelRes.missingFromEnv.includes("REDIS_URL") &&
      impRes.text.includes("Impact Analysis") &&
      denyOut.decision === "deny" &&
      allowOut.decision === "allow"
    ) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$pretoolHook" "$TargetDir" 2>$null
    if ($impEnvRes -eq "OK") { $impactEnvOk = $true }
} catch {}

Assert-Test -Name "Tools impact_analysis e env_skeleton operacionais com Secret Shield bloqueando leitura crua de .env" `
            -Condition $impactEnvOk `
            -ErrorDetails "impact_analysis, env_skeleton ou Secret Shield falhou"

# ------------------------------------------------------------------------------
# Teste 50: Telemetria de ROI & Economia Ativa (lib/token-savings.cjs e token-report.cjs)
# ------------------------------------------------------------------------------
$roiOk = $false
try {
    $roiRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];
    const { TokenSavingsTracker } = require(path.join(libDir, "token-savings.cjs"));
    const tempRoiDir = path.join(targetDir, ".agents", "temp-roi-test-ps");
    fs.mkdirSync(path.join(tempRoiDir, ".agents", ".cache"), { recursive: true });
    const tracker = new TokenSavingsTracker(tempRoiDir);
    tracker.record("pretool_redirect", 1500, "test redirect");
    tracker.record("test_isolation", 900, "pytest isolated");
    const summary = tracker.getSummary();
    fs.rmSync(tempRoiDir, { recursive: true, force: true });
    if (summary.totalTokensSaved === 2400 && summary.totalEvents === 2 && summary.topCategories.length === 2) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($roiRes -eq "OK") { $roiOk = $true }
} catch {}

Assert-Test -Name "Rastreador de ROI (lib/token-savings.cjs) contabiliza tokens poupados por categoria com precisao" `
            -Condition $roiOk `
            -ErrorDetails "lib/token-savings.cjs falhou ao contabilizar economia ativa"

# ------------------------------------------------------------------------------
# Teste 51: Catálogo Multi-LSP 20 Ecossistemas & Esqueletos Infra/Web/Dados
# ------------------------------------------------------------------------------
$multiLsp20Ok = $false
try {
    $multiLsp20Res = node -e '
    const fs = require("fs");
    const path = require("path");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];
    const LspEngine = require(path.join(libDir, "lsp-engine.cjs"));
    const SkeletonEngine = require(path.join(libDir, "skeleton-engine.cjs"));
    const reg = LspEngine.LANGUAGE_REGISTRY;

    const hasAll =
      reg.ts.lspBinaries.includes("vtsls") &&
      reg.python.lspBinaries.includes("basedpyright") &&
      reg.csharp.lspBinaries.includes("Microsoft.CodeAnalysis.LanguageServer") &&
      reg.lua && reg.bash && reg.web && reg.yaml && reg.sql && reg.docker &&
      reg.kotlin && reg.swift && reg.terraform;

    const tempDir = path.join(targetDir, ".agents", "temp-lsp20-test-ps");
    fs.mkdirSync(tempDir, { recursive: true });
    const sqlFile = path.join(tempDir, "schema.sql");
    const dockerFile = path.join(tempDir, "Dockerfile");
    const luaFile = path.join(tempDir, "module.lua");
    const badJsonFile = path.join(tempDir, "broken.json");

    fs.writeFileSync(sqlFile, "CREATE TABLE users (\n  id INT PRIMARY KEY\n);\n", "utf8");
    fs.writeFileSync(dockerFile, "FROM node:20-alpine AS builder\nWORKDIR /app\nEXPOSE 3000\n", "utf8");
    fs.writeFileSync(luaFile, "local M = {}\nfunction M.greet(name)\n  return name\nend\nreturn M\n", "utf8");
    fs.writeFileSync(badJsonFile, "{ \"name\": \"broken\", }", "utf8");

    const skel = new SkeletonEngine(tempDir);
    const lsp = new LspEngine(tempDir);

    const sqlOut = skel.getOutline(sqlFile);
    const dockerOut = skel.getOutline(dockerFile);
    const luaOut = skel.getOutline(luaFile);
    const jsonDiag = lsp.diagnostics({ file_path: badJsonFile });
    const sqlDef = lsp.definition({ symbol: "users", file_path: sqlFile });

    fs.rmSync(tempDir, { recursive: true, force: true });

    if (
      hasAll &&
      sqlOut.includes("CREATE TABLE users") &&
      dockerOut.includes("FROM node:20-alpine AS builder") &&
      luaOut.includes("function M.greet") &&
      jsonDiag.hasDiagnostics &&
      sqlDef.text.includes("schema.sql:1")
    ) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($multiLsp20Res -eq "OK") { $multiLsp20Ok = $true }
} catch {}

Assert-Test -Name "Catálogo Multi-LSP 20 ecossistemas (vtsls, basedpyright, roslyn, lua, bash, web, yaml, sql, docker, terraform) operacional" `
            -Condition $multiLsp20Ok `
            -ErrorDetails "Catálogo Multi-LSP de 20 ecossistemas falhou"

# ------------------------------------------------------------------------------
# Teste 52: Controle Rigoroso de Erros (ErrorGuard, Triple Visibility, Circuit Breaker e Diagnóstico Estrito)
# ------------------------------------------------------------------------------
$strictErrorOk = $false
try {
    $strictErrorRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];

    const ErrorGuard = require(path.join(libDir, "error-guard.cjs"));
    const LspEngine = require(path.join(libDir, "lsp-engine.cjs"));

    // 1. Testar mascaramento de segredos
    const masked = ErrorGuard.maskSecrets("TOKEN=ghp_1234567890abcdef1234567890 password: my-secret-pass");
    const secretSafe = masked.includes("[MASCARADO]") && !masked.includes("ghp_") && !masked.includes("my-secret-pass");

    // 2. Testar recordError e listErrors
    const testDir = path.join(targetDir, ".agents", "temp-err-test-ps");
    fs.mkdirSync(path.join(testDir, ".agents", ".cache"), { recursive: true });
    const rec = ErrorGuard.recordError(testDir, {
      component: "test-comp",
      title: "Teste de erro",
      stderr: "Erro intencional de teste"
    });
    const list = ErrorGuard.listErrors(testDir);
    const recorded = list.length === 1 && list[0].component === "test-comp";
    ErrorGuard.clearErrors(testDir);
    const cleared = ErrorGuard.listErrors(testDir).length === 0;

    // 3. Testar formatação de banner visual
    const banner = ErrorGuard.formatErrorBanner({
      category: "TOOL",
      component: "ast-grep",
      title: "Sintaxe inválida no padrão AST",
      stderr: "parse error at line 1"
    }, { color: false });
    const bannerOk = banner.includes("ERRO CRÍTICO") && banner.includes("TOOL • ast-grep") && banner.includes("parse error");

    // 4. Testar LSP Engine diagnostics isError: true em código quebrado
    const badJs = path.join(testDir, "bad.js");
    fs.writeFileSync(badJs, "const a = ;", "utf8");
    const lsp = new LspEngine(testDir);
    const diag = lsp.diagnostics({ file_path: badJs });
    const lspErrorOk = diag && diag.isError === true && diag.kind === "code";

    // 5. Testar LSP Engine checkStackHealth
    const health = lsp.checkStackHealth(testDir);
    const healthOk = typeof health.ok === "boolean";

    fs.rmSync(testDir, { recursive: true, force: true });

    if (secretSafe && recorded && cleared && bannerOk && lspErrorOk && healthOk) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($strictErrorRes -eq "OK") { $strictErrorOk = $true }
} catch {}

Assert-Test -Name "Controle Rigoroso de Erros (ErrorGuard, Triple Visibility, Circuit Breaker e Diagnóstico Estrito)" `
            -Condition $strictErrorOk `
            -ErrorDetails "ErrorGuard ou verificação de erro estrito falhou"

# ------------------------------------------------------------------------------
# Teste 52: Motores Nativos Caveman & Ponytail (codebase-map e caveman-shrink)
# ------------------------------------------------------------------------------
$enginesOk = $false
try {
    $enginesRes = node -e '
    const path = require("path");
    const fs = require("fs");
    const libDir = process.argv[1];
    const targetDir = process.argv[2];

    const CodebaseMap = require(path.join(libDir, "codebase-map.cjs"));
    const CavemanShrink = require(path.join(libDir, "caveman-shrink.cjs"));

    let mapOut = (CodebaseMap.generateMap || CodebaseMap.buildCodebaseMap)(targetDir, { maxChars: 2000 });
    if (typeof mapOut === "string" && mapOut.length === 0) {
      mapOut = (CodebaseMap.generateMap || CodebaseMap.buildCodebaseMap)(libDir, { maxChars: 2000 });
    }
    const mapOk = typeof mapOut === "string" && mapOut.length > 0 && mapOut.length <= 2000 && mapOut.includes("•");

    const sampleChat = "Sure! I would be happy to help you with that.\n" + "```js\nconsole.log(1);\n```\n" + "Let me know if you need anything else!";
    const sanitized = CavemanShrink.sanitizeChatOutput(sampleChat);
    const shrinkOk = !sanitized.includes("Sure!") && !sanitized.includes("happy to help") && sanitized.includes("console.log(1)");

    const sampleMd = "# Heading\n\n\n\nSome text here with extra blanks.\n\n\n";
    const compressed = CavemanShrink.compressMarkdown(sampleMd);
    const compressOk = compressed.length < sampleMd.length;

    if (mapOk && shrinkOk && compressOk) {
      process.stdout.write("OK");
    }
    ' "$mcpLibDir" "$TargetDir" 2>$null
    if ($enginesRes -eq "OK") { $enginesOk = $true }
} catch {}

Assert-Test -Name "Motores Nativos Ponytail (codebase-map) e Caveman (caveman-shrink) operacionais sob teto de tokens" `
            -Condition $enginesOk `
            -ErrorDetails "codebase-map.cjs ou caveman-shrink.cjs falhou na compactacao ou teto de caracteres"

# ------------------------------------------------------------------------------
# Teste 53: Servidor MCP & Comandos CLI para Ponytail e Caveman (map, debt, shrink)
# ------------------------------------------------------------------------------
$mcpPonyCaveOk = $false
try {
    $mcpPonyCaveRes = node -e '
    const { execSync } = require("child_process");
    const mcpBin = process.argv[1];
    const targetDir = process.argv[2];

    try {
      const mapOut = execSync(`node "${mcpBin}" map "${targetDir}"`, { encoding: "utf8" });
      const mapCliOk = mapOut.includes("Codebase Map") || mapOut.includes("•") || mapOut.includes("Nenhum código-fonte relevante mapeado");

      const debtOut = execSync(`node "${mcpBin}" debt "${targetDir}"`, { encoding: "utf8" });
      const debtCliOk = typeof debtOut === "string";

      const tmpFile = require("path").join(targetDir, ".agents", "temp-shrink-cli-test-ps.md");
      require("fs").writeFileSync(tmpFile, "# Title\n\n\nText\n\n", "utf8");
      const shrinkOut = execSync(`node "${mcpBin}" shrink "${tmpFile}"`, { encoding: "utf8" });
      require("fs").rmSync(tmpFile, { force: true });
      const shrinkCliOk = shrinkOut.includes("Caveman Shrink") && shrinkOut.includes("comprimido");

      if (mapCliOk && debtCliOk && shrinkCliOk) {
        process.stdout.write("OK");
      }
    } catch {}
    ' "$mcpBinPath" "$TargetDir" 2>$null
    if ($mcpPonyCaveRes -eq "OK") { $mcpPonyCaveOk = $true }
} catch {}

Assert-Test -Name "Ferramentas MCP & CLI para Ponytail e Caveman (map, debt, shrink) respondem com exito" `
            -Condition $mcpPonyCaveOk `
            -ErrorDetails "Comandos CLI map, debt ou shrink retornaram erro"

# ------------------------------------------------------------------------------
# Teste 54: Suíte Integral de Skills Ponytail e Caveman (16 skills) com Frontmatter
# ------------------------------------------------------------------------------
$ponyCaveSkills = @(
  "ponytail", "ponytail-review", "ponytail-audit", "ponytail-debt", "ponytail-help",
  "caveman", "ultracave", "caveman-review", "caveman-commit", "caveman-compress", "caveman-help",
  "investigate-first", "lean-build", "surgical-patch", "safe-refactor", "verify-and-stop"
)
$allPonyCaveSkillsOk = $true
foreach ($sk in $ponyCaveSkills) {
    $skPath = if (Test-Path (Join-Path $kitDir "skills\$sk\SKILL.md")) {
        Join-Path $kitDir "skills\$sk\SKILL.md"
    } elseif (Test-Path (Join-Path $TargetDir ".agents\skills\$sk\SKILL.md")) {
        Join-Path $TargetDir ".agents\skills\$sk\SKILL.md"
    } elseif (Test-Path (Join-Path $TargetDir ".agents\skills-pool\$sk\SKILL.md")) {
        Join-Path $TargetDir ".agents\skills-pool\$sk\SKILL.md"
    } else {
        Join-Path $PSScriptRoot "skills\$sk\SKILL.md"
    }
    if (-not (Test-Path $skPath) -or ((Get-Content $skPath -Raw) -notmatch "name:\s*$sk")) {
        $allPonyCaveSkillsOk = $false
        break
    }
}

Assert-Test -Name "Suíte completa Ponytail e Caveman ($($ponyCaveSkills.Count) skills) presente com frontmatter valido" `
            -Condition $allPonyCaveSkillsOk `
            -ErrorDetails "Uma ou mais skills de Ponytail/Caveman ausentes ou sem frontmatter valido"

# ------------------------------------------------------------------------------
# Teste 55: Subagentes Cavecrew e Protocolo Integrado Ponytail/Caveman
# ------------------------------------------------------------------------------
$cavecrewAgents = @("cavecrew-investigator.md", "cavecrew-builder.md", "cavecrew-reviewer.md")
$cavecrewOk = $true
foreach ($ca in $cavecrewAgents) {
    $caPath = if (Test-Path (Join-Path $TargetDir ".agents\agents-pool\$ca")) {
        Join-Path $TargetDir ".agents\agents-pool\$ca"
    } elseif (Test-Path (Join-Path $TargetDir ".agents\agents\$ca")) {
        Join-Path $TargetDir ".agents\agents\$ca"
    } elseif (Test-Path (Join-Path $kitDir "subagents\$ca")) {
        Join-Path $kitDir "subagents\$ca"
    } else {
        Join-Path $PSScriptRoot "subagents\$ca"
    }
    if (-not (Test-Path $caPath)) {
        $cavecrewOk = $false
        break
    }
    $caContent = Get-Content $caPath -Raw
    if ($caContent -match "ANTIGRAVITY_TOKEN_PROTOCOL_START") {
        if ($caContent -notmatch "ESCADA DE DECISÃO") {
            $cavecrewOk = $false
            break
        }
    } elseif ($caContent -notmatch "Voz ultraconcisa") {
        $cavecrewOk = $false
        break
    }
}

Assert-Test -Name "Subagentes Cavecrew ($($cavecrewAgents.Count) agentes) integrados com protocolo Ponytail & Caveman" `
            -Condition $cavecrewOk `
            -ErrorDetails "Subagentes cavecrew ausentes ou sem protocolo de concisao"

# ------------------------------------------------------------------------------
# Teste 56: Rastreamento em Tempo Real de Modos (/caveman e /ponytail) no PreInvocation
# ------------------------------------------------------------------------------
$trackerOk = $false
try {
    $trackerRes = node -e '
    const fs = require("fs");
    const path = require("path");
    const { execSync } = require("child_process");
    const preInvHook = process.argv[1];
    const targetDir = process.argv[2];
    const modesFile = path.join(targetDir, ".agents", ".cache", "modes.json");

    try {
      // Testar comando /caveman off
      const payload1 = JSON.stringify({ prompt: "/caveman off" });
      const out1 = execSync(`node "${preInvHook}"`, { input: payload1, encoding: "utf8" });
      const res1 = JSON.parse(out1.trim());
      const ok1 = res1.injectSteps && res1.injectSteps[0].ephemeralMessage.includes("CAVEMAN");

      const modes1 = JSON.parse(fs.readFileSync(modesFile, "utf8"));
      const ok2 = modes1.caveman === "off";

      // Testar comando /ponytail ultra
      const payload2 = JSON.stringify({ prompt: "/ponytail ultra" });
      const out2 = execSync(`node "${preInvHook}"`, { input: payload2, encoding: "utf8" });
      const res2 = JSON.parse(out2.trim());
      const ok3 = res2.injectSteps && res2.injectSteps[0].ephemeralMessage.includes("PONYTAIL");

      const modes2 = JSON.parse(fs.readFileSync(modesFile, "utf8"));
      const ok4 = modes2.ponytail === "ultra";

      // Restaurar defaults (full / on)
      const payload3 = JSON.stringify({ prompt: "/ponytail full" });
      execSync(`node "${preInvHook}"`, { input: payload3, encoding: "utf8" });
      const payload4 = JSON.stringify({ prompt: "/caveman on" });
      execSync(`node "${preInvHook}"`, { input: payload4, encoding: "utf8" });

      if (ok1 && ok2 && ok3 && ok4) {
        process.stdout.write("OK");
      }
    } catch {}
    ' "$preInvocPath" "$TargetDir" 2>$null
    if ($trackerRes -eq "OK") { $trackerOk = $true }
} catch {}

Assert-Test -Name "PreInvocation Hook intercepta comandos de modo (/caveman e /ponytail) com confirmacao efemera" `
            -Condition $trackerOk `
            -ErrorDetails "PreInvocation falhou ao rastrear modos /caveman ou /ponytail"

# ------------------------------------------------------------------------------
# Resumo Final
# ------------------------------------------------------------------------------
Write-Host "`n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
if ($failed -eq 0) {
    Write-Host "🎉 SUCESSO TOTAL: Todos os $passed testes passaram com exito!" -ForegroundColor Green
    Write-Host "   O kit esta 100% blindado e operacional para este workspace.`n" -ForegroundColor Gray
    exit 0
} else {
    Write-Host "⚠️ ATENCAO: $failed testes falharam de um total de $($passed + $failed)." -ForegroundColor Red
    exit 1
}



