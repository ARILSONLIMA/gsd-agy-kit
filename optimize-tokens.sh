#!/usr/bin/env bash
# ==============================================================================
# Optimize Tokens (Linux / macOS / WSL)
# ==============================================================================

set -euo pipefail

TARGET_DIR="${1:-$(pwd)}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

node "${SCRIPT_DIR}/optimize-tokens.cjs" "${TARGET_DIR}"
