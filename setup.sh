#!/usr/bin/env bash
# ==============================================================================
# Setup Antigravity GSD Kit (Linux / macOS / WSL)
# ==============================================================================

set -euo pipefail

TARGET_DIR=""
HAS_FRONTEND=""
ACTION_ARG=""
EXTRA_ARG=""
CLEANUP_FLAG=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --test)
            ACTION_ARG="--test"
            shift
            ;;
        --uninstall)
            ACTION_ARG="--uninstall"
            shift
            ;;
        --report)
            ACTION_ARG="--report"
            shift
            ;;
        --profile)
            ACTION_ARG="--profile"
            EXTRA_ARG="${2:-}"
            shift 2
            ;;
        --compact)
            ACTION_ARG="--compact"
            shift
            ;;
        --doctor)
            ACTION_ARG="--doctor"
            shift
            ;;
        --health)
            ACTION_ARG="--health"
            shift
            ;;
        --graphify)
            ACTION_ARG="--graphify"
            shift
            ;;
        --lsp)
            ACTION_ARG="--lsp"
            shift
            ;;
        --errors)
            ACTION_ARG="--errors"
            shift
            ;;
        --menu)
            ACTION_ARG="--menu"
            shift
            ;;
        --install)
            ACTION_ARG="--install"
            shift
            ;;
        --frontend)
            HAS_FRONTEND=true
            ACTION_ARG="--install"
            shift
            ;;
        --no-frontend)
            HAS_FRONTEND=false
            ACTION_ARG="--install"
            shift
            ;;
        --has-frontend=*)
            HAS_FRONTEND="${1#*=}"
            ACTION_ARG="--install"
            shift
            ;;
        --cleanup)
            CLEANUP_FLAG="--cleanup"
            shift
            ;;
        --no-cleanup)
            CLEANUP_FLAG="--no-cleanup"
            shift
            ;;
        --target-dir)
            TARGET_DIR="$2"
            shift 2
            ;;
        -*)
            echo "Opção desconhecida: $1"
            exit 1
            ;;
        *)
            if [ -z "$TARGET_DIR" ]; then
                TARGET_DIR="$1"
            fi
            shift
            ;;
    esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_DIR="${SCRIPT_DIR}"

if [ -z "${TARGET_DIR}" ]; then
    if [[ "${SCRIPT_DIR}" == *"/.agents/kit" ]]; then
        TARGET_DIR="$(cd "${SCRIPT_DIR}/../.." && pwd)"
    elif [ "$(pwd)" = "${SCRIPT_DIR}" ] || [[ "$(pwd)" == "${SCRIPT_DIR}/"* ]]; then
        if [ -d "$(dirname "${SCRIPT_DIR}")/.agents" ] || [ -d "$(dirname "${SCRIPT_DIR}")/.planning" ]; then
            TARGET_DIR="$(dirname "${SCRIPT_DIR}")"
        else
            TARGET_DIR="${SCRIPT_DIR}"
        fi
    else
        TARGET_DIR="$(pwd)"
    fi
fi

# 1. Delegar para motor de interface interativo e animado (setup-ui.cjs)
UI_SCRIPT="${SCRIPT_DIR}/setup-ui.cjs"
if [ -f "${UI_SCRIPT}" ]; then
    if ! command -v node >/dev/null 2>&1; then
        echo -e "\n\033[0;31m🛑 [HARD STOP] Node.js não encontrado no PATH!\033[0m"
        echo -e "\033[0;33m   O kit necessita do Node.js v18+ para operar seus hooks de governança.\033[0m"
        echo -e "\033[0;33m   Instale o Node.js em: https://nodejs.org e tente novamente.\n\033[0m"
        exit 1
    fi
    if [ -n "${ACTION_ARG}" ]; then
        if [ -n "${EXTRA_ARG}" ]; then
            node "${UI_SCRIPT}" "${TARGET_DIR}" "${ACTION_ARG}" "${EXTRA_ARG}" ${CLEANUP_FLAG}
        elif [ "${ACTION_ARG}" = "--install" ] && [ -n "${HAS_FRONTEND}" ]; then
            node "${UI_SCRIPT}" "${TARGET_DIR}" "${ACTION_ARG}" "${HAS_FRONTEND}" ${CLEANUP_FLAG}
        else
            node "${UI_SCRIPT}" "${TARGET_DIR}" "${ACTION_ARG}" ${CLEANUP_FLAG}
        fi
    else
        node "${UI_SCRIPT}" "${TARGET_DIR}" "--install" ${CLEANUP_FLAG}
    fi
    exit $?
