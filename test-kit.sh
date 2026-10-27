#!/usr/bin/env bash
# ==============================================================================
# Test-Kit Antigravity GSD (Linux / macOS / WSL)
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-}"

if [ "$TARGET_DIR" = "--help" ] || [ "$TARGET_DIR" = "-h" ]; then
echo -e "Uso: ./test-kit.sh [DIRETÓRIO_ALVO]"
echo -e "Executa a suíte de validação e autoteste da infraestrutura gsd-agy-kit."
exit 0
fi

if [ -z "$TARGET_DIR" ]; then
if [[ "$SCRIPT_DIR" == *"/.agents/kit" ]]; then
TARGET_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
KIT_DIR="${SCRIPT_DIR}"
elif [[ "$SCRIPT_DIR" == *"/scripts" ]] && [ -d "$(cd "${SCRIPT_DIR}/.." && pwd)/.agents/kit" ]; then
TARGET_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
KIT_DIR="${TARGET_DIR}/.agents/kit"
elif [ -f "$(pwd)/.agents/hooks/token-guard-pretool.cjs" ]; then
TARGET_DIR="$(pwd)"
KIT_DIR="${SCRIPT_DIR}"
elif [ -f "$(dirname "$SCRIPT_DIR")/.agents/hooks/token-guard-pretool.cjs" ]; then
TARGET_DIR="$(dirname "$SCRIPT_DIR")"
KIT_DIR="${SCRIPT_DIR}"
elif [ -f "${SCRIPT_DIR}/.agents/hooks/token-guard-pretool.cjs" ]; then
TARGET_DIR="${SCRIPT_DIR}"
KIT_DIR="${SCRIPT_DIR}"
elif [ "$(pwd)" = "$SCRIPT_DIR" ] || [[ "$(pwd)" == "$SCRIPT_DIR/"* ]]; then
TARGET_DIR="$(dirname "$SCRIPT_DIR")"
KIT_DIR="${SCRIPT_DIR}"
else
TARGET_DIR="$(pwd)"
KIT_DIR="${SCRIPT_DIR}"
fi
else
if [ ! -d "$TARGET_DIR" ]; then
echo -e "\n\033[0;31m🛑 [Erro] Diretório alvo não encontrado: ${TARGET_DIR}\033[0m\n"
exit 1
fi
TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
if [ -f "${SCRIPT_DIR}/mcp-server.cjs" ]; then
KIT_DIR="${SCRIPT_DIR}"
elif [[ "$SCRIPT_DIR" == *"/.agents/kit" ]]; then
KIT_DIR="${SCRIPT_DIR}"
elif [ -d "${TARGET_DIR}/.agents/kit" ]; then
KIT_DIR="${TARGET_DIR}/.agents/kit"
else
KIT_DIR="${SCRIPT_DIR}"
fi
fi

# Pre-flight Check: verificar se o kit está instalado no TargetDir
HOOK_CHECK="${TARGET_DIR}/.agents/hooks/token-guard-pretool.cjs"
if [ ! -f "$HOOK_CHECK" ]; then
echo -e "\n\033[0;31m🛑 [Pre-flight Check] Workspace não configurado!\033[0m"
echo -e "\033[0;33m   O diretório '${TARGET_DIR}' não contém a infraestrutura do kit instalada (.agents/hooks/token-guard-pretool.cjs).\033[0m"
echo -e "\n\033[0;36m💡 Para instalar e blindar este projeto, execute:\033[0m"
if [ -f "${KIT_DIR}/setup-ui.cjs" ]; then
echo -e "   node \"${KIT_DIR}/setup-ui.cjs\" \"${TARGET_DIR}\" --install\n"
else
echo -e "   bash \"${SCRIPT_DIR}/setup.sh\" \"${TARGET_DIR}\"\n"
fi
exit 1
fi

find_kit_script() {
local name="$1"
if [ -f "${KIT_DIR}/${name}" ]; then
echo "${KIT_DIR}/${name}"
elif [ -f "${TARGET_DIR}/.agents/kit/${name}" ]; then
echo "${TARGET_DIR}/.agents/kit/${name}"
else
echo "${SCRIPT_DIR}/${name}"
fi
}

echo -e "\n\033[0;36m🧪 [Antigravity GSD Kit] Executando bateria de testes automatizados...\033[0m"

PASSED=0
FAILED=0

assert_test() {
local name="$1"
local condition="$2"
local details="${3:-}"

if [ "$condition" -eq 1 ]; then
echo -e "   \033[0;32m✅ PASS: ${name}\033[0m"
PASSED=$((PASSED + 1))
else
echo -e "   \033[0;31m❌ FAIL: ${name}\033[0m"
if [ -n "$details" ]; then
echo -e "      \033[0;33mDetalhe: ${details}\033[0m"
fi
FAILED=$((FAILED + 1))
fi
}

