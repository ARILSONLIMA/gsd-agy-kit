#!/usr/bin/env bash
# ==============================================================================
# Antigravity GSD Kit - One-Line Remote Installer (Linux / macOS / WSL)
# Uso:
#   curl -fsSL https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.sh | bash -s -- --no-frontend
#   curl -fsSL https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.sh | bash -s -- --frontend
# ==============================================================================

set -euo pipefail

REPO_OWNER="${GSD_REPO_OWNER:-ARILSONLIMA}"
REPO_NAME="${GSD_REPO_NAME:-gsd-agy-kit}"
REPO_BRANCH="${GSD_REPO_BRANCH:-main}"
REPO_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}.git"
TARBALL_URL="https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz"

TARGET_DIR="$(pwd)"
TMP_DIR="${TARGET_DIR}/.gsd-agy-kit-tmp"

cleanup() {
    if [ -d "${TMP_DIR}" ]; then
        rm -rf "${TMP_DIR}" 2>/dev/null || true
    fi
}
trap cleanup EXIT INT TERM

if ! command -v node >/dev/null 2>&1; then
    echo -e "\n\033[0;31m🛑 [HARD STOP] Node.js não encontrado no PATH!\033[0m"
    echo -e "\033[0;33m   O Antigravity GSD Kit necessita do Node.js v18+ para operar.\033[0m"
    echo -e "\033[0;33m   Instale em: https://nodejs.org e tente novamente.\n\033[0m"
    exit 1
fi

echo -e "\n\033[0;36m⬇️  Baixando Antigravity GSD Kit (${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH})...\033[0m"
rm -rf "${TMP_DIR}"
mkdir -p "${TMP_DIR}"

if command -v git >/dev/null 2>&1; then
    git clone --depth 1 --branch "${REPO_BRANCH}" --quiet "${REPO_URL}" "${TMP_DIR}"
elif command -v curl >/dev/null 2>&1 && command -v tar >/dev/null 2>&1; then
    curl -fsSL "${TARBALL_URL}" | tar -xz -C "${TMP_DIR}" --strip-components=1
else
    echo -e "\033[0;31m🛑 Erro: É necessário ter 'git' ou 'curl + tar' instalados para baixar o kit.\033[0m"
    exit 1
fi

# Define argumentos padrão: --install e --cleanup (se nenhuma ação explícita foi passada)
HAS_ACTION=0
for arg in "$@"; do
    case "$arg" in
        --install|--menu|--test|--uninstall|--report|--profile|--compact|--doctor|--health|--graphify|--lsp|--update|--check-update)
            HAS_ACTION=1
            ;;
    esac
done

INSTALL_ARGS=("${TARGET_DIR}")
if [ "$HAS_ACTION" -eq 0 ]; then
    INSTALL_ARGS+=("--install")
fi
INSTALL_ARGS+=("$@" "--cleanup")

# Reconecta stdin ao /dev/tty se executado via pipe (curl | bash) em terminal interativo
if [ ! -t 0 ] && [ -t 1 ] && [ -e /dev/tty ]; then
    node "${TMP_DIR}/setup-ui.cjs" "${INSTALL_ARGS[@]}" < /dev/tty
else
    node "${TMP_DIR}/setup-ui.cjs" "${INSTALL_ARGS[@]}"
fi