fi

echo -e "\n\033[0;36m🚀 [Antigravity GSD Kit] Iniciando configuração no Linux / POSIX (Modo Fallback)...\033[0m"
echo -e "   Diretório Alvo: ${TARGET_DIR}"

# Pergunta interativa sobre interface Front-End se não informada via parâmetro
if [ -z "${HAS_FRONTEND}" ]; then
    if [ -t 0 ]; then
        echo -e "\n\033[0;36m🎨 Configuração de Interface / Front-End:\033[0m"
        read -r -p "   O projeto terá interface Front-End (UI/Web/App)? [s/N] (Padrão: N): " resp || resp=""
        case "${resp}" in
            [sS]|[sS][iI][mM]|[yY]|[yY][eE][sS]) HAS_FRONTEND=true ;;
            *) HAS_FRONTEND=false ;;
        esac
    else
        HAS_FRONTEND=false
    fi
fi

if [ "${HAS_FRONTEND}" = "true" ]; then
    echo -e "   \033[0;32m🎨 Modo Front-End: ATIVADO (UI phases, safety gates, reviews e perfil de skills full)\033[0m"
else
    echo -e "   \033[0;37m⚙️ Modo Front-End: DESATIVADO (perfil enxuto backend e UI desligada)\033[0m"
fi

# 1. Verificar Node.js (Hard Stop)
if command -v node >/dev/null 2>&1; then
    NODE_VER=$(node -v)
    echo -e "   \033[0;32mNode.js detectado: ${NODE_VER}\033[0m"
else
    echo -e "\n\033[0;31m🛑 [HARD STOP] Node.js não encontrado no PATH!\033[0m"
    echo -e "\033[0;33m   O kit necessita do Node.js v18+ para operar seus hooks de governança.\033[0m"
    echo -e "\033[0;33m   Instale o Node.js em: https://nodejs.org e tente novamente.\n\033[0m"
    exit 1
fi

# 2. Verificar Ferramentas Obrigatórias (Circuit Breaker & Hard Stop)
echo -e "\n\033[0;36m🔍 Verificando ferramentas obrigatórias...\033[0m"

# 2.1: ast-grep (Hard Stop)
if command -v ast-grep >/dev/null 2>&1; then
    AST_VER=$(ast-grep --version)
    echo -e "   \033[0;32m✅ ast-grep: ${AST_VER}\033[0m"
elif npx -y --package @ast-grep/cli ast-grep --version >/dev/null 2>&1; then
    echo -e "   \033[0;32m✅ ast-grep: Disponível via npx @ast-grep/cli\033[0m"
else
    echo -e "\n\033[0;31m🛑 [HARD STOP] ast-grep não encontrado no PATH nem via npx!\033[0m"
    echo -e "\033[0;33m   O ast-grep é obrigatório para análise estrutural e AST conforme a Regra 4/5 do Projeto.\033[0m"
    echo -e "\033[0;33m   Para instalar, execute no terminal:\033[0m"
    echo -e "\033[0;36m     npm install -g @ast-grep/cli\033[0m"
    echo -e "\033[0;36m     ou: cargo install ast-grep\033[0m"
    echo -e "\033[0;33m   Após instalar, execute este setup novamente.\n\033[0m"
    exit 1
fi

# 2.2: graphify (Hard Stop)
if command -v graphify >/dev/null 2>&1; then
    echo -e "   \033[0;32m✅ graphify: OK\033[0m"