# 1. Conformidade dos Subagentes (Ativos e no Pool)
AGENTS_DIR="${TARGET_DIR}/.agents/agents"
POOL_DIR="${TARGET_DIR}/.agents/agents-pool"
INCOMPATIBLE_COUNT=$( (grep -E "-\s+glob|-\s+grep_search|-\s+call_mcp_tool" "${AGENTS_DIR}"/*.md 2>/dev/null || true) | wc -l | tr -d ' ' )
MISSING_PROTOCOL=$( (grep -L "ANTIGRAVITY_TOKEN_PROTOCOL_START" "${AGENTS_DIR}"/*.md 2>/dev/null || true) | wc -l | tr -d ' ' )

POOL_INCOMPATIBLE=0
if [ -d "${POOL_DIR}" ]; then
POOL_INCOMPATIBLE=$( (grep -E "-\s+glob|-\s+grep_search|-\s+call_mcp_tool" "${POOL_DIR}"/*.md 2>/dev/null || true) | wc -l | tr -d ' ' )
fi

TOTAL_INCOMPATIBLE=$((INCOMPATIBLE_COUNT + MISSING_PROTOCOL + POOL_INCOMPATIBLE))
assert_test "Subagentes ativos e no pool normalizados sem glob/grep_search/call_mcp_tool e com protocolo injetado" \
"$([ "$TOTAL_INCOMPATIBLE" -eq 0 ] && echo 1 || echo 0)" \
"${TOTAL_INCOMPATIBLE} agentes com problemas"

# 2. Hard Gate - view_file (sem linhas, >100 linhas, cirúrgico e docs)
HOOK_PATH="${TARGET_DIR}/.agents/hooks/token-guard-pretool.cjs"

PAYLOAD_VIEW='{"toolCall":{"name":"view_file","args":{"AbsolutePath":"cmd/api/main.go"}}}'
RESP_VIEW=$(printf '%s' "$PAYLOAD_VIEW" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia view_file sem StartLine/EndLine em codigo" \
"$([ "$RESP_VIEW" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_VIEW_LARGE='{"toolCall":{"name":"view_file","args":{"AbsolutePath":"cmd/api/main.go","StartLine":1,"EndLine":150}}}'
RESP_VIEW_LARGE=$(printf '%s' "$PAYLOAD_VIEW_LARGE" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia view_file com range > 100 linhas em codigo" \
"$([ "$RESP_VIEW_LARGE" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_VIEW_SURGICAL='{"toolCall":{"name":"view_file","args":{"AbsolutePath":"cmd/api/main.go","StartLine":1,"EndLine":50}}}'
RESP_VIEW_SURGICAL=$(printf '%s' "$PAYLOAD_VIEW_SURGICAL" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite view_file cirurgico (<= 100 linhas) em codigo" \
"$([ "$RESP_VIEW_SURGICAL" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_VIEW_DOC='{"toolCall":{"name":"view_file","args":{"AbsolutePath":"README.md"}}}'
RESP_VIEW_DOC=$(printf '%s' "$PAYLOAD_VIEW_DOC" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite view_file em documentacao (README.md)" \
"$([ "$RESP_VIEW_DOC" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_VIEW_100='{"toolCall":{"name":"view_file","args":{"AbsolutePath":"cmd/api/main.go","StartLine":1,"EndLine":100}}}'
RESP_VIEW_100=$(printf '%s' "$PAYLOAD_VIEW_100" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite view_file no teto exato de 100 linhas em codigo" \
"$([ "$RESP_VIEW_100" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_VIEW_101='{"toolCall":{"name":"view_file","args":{"AbsolutePath":"cmd/api/main.go","StartLine":1,"EndLine":101}}}'
RESP_VIEW_101=$(printf '%s' "$PAYLOAD_VIEW_101" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia view_file na fronteira de 101 linhas em codigo" \
"$([ "$RESP_VIEW_101" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_VIEW_JSON='{"toolCall":{"name":"view_file","args":{"AbsolutePath":".planning/config.json"}}}'
RESP_VIEW_JSON=$(printf '%s' "$PAYLOAD_VIEW_JSON" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite view_file em arquivo de configuracao (.json) sem paginacao" \
"$([ "$RESP_VIEW_JSON" = '"decision":"allow"' ] && echo 1 || echo 0)"

# 3. Hard Gate - run_command (cat, testes verbosos e ast-grep rewrite)
PAYLOAD_CAT='{"toolCall":{"name":"run_command","args":{"CommandLine":"cat cmd/api/main.go"}}}'
RESP_CAT=$(printf '%s' "$PAYLOAD_CAT" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia comando de despejo (cat)" \
"$([ "$RESP_CAT" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_TEST_V='{"toolCall":{"name":"run_command","args":{"CommandLine":"go test -v ./..."}}}'
RESP_TEST_V=$(printf '%s' "$PAYLOAD_TEST_V" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia go test com flag prolixa (-v)" \
"$([ "$RESP_TEST_V" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_AST_REWRITE='{"toolCall":{"name":"run_command","args":{"CommandLine":"ast-grep -r -u -p '\''fmt.Println()'\''"}}}'
RESP_AST_REWRITE=$(printf '%s' "$PAYLOAD_AST_REWRITE" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia ast-grep com reescrita em lote (-r -u)" \
"$([ "$RESP_AST_REWRITE" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_CAT_DOC='{"toolCall":{"name":"run_command","args":{"CommandLine":"cat README.md"}}}'
RESP_CAT_DOC=$(printf '%s' "$PAYLOAD_CAT_DOC" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite cat em documentacao (README.md) sem falso-positivo" \
"$([ "$RESP_CAT_DOC" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_TEST_CLEAN='{"toolCall":{"name":"run_command","args":{"CommandLine":"go test ./..."}}}'
RESP_TEST_CLEAN=$(printf '%s' "$PAYLOAD_TEST_CLEAN" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite execucao normal de go test ./... (sem flag -v)" \
"$([ "$RESP_TEST_CLEAN" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_AST_SINGLE='{"toolCall":{"name":"run_command","args":{"CommandLine":"ast-grep run -p '\''func $NAME()'\'' --lang go"}}}'
RESP_AST_SINGLE=$(printf '%s' "$PAYLOAD_AST_SINGLE" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite ast-grep com aspas simples e variavel" \
"$([ "$RESP_AST_SINGLE" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_BASH_DUMP='{"toolCall":{"name":"bash","args":{"command":"cat cmd/api/main.go"}}}'
RESP_BASH_DUMP=$(printf '%s' "$PAYLOAD_BASH_DUMP" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse intercepta e bloqueia despejo de codigo via alias de ferramenta (bash)" \
"$([ "$RESP_BASH_DUMP" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_TEST_VERBOSE='{"toolCall":{"name":"run_command","args":{"CommandLine":"go test --verbose ./..."}}}'
RESP_TEST_VERBOSE=$(printf '%s' "$PAYLOAD_TEST_VERBOSE" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia go test com flag prolixa estendida (--verbose)" \
"$([ "$RESP_TEST_VERBOSE" = '"decision":"deny"' ] && echo 1 || echo 0)"

# 4. Hard Gate - write_to_file (bloqueio de sobrescrita e permissoes legitimas)
DUMMY_CODE_TARGET="${TARGET_DIR}/dummy_existing_code_test.js"
echo "// existing code" > "${DUMMY_CODE_TARGET}"
PAYLOAD_OVERWRITE="{\"toolCall\":{\"name\":\"write_to_file\",\"args\":{\"TargetFile\":\"${DUMMY_CODE_TARGET}\",\"Overwrite\":true}}}"
RESP_OVERWRITE=$(printf '%s' "$PAYLOAD_OVERWRITE" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia sobrescrita integral de arquivo de codigo existente" \
"$([ "$RESP_OVERWRITE" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_WRITE_NEW="{\"toolCall\":{\"name\":\"write_to_file\",\"args\":{\"TargetFile\":\"${TARGET_DIR}/dummy_new_feature_test.go\",\"Overwrite\":true}}}"
RESP_WRITE_NEW=$(printf '%s' "$PAYLOAD_WRITE_NEW" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite criacao de novo arquivo de codigo inexistente com write_to_file" \
"$([ "$RESP_WRITE_NEW" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_WRITE_DOC="{\"toolCall\":{\"name\":\"write_to_file\",\"args\":{\"TargetFile\":\"${TARGET_DIR}/README.md\",\"Overwrite\":true}}}"
RESP_WRITE_DOC=$(printf '%s' "$PAYLOAD_WRITE_DOC" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite sobrescrita de documentacao (README.md) existente" \
"$([ "$RESP_WRITE_DOC" = '"decision":"allow"' ] && echo 1 || echo 0)"

PAYLOAD_WRITE_ALIAS="{\"toolCall\":{\"name\":\"write\",\"args\":{\"TargetFile\":\"${DUMMY_CODE_TARGET}\",\"Overwrite\":true}}}"
RESP_WRITE_ALIAS=$(printf '%s' "$PAYLOAD_WRITE_ALIAS" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
rm -f "${DUMMY_CODE_TARGET}" 2>/dev/null || true
assert_test "Hook PreToolUse bloqueia sobrescrita integral de arquivo de codigo via alias 'write'" \
"$([ "$RESP_WRITE_ALIAS" = '"decision":"deny"' ] && echo 1 || echo 0)"

# 4.1 Native Antigravity Tools: read_file e write_file
PAYLOAD_READ_FAIL='{"toolCall":{"name":"read_file","args":{"Path":"cmd/api/main.go"}}}'
RESP_READ_FAIL=$(printf '%s' "$PAYLOAD_READ_FAIL" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia read_file sem StartLine/EndLine em codigo" \
"$([ "$RESP_READ_FAIL" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_READ_OK='{"toolCall":{"name":"read_file","args":{"Path":"cmd/api/main.go","StartLine":1,"EndLine":50}}}'
RESP_READ_OK=$(printf '%s' "$PAYLOAD_READ_OK" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse permite read_file cirurgico (<= 100 linhas) em codigo" \
"$([ "$RESP_READ_OK" = '"decision":"allow"' ] && echo 1 || echo 0)"

echo "// existing code" > "${DUMMY_CODE_TARGET}"
PAYLOAD_WRITE_FILE="{\"toolCall\":{\"name\":\"write_file\",\"args\":{\"Path\":\"${DUMMY_CODE_TARGET}\",\"Overwrite\":true}}}"
RESP_WRITE_FILE=$(printf '%s' "$PAYLOAD_WRITE_FILE" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
rm -f "${DUMMY_CODE_TARGET}" 2>/dev/null || true
assert_test "Hook PreToolUse bloqueia sobrescrita integral via write_file em arquivo existente" \
"$([ "$RESP_WRITE_FILE" = '"decision":"deny"' ] && echo 1 || echo 0)"

# 4.2 Sandbox Shield - Bloqueio de orquestração externa e holdout
PAYLOAD_SCENARIO='{"toolCall":{"name":"view_file","args":{"Path":"scenario.json"}}}'
RESP_SCENARIO=$(printf '%s' "$PAYLOAD_SCENARIO" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia leitura de scenario.json (Sandbox Shield)" \
"$([ "$RESP_SCENARIO" = '"decision":"deny"' ] && echo 1 || echo 0)"

HOLDOUT_SEG=".gsd-""bench-holdout"
PAYLOAD_HOLDOUT="{\"toolCall\":{\"name\":\"read_file\",\"args\":{\"Path\":\"~/${HOLDOUT_SEG}/suite.test.js\"}}}"
RESP_HOLDOUT=$(printf '%s' "$PAYLOAD_HOLDOUT" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia leitura de suítes holdout externas (Sandbox Shield)" \
"$([ "$RESP_HOLDOUT" = '"decision":"deny"' ] && echo 1 || echo 0)"

PAYLOAD_CMD_HOLDOUT="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"ls -la ~/${HOLDOUT_SEG}\"}}}"
RESP_CMD_HOLDOUT=$(printf '%s' "$PAYLOAD_CMD_HOLDOUT" | node "$HOOK_PATH" 2>/dev/null | grep -o '"decision":"[^"]*"' || echo "")
assert_test "Hook PreToolUse bloqueia comandos shell direcionados a holdout (Sandbox Shield)" \
"$([ "$RESP_CMD_HOLDOUT" = '"decision":"deny"' ] && echo 1 || echo 0)"

# 5. PreInvocation Hook
PRE_INVOC_PATH="${TARGET_DIR}/.agents/hooks/token-guard-preinvocation.cjs"
RESP_PRE_INVOC=$(node "$PRE_INVOC_PATH" 2>/dev/null || echo "")
PRE_INVOC_OK=0
if [ -n "$RESP_PRE_INVOC" ]; then
PRE_INVOC_OK=1
fi
assert_test "Hook PreInvocation executa limpo sem poluir o chat com banners repetidos" "$PRE_INVOC_OK"

# 6. Otimização de Tokens & Dynamic Agent Pool
COMPACT_ARCHIVE="${TARGET_DIR}/.agents/agents-backup-compact"
COMPACT_REMAINING=$(find "${AGENTS_DIR}" -maxdepth 1 -name "*.compact.md" 2>/dev/null | wc -l || echo 0)
OPT_COMPACT_OK=0
if [ -d "$COMPACT_ARCHIVE" ] && [ "$COMPACT_REMAINING" -eq 0 ]; then
OPT_COMPACT_OK=1
fi
assert_test "Subagentes .compact.md devidamente arquivados e ausentes do catalogo ativo" "$OPT_COMPACT_OK"

AGENTS_BRIDGE="${TARGET_DIR}/.agents/GEMINI.md"
[ ! -f "$AGENTS_BRIDGE" ] && AGENTS_BRIDGE="${TARGET_DIR}/.agents/AGENTS.md"
[ ! -f "$AGENTS_BRIDGE" ] && AGENTS_BRIDGE="${TARGET_DIR}/AGENTS.md"
[ ! -f "$AGENTS_BRIDGE" ] && AGENTS_BRIDGE="${TARGET_DIR}/GEMINI.md"
GEMINI_DEDUP=0
if [ -f "$AGENTS_BRIDGE" ] || [ -f "${TARGET_DIR}/.agents/rules/token-protocol.md" ]; then
GEMINI_DEDUP=1
fi
assert_test "Instruções do projeto presentes (.agents/rules/ ou AGENTS.md)" "$GEMINI_DEDUP"

POOL_COUNT=$(find "${POOL_DIR}" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l || echo 0)
POOL_OK=0
if [ "$POOL_COUNT" -ge 30 ]; then
POOL_OK=1
fi
assert_test "Dynamic Agent Pool (.agents/agents-pool/) contem todos os agentes preservados (${POOL_COUNT})" "$POOL_OK"

ACTIVE_COUNT=$(find "${AGENTS_DIR}" -maxdepth 1 -name "*.md" 2>/dev/null | wc -l || echo 0)
ACTIVE_OK=0
if [ "$ACTIVE_COUNT" -eq 0 ]; then
ACTIVE_OK=1
fi
assert_test "Catalogo ativo (.agents/agents/) em Zero-Baseline (0 agentes ativos por padrao)" "$ACTIVE_OK"

SKILLS_ACTIVE_DIR="${TARGET_DIR}/.agents/skills"
SKILLS_ACTIVE_COUNT=$(find "${SKILLS_ACTIVE_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l || echo 0)
SKILLS_ZERO_OK=0
if [ "$SKILLS_ACTIVE_COUNT" -eq 0 ]; then
SKILLS_ZERO_OK=1
fi
assert_test "Catalogo de Skills (.agents/skills/) em Zero-Baseline (0 skills ativas por padrao)" "$SKILLS_ZERO_OK"

CATALOG_OK=0
if grep -E -q "(Catálogo Sintético|Agentic Skill Retrieval|Descoberta & Ativação Autônoma)" "${TARGET_DIR}/.agents/rules/token-protocol.md" 2>/dev/null; then
CATALOG_OK=1
fi
assert_test "Catálogo Sintético presente nas regras (.agents/rules/token-protocol.md)" "$CATALOG_OK"

# 7. JIT Auto-Promoter do Hook
TEMP_AGENT="gsd-ui-auditor"
rm -f "${AGENTS_DIR}/${TEMP_AGENT}.md"
PAYLOAD_JIT='{"toolCall":{"name":"invoke_subagent","args":{"Subagents":[{"TypeName":"'"${TEMP_AGENT}"'"}]}}}'
printf '%s' "$PAYLOAD_JIT" | node "$HOOK_PATH" >/dev/null 2>&1 || true
JIT_OK=0
if [ -f "${AGENTS_DIR}/${TEMP_AGENT}.md" ]; then
JIT_OK=1
fi
assert_test "Hook PreToolUse promove instantaneamente (JIT) subagente do pool sob demanda" "$JIT_OK"

# 7.1: Validar TTL = 1: PreInvocation recolhe o subagente no turno subsequente
PRE_INVOC_PATH="${TARGET_DIR}/.agents/hooks/token-guard-preinvocation.cjs"
node "$PRE_INVOC_PATH" >/dev/null 2>&1 || true
TTL_OK=0
if [ ! -f "${AGENTS_DIR}/${TEMP_AGENT}.md" ]; then
TTL_OK=1
fi
assert_test "Hook PreInvocation recolhe subagente promovido apos 1 turno (TTL=1 cirurgico)" "$TTL_OK"

TEMP_DIRECT_AGENT="gsd-code-fixer"
rm -f "${AGENTS_DIR}/${TEMP_DIRECT_AGENT}.md"
PAYLOAD_JIT_DIRECT='{"toolCall":{"name":"invoke_subagent","args":{"TypeName":"'"${TEMP_DIRECT_AGENT}"'"}}}'
printf '%s' "$PAYLOAD_JIT_DIRECT" | node "$HOOK_PATH" >/dev/null 2>&1 || true
JIT_DIRECT_OK=0
if [ -f "${AGENTS_DIR}/${TEMP_DIRECT_AGENT}.md" ]; then
JIT_DIRECT_OK=1
rm -f "${AGENTS_DIR}/${TEMP_DIRECT_AGENT}.md"
fi
assert_test "Hook PreToolUse promove subagente do pool via argumento direto TypeName" "$JIT_DIRECT_OK"

# 8. Configuração de Hooks e Git Hooks
HOOKS_JSON="${TARGET_DIR}/.agents/hooks.json"
HOOKS_CONF_OK=0
if [ -f "$HOOKS_JSON" ] && grep -q "token-efficiency-guard" "$HOOKS_JSON" 2>/dev/null && grep -q "invoke_subagent" "$HOOKS_JSON" 2>/dev/null; then
HOOKS_CONF_OK=1
fi
assert_test "Configuracao de hooks ativa e com invoke_subagent em .agents/hooks.json" "$HOOKS_CONF_OK"

GIT_HOOKS_DIR="${TARGET_DIR}/.git/hooks"
GIT_HOOKS_OK=0
if [ -f "${GIT_HOOKS_DIR}/post-merge" ] && [ -f "${GIT_HOOKS_DIR}/post-checkout" ]; then
GIT_HOOKS_OK=1
fi
assert_test "Git hooks de auto-cura presentes em .git/hooks/" "$GIT_HOOKS_OK"

# 9. Telemetria de Tokens
TOKEN_REPORT_PATH=$(find_kit_script "token-report.cjs")
REPORT_OK=0
if node "$TOKEN_REPORT_PATH" --json 2>/dev/null | grep -q '"session"'; then
REPORT_OK=1
fi
assert_test "Script de telemetria (token-report.cjs) operacional via JSON" "$REPORT_OK"

# 10. Hard Stop & Pré-requisitos
command -v node >/dev/null 2>&1 && NODE_OK=1 || NODE_OK=0
command -v ast-grep >/dev/null 2>&1 && AST_OK=1 || AST_OK=0
command -v graphify >/dev/null 2>&1 && GFY_OK=1 || GFY_OK=0
[ -d "${TARGET_DIR}/.agents/gsd-core" ] || [ -d "${TARGET_DIR}/.agents/agents" ] && GSD_OK=1 || GSD_OK=0

assert_test "Hard Stop Setup: Node.js presente" "$NODE_OK"
assert_test "Hard Stop Setup: ast-grep presente" "$AST_OK"
assert_test "Hard Stop Setup: graphify presente" "$GFY_OK"
assert_test "Hard Stop Setup: gsd-core presente no projeto" "$GSD_OK"

# ------------------------------------------------------------------------------
# Teste 11: Defaults Enxutos e Governança no .planning/config.json
# ------------------------------------------------------------------------------
CONFIG_PATH="${TARGET_DIR}/.planning/config.json"
if [ -f "${CONFIG_PATH}" ]; then
CFG_OK=$(node -e '
const fs = require("fs");
try {
const raw = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const ok = raw.response_language === "pt-BR" &&
raw.workflow && raw.workflow.compact_content === true &&
raw.workflow.auto_prune_state === true &&
raw.workflow.code_review === true &&
raw.plan_review && raw.plan_review.source_grounding_authority === "ast-grep" &&
raw.graphify && raw.graphify.enabled === true;
process.stdout.write(ok ? "1" : "0");
} catch {
process.stdout.write("0");
}
' "${CONFIG_PATH}")
assert_test "Defaults enxutos e governança em .planning/config.json validados" "$CFG_OK"
fi

# ------------------------------------------------------------------------------
# Teste 12: Dynamic Skill Pool (.agents/skills-pool/) & JIT Auto-Promoter
# ------------------------------------------------------------------------------
SKILLS_POOL_DIR="${TARGET_DIR}/.agents/skills-pool"
ACTIVE_SKILLS_DIR="${TARGET_DIR}/.agents/skills"
POOL_SKILLS_COUNT=$(find "${SKILLS_POOL_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)
ACTIVE_SKILLS_COUNT=$(find "${ACTIVE_SKILLS_DIR}" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | wc -l)

[ "${POOL_SKILLS_COUNT}" -ge 30 ] && POOL_OK=1 || POOL_OK=0
assert_test "Dynamic Skill Pool (.agents/skills-pool/) preservado (${POOL_SKILLS_COUNT} skills)" "$POOL_OK"

[ "${ACTIVE_SKILLS_COUNT}" -le 25 ] && ACTIVE_OK=1 || ACTIVE_OK=0
assert_test "Catálogo de skills ativo (.agents/skills/) enxuto (${ACTIVE_SKILLS_COUNT} ativas)" "$ACTIVE_OK"

# Teste JIT via view_file
rm -rf "${ACTIVE_SKILLS_DIR}/gsd-spike" 2>/dev/null || true
PAYLOAD_SKILL_JIT="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"${SKILLS_POOL_DIR}/gsd-spike/SKILL.md\"}}}"
RES_SKILL_JIT=$(echo "${PAYLOAD_SKILL_JIT}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
[ -d "${ACTIVE_SKILLS_DIR}/gsd-spike" ] && SKILL_JIT_OK=1 || SKILL_JIT_OK=0
rm -rf "${ACTIVE_SKILLS_DIR}/gsd-spike" 2>/dev/null || true
assert_test "Hook PreToolUse promove instantaneamente (JIT) skill do pool sob demanda" "$SKILL_JIT_OK"

# ------------------------------------------------------------------------------
# Teste 13: Motor de UI do Instalador (setup-ui.cjs)
# ------------------------------------------------------------------------------
SETUP_UI_PATH=$(find_kit_script "setup-ui.cjs")
node --check "${SETUP_UI_PATH}" >/dev/null 2>&1 && UI_SYNTAX_OK=1 || UI_SYNTAX_OK=0
assert_test "Motor de UI do instalador (setup-ui.cjs) presente e sintaticamente válido" "$UI_SYNTAX_OK"

# ------------------------------------------------------------------------------
# Teste 14: Deduplicação de Leituras Recentes no view_file
# ------------------------------------------------------------------------------
DUMMY_CODE="${TARGET_DIR}/.agents/temp-dedup-test.go"
printf "package test\nfunc Hello() { println(\"ok\") }\n" > "${DUMMY_CODE}"
PAYLOAD_READ1="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"${DUMMY_CODE}\",\"StartLine\":1,\"EndLine\":2}}}"
RES_READ1=$(echo "${PAYLOAD_READ1}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
RES_READ2=$(echo "${PAYLOAD_READ1}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
rm -f "${DUMMY_CODE}" 2>/dev/null || true

DEDUP_OK=0
if echo "${RES_READ1}" | grep -q '"decision":"allow"' && echo "${RES_READ2}" | grep -q '"decision":"deny"'; then
DEDUP_OK=1
fi
assert_test "Hook PreToolUse bloqueia releituras redundantes imediatas (Deduplicação de Contexto)" "$DEDUP_OK"

DUMMY_CODE_DIFF="${TARGET_DIR}/.agents/temp-dedup-diff.go"
printf "package test\nfunc L1() {}\nfunc L2() {}\nfunc L3() {}\nfunc L4() {}\n" > "${DUMMY_CODE_DIFF}"
PAYLOAD_DIFF1="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"${DUMMY_CODE_DIFF}\",\"StartLine\":1,\"EndLine\":2}}}"
PAYLOAD_DIFF2="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"${DUMMY_CODE_DIFF}\",\"StartLine\":3,\"EndLine\":4}}}"
RES_DIFF1=$(echo "${PAYLOAD_DIFF1}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
RES_DIFF2=$(echo "${PAYLOAD_DIFF2}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
rm -f "${DUMMY_CODE_DIFF}" 2>/dev/null || true

DIFF_OK=0
if echo "${RES_DIFF1}" | grep -q '"decision":"allow"' && echo "${RES_DIFF2}" | grep -q '"decision":"allow"'; then
DIFF_OK=1
fi
assert_test "Hook PreToolUse permite leitura de ranges distintos do mesmo arquivo sem falso-positivo" "$DIFF_OK"

# Teste de invalidação de deduplicação após alteração do arquivo no disco (mtime atualizado)
DUMMY_MTIME="${TARGET_DIR}/.agents/temp-dedup-mtime.go"
printf "package test\nfunc OldCode() {}\n" > "${DUMMY_MTIME}"
PAYLOAD_MTIME1="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"${DUMMY_MTIME}\",\"StartLine\":1,\"EndLine\":2}}}"
RES_MTIME1=$(echo "${PAYLOAD_MTIME1}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
sleep 0.1
printf "package test\nfunc NewCode() {}\n" > "${DUMMY_MTIME}"
touch -d "+2 seconds" "${DUMMY_MTIME}" 2>/dev/null || touch "${DUMMY_MTIME}" 2>/dev/null || true
RES_MTIME2=$(echo "${PAYLOAD_MTIME1}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
rm -f "${DUMMY_MTIME}" 2>/dev/null || true
MTIME_OK=0
if echo "${RES_MTIME1}" | grep -q '"decision":"allow"' && echo "${RES_MTIME2}" | grep -q '"decision":"allow"'; then
MTIME_OK=1
fi
assert_test "Hook PreToolUse invalida deduplicacao e permite releitura quando arquivo e modificado no disco" "$MTIME_OK"

# ------------------------------------------------------------------------------
# Teste 15: Auto-Limitador de Comandos Prolixos (git log / docker logs / npm list)
# ------------------------------------------------------------------------------
PAYLOAD_GIT_LOG="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"git log\"}}}"
RES_GIT_LOG=$(echo "${PAYLOAD_GIT_LOG}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
GIT_LOG_OK=0
if echo "${RES_GIT_LOG}" | grep -q '"decision":"allow"' && echo "${RES_GIT_LOG}" | grep -q 'git log -n 20'; then
GIT_LOG_OK=1
fi
assert_test "Hook PreToolUse auto-limita comandos prolixos (git log -> git log -n 20)" "$GIT_LOG_OK"

PAYLOAD_FIND="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"find . -type f\"}}}"
RES_FIND=$(echo "${PAYLOAD_FIND}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
FIND_OK=0
if echo "${RES_FIND}" | grep -q '"decision":"allow"' && echo "${RES_FIND}" | grep -q '\-maxdepth 3'; then
FIND_OK=1
fi
assert_test "Hook PreToolUse auto-limita varreduras recursivas (find . -> -maxdepth 3)" "$FIND_OK"

PAYLOAD_DOCKER="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"docker logs api-service\"}}}"
RES_DOCKER=$(echo "${PAYLOAD_DOCKER}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
DOCKER_OK=0
if echo "${RES_DOCKER}" | grep -q '"decision":"allow"' && echo "${RES_DOCKER}" | grep -q 'docker logs --tail 100 api-service'; then
DOCKER_OK=1
fi
assert_test "Hook PreToolUse auto-limita logs do Docker (docker logs -> --tail 100)" "$DOCKER_OK"

PAYLOAD_NPM="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"npm list\"}}}"
RES_NPM=$(echo "${PAYLOAD_NPM}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
NPM_OK=0
if echo "${RES_NPM}" | grep -q '"decision":"allow"' && echo "${RES_NPM}" | grep -q 'npm list --depth=0'; then
NPM_OK=1
fi
assert_test "Hook PreToolUse auto-limita listagem de dependencias (npm list -> --depth=0)" "$NPM_OK"

PAYLOAD_GIT_LIM="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"git log -n 5\"}}}"
RES_GIT_LIM=$(echo "${PAYLOAD_GIT_LIM}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
IDEMPOTENT_OK=0
if echo "${RES_GIT_LIM}" | grep -q '"decision":"allow"' && ! echo "${RES_GIT_LIM}" | grep -q '"overwrite":'; then
IDEMPOTENT_OK=1
fi
assert_test "Hook PreToolUse preserva comandos que ja possuem limitador (idempotencia)" "$IDEMPOTENT_OK"

PAYLOAD_DOCKER_C="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"docker compose logs api-service\"}}}"
RES_DOCKER_C=$(echo "${PAYLOAD_DOCKER_C}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
DOCKER_C_OK=0
if echo "${RES_DOCKER_C}" | grep -q '"decision":"allow"' && echo "${RES_DOCKER_C}" | grep -q 'docker compose logs --tail 100 api-service'; then
DOCKER_C_OK=1
fi
assert_test "Hook PreToolUse auto-limita logs do Docker Compose (docker compose logs -> --tail 100)" "$DOCKER_C_OK"

PAYLOAD_PNPM="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"pnpm list\"}}}"
RES_PNPM=$(echo "${PAYLOAD_PNPM}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
PNPM_OK=0
if echo "${RES_PNPM}" | grep -q '"decision":"allow"' && echo "${RES_PNPM}" | grep -q 'pnpm list --depth=0'; then
PNPM_OK=1
fi
assert_test "Hook PreToolUse auto-limita listagem de dependencias pnpm (pnpm list -> --depth=0)" "$PNPM_OK"

PAYLOAD_SHELL_LIM="{\"toolCall\":{\"name\":\"shell\",\"args\":{\"CommandLine\":\"git log\"}}}"
RES_SHELL_LIM=$(echo "${PAYLOAD_SHELL_LIM}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
SHELL_LIM_OK=0
if echo "${RES_SHELL_LIM}" | grep -q '"decision":"allow"' && echo "${RES_SHELL_LIM}" | grep -q 'git log -n 20'; then
SHELL_LIM_OK=1
fi
assert_test "Hook PreToolUse auto-limita comandos prolixos via alias de ferramenta (shell)" "$SHELL_LIM_OK"

# ------------------------------------------------------------------------------
# Teste 16: State Compactor (compact-state.cjs)
# ------------------------------------------------------------------------------
COMPACT_STATE_PATH=$(find_kit_script "compact-state.cjs")
node --check "${COMPACT_STATE_PATH}" >/dev/null 2>&1 && COMPACT_STATE_OK=1 || COMPACT_STATE_OK=0
assert_test "State Compactor (compact-state.cjs) presente e sintaticamente válido" "$COMPACT_STATE_OK"

# 16.2: Teste Funcional do State Compactor com mock
MOCK_PLAN_DIR="${TARGET_DIR}/.agents/temp-compactor-test"
mkdir -p "${MOCK_PLAN_DIR}/.planning"
cat << 'EOF' > "${MOCK_PLAN_DIR}/.planning/STATE.md"
### Performance Metrics
| Phase | Plans | Total | Avg/Plan |
|---|---|---|---|
| Phase 01 | 3 | 12m | 4m |
| Phase 02 | 4 | 20m | 5m |
| Phase 03 | 2 | 10m | 5m |
| Phase 04 | 5 | 25m | 5m |
| Phase 05 | 3 | 15m | 5m |
| Phase 06 | 2 | 8m | 4m |
| Phase 07 | 4 | 18m | 4.5m |
| Phase 08 | 3 | 12m | 4m |
| Phase 09 | 2 | 10m | 5m |

EOF
COMPACT_FUNC_RES=$(node "${COMPACT_STATE_PATH}" "${MOCK_PLAN_DIR}" --json 2>/dev/null || echo "{}")
COMPACT_PASSED=0
if echo "${COMPACT_FUNC_RES}" | grep -q '"success": true' && echo "${COMPACT_FUNC_RES}" | grep -q '"compacted": true' && [ -f "${MOCK_PLAN_DIR}/.planning/STATE-ARCHIVE.md" ]; then
COMPACT_PASSED=1
fi
rm -rf "${MOCK_PLAN_DIR}" 2>/dev/null || true
assert_test "State Compactor (compact-state.cjs) arquiva metricas historicas (>8 linhas) e preserva ativas" "$COMPACT_PASSED"

# ------------------------------------------------------------------------------
# Teste 17: JSON Stream Compact (compact-json.cjs)
# ------------------------------------------------------------------------------
COMPACT_JSON_PATH=$(find_kit_script "compact-json.cjs")
JSON_TEST_RES=$(echo '{"a":1,"b":null}' | node "${COMPACT_JSON_PATH}" 2>/dev/null || echo "{}")
COMPACT_JSON_OK=0
if echo "${JSON_TEST_RES}" | grep -q '"a": 1' && ! echo "${JSON_TEST_RES}" | grep -q '"b":'; then
COMPACT_JSON_OK=1
fi
assert_test "JSON Stream Compact (compact-json.cjs) operacional e filtrando nulos" "$COMPACT_JSON_OK"

# ------------------------------------------------------------------------------
# Teste 18: Output Sanitizer (sanitize-output.cjs)
# ------------------------------------------------------------------------------
SANITIZER_PATH=$(find_kit_script "sanitize-output.cjs")
TEST_LINES=""
for i in $(seq 1 80); do TEST_LINES="${TEST_LINES}Linha $i\n"; done
SANITIZED_RES=$(printf "${TEST_LINES}" | node "${SANITIZER_PATH}" 2>/dev/null || echo "")
SANITIZER_OK=0
if echo "${SANITIZED_RES}" | grep -q "TOKEN GUARD" && echo "${SANITIZED_RES}" | grep -q "Linha 1"; then
SANITIZER_OK=1
fi
assert_test "Output Sanitizer (sanitize-output.cjs) trunca saídas extensas com log preservado" "$SANITIZER_OK"

# 18.2: Teste Funcional do Output Sanitizer via flag --exec
SANITIZED_EXEC_RES=$(node "${SANITIZER_PATH}" --exec "node -e \"for(let i=1;i<=80;i++)console.log(i)\"" 2>/dev/null || echo "")
SANITIZER_EXEC_OK=0
if echo "${SANITIZED_EXEC_RES}" | grep -q "TOKEN GUARD" && echo "${SANITIZED_EXEC_RES}" | grep -q "1" && echo "${SANITIZED_EXEC_RES}" | grep -q "80"; then
SANITIZER_EXEC_OK=1
fi
assert_test "Output Sanitizer (sanitize-output.cjs --exec) trunca execucao em lote e exibe banner" "$SANITIZER_EXEC_OK"

# ------------------------------------------------------------------------------
# Teste 19: Preservação de URLs na Normalização Windows
# ------------------------------------------------------------------------------
PAYLOAD_URL="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"curl https://api.com/v1/resource -o D:/temp/out.json\"}}}"
RES_URL=$(echo "${PAYLOAD_URL}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
URL_OK=0
if echo "${RES_URL}" | grep -q '"decision":"allow"' && echo "${RES_URL}" | grep -q 'https://api.com/v1/resource' && ! echo "${RES_URL}" | grep -q 'https:\\'; then
URL_OK=1
fi
assert_test "Hook PreToolUse preserva URLs HTTP/HTTPS enquanto normaliza caminhos" "$URL_OK"

# ------------------------------------------------------------------------------
# Teste 20: Gate Universal de Linguagens (.vue e .cs)
# ------------------------------------------------------------------------------
PAYLOAD_VUE="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"/src/Component.vue\"}}}"
RES_VUE=$(echo "${PAYLOAD_VUE}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
VUE_OK=0
if echo "${RES_VUE}" | grep -q '"decision":"deny"'; then VUE_OK=1; fi

PAYLOAD_CS="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"/src/Service.cs\"}}}"
RES_CS=$(echo "${PAYLOAD_CS}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
CS_OK=0
if echo "${RES_CS}" | grep -q '"decision":"deny"'; then CS_OK=1; fi

LANG_OK=$(( VUE_OK && CS_OK ))
assert_test "Hook PreToolUse bloqueia view_file sem paginação em linguagens universais (.vue e .cs)" "$LANG_OK"

# ------------------------------------------------------------------------------
# Teste 21: Higienização de URIs file:/// no view_file
# ------------------------------------------------------------------------------
PAYLOAD_FILE_URI="{\"toolCall\":{\"name\":\"view_file\",\"args\":{\"AbsolutePath\":\"file:///README.md\"}}}"
RES_FILE_URI=$(echo "${PAYLOAD_FILE_URI}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
FILE_URI_OK=0
if echo "${RES_FILE_URI}" | grep -q '"decision":"allow"'; then FILE_URI_OK=1; fi
assert_test "Hook PreToolUse higieniza e aceita URIs com prefixo file:///" "$FILE_URI_OK"

# ------------------------------------------------------------------------------
# Teste 22: Preservação de URLs remotas com extensão .ps1
# ------------------------------------------------------------------------------
PAYLOAD_PS1_URL="{\"toolCall\":{\"name\":\"run_command\",\"args\":{\"CommandLine\":\"curl https://example.com/deploy/setup.ps1\"}}}"
RES_PS1_URL=$(echo "${PAYLOAD_PS1_URL}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
PS1_URL_OK=0
if echo "${RES_PS1_URL}" | grep -q 'https://example\.com/deploy/setup\.ps1'; then PS1_URL_OK=1; fi
assert_test "Hook PreToolUse preserva integralmente URLs remotas terminadas em .ps1" "$PS1_URL_OK"

# ------------------------------------------------------------------------------
# Teste 23: Exceção de write_to_file para arquivos temporários/scratch
# ------------------------------------------------------------------------------
SCRATCH_DUMMY="${TARGET_DIR}/.agents/.cache/scratch/test.go"
mkdir -p "$(dirname "${SCRATCH_DUMMY}")"
echo "package main" > "${SCRATCH_DUMMY}"
PAYLOAD_SCRATCH="{\"toolCall\":{\"name\":\"write_to_file\",\"args\":{\"TargetFile\":\"${SCRATCH_DUMMY}\",\"Overwrite\":true}}}"
RES_SCRATCH=$(echo "${PAYLOAD_SCRATCH}" | node "${HOOK_PATH}" 2>/dev/null || echo "{}")
rm -f "${SCRATCH_DUMMY}"
SCRATCH_OK=0
if echo "${RES_SCRATCH}" | grep -q '"decision":"allow"'; then SCRATCH_OK=1; fi
assert_test "Hook PreToolUse permite sobrescrita de write_to_file em pastas efêmeras/scratch" "$SCRATCH_OK"

# ------------------------------------------------------------------------------
# Teste 24: Operacao do Skill Surface Manager (skills-manager.cjs)
# ------------------------------------------------------------------------------
SKILLS_MGR_PATH=$(find_kit_script "skills-manager.cjs")
MGR_OUTPUT=$(node "${SKILLS_MGR_PATH}" status "${TARGET_DIR}" 2>/dev/null || echo "")
SKILLS_STATUS_OK=0
if echo "${MGR_OUTPUT}" | grep -q "Status do Catálogo de Skills" && echo "${MGR_OUTPUT}" | grep -q "Skills Ativas"; then
SKILLS_STATUS_OK=1
fi
assert_test "Skill Surface Manager (skills-manager.cjs) operacional exibindo status e tokens" "$SKILLS_STATUS_OK"

# ------------------------------------------------------------------------------
# Teste 25: Extrator de Estado do GSD (gsd-state-summary.cjs)
# ------------------------------------------------------------------------------
STATE_SUM_PATH=$(find_kit_script "gsd-state-summary.cjs")
SUM_OUTPUT=$(node "${STATE_SUM_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "{}")
if ! echo "${SUM_OUTPUT}" | grep -q '"phase_number":'; then
TEMP_PLAN_DIR="${TARGET_DIR}/.temp-state-test/.planning"
mkdir -p "${TEMP_PLAN_DIR}"
cat << 'EOF' > "${TEMP_PLAN_DIR}/STATE.md"
---
current_phase: 1
current_phase_name: "Setup"
status: "in_progress"
---
# State
EOF
SUM_OUTPUT=$(node "${STATE_SUM_PATH}" "${TARGET_DIR}/.temp-state-test" 2>/dev/null || echo "{}")
rm -rf "${TARGET_DIR}/.temp-state-test" 2>/dev/null || true
fi
SUM_OK=0
if echo "${SUM_OUTPUT}" | grep -q '"phase_number":'; then
SUM_OK=1
fi
assert_test "Extrator de Estado GSD (gsd-state-summary.cjs) operacional gerando JSON estruturado" "$SUM_OK"

# ------------------------------------------------------------------------------
# Teste 26: Integridade Sintatica dos Utilitarios do Kit (patch-agents & graphify-update)
# ------------------------------------------------------------------------------
PATCH_PATH=$(find_kit_script "patch-agents.cjs")
GFY_UPDATE_PATH=$(find_kit_script "gsd-graphify-update.cjs")
node --check "${PATCH_PATH}" >/dev/null 2>&1 && P_OK=1 || P_OK=0
node --check "${GFY_UPDATE_PATH}" >/dev/null 2>&1 && G_OK=1 || G_OK=0
SYNTAX_ALL_OK=$(( P_OK && G_OK ))
assert_test "Utilitarios de manutencao (patch-agents.cjs e gsd-graphify-update.cjs) sintaticamente validos" "$SYNTAX_ALL_OK"

# 26.2: Teste Funcional Unitário do Normalizador de Agentes (patch-agents.cjs)
TEMP_AGENT_DIR="${TARGET_DIR}/.agents/temp-agent-patch-test"
mkdir -p "${TEMP_AGENT_DIR}"
TEMP_AGENT_FILE="${TEMP_AGENT_DIR}/dummy-patch-agent.md"
cat << 'EOF' > "${TEMP_AGENT_FILE}"
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
EOF

PATCH_FUNC_OK=0
PATCH_SCRIPT_RES=$(node -e "
const { patchAgentFile } = require(process.argv[1]);
const changed = patchAgentFile(process.argv[2], process.argv[3]);
process.stdout.write(changed ? 'OK' : 'FAIL');
" "${PATCH_PATH}" "${TEMP_AGENT_FILE}" "${TARGET_DIR}" 2>/dev/null || echo "FAIL")

if [ "$PATCH_SCRIPT_RES" = "OK" ]; then
if ! grep -q -- "- glob" "${TEMP_AGENT_FILE}" && \
! grep -q -- "- grep_search" "${TEMP_AGENT_FILE}" && \
grep -q -- "- write_to_file" "${TEMP_AGENT_FILE}" && \
grep -q "ANTIGRAVITY_TOKEN_PROTOCOL_START" "${TEMP_AGENT_FILE}"; then
PATCH_FUNC_OK=1
fi
fi
rm -rf "${TEMP_AGENT_DIR}" 2>/dev/null || true
assert_test "Normalizador de Agentes (patch-agents.cjs) remove ferramentas legadas e injeta protocolo cirurgico" "$PATCH_FUNC_OK"

# 26.3: Validação de não-interferência de gsd-graphify-update.cjs para comandos regulares
GFY_NON_COMMIT_OK=0
PAYLOAD_GFY='{"toolCall":{"name":"run_command","args":{"CommandLine":"git status"}}}'
if printf '%s' "$PAYLOAD_GFY" | node "${GFY_UPDATE_PATH}" >/dev/null 2>&1; then
GFY_NON_COMMIT_OK=1
fi
assert_test "Hook Graphify Update (gsd-graphify-update.cjs) ignora comandos que nao sao commit com saida limpa" "$GFY_NON_COMMIT_OK"

# ------------------------------------------------------------------------------
# Teste 27: Validacao Sintatica Integral de Scripts Shell (.sh) e PowerShell (.ps1)
# ------------------------------------------------------------------------------
PS1_FILES=("setup.ps1" "install.ps1" "uninstall.ps1" "skills-profile.ps1" "sanitize-command.ps1" "optimize-tokens.ps1" "test-kit.ps1")
PS1_ALL_PRESENT=1
for ps in "${PS1_FILES[@]}"; do
ps_file=$(find_kit_script "${ps}")
if [ ! -s "${ps_file}" ]; then
PS1_ALL_PRESENT=0
break
fi
done
assert_test "Todos os scripts PowerShell do kit (${#PS1_FILES[@]} scripts .ps1) presentes e íntegros" "$PS1_ALL_PRESENT"

SH_FILES=("setup.sh" "install.sh" "uninstall.sh" "skills-profile.sh" "optimize-tokens.sh" "test-kit.sh")
SH_ALL_VALID=1
for shf in "${SH_FILES[@]}"; do
sh_file=$(find_kit_script "${shf}")
if [ ! -s "${sh_file}" ]; then
SH_ALL_VALID=0
break
fi
if ! bash -n "${sh_file}" 2>/dev/null; then
SH_ALL_VALID=0
break
fi
done
assert_test "Todos os scripts Shell do kit (${#SH_FILES[@]} scripts .sh) com sintaxe valida" "$SH_ALL_VALID"

# ------------------------------------------------------------------------------
# Teste 28: Integridade das Regras e Skills Canonicas Empacotadas
# ------------------------------------------------------------------------------
if [ -d "${KIT_DIR}/rules" ]; then
RESOLVED_RULES_DIR="${KIT_DIR}/rules"
elif [ -d "${TARGET_DIR}/.agents/rules" ]; then
RESOLVED_RULES_DIR="${TARGET_DIR}/.agents/rules"
else
RESOLVED_RULES_DIR="${SCRIPT_DIR}/rules"
fi

RULES_FILES=("ast-grep.md" "lsp.md" "graphify.md" "idioma.md" "token-protocol.md" "ponytail.md" "caveman.md")
RULES_ALL_OK=1
for rf in "${RULES_FILES[@]}"; do
if [ ! -f "${RESOLVED_RULES_DIR}/${rf}" ] || [ $(wc -c < "${RESOLVED_RULES_DIR}/${rf}" 2>/dev/null || echo 0) -lt 50 ]; then
RULES_ALL_OK=0
break
fi
done
assert_test "Regras canonicas em rules/ (${#RULES_FILES[@]} regras) presentes e validas" "$RULES_ALL_OK"

GUARDRAILS_FILE="${RESOLVED_RULES_DIR}/quality-guardrails.md"
[ ! -f "$GUARDRAILS_FILE" ] && GUARDRAILS_FILE="${TARGET_DIR}/.agents/rules/quality-guardrails.md"
GUARDRAILS_ADVANCED_OK=0
if grep -q "Teto Estrito de Aninhamento" "$GUARDRAILS_FILE" 2>/dev/null && grep -q "Blindagem Aritmética" "$GUARDRAILS_FILE" 2>/dev/null; then
  GUARDRAILS_ADVANCED_OK=1
fi
assert_test "Regras de qualidade contêm guardrails de aninhamento <= 3 e blindagem aritmética" "$GUARDRAILS_ADVANCED_OK"

PLANNING_RULE_FILE="${RESOLVED_RULES_DIR}/compact-planning.md"
[ ! -f "$PLANNING_RULE_FILE" ] && PLANNING_RULE_FILE="${TARGET_DIR}/.agents/rules/compact-planning.md"
PLANNING_RULE_OK=0
if grep -q "Teto Calibrado sem Prosa: Máximo 55 Linhas" "$PLANNING_RULE_FILE" 2>/dev/null; then
  PLANNING_RULE_OK=1
fi
assert_test "Diretrizes de planejamento contêm Blueprint de Coordenadas com teto de 55 linhas" "$PLANNING_RULE_OK"

COMPLEXITY_GUARD_TEST_PATH="${KIT_DIR}/lib/complexity-guard.cjs"
[ ! -f "$COMPLEXITY_GUARD_TEST_PATH" ] && COMPLEXITY_GUARD_TEST_PATH="${SCRIPT_DIR}/lib/complexity-guard.cjs"
COMPLEXITY_TEST_OK=0
if node -e '
  const CG = require(process.argv[1]);
  const cg = new CG();
  const code = "function test() { if (1) { for (let i=0; i<2; i++) { if (2) { console.log(1); } } } }";
  const fns = cg.extractFunctions(code);
  const fn = fns[0];
  if (fn && fn.maxNesting >= 4) process.exit(0);
  process.exit(1);
' "$COMPLEXITY_GUARD_TEST_PATH" 2>/dev/null; then
  COMPLEXITY_TEST_OK=1
fi
assert_test "ComplexityGuard detecta aninhamento profundo nivel >= 4 sem off-by-one" "$COMPLEXITY_TEST_OK"

COMPLEXITY_HIGH_OK=0
if node -e '
  const CG = require(process.argv[1]);
  const cg = new CG({ maxComplexity: 12 });
  const code = "app.get(\"/test\", async (req, res) => { if(1){}if(2){}if(3){}if(4){}if(5){}if(6){}if(7){}if(8){}if(9){}if(10){}if(11){}if(12){}if(13){} });";
  const fns = cg.extractFunctions(code);
  const fn = fns[0];
  if (fn) {
    const kw = (fn.body.match(/\b(if|for|while|case|catch)\b/g) || []).length;
    if (kw > 12) process.exit(0);
  }
  process.exit(1);
' "$COMPLEXITY_GUARD_TEST_PATH" 2>/dev/null; then
  COMPLEXITY_HIGH_OK=1
fi
assert_test "ComplexityGuard detecta rotas anonimas e alta complexidade ciclomática > 12" "$COMPLEXITY_HIGH_OK"

AMBIGUITY_RULE_FILE="${RESOLVED_RULES_DIR}/token-protocol.md"
[ ! -f "$AMBIGUITY_RULE_FILE" ] && AMBIGUITY_RULE_FILE="${TARGET_DIR}/.agents/rules/token-protocol.md"
AMB_UNIVERSAL_OK=0
if grep -q "Os 4 Vetores Universais de Incerteza de Software" "$AMBIGUITY_RULE_FILE" 2>/dev/null && grep -q "Formato Obrigatório em Bloco Atômico" "$AMBIGUITY_RULE_FILE" 2>/dev/null; then
  AMB_UNIVERSAL_OK=1
fi
assert_test "Protocolo de ambiguidades contém os 4 vetores universais e formato de bloco atômico" "$AMB_UNIVERSAL_OK"

GUARDRAILS_WEB_OK=0
if grep -q "Achatamento de Middlewares Web" "$GUARDRAILS_FILE" 2>/dev/null && grep -q "Anti-Magic Sampling Caps" "$GUARDRAILS_FILE" 2>/dev/null; then
  GUARDRAILS_WEB_OK=1
fi
assert_test "Regras de qualidade contêm achatamento de middlewares web e anti-magic sampling caps" "$GUARDRAILS_WEB_OK"

SECURITY_LINTER_TEST_PATH="${KIT_DIR}/lib/security-linter.cjs"
[ ! -f "$SECURITY_LINTER_TEST_PATH" ] && SECURITY_LINTER_TEST_PATH="${SCRIPT_DIR}/lib/security-linter.cjs"
SECURITY_LINTER_OK=0
if node -e '
  const SL = require(process.argv[1]);
  const sl = new SL();
  const issues = sl.scanSource("const q = `SELECT * FROM x WHERE id IN (${placeholders})`;");
  if (issues.length > 0 && issues[0].type === "sql_template_interpolation") process.exit(0);
  process.exit(1);
' "$SECURITY_LINTER_TEST_PATH" 2>/dev/null; then
  SECURITY_LINTER_OK=1
fi
assert_test "SecurityLinter intercepta qualquer interpolacao template em SQL sem excecao indevida" "$SECURITY_LINTER_OK"

CANONICAL_SKILLS=("gsd-tokens" "gsd-test" "gsd-agy-update")
SKILL_OK=1
for sk in "${CANONICAL_SKILLS[@]}"; do
sk_path=""
if [ -f "${KIT_DIR}/skills/${sk}/SKILL.md" ]; then
sk_path="${KIT_DIR}/skills/${sk}/SKILL.md"
elif [ -f "${TARGET_DIR}/.agents/skills/${sk}/SKILL.md" ]; then
sk_path="${TARGET_DIR}/.agents/skills/${sk}/SKILL.md"
elif [ -f "${TARGET_DIR}/.agents/skills-pool/${sk}/SKILL.md" ]; then
sk_path="${TARGET_DIR}/.agents/skills-pool/${sk}/SKILL.md"
else
sk_path="${SCRIPT_DIR}/skills/${sk}/SKILL.md"
fi
if [ ! -f "$sk_path" ] || ! grep -q "name:\s*${sk}" "$sk_path" 2>/dev/null; then
SKILL_OK=0
break
fi
done
assert_test "Skills canonicas (/gsd-tokens, /gsd-test e /gsd-agy-update) presentes com frontmatter valido" "$SKILL_OK"
# ------------------------------------------------------------------------------
# Teste 29: MemPalace Engine (lib/mempalace-engine.cjs)
# ------------------------------------------------------------------------------
if [ -d "${KIT_DIR}/lib" ]; then
MCP_LIB_DIR="${KIT_DIR}/lib"
elif [ -d "${TARGET_DIR}/.agents/kit/lib" ]; then
MCP_LIB_DIR="${TARGET_DIR}/.agents/kit/lib"
elif [ -d "${TARGET_DIR}/.agents/lib" ]; then
MCP_LIB_DIR="${TARGET_DIR}/.agents/lib"
else
MCP_LIB_DIR="${SCRIPT_DIR}/lib"
fi

if [ -f "${KIT_DIR}/mcp-server.cjs" ]; then
MCP_BIN="${KIT_DIR}/mcp-server.cjs"
elif [ -f "${TARGET_DIR}/.agents/kit/mcp-server.cjs" ]; then
MCP_BIN="${TARGET_DIR}/.agents/kit/mcp-server.cjs"
elif [ -f "${TARGET_DIR}/.agents/mcp-server.cjs" ]; then
MCP_BIN="${TARGET_DIR}/.agents/mcp-server.cjs"
else
MCP_BIN="${SCRIPT_DIR}/mcp-server.cjs"
fi

MEMPALACE_TEST_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const MemPalace = require(path.join(libDir, "mempalace-engine.cjs"));
const testDir = path.join(process.cwd(), ".agents", "temp-mp-test");
const mp = new MemPalace(testDir);
mp.capture({ room: "decisions", topic: "TestTopic", content: "TestContent", rationale: "TestRationale" });
const recall = mp.recall({ query: "TestTopic" });
fs.rmSync(testDir, { recursive: true, force: true });
if (recall && recall.results && recall.results.length > 0) {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" 2>/dev/null || echo "")
MEMPALACE_OK=0
if [ "$MEMPALACE_TEST_RES" = "OK" ]; then
MEMPALACE_OK=1
fi
assert_test "MemPalace Engine (lib/mempalace-engine.cjs) grava e recupera fatos com sucesso" "$MEMPALACE_OK"

# ------------------------------------------------------------------------------
# Teste 30: Mini-RAG Docs Engine (lib/rag-docs-engine.cjs)
# ------------------------------------------------------------------------------
RAG_TEST_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const RagDocs = require(path.join(libDir, "rag-docs-engine.cjs"));
const testDir = path.join(process.cwd(), ".agents", "temp-rag-test");
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, "test.md"), "# Regras do Pix\nO Pix deve ter estorno automatico.", "utf8");
const rag = new RagDocs(testDir);
rag.indexFiles(true);
const res = rag.query({ query: "estorno" });
fs.rmSync(testDir, { recursive: true, force: true });
if (res && res.results && res.results.length > 0) {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" 2>/dev/null || echo "")
RAG_OK=0
if [ "$RAG_TEST_RES" = "OK" ]; then
RAG_OK=1
fi
assert_test "Mini-RAG Docs Engine (lib/rag-docs-engine.cjs) indexa e busca trechos FTS5" "$RAG_OK"

# ------------------------------------------------------------------------------
# Teste 31: Lockfile Lens (lib/lockfile-lens.cjs)
# ------------------------------------------------------------------------------
LENS_TEST_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const Lens = require(path.join(libDir, "lockfile-lens.cjs"));
const testDir = path.join(process.cwd(), ".agents", "temp-lens-test");
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, "package.json"), JSON.stringify({ dependencies: { "express": "^4.18.2" } }), "utf8");
const lens = new Lens(testDir);
const res = lens.inspect("express");
fs.rmSync(testDir, { recursive: true, force: true });
if (res && res.found && res.details[0].package === "express") {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" 2>/dev/null || echo "")
LENS_OK=0
if [ "$LENS_TEST_RES" = "OK" ]; then
LENS_OK=1
fi
assert_test "Lockfile Lens (lib/lockfile-lens.cjs) detecta dependencias sem abrir lockfile" "$LENS_OK"

# ------------------------------------------------------------------------------
# Teste 32: Skeleton Engine (lib/skeleton-engine.cjs)
# ------------------------------------------------------------------------------
SKELETON_TEST_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const Skeleton = require(path.join(libDir, "skeleton-engine.cjs"));
const testDir = path.join(process.cwd(), ".agents", "temp-skel-test");
fs.mkdirSync(testDir, { recursive: true });
const dummyFile = path.join(testDir, "dummy.ts");
fs.writeFileSync(dummyFile, "export interface User { id: string; }\nexport function getUser() { return 1; }", "utf8");
const skel = new Skeleton(testDir);
const outline = skel.getOutline(dummyFile);
fs.rmSync(testDir, { recursive: true, force: true });
if (outline && outline.includes("export interface User") && outline.includes("export function getUser")) {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" 2>/dev/null || echo "")
SKELETON_OK=0
if [ "$SKELETON_TEST_RES" = "OK" ]; then
SKELETON_OK=1
fi
assert_test "Skeleton Engine (lib/skeleton-engine.cjs) extrai assinaturas com precisao" "$SKELETON_OK"

# ------------------------------------------------------------------------------
# Teste 33: MCP Server JSON-RPC Stdio (mcp-server.cjs)
# ------------------------------------------------------------------------------

MCP_TEST_RES=$(node -e '
const { spawn } = require("child_process");
const mcpBin = process.argv[1];
const proc = spawn("node", [mcpBin], { cwd: process.cwd() });
let output = "";
proc.stdout.on("data", d => output += d.toString());
proc.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n");
setTimeout(() => {
proc.kill();
if (output.includes("mempalace_recall") && output.includes("query_docs") && output.includes("check_dependency")) {
process.stdout.write("OK");
}
}, 600);
' "${MCP_BIN}" 2>/dev/null || echo "")
MCP_OK=0
if [ "$MCP_TEST_RES" = "OK" ]; then
MCP_OK=1
fi
assert_test "Servidor MCP Padronizado (mcp-server.cjs) responde tools/list via JSON-RPC" "$MCP_OK"

# ------------------------------------------------------------------------------
# Teste 34: MCP Server Dual-Mode CLI (run_command)
# ------------------------------------------------------------------------------
MCP_CLI_OUT=$(timeout 3s node "${MCP_BIN}" tools 2>/dev/null || echo "")
MCP_SKEL_OUT=$(timeout 3s node "${MCP_BIN}" skeleton "${MCP_BIN}" 2>/dev/null || echo "")
MCP_CLI_OK=0
if [[ "$MCP_CLI_OUT" == *"mempalace_recall"* ]] && [[ "$MCP_SKEL_OUT" == *"Skeleton Outline"* ]]; then
MCP_CLI_OK=1
fi
assert_test "Servidor MCP Dual-Mode atende chamadas diretas de CLI (tools e skeleton)" "$MCP_CLI_OK"

# ------------------------------------------------------------------------------
# Teste 34.1: Agentic Skill Retrieval (skill_search & activate via CLI e MCP)
# ------------------------------------------------------------------------------
rm -rf "${ACTIVE_SKILLS_DIR}/ponytail-debt" 2>/dev/null || true
SKILL_SEARCH_OUT=$(PROJECT_ROOT="${TARGET_DIR}" timeout 5s node "${MCP_BIN}" skill search "refatoracao" 2>/dev/null || echo "")
SKILL_ACTIVATE_OUT=$(PROJECT_ROOT="${TARGET_DIR}" timeout 5s node "${MCP_BIN}" skill activate "ponytail-debt" 2>/dev/null || echo "")
AGENTIC_RETRIEVAL_OK=0
if [[ "$SKILL_SEARCH_OUT" == *"Skill Retrieval"* ]] && [ -d "${ACTIVE_SKILLS_DIR}/ponytail-debt" ]; then
AGENTIC_RETRIEVAL_OK=1
fi
rm -rf "${ACTIVE_SKILLS_DIR}/ponytail-debt" 2>/dev/null || true
assert_test "Agentic Skill Retrieval (skill_search & activate) localiza por intenção e auto-promove JIT" "$AGENTIC_RETRIEVAL_OK"

# ------------------------------------------------------------------------------
# Teste 35: MCP Server CLI ast_query
# ------------------------------------------------------------------------------
AST_QUERY_OUT=$(timeout 5s node "${MCP_BIN}" ast "class \$NAME" js "${MCP_LIB_DIR}" 2>/dev/null || echo "")
AST_QUERY_OK=0
if [[ "$AST_QUERY_OUT" == *"AST Query"* ]] && [[ "$AST_QUERY_OUT" == *"correspondência"* ]]; then
AST_QUERY_OK=1
fi
assert_test "Tool ast_query nativa no MCP Server localiza padrões estruturais sem falhas de escape" "$AST_QUERY_OK"

# ------------------------------------------------------------------------------
# Teste 36: Test Isolate Engine (lib/test-isolate.cjs e CLI)
# ------------------------------------------------------------------------------
TEST_ISO_RES=$(node -e '
const path = require("path");
const libDir = process.argv[1];
const TestIsolate = require(path.join(libDir, "test-isolate.cjs"));
const t = new TestIsolate();
const out = "✖ Scenario 10 - Circuit Breaker (50ms)\nnot ok 2 - should retry";
const f = t.parseFailures(out);
if (f.length === 2 && f.includes("Scenario 10 - Circuit Breaker")) {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" 2>/dev/null || echo "")
TEST_ISO_OK=0
if [ "$TEST_ISO_RES" = "OK" ]; then
TEST_ISO_OK=1
fi
assert_test "Test Isolate Engine (lib/test-isolate.cjs) extrai falhas pontuais para reexecução cirúrgica" "$TEST_ISO_OK"

# ------------------------------------------------------------------------------
# Teste 37: Checkpoint Engine (lib/checkpoint-engine.cjs)
# ------------------------------------------------------------------------------
CHK_RES=$(node -e '
const path = require("path");
const libDir = process.argv[1];
const Checkpoint = require(path.join(libDir, "checkpoint-engine.cjs"));
const c = new Checkpoint();
const list = c.listCheckpoints();
if (Array.isArray(list)) {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" 2>/dev/null || echo "")
CHK_OK=0
if [ "$CHK_RES" = "OK" ]; then
CHK_OK=1
fi
assert_test "Checkpoint Engine (lib/checkpoint-engine.cjs) gerencia micro-checkpoints para rollback seguro" "$CHK_OK"

# ------------------------------------------------------------------------------
# Teste 38: Skeleton Engine Multi-Stack (PHP, Ruby, Dart, Elixir)
# ------------------------------------------------------------------------------
SKEL_MULTI_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const Skeleton = require(path.join(libDir, "skeleton-engine.cjs"));
const targetDir = process.argv[2];
const skel = new Skeleton(targetDir);
const testDir = path.join(targetDir, ".agents", "temp-multi-test");
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
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
SKEL_MULTI_OK=0
if [ "$SKEL_MULTI_RES" = "OK" ]; then
SKEL_MULTI_OK=1
fi
assert_test "Skeleton Engine suporta extração estrutural em PHP, Ruby, Dart e Elixir" "$SKEL_MULTI_OK"

# ------------------------------------------------------------------------------
# Teste 39: Lockfile Lens Multi-Stack (PHP, Ruby, Dart)
# ------------------------------------------------------------------------------
LENS_MULTI_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const Lens = require(path.join(libDir, "lockfile-lens.cjs"));
const targetDir = process.argv[2];
const testDir = path.join(targetDir, ".agents", "temp-lens-multi");
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
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
LENS_MULTI_OK=0
if [ "$LENS_MULTI_RES" = "OK" ]; then
LENS_MULTI_OK=1
fi
assert_test "Lockfile Lens inspeciona dependências PHP (composer), Ruby (Gemfile) e Dart (pubspec)" "$LENS_MULTI_OK"

# ------------------------------------------------------------------------------
# Teste 40: Greenfield vs Brownfield Protocol Generator (patch-agents.cjs)
# ------------------------------------------------------------------------------
PROTO_TEST_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const patchPath = process.argv[1];
const targetDir = process.argv[2];
const testDir = path.join(targetDir, ".agents", "temp-proto-test");
fs.mkdirSync(path.join(testDir, ".agents", "agents"), { recursive: true });
fs.writeFileSync(path.join(testDir, ".agents", "agents", "gsd-executor.md"), "---\nname: gsd-executor\ntools:\n  - view_file\n---\nExecutor", "utf8");
execSync(`node "${patchPath}" "${testDir}"`, { stdio: "ignore" });
const content = fs.readFileSync(path.join(testDir, ".agents", "agents", "gsd-executor.md"), "utf8");
fs.rmSync(testDir, { recursive: true, force: true });
if (content.includes("GREENFIELD FAST-TRACK") && content.includes("mode=\"greenfield\"")) {
process.stdout.write("OK");
}
' "${PATCH_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
PROTO_OK=0
if [ "$PROTO_TEST_RES" = "OK" ]; then
PROTO_OK=1
fi
assert_test "Normalizador detecta maturidade de projeto e injeta protocolo Greenfield Fast-Track" "$PROTO_OK"

# ------------------------------------------------------------------------------
# Teste 41: Smart-Assist Proactive Auto-Slicing Mode (res.overwrite)
# ------------------------------------------------------------------------------
AUTO_SLICE_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const hookPath = process.argv[1];
const targetDir = process.argv[2];
const dummyFile = path.join(targetDir, ".agents", "temp-slice-test.js");
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
' "${HOOK_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
AUTO_SLICE_OK=0
if [ "$AUTO_SLICE_RES" = "OK" ]; then
AUTO_SLICE_OK=1
fi
assert_test "Hook PreToolUse auto-corrige range excessivo via overwrite em modo smart-assist" "$AUTO_SLICE_OK"

# ------------------------------------------------------------------------------
# Teste 42: Blindagem de Índices (.graphifyignore e .astgrepignore)
# ------------------------------------------------------------------------------
IGNORE_TEMPLATES_OK=0
if [ -f "${TARGET_DIR}/.graphifyignore" ] && [ -f "${TARGET_DIR}/.astgrepignore" ] && \
grep -q "graphify-out/" "${TARGET_DIR}/.graphifyignore" && \
grep -q "graphify-out/" "${TARGET_DIR}/.astgrepignore"; then
IGNORE_TEMPLATES_OK=1
elif [ -f "${SCRIPT_DIR}/.graphifyignore" ] && [ -f "${SCRIPT_DIR}/.astgrepignore" ] && \
grep -q "graphify-out/" "${SCRIPT_DIR}/.graphifyignore" && \
grep -q "graphify-out/" "${SCRIPT_DIR}/.astgrepignore"; then
IGNORE_TEMPLATES_OK=1
fi
assert_test "Arquivos de blindagem de índices (.graphifyignore e .astgrepignore) presentes e com graphify-out/" "$IGNORE_TEMPLATES_OK"

# ------------------------------------------------------------------------------
# Teste 43: Multi-LSP Hybrid Engine (lib/lsp-engine.cjs) - Definition, References, Hover, Diagnostics, Rename
# ------------------------------------------------------------------------------
LSP_ENGINE_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const targetDir = process.argv[2];
const LspEngine = require(path.join(libDir, "lsp-engine.cjs"));
const testDir = path.join(targetDir, ".agents", "temp-lsp-test");
fs.mkdirSync(testDir, { recursive: true });
fs.writeFileSync(path.join(testDir, "service.ts"), "// Docstring for PaymentProcessor\nexport class PaymentProcessor {\n  processOrder() { return true; }\n}\nconst p = new PaymentProcessor();\n", "utf8");
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
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
LSP_ENGINE_OK=0
if [ "$LSP_ENGINE_RES" = "OK" ]; then
LSP_ENGINE_OK=1
fi
assert_test "Motor Multi-LSP Híbrido (lib/lsp-engine.cjs) resolve definition, references, hover, diagnostics e rename" "$LSP_ENGINE_OK"

# ------------------------------------------------------------------------------
# Teste 44: MCP Server CLI Multi-LSP Subcommands (node mcp-server.cjs lsp ...)
# ------------------------------------------------------------------------------
MCP_LSP_DEF_OUT=$(timeout 5s node "${MCP_BIN}" lsp definition "LspEngine" "${MCP_LIB_DIR}/lsp-engine.cjs" 2>/dev/null || echo "")
MCP_LSP_DIAG_OUT=$(timeout 5s node "${MCP_BIN}" lsp diagnostics "${MCP_BIN}" 2>/dev/null || echo "")
MCP_LSP_CLI_OK=0
if [[ "$MCP_LSP_DEF_OUT" == *"LSP Definition"* ]] && [[ "$MCP_LSP_DIAG_OUT" == *"Zero erros"* ]]; then
MCP_LSP_CLI_OK=1
fi
assert_test "CLI Dual-Mode (mcp-server.cjs lsp) responde comandos definition e diagnostics com precisão" "$MCP_LSP_CLI_OK"

# ------------------------------------------------------------------------------
# Teste 45: Auto-Isolamento Proativo de Testes no PreToolUse (res.overwrite)
# ------------------------------------------------------------------------------
PROACTIVE_ISO_RES=$(node -e '
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
' "${HOOK_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
PROACTIVE_ISO_OK=0
if [ "$PROACTIVE_ISO_RES" = "OK" ]; then
PROACTIVE_ISO_OK=1
fi
assert_test "Hook PreToolUse reescreve suite global de testes para teste isolado via overwrite quando ha falha recente" "$PROACTIVE_ISO_OK"

# ------------------------------------------------------------------------------
# Teste 46: Gate Anti-Parada Prematura no Stop Hook (Auto-Verify TDD/LSP + Anti-Loop)
# ------------------------------------------------------------------------------
STOP_GATE_RES=$(node -e '
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
' "${TARGET_DIR}/.agents/hooks/token-guard-diagnostics.cjs" "${TARGET_DIR}" 2>/dev/null || echo "")
STOP_GATE_OK=0
if [ "$STOP_GATE_RES" = "OK" ]; then
STOP_GATE_OK=1
fi
assert_test "Hook Stop bloqueia parada prematura com teste quebrado (decision: continue) e respeita trava anti-loop" "$STOP_GATE_OK"

# ------------------------------------------------------------------------------
# Teste 47: Detector de Loop de Alucinacao no PreInvocation (injectSteps)
# ------------------------------------------------------------------------------
LOOP_DETECT_RES=$(node -e '
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
' "${TARGET_DIR}/.agents/hooks/token-guard-preinvocation.cjs" "${TARGET_DIR}" 2>/dev/null || echo "")
LOOP_DETECT_OK=0
if [ "$LOOP_DETECT_RES" = "OK" ]; then
LOOP_DETECT_OK=1
fi
assert_test "Hook PreInvocation detecta loop de 3+ falhas seguidas e injeta ephemeralMessage corretivo" "$LOOP_DETECT_OK"

# ------------------------------------------------------------------------------
# Teste 48: Briefing Zero-Read na Inicializacao (SessionStart Hook)
# ------------------------------------------------------------------------------
SESSION_START_HOOK="${TARGET_DIR}/.agents/hooks/token-guard-sessionstart.cjs"
if [ ! -f "${SESSION_START_HOOK}" ]; then
SESSION_START_HOOK="${SCRIPT_DIR}/hooks/token-guard-sessionstart.cjs"
fi
SESSION_START_OUT=$(echo '{}' | node "${SESSION_START_HOOK}" 2>/dev/null || echo "{}")
SESSION_START_OK=0
if echo "${SESSION_START_OUT}" | grep -q '"injectSteps"' && echo "${SESSION_START_OUT}" | grep -q 'Zero-Read'; then
SESSION_START_OK=1
fi
assert_test "Hook SessionStart (token-guard-sessionstart.cjs) injeta Briefing Zero-Read na inicializacao" "$SESSION_START_OK"

# ------------------------------------------------------------------------------
# Teste 49: Tools MCP impact_analysis + env_skeleton e Secret Shield no PreToolUse
# ------------------------------------------------------------------------------
IMPACT_ENV_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const libDir = process.argv[1];
const hookPath = process.argv[2];
const targetDir = process.argv[3];
const EnvSkeletonEngine = require(path.join(libDir, "env-skeleton.cjs"));
const ImpactEngine = require(path.join(libDir, "impact-engine.cjs"));

const tempEnvDir = path.join(targetDir, ".agents", "temp-env-test");
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
' "${MCP_LIB_DIR}" "${HOOK_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
IMPACT_ENV_OK=0
if [ "$IMPACT_ENV_RES" = "OK" ]; then
IMPACT_ENV_OK=1
fi
assert_test "Tools impact_analysis e env_skeleton operacionais com Secret Shield bloqueando leitura crua de .env" "$IMPACT_ENV_OK"

# ------------------------------------------------------------------------------
# Teste 50: Telemetria de ROI & Economia Ativa (lib/token-savings.cjs e token-report.cjs)
# ------------------------------------------------------------------------------
ROI_TEST_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const libDir = process.argv[1];
const targetDir = process.argv[2];
const { TokenSavingsTracker } = require(path.join(libDir, "token-savings.cjs"));
const tempRoiDir = path.join(targetDir, ".agents", "temp-roi-test");
fs.mkdirSync(path.join(tempRoiDir, ".agents", ".cache"), { recursive: true });
const tracker = new TokenSavingsTracker(tempRoiDir);
tracker.record("pretool_redirect", 1500, "test redirect");
tracker.record("test_isolation", 900, "pytest isolated");
const summary = tracker.getSummary();
fs.rmSync(tempRoiDir, { recursive: true, force: true });
if (summary.totalTokensSaved === 2400 && summary.totalEvents === 2 && summary.topCategories.length === 2) {
process.stdout.write("OK");
}
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
ROI_OK=0
if [ "$ROI_TEST_RES" = "OK" ]; then
ROI_OK=1
fi
assert_test "Rastreador de ROI (lib/token-savings.cjs) contabiliza tokens poupados por categoria com precisao" "$ROI_OK"

# ------------------------------------------------------------------------------
# Teste 51: Catálogo Multi-LSP 20 Ecossistemas & Esqueletos Infra/Web/Dados
# ------------------------------------------------------------------------------
MULTI_LSP20_RES=$(node -e '
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

const tempDir = path.join(targetDir, ".agents", "temp-lsp20-test");
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
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
MULTI_LSP20_OK=0
if [ "$MULTI_LSP20_RES" = "OK" ]; then
MULTI_LSP20_OK=1
fi
assert_test "Catálogo Multi-LSP 20 ecossistemas (vtsls, basedpyright, roslyn, lua, bash, web, yaml, sql, docker, terraform) operacional" "$MULTI_LSP20_OK"

# ------------------------------------------------------------------------------
# Teste 52: Controle Rigoroso de Erros (ErrorGuard, Triple Visibility, Circuit Breaker e Diagnóstico Estrito)
# ------------------------------------------------------------------------------
STRICT_ERROR_RES=$(node -e '
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
const testDir = path.join(targetDir, ".agents", "temp-err-test");
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
} else {
process.stderr.write(JSON.stringify({ secretSafe, recorded, cleared, bannerOk, lspErrorOk, healthOk }));
}
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
STRICT_ERROR_OK=0
if [ "$STRICT_ERROR_RES" = "OK" ]; then
STRICT_ERROR_OK=1
fi
assert_test "Controle Rigoroso de Erros (ErrorGuard, Triple Visibility, Circuit Breaker e Diagnóstico Estrito)" "$STRICT_ERROR_OK"

# ------------------------------------------------------------------------------
# ------------------------------------------------------------------------------
# Teste 52: Motores Nativos Caveman & Ponytail (codebase-map e caveman-shrink)
# ------------------------------------------------------------------------------
ENGINES_TEST_RES=$(node -e '
const path = require("path");
const fs = require("fs");
const libDir = process.argv[1];
const targetDir = process.argv[2];

const CodebaseMap = require(path.join(libDir, "codebase-map.cjs"));
const CavemanShrink = require(path.join(libDir, "caveman-shrink.cjs"));

// 1. Validar Codebase Map
const mapOut = (CodebaseMap.generateMap || CodebaseMap.buildCodebaseMap)(targetDir, { maxChars: 2000 });
const mapOk = typeof mapOut === "string" && mapOut.length > 0 && mapOut.length <= 2000 && mapOut.includes("•");

// 2. Validar Caveman Shrink sanitização
const sampleChat = "Sure! I would be happy to help you with that.\n" + "```js\nconsole.log(1);\n```\n" + "Let me know if you need anything else!";
const sanitized = CavemanShrink.sanitizeChatOutput(sampleChat);
const shrinkOk = !sanitized.includes("Sure!") && !sanitized.includes("happy to help") && sanitized.includes("console.log(1)");

// 3. Validar Caveman Shrink compressão de markdown
const sampleMd = "# Heading\n\n\n\nSome text here with extra blanks.\n\n\n";
const compressed = CavemanShrink.compressMarkdown(sampleMd);
const compressOk = compressed.length < sampleMd.length;

if (mapOk && shrinkOk && compressOk) {
  process.stdout.write("OK");
} else {
  process.stderr.write(JSON.stringify({ mapOk, shrinkOk, compressOk, mapLen: mapOut.length }));
}
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
ENGINES_OK=0
if [ "$ENGINES_TEST_RES" = "OK" ]; then
  ENGINES_OK=1
fi
assert_test "Motores Nativos Ponytail (codebase-map) e Caveman (caveman-shrink) operacionais sob teto de tokens" "$ENGINES_OK"

# ------------------------------------------------------------------------------
# Teste 53: Servidor MCP & Comandos CLI para Ponytail e Caveman (map, debt, shrink)
# ------------------------------------------------------------------------------
MCP_PONYCAVE_RES=$(node -e '
const { execSync } = require("child_process");
const mcpBin = process.argv[1];
const targetDir = process.argv[2];

try {
  // Teste CLI: map
  const mapOut = execSync(`node "${mcpBin}" map "${targetDir}"`, { encoding: "utf8" });
  const mapCliOk = mapOut.includes("Codebase Map") || mapOut.includes("•");

  // Teste CLI: debt
  const debtOut = execSync(`node "${mcpBin}" debt "${targetDir}"`, { encoding: "utf8" });
  const debtCliOk = typeof debtOut === "string";

  // Teste CLI: shrink com arquivo de teste
  const tmpFile = require("path").join(targetDir, ".agents", "temp-shrink-cli-test.md");
  require("fs").writeFileSync(tmpFile, "# Title\n\n\nText\n\n", "utf8");
  const shrinkOut = execSync(`node "${mcpBin}" shrink "${tmpFile}"`, { encoding: "utf8" });
  require("fs").rmSync(tmpFile, { force: true });
  const shrinkCliOk = shrinkOut.includes("Caveman Shrink") && shrinkOut.includes("comprimido");

  if (mapCliOk && debtCliOk && shrinkCliOk) {
    process.stdout.write("OK");
  } else {
    process.stderr.write(JSON.stringify({ mapCliOk, debtCliOk, shrinkCliOk }));
  }
} catch (e) {
  process.stderr.write(e.message);
}
' "${MCP_BIN}" "${TARGET_DIR}" 2>/dev/null || echo "")
MCP_PONYCAVE_OK=0
if [ "$MCP_PONYCAVE_RES" = "OK" ]; then
  MCP_PONYCAVE_OK=1
fi
assert_test "Ferramentas MCP & CLI para Ponytail e Caveman (map, debt, shrink) respondem com exito" "$MCP_PONYCAVE_OK"

# ------------------------------------------------------------------------------
# Teste 54: Suíte Integral de Skills Ponytail e Caveman (16 skills) com Frontmatter
# ------------------------------------------------------------------------------
PONY_CAVE_SKILLS=(
  "ponytail" "ponytail-review" "ponytail-audit" "ponytail-debt" "ponytail-help"
  "caveman" "ultracave" "caveman-review" "caveman-commit" "caveman-compress" "caveman-help"
  "investigate-first" "lean-build" "surgical-patch" "safe-refactor" "verify-and-stop"
)
ALL_PONYCAVE_SKILLS_OK=1
for sk in "${PONY_CAVE_SKILLS[@]}"; do
  sk_path=""
  if [ -f "${KIT_DIR}/skills/${sk}/SKILL.md" ]; then
    sk_path="${KIT_DIR}/skills/${sk}/SKILL.md"
  elif [ -f "${TARGET_DIR}/.agents/skills/${sk}/SKILL.md" ]; then
    sk_path="${TARGET_DIR}/.agents/skills/${sk}/SKILL.md"
  elif [ -f "${TARGET_DIR}/.agents/skills-pool/${sk}/SKILL.md" ]; then
    sk_path="${TARGET_DIR}/.agents/skills-pool/${sk}/SKILL.md"
  else
    sk_path="${SCRIPT_DIR}/skills/${sk}/SKILL.md"
  fi
  if [ ! -f "$sk_path" ] || ! grep -q "name:\s*${sk}" "$sk_path" 2>/dev/null; then
    ALL_PONYCAVE_SKILLS_OK=0
    break
  fi
done
assert_test "Suíte completa Ponytail e Caveman (${#PONY_CAVE_SKILLS[@]} skills) presente com frontmatter valido" "$ALL_PONYCAVE_SKILLS_OK"

# ------------------------------------------------------------------------------
# Teste 55: Subagentes Cavecrew e Protocolo Integrado Ponytail/Caveman
# ------------------------------------------------------------------------------
CAVECREW_AGENTS=("cavecrew-investigator.md" "cavecrew-builder.md" "cavecrew-reviewer.md")
CAVECREW_OK=1
for ca in "${CAVECREW_AGENTS[@]}"; do
  ca_path=""
  if [ -f "${TARGET_DIR}/.agents/agents-pool/${ca}" ]; then
    ca_path="${TARGET_DIR}/.agents/agents-pool/${ca}"
  elif [ -f "${TARGET_DIR}/.agents/agents/${ca}" ]; then
    ca_path="${TARGET_DIR}/.agents/agents/${ca}"
  elif [ -f "${KIT_DIR}/subagents/${ca}" ]; then
    ca_path="${KIT_DIR}/subagents/${ca}"
  else
    ca_path="${SCRIPT_DIR}/subagents/${ca}"
  fi
  if [ ! -f "$ca_path" ]; then
    CAVECREW_OK=0
    break
  fi
  if grep -q "ANTIGRAVITY_TOKEN_PROTOCOL_START" "$ca_path" 2>/dev/null; then
    if ! grep -q "ESCADA DE DECISÃO" "$ca_path" 2>/dev/null; then
      CAVECREW_OK=0
      break
    fi
  elif ! grep -q "Voz ultraconcisa" "$ca_path" 2>/dev/null; then
    CAVECREW_OK=0
    break
  fi
done
assert_test "Subagentes Cavecrew (${#CAVECREW_AGENTS[@]} agentes) integrados com protocolo Ponytail & Caveman" "$CAVECREW_OK"

# ------------------------------------------------------------------------------
# Teste 56: Rastreamento em Tempo Real de Modos (/caveman e /ponytail) no PreInvocation
# ------------------------------------------------------------------------------
TRACKER_TEST_RES=$(node -e '
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

  // Verificar gravação no disco
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
  } else {
    process.stderr.write(JSON.stringify({ ok1, ok2, ok3, ok4 }));
  }
} catch (e) {
  process.stderr.write(e.message);
}
' "${PRE_INVOC_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
TRACKER_OK=0
if [ "$TRACKER_TEST_RES" = "OK" ]; then
  TRACKER_OK=1
fi
assert_test "PreInvocation Hook intercepta comandos de modo (/caveman e /ponytail) com confirmacao efemera" "$TRACKER_OK"

# ------------------------------------------------------------------------------
# Teste 57: v2.5.0 - MCP Server resiliencia camelCase (filePath), ast_query 0-match e quick_verify isError:false
# ------------------------------------------------------------------------------
MCP_V250_RES=$(node -e '
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const mcpBin = process.argv[1];
const targetDir = process.argv[2];

const tempDir = path.join(targetDir, ".agents", "temp-v250-mcp");
fs.mkdirSync(path.join(tempDir, "src"), { recursive: true });
const sampleJs = path.join(tempDir, "src", "sample.js");
fs.writeFileSync(sampleJs, "function alpha() { return 1; }\nmodule.exports = { alpha };\n", "utf8");
fs.writeFileSync(path.join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(1)\"" } }), "utf8");

const proc = spawn("node", [mcpBin], { cwd: tempDir, env: { ...process.env, PROJECT_ROOT: tempDir } });
let output = "";
proc.stdout.on("data", d => output += d.toString());

const reqs = [
  { jsonrpc: "2.0", id: 101, method: "tools/call", params: { name: "view_skeleton", arguments: { filePath: sampleJs } } },
  { jsonrpc: "2.0", id: 102, method: "tools/call", params: { name: "ast_query", arguments: { pattern: "function nonexistentSymbolXYZ($$$)", lang: "js", path: sampleJs } } },
  { jsonrpc: "2.0", id: 103, method: "tools/call", params: { name: "quick_verify", arguments: {} } }
];
for (const r of reqs) proc.stdin.write(JSON.stringify(r) + "\n");

setTimeout(() => {
  proc.kill();
  fs.rmSync(tempDir, { recursive: true, force: true });
  const lines = output.trim().split("\n").filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  const r101 = lines.find(x => x.id === 101);
  const r102 = lines.find(x => x.id === 102);
  const r103 = lines.find(x => x.id === 103);
  const skelOk = r101 && r101.result && !r101.result.isError && JSON.stringify(r101.result).includes("alpha");
  const astZeroOk = r102 && r102.result && r102.result.isError === false;
  const verifyNoErrOk = r103 && r103.result && r103.result.isError === false && JSON.stringify(r103.result).includes("FAIL");
  if (skelOk && astZeroOk && verifyNoErrOk) {
    process.stdout.write("OK");
  } else {
    process.stderr.write(JSON.stringify({ skelOk, astZeroOk, verifyNoErrOk }));
  }
}, 1500);
' "${MCP_BIN}" "${TARGET_DIR}" 2>/dev/null || echo "")
MCP_V250_OK=0
if [ "$MCP_V250_RES" = "OK" ]; then
  MCP_V250_OK=1
fi
assert_test "MCP v2.5.0 aceita alias camelCase (filePath) e evita falsos isError em ast_query (0 matches) e quick_verify" "$MCP_V250_OK"

# ------------------------------------------------------------------------------
# Teste 58: v2.5.0 - gsd-read-strip.cjs preserva numeracao original de linhas e // shortcut:
# ------------------------------------------------------------------------------
STRIP_V250_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const stripBin = process.argv[1];
const targetDir = process.argv[2];

const tmpJs = path.join(targetDir, ".agents", "temp-strip-v250.js");
const src = [
  "/**",
  " * Multi-line docstring",
  " * Line 3",
  " */",
  "// Regular comment to strip",
  "function calc(x) {",
  "  // shortcut: inline cap for MVP, extract policy table on v2",
  "  return x * 2;",
  "}"
].join("\n");
fs.writeFileSync(tmpJs, src, "utf8");
const out = execFileSync("node", [stripBin, tmpJs], { encoding: "utf8" });
fs.rmSync(tmpJs, { force: true });

const hasLine6 = out.includes("6: function calc(x) {");
const hasShortcut7 = out.includes("7:   // shortcut: inline cap for MVP");
const hasLine8 = out.includes("8:   return x * 2;");
const strippedDoc = !out.includes("Multi-line docstring") && !out.includes("Regular comment");
if (hasLine6 && hasShortcut7 && hasLine8 && strippedDoc) {
  process.stdout.write("OK");
}
' "$(find_kit_script "gsd-read-strip.cjs")" "${TARGET_DIR}" 2>/dev/null || echo "")
STRIP_V250_OK=0
if [ "$STRIP_V250_RES" = "OK" ]; then
  STRIP_V250_OK=1
fi
assert_test "gsd-read-strip.cjs preserva numeros de linha originais (1-based) e comentarios // shortcut:" "$STRIP_V250_OK"

# ------------------------------------------------------------------------------
# Teste 59: v2.5.0 - Deduplicacao em janela com sub-range e bloqueio de leitura interna .agents/lib/
# ------------------------------------------------------------------------------
DEDUP_SHIELD_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const hookPath = process.argv[1];
const targetDir = process.argv[2];

const fileA = path.join(targetDir, ".agents", "temp-dedup-a.js");
const fileB = path.join(targetDir, ".agents", "temp-dedup-b.js");
const recentReadsPath = path.join(targetDir, ".agents", ".cache", "recent-reads.json");
fs.writeFileSync(fileA, Array(60).fill("const x = 1;").join("\n"), "utf8");
fs.writeFileSync(fileB, Array(30).fill("const y = 2;").join("\n"), "utf8");
try { fs.unlinkSync(recentReadsPath); } catch {}

const runHook = (payload) => JSON.parse(execSync(`node "${hookPath}"`, {
  input: JSON.stringify(payload),
  cwd: targetDir,
  env: { ...process.env, PROJECT_ROOT: targetDir },
  encoding: "utf8"
}).trim());

try {
  // 1. Ler fileA [1..50] -> allow
  const r1 = runHook({ toolCall: { name: "read_file", args: { Path: fileA, StartLine: 1, EndLine: 50 } } });
  // 2. Ler fileB [1..20] -> allow (intercalado)
  const r2 = runHook({ toolCall: { name: "read_file", args: { Path: fileB, StartLine: 1, EndLine: 20 } } });
  // 3. Reler sub-range de fileA [10..30] -> deve bloquear via dedup em janela!
  const r3 = runHook({ toolCall: { name: "read_file", args: { Path: fileA, StartLine: 10, EndLine: 30 } } });
  // 4. Tentar ler motor interno .agents/lib/complexity-guard.cjs -> deve bloquear!
  const r4 = runHook({ toolCall: { name: "view_file", args: { AbsolutePath: ".agents/lib/complexity-guard.cjs", StartLine: 1, EndLine: 30 } } });

  if (r1.decision === "allow" && r2.decision === "allow" && r3.decision === "deny" && r4.decision === "deny") {
    process.stdout.write("OK");
  } else {
    process.stderr.write(JSON.stringify({ r1: r1.decision, r2: r2.decision, r3: r3.decision, r4: r4.decision }));
  }
} finally {
  fs.rmSync(fileA, { force: true });
  fs.rmSync(fileB, { force: true });
  try { fs.unlinkSync(recentReadsPath); } catch {}
}
' "${HOOK_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
DEDUP_SHIELD_OK=0
if [ "$DEDUP_SHIELD_RES" = "OK" ]; then
  DEDUP_SHIELD_OK=1
fi
assert_test "Hook PreToolUse bloqueia releitura de sub-range intercalada (dedup em janela) e protege .agents/lib/" "$DEDUP_SHIELD_OK"

# ------------------------------------------------------------------------------
# Teste 60: SkeletonEngine v2 extrai metodos de classe JS, rotas Express e module.exports
# ------------------------------------------------------------------------------
SKEL_V2_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const SkeletonEngine = require(path.join(process.argv[1], "skeleton-engine.cjs"));
const targetDir = process.argv[2];
const tmpJs = path.join(targetDir, ".agents", "temp-skel-v2.js");
fs.writeFileSync(tmpJs, [
  "class TelemetryHub {",
  "  constructor(db) { this.db = db; }",
  "  async ingestEvent(payload) {",
  "    if (payload) { return true; }",
  "  }",
  "}",
  "const parsePrefix = (raw) => String(raw).trim();",
  "app.post(\"/api/telemetry\", (req, res) => res.json({ ok: true }));",
  "module.exports = { TelemetryHub, parsePrefix };"
].join("\n"), "utf8");
try {
  const sk = new SkeletonEngine(targetDir);
  const out = sk.getOutline(tmpJs);
  const ok = out.includes("1: class TelemetryHub") &&
    out.includes("2:   constructor(db)") &&
    out.includes("3:   async ingestEvent(payload)") &&
    !out.includes("if (payload)") &&
    out.includes("7: const parsePrefix =") &&
    out.includes("8: app.post(\"/api/telemetry\"") &&
    out.includes("9: module.exports =");
  if (ok) process.stdout.write("OK");
} finally {
  fs.rmSync(tmpJs, { force: true });
}
' "${MCP_LIB_DIR}" "${TARGET_DIR}" 2>/dev/null || echo "")
SKEL_V2_OK=0
[ "$SKEL_V2_RES" = "OK" ] && SKEL_V2_OK=1
assert_test "SkeletonEngine v2 extrai metodos de classe JS, rotas Express, arrow functions e module.exports" "$SKEL_V2_OK"

# ------------------------------------------------------------------------------
# Teste 61: Ponte PostToolUse -> PreInvocation (pending-edit-lint.json) e lastUserInput fast-exit
# ------------------------------------------------------------------------------
BRIDGE_LINT_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const diagHook = process.argv[1];
const preInvHook = process.argv[2];
const targetDir = process.argv[3];

const badFile = path.join(targetDir, ".agents", "temp-bad-sql.js");
fs.writeFileSync(badFile, "function q(id) { return db.prepare(`SELECT * FROM users WHERE id = ${id}`); }\n", "utf8");

try {
  // 1. Disparar PostToolUse simulando edicao com SQLi
  execFileSync("node", [diagHook], {
    input: JSON.stringify({ toolCall: { name: "edit_file", args: { Path: badFile } } }),
    cwd: targetDir,
    encoding: "utf8"
  });
  // 2. Disparar PreInvocation com lastUserInput e medir latencia + injecao efemera
  const t0 = Date.now();
  const out = execFileSync("node", [preInvHook], {
    input: JSON.stringify({ lastUserInput: "continue" }),
    cwd: targetDir,
    encoding: "utf8"
  });
  const elapsed = Date.now() - t0;
  const parsed = JSON.parse(out.trim());
  const msg = parsed.injectSteps && parsed.injectSteps[0] ? parsed.injectSteps[0].ephemeralMessage : "";
  // 3. Segunda chamada deve vir limpa (consumo unico sem bloat)
  const out2 = execFileSync("node", [preInvHook], {
    input: JSON.stringify({ lastUserInput: "continue" }),
    cwd: targetDir,
    encoding: "utf8"
  });
  const parsed2 = JSON.parse(out2.trim());
  const cleared = !parsed2.injectSteps;

  if (msg.includes("Auto-Linter") && msg.includes("SQLi") && cleared && elapsed < 250) {
    process.stdout.write("OK");
  }
} finally {
  fs.rmSync(badFile, { force: true });
  try { fs.unlinkSync(path.join(targetDir, ".agents", ".cache", "pending-edit-lint.json")); } catch {}
  try { fs.unlinkSync(path.join(targetDir, ".agents", ".cache", "session-modified-files.json")); } catch {}
  try { fs.unlinkSync(path.join(targetDir, ".agents", ".cache", "session-incidents.json")); } catch {}
  try { fs.unlinkSync(path.join(targetDir, ".agents", ".cache", "error-guard.json")); } catch {}
}
' "${TARGET_DIR}/.agents/hooks/token-guard-diagnostics.cjs" "${PRE_INVOC_PATH}" "${TARGET_DIR}" 2>/dev/null || echo "")
BRIDGE_LINT_OK=0
[ "$BRIDGE_LINT_RES" = "OK" ] && BRIDGE_LINT_OK=1
assert_test "Ponte PostToolUse -> PreInvocation injeta alerta efemero de linter em 1 turno com fast-exit stdin" "$BRIDGE_LINT_OK"

# ------------------------------------------------------------------------------
# Teste 62: AmbiguityGuard + verify.cjs paridade estrita (detecta AMB-03 omitido e smells)
# ------------------------------------------------------------------------------
AMB_VERIFY_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const verifyRunner = require(process.argv[1]);
const targetDir = process.argv[2];

const tmpWs = path.join(targetDir, ".agents", "temp-verify-amb");
fs.mkdirSync(path.join(tmpWs, "src"), { recursive: true });
fs.writeFileSync(path.join(tmpWs, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }), "utf8");
fs.writeFileSync(path.join(tmpWs, "src", "index.js"), "function ok(a) { return a + 1; }\nmodule.exports = { ok };\n", "utf8");
fs.writeFileSync(path.join(tmpWs, "TASK.md"), [
  "# Task Spec",
  "- **[AMB-01]** Fuso horario UTC-3 vs horario local no corte noturno.",
  "- **[AMB-02]** Arredondamento contabil vs truncamento bancario de centavos.",
  "- **[AMB-03]** Tratamento de descarte ou dead-letter para prefixos de veiculos nao homologados na frota."
].join("\n"), "utf8");

