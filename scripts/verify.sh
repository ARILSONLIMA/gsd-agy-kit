#!/usr/bin/env bash
# Runner Unificado de Verificação Rápida em 1 Turno (Sintaxe, Qualidade Estática e Testes)
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
KIT_ROOT="$(dirname "$SCRIPT_DIR")"
TARGET_DIR="${1:-.}"

if [ -f "${KIT_ROOT}/verify.cjs" ]; then
    node "${KIT_ROOT}/verify.cjs" "$TARGET_DIR"
elif [ -f ".agents/verify.cjs" ]; then
    node ".agents/verify.cjs" "$TARGET_DIR"
else
    echo "{\"error\": \"verify.cjs não encontrado\"}"
    exit 1
fi