else
    echo -e "\n\033[0;31m🛑 [HARD STOP] graphify não encontrado no PATH!\033[0m"
    echo -e "\033[0;33m   O graphify é obrigatório para mapeamento macro do grafo de conhecimento.\033[0m"
    echo -e "\033[0;33m   Para instalar, execute no terminal:\033[0m"
    echo -e "\033[0;36m     pip install graphify-cli\033[0m"
    echo -e "\033[0;36m     ou: uv tool install graphify-cli\033[0m"
    echo -e "\033[0;33m   Após instalar, execute este setup novamente.\n\033[0m"
    exit 1
fi

# 2.3: GSD Core no Projeto (Hard Stop)
GSD_CORE_PATH="${TARGET_DIR}/.agents/gsd-core"
GSD_AGENTS_PATH="${TARGET_DIR}/.agents/agents"

if [ ! -d "${GSD_CORE_PATH}" ] && [ ! -d "${GSD_AGENTS_PATH}" ]; then
    echo -e "\n\033[0;31m🛑 [HARD STOP] Ecossistema GSD não detectado neste projeto!\033[0m"
    echo -e "\033[0;33m   Não foram encontrados .agents/gsd-core ou .agents/agents em: ${TARGET_DIR}\033[0m"
    echo -e "\033[0;33m   Este kit foi desenhado para blindar e normalizar um projeto GSD existente.\033[0m"
    echo -e "\033[0;36m   Inicialize o projeto com o GSD primeiro (ex: rodando /gsd-new-project ou instalando o GSD)\033[0m"
    echo -e "\033[0;33m   e então execute este setup para ativar a governança.\n\033[0m"
    exit 1
fi
echo -e "   \033[0;32m✅ Ecossistema GSD detectado no projeto\033[0m"

# 3. Garantir pastas necessárias
AGENTS_DIR="${TARGET_DIR}/.agents"
RULES_DIR="${AGENTS_DIR}/rules"
HOOKS_DIR="${AGENTS_DIR}/hooks"
KIT_DIR="${SCRIPT_DIR}"

mkdir -p "${RULES_DIR}"
mkdir -p "${HOOKS_DIR}"

# 4. Copiar Regras Canônicas e Hooks
if [ -d "${KIT_DIR}/rules" ]; then
    cp -f "${KIT_DIR}/rules/"* "${RULES_DIR}/"
    echo -e "   \033[0;32mRegras de comportamento e tools copiadas para: ${RULES_DIR}\033[0m"
fi

if [ -d "${KIT_DIR}/hooks" ]; then
    cp -f "${KIT_DIR}/hooks/"* "${HOOKS_DIR}/"
    mkdir -p "${AGENTS_DIR}/tools/gsd-agy-kit/hooks"
    cp -f "${KIT_DIR}/hooks/"* "${AGENTS_DIR}/tools/gsd-agy-kit/hooks/"
    echo -e "   \033[0;32mHooks instalados em: ${HOOKS_DIR}\033[0m"
fi

# 5. Configurar .agents/hooks.json via Node inline
HOOKS_JSON="${AGENTS_DIR}/hooks.json"
node -e '
const fs = require("fs");
const file = process.argv[1];
let data = {};
if (fs.existsSync(file)) {
  try { data = JSON.parse(fs.readFileSync(file, "utf8")); } catch {}
}
data["token-efficiency-guard"] = {
  SessionStart: [
    {
      type: "command",
      command: "node hooks/token-guard-sessionstart.cjs",
      timeout: 15
    }
  ],
  PreInvocation: [
    {
      type: "command",
      command: "node hooks/token-guard-preinvocation.cjs",
      timeout: 15
    }
  ],
  PreToolUse: [
    {
      matcher: "read_file|view_file|run_command|write_file|write_to_file|Write|write|edit_file|replace_file_content|invoke_subagent",
      hooks: [
        {
          type: "command",
          command: "node hooks/token-guard-pretool.cjs",
          timeout: 15
        }
      ]
    }
  ],
  PostToolUse: [
    {
      matcher: "edit_file|replace_file_content|multi_replace_file_content|write_file|write_to_file|Write|write|run_command|bash|shell|call_mcp_tool",
      hooks: [
        {
          type: "command",
          command: "node hooks/token-guard-diagnostics.cjs",
          timeout: 15
        }
      ]
    }
  ],
  Stop: [
    {
      type: "command",
      command: "node hooks/token-guard-diagnostics.cjs --summary",
      timeout: 15
    }
  ]
};
fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
' "${HOOKS_JSON}"