// Caso 1: AMBIGUITIES.md omitindo o tema de AMB-03 (substituido por idempotencia generica)
fs.writeFileSync(path.join(tmpWs, "AMBIGUITIES.md"), [
  "### AMB-01: Corte Noturno Fuso Horario",
  "Identificada indefinicao entre fuso UTC-3 e horario local no cancelamento noturno. Decisao adotada: converter para UTC.",
  "",
  "### AMB-02: Truncamento Bancario de Centavos",
  "Identificada divergencia entre arredondamento contabil e truncamento bancario de centavos. Decisao adotada: truncar centavos.",
  "",
  "### AMB-03: Idempotencia de Eventos Duplicados",
  "Identificada indefinicao em eventos repetidos com mesma chave de transacao. Decisao adotada: retornar registro existente."
].join("\n"), "utf8");

try {
  const rFail = verifyRunner.runFullVerification(tmpWs);
  // Caso 2: Corrigir AMB-03 com os termos do dominio
  fs.writeFileSync(path.join(tmpWs, "AMBIGUITIES.md"), [
    "### AMB-01: Corte Noturno Fuso Horario",
    "Identificada indefinicao entre fuso UTC-3 e horario local no cancelamento noturno. Decisao adotada: converter para UTC.",
    "",
    "### AMB-02: Truncamento Bancario de Centavos",
    "Identificada divergencia entre arredondamento contabil e truncamento bancario de centavos. Decisao adotada: truncar centavos.",
    "",
    "### AMB-03: Prefixos de Veiculos Nao Homologados na Frota",
    "Identificada indefinicao entre descarte imediato ou envio para dead-letter de prefixos de veiculos nao homologados na frota. Decisao: rejeitar com 422 e registrar em dead-letter."
  ].join("\n"), "utf8");
  const rPass = verifyRunner.runFullVerification(tmpWs);

  if (rFail.ready_to_complete === false && rFail.status === "FAIL_AMBIGUITIES" && rPass.ready_to_complete === true && rPass.status === "PASS") {
    process.stdout.write("OK");
  }
} finally {
  fs.rmSync(tmpWs, { recursive: true, force: true });
}
' "$(find_kit_script "verify.cjs")" "${TARGET_DIR}" 2>/dev/null || echo "")
AMB_VERIFY_OK=0
[ "$AMB_VERIFY_RES" = "OK" ] && AMB_VERIFY_OK=1
assert_test "verify.cjs e AmbiguityGuard reprovam desvio tematico de AMB-XX do TASK.md e aprovam paridade 1-para-1" "$AMB_VERIFY_OK"

