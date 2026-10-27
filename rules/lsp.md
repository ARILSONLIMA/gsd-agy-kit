---
trigger: model_decision
description: Ative ao alterar assinaturas exportadas, renomear símbolos em múltiplos arquivos (lsp_rename) ou depurar diagnósticos de compilação/tipos.
---

# Multi-LSP: Referências, Rename e Diagnósticos

- Antes de alterar assinaturas compartilhadas, mapeie chamadores com `lsp_references` (`node .agents/mcp-server.cjs lsp references "<símbolo>"`) e aplique renomeações multi-arquivo em 1 operação com `lsp_rename` (`node .agents/mcp-server.cjs lsp rename "<antigo>" "<novo>" src`).
- Use `lsp_definition` / `lsp_hover` para localizar declarações exatas e `lsp_diagnostics` para isolar falhas sintáticas/tipagem.
