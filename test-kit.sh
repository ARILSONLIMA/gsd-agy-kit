#!/usr/bin/env bash
# ==============================================================================
# Test-Kit Antigravity GSD (Linux / macOS / WSL)
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-}"

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
    TARGET_DIR="$(cd "$TARGET_DIR" && pwd)"
    if [[ "$SCRIPT_DIR" == *"/.agents/kit" ]]; then
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
if [ "$ACTIVE_COUNT" -le 10 ]; then
    ACTIVE_OK=1
fi
assert_test "Catalogo ativo (.agents/agents/) enxuto e consciente de fase (${ACTIVE_COUNT} agentes ativos)" "$ACTIVE_OK"

# 7. JIT Auto-Promoter do Hook
TEMP_AGENT="gsd-ui-auditor"
rm -f "${AGENTS_DIR}/${TEMP_AGENT}.md"
PAYLOAD_JIT='{"toolCall":{"name":"invoke_subagent","args":{"Subagents":[{"TypeName":"'"${TEMP_AGENT}"'"}]}}}'
printf '%s' "$PAYLOAD_JIT" | node "$HOOK_PATH" >/dev/null 2>&1 || true
JIT_OK=0
if [ -f "${AGENTS_DIR}/${TEMP_AGENT}.md" ]; then
    JIT_OK=1
    rm -f "${AGENTS_DIR}/${TEMP_AGENT}.md"
fi
assert_test "Hook PreToolUse promove instantaneamente (JIT) subagente do pool sob demanda" "$JIT_OK"

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

RULES_FILES=("ast-grep.md" "gopls.md" "graphify.md" "idioma.md" "token-protocol.md")
RULES_ALL_OK=1
for rf in "${RULES_FILES[@]}"; do
    if [ ! -f "${RESOLVED_RULES_DIR}/${rf}" ] || [ $(wc -c < "${RESOLVED_RULES_DIR}/${rf}" 2>/dev/null || echo 0) -lt 50 ]; then
        RULES_ALL_OK=0
        break
    fi
done
assert_test "Regras canonicas em rules/ (${#RULES_FILES[@]} regras) presentes e validas" "$RULES_ALL_OK"

if [ -f "${KIT_DIR}/skills/gsd-tokens/SKILL.md" ]; then
    GSD_TOKENS_SKILL="${KIT_DIR}/skills/gsd-tokens/SKILL.md"
elif [ -f "${TARGET_DIR}/.agents/skills/gsd-tokens/SKILL.md" ]; then
    GSD_TOKENS_SKILL="${TARGET_DIR}/.agents/skills/gsd-tokens/SKILL.md"
else
    GSD_TOKENS_SKILL="${SCRIPT_DIR}/skills/gsd-tokens/SKILL.md"
fi

if [ -f "${KIT_DIR}/skills/gsd-test/SKILL.md" ]; then
    GSD_TEST_SKILL="${KIT_DIR}/skills/gsd-test/SKILL.md"
elif [ -f "${TARGET_DIR}/.agents/skills/gsd-test/SKILL.md" ]; then
    GSD_TEST_SKILL="${TARGET_DIR}/.agents/skills/gsd-test/SKILL.md"
else
    GSD_TEST_SKILL="${SCRIPT_DIR}/skills/gsd-test/SKILL.md"
fi

SKILL_OK=0
if [ -f "${GSD_TOKENS_SKILL}" ] && grep -q "name:\s*gsd-tokens" "${GSD_TOKENS_SKILL}" 2>/dev/null && \
   [ -f "${GSD_TEST_SKILL}" ] && grep -q "name:\s*gsd-test" "${GSD_TEST_SKILL}" 2>/dev/null; then
    SKILL_OK=1
fi
assert_test "Skills canonicas (/gsd-tokens e /gsd-test) presentes com frontmatter valido" "$SKILL_OK"
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


echo -e "\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
if [ "$FAILED" -eq 0 ]; then
    echo -e "\033[0;32m🎉 SUCESSO TOTAL: Todos os ${PASSED} testes passaram com êxito!\033[0m"
    echo -e "   O kit está 100% blindado e operacional para este workspace.\n"
else
    echo -e "\033[0;31m⚠️ ATENÇÃO: ${FAILED} testes falharam de um total de $((PASSED + FAILED)).\033[0m\n"
fi

