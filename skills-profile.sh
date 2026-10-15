#!/usr/bin/env bash
# ==============================================================================
# Skills Profile Manager (Linux / macOS / WSL)
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="${SCRIPT_DIR}/skills-manager.cjs"

if [ ! -f "${SCRIPT}" ]; then
    echo "❌ Script skills-manager.cjs não encontrado em ${SCRIPT}"
    exit 1
fi

ACTION="${1:-status}"
PARAM="${2:-}"
TARGET_DIR="${3:-}"

node "${SCRIPT}" "${ACTION}" "${PARAM}" "${TARGET_DIR}"