# ------------------------------------------------------------------------------
# Teste 63: SessionStart injeta Blueprint PLAN.md quando presente na raiz
# ------------------------------------------------------------------------------
SESS_PLAN_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const sessHook = process.argv[1];
const targetDir = process.argv[2];

const planPath = path.join(targetDir, "PLAN.md");
const hadPlan = fs.existsSync(planPath);
const backupPlan = hadPlan ? fs.readFileSync(planPath, "utf8") : null;

try {
  fs.writeFileSync(planPath, "# Blueprint\n| T1 | src/service.js:L10-L42 | Usar src/utils/geo.js |\n", "utf8");
  const out = execFileSync("node", [sessHook], { cwd: targetDir, encoding: "utf8" });
  const parsed = JSON.parse(out.trim());
  const msg = parsed.injectSteps && parsed.injectSteps[0] ? parsed.injectSteps[0].ephemeralMessage : "";
  if (msg.includes("Zero-Read") && msg.includes("src/service.js:L10-L42") && msg.includes("Zero-Releitura")) {
    process.stdout.write("OK");
  }
} finally {
  if (hadPlan) fs.writeFileSync(planPath, backupPlan, "utf8");
  else fs.rmSync(planPath, { force: true });
}
' "${TARGET_DIR}/.agents/hooks/token-guard-sessionstart.cjs" "${TARGET_DIR}" 2>/dev/null || echo "")
SESS_PLAN_OK=0
[ "$SESS_PLAN_RES" = "OK" ] && SESS_PLAN_OK=1
assert_test "SessionStart injeta coordenadas de PLAN.md automaticamente para eliminar releitura na Fase 3" "$SESS_PLAN_OK"