echo -e "   \033[0;32mHooks registrados em: ${HOOKS_JSON}\033[0m"

# 6. Executar o Patch dos Subagentes GSD (Apenas se existirem subagentes .agents/agents)
PATCH_SCRIPT="${KIT_DIR}/patch-agents.cjs"
if [ -d "${TARGET_DIR}/.agents/agents" ] && [ -f "${PATCH_SCRIPT}" ]; then
    echo -e "\n\033[0;36m🛠️ Normalizando e injetando regras nos subagentes do GSD...\033[0m"
    node "${PATCH_SCRIPT}" "${TARGET_DIR}"
    if [ -f "${KIT_DIR}/shrink-prompts.cjs" ]; then node "${KIT_DIR}/shrink-prompts.cjs" "${TARGET_DIR}"; fi
fi

# 7. Otimização de Tokens & Dynamic Agent Pool (Apenas se existirem subagentes)
OPT_SCRIPT="${KIT_DIR}/optimize-tokens.cjs"
if [ -d "${TARGET_DIR}/.agents/agents" ] && [ -f "${OPT_SCRIPT}" ]; then
    node "${OPT_SCRIPT}" "${TARGET_DIR}" --sync
    echo -e "   \033[0;32mDynamic Agent Pool inicializado (.agents/agents-pool/ com ativação JIT ativa)\033[0m"
fi

# 8. Servidor MCP & Motores de Economia (MemPalace, RAG, Lockfile, Skeleton)
echo -e "\n\033[0;36m🧠 Configurando Servidor MCP e Memória Episódica...\033[0m"
MEMORY_DIR="${AGENTS_DIR}/memory"
mkdir -p "${MEMORY_DIR}"

if [ -d "${KIT_DIR}/lib" ]; then
    mkdir -p "${AGENTS_DIR}/lib"
    cp -rf "${KIT_DIR}/lib/"* "${AGENTS_DIR}/lib/"
fi

for sc in "mcp-server.cjs" "gsd-read-strip.cjs" "verify.cjs"; do
    if [ -f "${KIT_DIR}/${sc}" ]; then
        cp -f "${KIT_DIR}/${sc}" "${AGENTS_DIR}/${sc}"
        chmod +x "${AGENTS_DIR}/${sc}" 2>/dev/null || true
    fi
done

# Registrar .agents/mcp_config.json
MCP_JSON="${AGENTS_DIR}/mcp_config.json"
node -e '
const fs = require("fs");
const file = process.argv[1];
let mcpConfig = { mcpServers: {} };
if (fs.existsSync(file)) {
    try { mcpConfig = JSON.parse(fs.readFileSync(file, "utf8")) || { mcpServers: {} }; } catch {}
}
if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
mcpConfig.mcpServers["gsd-economy"] = {
    command: "node",
    args: [".agents/mcp-server.cjs"]
};
fs.writeFileSync(file, JSON.stringify(mcpConfig, null, 2), "utf8");
' "${MCP_JSON}"

# Também gerar plugin .agents/plugins/gsd-economy/ via wrapper leve (zero duplicação de lib/)
PLUGIN_DIR="${AGENTS_DIR}/plugins/gsd-economy"
mkdir -p "${PLUGIN_DIR}"
cat << 'EOF' > "${PLUGIN_DIR}/plugin.json"
{
  "name": "gsd-economy",
  "description": "Otimizador de tokens, MemPalace e busca cirúrgica para GSD no Antigravity",
  "version": "1.0.0"
}
EOF
cp -f "${MCP_JSON}" "${PLUGIN_DIR}/mcp_config.json"
cat << 'EOF' > "${PLUGIN_DIR}/mcp-server.cjs"
#!/usr/bin/env node
'use strict';
require('../../mcp-server.cjs');
EOF

