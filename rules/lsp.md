---
trigger: always_on
description: Motor Multi-LSP Híbrido para diagnósticos de compilação, tipos e sintaxe.
---

# Multi-LSP: Tipagem e Diagnósticos

- **Após editar arquivo:** Valide sintaxe e tipos com MCP `lsp_diagnostics` (ou `node .agents/mcp-server.cjs lsp diagnostics [arquivo]`).
- **Antes de mudar assinatura:** Verifique chamadores com `lsp_references` (`node .agents/mcp-server.cjs lsp references "<símbolo>"`).
- **Inspeção de símbolos:** Use `lsp_definition` para ir ao arquivo/linha do símbolo e `lsp_hover` para assinatura e docstring.