# ------------------------------------------------------------------------------
# Teste 64: Higiene de Workspace, Progressive Disclosure (model_decision) e Zero Contaminacao Estatica
# ------------------------------------------------------------------------------
HYGIENE_RES=$(node -e '
const fs = require("fs");
const path = require("path");
const targetDir = process.argv[1];

const patA = [".gsd", "bench", "holdout"].join("-");
const patB = ["__hid", "den_"].join("");
let hits = 0;

function scanDir(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === ".git" || ent.name === "memory") continue;
      scanDir(full);
    } else if (ent.isFile()) {
      try {
        const st = fs.statSync(full);
        if (st.size > 1024 * 1024) continue;
        const txt = fs.readFileSync(full, "utf8");
        if (txt.includes(patA) || txt.includes(patB)) hits++;
      } catch {}
    }
  }
}

scanDir(path.join(targetDir, ".agents"));
const hooksJson = JSON.parse(fs.readFileSync(path.join(targetDir, ".agents", "hooks.json"), "utf8"));
const postMatcher = hooksJson["token-efficiency-guard"].PostToolUse[0].matcher;
const lspRule = fs.readFileSync(path.join(targetDir, ".agents", "rules", "lsp.md"), "utf8");
const noRootTestKit = !fs.existsSync(path.join(targetDir, "scripts", "test-kit.sh"));

if (hits === 0 && postMatcher !== "*" && postMatcher.includes("edit_file") && lspRule.includes("trigger: model_decision") && noRootTestKit) {
  process.stdout.write("OK");
} else {
  process.stderr.write(JSON.stringify({ hits, postMatcher, noRootTestKit }));
}
' "${TARGET_DIR}" 2>/dev/null || echo "")
HYGIENE_OK=0
[ "$HYGIENE_RES" = "OK" ] && HYGIENE_OK=1
assert_test "Workspace hermetico: 0 strings literais de holdout em .agents/, PostToolUse seletivo e model_decision ativo" "$HYGIENE_OK"

echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAILED" -eq 0 ]; then
echo -e "\033[0;32m🎉 SUCESSO TOTAL: Todos os ${PASSED} testes passaram com êxito!\033[0m"
echo -e "   O kit está 100% blindado e operacional para este workspace.\n"
exit 0
else
echo -e "\033[0;31m⚠️ ATENÇÃO: ${FAILED} testes falharam de um total de $((PASSED + FAILED)).\033[0m\n"
exit 1
fi