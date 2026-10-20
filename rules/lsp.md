---
trigger: always_on
description: Motor Multi-LSP Híbrido (20 ecossistemas) para diagnóstico, resolução de tipos, definições, referências e renomeação segura.
---

# Multi-LSP Híbrido: Tipagem e Diagnósticos

Motor LSP integrado (CLI e MCP `gsd-economy`) para 20 ecossistemas (Go, TS/JS, Python, Rust, PHP, C/C++, Java, C#, Lua, Shell, HTML/CSS/JSON, YAML, SQL, Docker, Ruby, Dart, Elixir, Kotlin, Swift, Terraform).

## Comandos Principais (CLI ou MCP)
| Objetivo | Tool MCP | Comando CLI |
|---|---|---|
| Checar erros de compilação/tipagem após editar | `lsp_diagnostics` | `node .agents/mcp-server.cjs lsp diagnostics [arquivo]` |
| Ir à definição de função, classe, struct ou tipo | `lsp_definition` | `node .agents/mcp-server.cjs lsp definition "<símbolo>" [arquivo]` |
| Listar referências antes de alterar assinatura | `lsp_references` | `node .agents/mcp-server.cjs lsp references "<símbolo>" [caminho]` |
| Ver assinatura completa e docstring sem abrir arquivo | `lsp_hover` | `node .agents/mcp-server.cjs lsp hover "<símbolo>" [arquivo]` |
| Listar todos os símbolos estruturais de um arquivo | `lsp_hover` (file_path) | `node .agents/mcp-server.cjs lsp symbols "<arquivo>"` |
| Renomear símbolo com segurança no projeto | `lsp_rename` | `node .agents/mcp-server.cjs lsp rename "<antigo>" "<novo>" [caminho]` |

## Regras de Execução
- **Antes de editar contrato/assinatura:** Verifique referências com `lsp_references` (`node .agents/mcp-server.cjs lsp references "<símbolo>"`).
- **Imediatamente após editar:** Valide sintaxe e tipos com `lsp_diagnostics` (`node .agents/mcp-server.cjs lsp diagnostics [arquivo]`) ou com o verificador rápido de sintaxe da stack (`node -c <arquivo>`, `go vet`, `python -m py_compile`) antes de executar suítes de teste.