# Gerar .agents/plugins.json para registro explícito no Antigravity
cat << 'EOF' > "${AGENTS_DIR}/plugins.json"
{
  "entries": [
    {
      "path": ".agents/plugins"
    }
  ]
}
EOF
echo -e "   \033[0;32mServidor MCP registrado em: ${MCP_JSON}\033[0m"
echo -e "   \033[0;32mPlugin local registrado em: ${AGENTS_DIR}/plugins.json\033[0m"
echo -e "   \033[0;32mMemória episódica (MemPalace) pronta em: ${MEMORY_DIR}\033[0m"

# Registrar servidor MCP nativamente no Antigravity CLI caso o binário agy esteja presente
if command -v agy >/dev/null 2>&1; then
    agy mcp add gsd-economy node "${AGENTS_DIR}/mcp-server.cjs" >/dev/null 2>&1 || true
    echo -e "   \033[0;32mServidor MCP gsd-economy registrado no runtime Antigravity (agy mcp)\033[0m"
fi

# 9. Instalar Pacote Completo e Utilitários Nativos (.agents/kit/)
TARGET_KIT_DIR="${AGENTS_DIR}/kit"
mkdir -p "${TARGET_KIT_DIR}"

if [ -d "${KIT_DIR}/lib" ]; then
    mkdir -p "${TARGET_KIT_DIR}/lib"
    cp -rf "${KIT_DIR}/lib/"* "${TARGET_KIT_DIR}/lib/"
fi

if [ -d "${KIT_DIR}/rules" ]; then
    mkdir -p "${TARGET_KIT_DIR}/rules"
    cp -rf "${KIT_DIR}/rules/"* "${TARGET_KIT_DIR}/rules/"
fi

KIT_SCRIPTS=("test-kit.sh" "test-kit.ps1" "setup-ui.cjs" "setup.sh" "setup.ps1" "install.sh" "install.ps1" "package.json" "uninstall.sh" "uninstall.ps1" "skills-profile.sh" "skills-profile.ps1" "optimize-tokens.sh" "optimize-tokens.ps1" "sanitize-command.ps1" "token-report.cjs" "gsd-update.cjs" "gsd-state-summary.cjs" "gsd-graphify-update.cjs" "patch-agents.cjs" "optimize-tokens.cjs" "skills-manager.cjs" "compact-state.cjs" "compact-json.cjs" "sanitize-output.cjs" "shrink-prompts.cjs" "gsd-outline.cjs" "mcp-server.cjs" "gsd-read-strip.cjs" "verify.cjs")
for sName in "${KIT_SCRIPTS[@]}"; do
    src="${KIT_DIR}/${sName}"
    if [ -f "${src}" ]; then
        cp -f "${src}" "${TARGET_KIT_DIR}/${sName}"
        chmod +x "${TARGET_KIT_DIR}/${sName}" 2>/dev/null || true
    fi
done
echo -e "   \033[0;32mPacote completo do kit instalado nativamente em: ${TARGET_KIT_DIR}\033[0m"

# 10. Copiar Catálogo Completo de Skills e Subagentes Cavecrew
SKILLS_DIR="${AGENTS_DIR}/skills"
SKILLS_POOL_DIR="${AGENTS_DIR}/skills-pool"
mkdir -p "${SKILLS_DIR}"
mkdir -p "${SKILLS_POOL_DIR}"

if [ -d "${KIT_DIR}/skills" ]; then
    cp -rf "${KIT_DIR}/skills/"* "${SKILLS_POOL_DIR}/"
    cp -rf "${KIT_DIR}/skills/"* "${SKILLS_DIR}/"
    echo -e "   \033[0;32mCatálogo de Skills (incluindo Ponytail & Caveman) instalado em: ${SKILLS_DIR}\033[0m"
fi

if [ -d "${KIT_DIR}/subagents" ]; then
    AGENTS_POOL_DIR="${AGENTS_DIR}/agents-pool"
    mkdir -p "${AGENTS_POOL_DIR}"
    cp -rf "${KIT_DIR}/subagents/"* "${AGENTS_POOL_DIR}/"
    echo -e "   \033[0;32mSubagentes Cavecrew instalados no pool: ${AGENTS_POOL_DIR}\033[0m"
