---
trigger: always_on
description: Use gopls MCP tools for Go type resolution, definitions, references, and diagnostics — zero tokens, compiler-accurate.
---

## gopls (LSP via MCP)

Este projeto tem o `gopls` conectado como servidor MCP. Ele expõe ferramentas de análise estática direto do compilador Go — sem custo de tokens, com precisão de 100%.

### Quando usar gopls (antes de `view_file` ou `ast-grep`)

| Objetivo | Tool gopls |
|---|---|
| Entender layout do workspace / módulos | `go_workspace` |
| Encontrar um tipo, função ou variável por nome | `go_search` |
| Ver dependências intra-pacote de um arquivo | `go_file_context` |
| Ver API pública de um pacote | `go_package_api` |
| Ir para a definição de um símbolo | `gopls_definition` / CLI `gopls definition <file>:<linha>:<col>` |
| Listar todas as referências a um símbolo antes de alterar | `go_symbol_references` |
| Checar erros de compilação após editar | `go_diagnostics` |
| Verificar vulnerabilidades ao adicionar dependências | `go_vulncheck` |

### Fluxo de Leitura (Read Workflow)

1. `go_workspace` → entender a estrutura do módulo
2. `go_search` → localizar símbolos sem saber o arquivo
3. `go_file_context` → após ler um arquivo Go, entender as dependências do mesmo pacote
4. `go_package_api` → ver a API de um pacote externo ou interno

### Fluxo de Edição (Edit Workflow)

1. Antes de editar: `go_symbol_references` para medir o impacto da mudança
2. Após editar: `go_diagnostics` para checar erros de compilação
3. Se alterou `go.mod`: `go_vulncheck` para verificar vulnerabilidades

### Regra de Ordem de Prioridade

```
graphify query  →  gopls MCP  →  ast-grep  →  replace_file_content / view_file cirúrgico
```

- **graphify** para navegação de arquitetura macro e relações entre módulos
- **gopls** para resolver tipos, assinaturas, referências e diagnósticos em Go
- **ast-grep** para busca sintática e estrutural precisa quando o símbolo ou padrão é conhecido
- **replace_file_content / view_file** (cirúrgico por linha) para leitura e diffs cirúrgicos delimitados
