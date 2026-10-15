#!/usr/bin/env bash
# ==============================================================================
# Uninstall Antigravity GSD Kit (Linux / macOS / WSL)
# ==============================================================================

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_DIR="${1:-}"
if [ -z "$TARGET_DIR" ]; then
    if [ "$(pwd)" = "$SCRIPT_DIR" ] || [[ "$(pwd)" == "$SCRIPT_DIR/"* ]]; then
        TARGET_DIR="$(dirname "$SCRIPT_DIR")"
    else
        TARGET_DIR="$(pwd)"
    fi
fi

echo -e "\n\033[0;33m🧹 [Antigravity GSD Kit] Iniciando desinstalação e reversão...\033[0m"

AGENTS_DIR="${TARGET_DIR}/.agents"
HOOKS_JSON="${AGENTS_DIR}/hooks.json"

# 1. Remover hooks do hooks.json
if [ -f "${HOOKS_JSON}" ]; then
    node -e '
    const fs = require("fs");
    const file = process.argv[1];
    try {
        const data = JSON.parse(fs.readFileSync(file, "utf8"));
        if (data["token-efficiency-guard"]) {
            delete data["token-efficiency-guard"];
            fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
            console.log("   \x1b[32m✅ token-efficiency-guard removido de hooks.json\x1b[0m");
        }
    } catch (e) {}
    ' "${HOOKS_JSON}"
fi

# 2. Remover arquivos e diretórios
rm -f "${AGENTS_DIR}/hooks/token-guard-preinvocation.cjs"
rm -f "${AGENTS_DIR}/hooks/token-guard-pretool.cjs"
rm -f "${AGENTS_DIR}/rules/token-protocol.md"
rm -f "${AGENTS_DIR}/rules/ast-grep.md"
rm -f "${AGENTS_DIR}/rules/graphify.md"
rm -f "${AGENTS_DIR}/rules/idioma.md"
rm -f "${AGENTS_DIR}/.last-heal-check"
rm -f "${AGENTS_DIR}/.health-cache"
rm -f "${AGENTS_DIR}/.jit-promotions.json"
rm -f "${AGENTS_DIR}/.last-synced-phase"
rm -rf "${AGENTS_DIR}/.cache"
rm -rf "${AGENTS_DIR}/kit"
rm -rf "${AGENTS_DIR}/skills/gsd-tokens"
rm -rf "${AGENTS_DIR}/tools/gsd-agy-kit"
rm -rf "${AGENTS_DIR}/gsd-agy-kit"
echo -e "   \033[0;32m✅ Arquivos de hook, regras e caches removidos.\033[0m"

# 3. Remover Git Hooks
for gh in "${TARGET_DIR}/.git/hooks/post-merge" "${TARGET_DIR}/.git/hooks/post-checkout" "${TARGET_DIR}/.git/hooks/post-commit"; do
    if [ -f "$gh" ] && grep -E "gsd-agy-kit|gsd-graphify-update|patch-agents" "$gh" >/dev/null 2>&1; then
        rm -f "$gh"
        echo -e "   \033[0;32m✅ Git hook removido: ${gh}\033[0m"
    fi
done

# 4. Limpar subagentes
SUBAGENTS_DIR="${AGENTS_DIR}/agents"
if [ -d "${SUBAGENTS_DIR}" ]; then
    node -e '
    const fs = require("fs");
    const path = require("path");
    const dir = process.argv[1];
    let cleaned = 0;
    fs.readdirSync(dir).filter(f => f.endsWith(".md")).forEach(f => {
        const fp = path.join(dir, f);
        const c = fs.readFileSync(fp, "utf8");
        if (c.includes("<!-- ANTIGRAVITY_TOKEN_PROTOCOL_START -->")) {
            const next = c.replace(/<!-- ANTIGRAVITY_TOKEN_PROTOCOL_START -->[\s\S]*?<!-- ANTIGRAVITY_TOKEN_PROTOCOL_END -->\r?\n?/, "");
            fs.writeFileSync(fp, next.trim(), "utf8");
            cleaned++;
        }
    });
    console.log(`   \x1b[32m✅ Limpos ${cleaned} subagentes (protocolo removido).\x1b[0m`);
    ' "${SUBAGENTS_DIR}"
fi

# 5. Restaurar snapshot de backup original se presente
ORIGINAL_BACKUP_DIR="${AGENTS_DIR}/.backup-original-gsd"
if [ -d "${ORIGINAL_BACKUP_DIR}" ]; then
    cp -r "${ORIGINAL_BACKUP_DIR}/"* "${SUBAGENTS_DIR}/" 2>/dev/null || true
    rm -rf "${ORIGINAL_BACKUP_DIR}"
    echo -e "   \033[0;32m✅ Subagentes originais restaurados a partir do snapshot de backup.\033[0m"
fi

# 6. Restaurar skills do pool
SKILLS_POOL_DIR="${AGENTS_DIR}/skills-pool"
ACTIVE_SKILLS_DIR="${AGENTS_DIR}/skills"
if [ -d "${SKILLS_POOL_DIR}" ]; then
    cp -r "${SKILLS_POOL_DIR}/"* "${ACTIVE_SKILLS_DIR}/" 2>/dev/null || true
    rm -rf "${SKILLS_POOL_DIR}"
    echo -e "   \033[0;32m✅ Todas as skills do pool restauradas para .agents/skills/.\033[0m"
fi

# 7. Restaurar agentes do pool se não restaurados por backup
AGENTS_POOL_DIR="${AGENTS_DIR}/agents-pool"
if [ -d "${AGENTS_POOL_DIR}" ]; then
    cp -r "${AGENTS_POOL_DIR}/"* "${SUBAGENTS_DIR}/" 2>/dev/null || true
    rm -rf "${AGENTS_POOL_DIR}"
    echo -e "   \033[0;32m✅ Todos os subagentes do pool restaurados para .agents/agents/.\033[0m"
fi

echo -e "\n\033[0;32m✅ [Antigravity GSD Kit] Desinstalação concluída com sucesso!\033[0m\n"