fi

# 10.1 Sincronizar Perfil de Skills (Zero-Baseline sob Demanda JIT)
SKILLS_MGR="${KIT_DIR}/skills-manager.cjs"
if [ -f "${SKILLS_MGR}" ]; then
    SKILL_PROFILE="zero"
    echo -e "\n\033[0;36m🧩 [Skills Profile] Aplicando perfil Zero-Baseline (JIT sob demanda)...\033[0m"
    node "${SKILLS_MGR}" profile "${SKILL_PROFILE}" "${TARGET_DIR}"
fi

# 11. Configurar Defaults Enxutos e Governança no .planning/config.json
PLANNING_DIR="${TARGET_DIR}/.planning"
CONFIG_JSON="${PLANNING_DIR}/config.json"
if [ -f "${CONFIG_JSON}" ]; then
    node -e '
    const fs = require("fs");
    const path = require("path");
    const file = process.argv[1];
    const hasFrontend = process.argv[2] === "true";
    const targetDir = process.argv[3];

    try {
        const raw = JSON.parse(fs.readFileSync(file, "utf8"));

        raw.response_language = "pt-BR";
        raw.kit_mode = "smart-assist";

        raw.workflow = raw.workflow || {};
        raw.workflow.ui_phase = hasFrontend;
        raw.workflow.ui_safety_gate = hasFrontend;
        raw.workflow.ui_review = hasFrontend;
        raw.workflow.compact_content = true;
        raw.workflow.auto_prune_state = true;
        raw.workflow.inline_plan_threshold = 2;
        raw.workflow.ai_integration_phase = false;
        raw.workflow.pattern_mapper = false;
        raw.workflow.code_review = true;
        raw.workflow.code_review_depth = "standard";
        raw.workflow.security_enforcement = true;
        raw.workflow.security_asvs_level = 1;
        raw.workflow.security_block_on = "high";
        raw.workflow.api_coverage_gate = true;
        raw.workflow.tdd_mode = false;

        raw.plan_review = raw.plan_review || {};
        raw.plan_review.source_grounding = true;
        raw.plan_review.source_grounding_authority = "ast-grep";

        raw.graphify = raw.graphify || {};
        raw.graphify.enabled = true;
        raw.graphify.auto_update = false; // Sob demanda via skill /graphify

        raw.mempalace = raw.mempalace || {};
        raw.mempalace.enabled = true;
        raw.mempalace.memory_mode = "augment";
        raw.mempalace.recall_on_discuss = true;
        raw.mempalace.recall_on_plan = true;
        raw.mempalace.mirror_kg = true;
        raw.mempalace.diary_journal = true;
        if (!raw.mempalace.wing) {
            raw.mempalace.wing = path.basename(targetDir);
        }

        fs.writeFileSync(file, JSON.stringify(raw, null, 2) + "\n", "utf8");
        console.log("   \x1b[32mDefaults econômicos e governança gravados em: " + file + "\x1b[0m");
    } catch (e) {
        console.warn("⚠️ Não foi possível atualizar config.json: " + e.message);
    }
    ' "${CONFIG_JSON}" "${HAS_FRONTEND}" "${TARGET_DIR}"
fi

# 12. Configurar Git Hooks (post-merge / post-checkout)
GIT_HOOKS_DIR="${TARGET_DIR}/.git/hooks"
if [ -d "${GIT_HOOKS_DIR}" ]; then
    cat << 'EOF' > "${GIT_HOOKS_DIR}/post-merge"
#!/bin/sh
# Antigravity GSD Kit Auto-Heal Hook
if [ -f ".agents/kit/patch-agents.cjs" ]; then
    node .agents/kit/patch-agents.cjs >/dev/null 2>&1 || true
elif [ -f "gsd-agy-kit/patch-agents.cjs" ]; then
    node gsd-agy-kit/patch-agents.cjs >/dev/null 2>&1 || true
elif [ -f "tools/gsd-agy-kit/patch-agents.cjs" ]; then
    node tools/gsd-agy-kit/patch-agents.cjs >/dev/null 2>&1 || true
fi
EOF
    cp -f "${GIT_HOOKS_DIR}/post-merge" "${GIT_HOOKS_DIR}/post-checkout"
    chmod +x "${GIT_HOOKS_DIR}/post-merge" "${GIT_HOOKS_DIR}/post-checkout"

    # Limpeza de post-commit legado: atualização do graphify é sob demanda via /graphify
    if [ -f "${GIT_HOOKS_DIR}/post-commit" ] && grep -q "gsd-graphify-update" "${GIT_HOOKS_DIR}/post-commit"; then
        rm -f "${GIT_HOOKS_DIR}/post-commit"
    fi

    echo -e "   \033[0;32mGit hooks (post-merge, post-checkout) instalados em .git/hooks\033[0m"
fi

# 12.1 Garantir exclusões de caches/índices em .git/info/exclude (sem sujar .gitignore rastreado)
if [ -d "${TARGET_DIR}/.git" ]; then
    mkdir -p "${TARGET_DIR}/.git/info"
    EXCLUDE_FILE="${TARGET_DIR}/.git/info/exclude"
    touch "${EXCLUDE_FILE}"
    for entry in "gsd-agy-kit/" ".agents/.cache/" "graphify-out/" ".graphifyignore" ".astgrepignore"; do
        if ! grep -qxF "${entry}" "${EXCLUDE_FILE}" 2>/dev/null; then
            echo "${entry}" >> "${EXCLUDE_FILE}"
        fi
    done
    echo -e "   \033[0;32mEntradas de proteção garantidas em .git/info/exclude (working tree limpo)\033[0m"
elif [ -f "${TARGET_DIR}/.gitignore" ]; then
    GITIGNORE_FILE="${TARGET_DIR}/.gitignore"
    if ! grep -q "^gsd-agy-kit/\?" "${GITIGNORE_FILE}"; then
        echo -e "\ngsd-agy-kit/" >> "${GITIGNORE_FILE}"
    fi
    if ! grep -q "^\.agents/\.cache/\?" "${GITIGNORE_FILE}"; then
        echo -e ".agents/.cache/" >> "${GITIGNORE_FILE}"
    fi
    if ! grep -q "^graphify-out/\?" "${GITIGNORE_FILE}"; then
        echo -e "graphify-out/" >> "${GITIGNORE_FILE}"
    fi
fi

# 12.1 Blindagem de Índices (.graphifyignore e .astgrepignore)
if [ -f "${KIT_DIR}/.graphifyignore" ]; then
    cp -f "${KIT_DIR}/.graphifyignore" "${TARGET_DIR}/.graphifyignore"
fi
if [ -f "${KIT_DIR}/.astgrepignore" ]; then
    cp -f "${KIT_DIR}/.astgrepignore" "${TARGET_DIR}/.astgrepignore"
fi
echo -e "   \033[0;32mBlindagem de índices (.graphifyignore e .astgrepignore) aplicada com sucesso\033[0m"

# 13. Resumo Final
echo -e "\n\033[0;32m✅ [Antigravity GSD Kit] Instalação e blindagem concluídas com sucesso!\033[0m"
echo -e "   - Ferramentas normalizadas para Antigravity CLI (write_to_file, sem glob/grep_search/call_mcp_tool)"
echo -e "   - Regras de protocolo de tokens injetadas nos prompts dos subagentes"
echo -e "   - Hooks de Hard Gate ativos em .agents/hooks.json (Circuit Breaker e Sanitizador)"
echo -e "   - Lazy Loading de Subagentes ativo (Dynamic Agent Pool)"
echo -e "   - Perfil de Skills sincronizado conforme Front-End (${SKILL_PROFILE:-backend})"
echo -e "   - Defaults enxutos e governança gravados no .planning/config.json"
echo -e "   - Utilitários /gsd-tokens e /gsd-state-summary prontos para uso"
echo -e "   - Auto-Cura (Self-Healing) ativo para neutralizar futuros updates do GSD\n"


