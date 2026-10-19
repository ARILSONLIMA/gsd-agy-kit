---
trigger: always_on
description: Use Multi-Language Hybrid LSP tools (via MCP or CLI) for compiler-accurate diagnostics, definitions, references, hover signatures, and safe symbol renaming across 20 ecosystems (Go, TS/JS, Python, Rust, PHP, C/C++, Java, C#, Lua, Bash/Shell, HTML/CSS/JSON, YAML/Helm, SQL, Docker, Ruby, Dart, Elixir, Kotlin, Swift, and Terraform).
---

## Multi-LSP Híbrido (Resolução de Tipos, Referências e Diagnósticos)

Este projeto possui o **Motor Multi-LSP Híbrido** integrado ao servidor MCP (`gsd-economy`) e acessível via CLI. Ele resolve definições, referências cruzadas, assinaturas e diagnósticos de compilação sem desperdiçar tokens lendo arquivos inteiros.

### Ecossistemas Suportados (20 Stacks)
- **Código & Sistemas:** Go (`gopls`), TS/JS (`vtsls`, `typescript-language-server`), Python (`pyright`, `basedpyright`, `ruff`), Rust (`rust-analyzer`), C/C++ (`clangd`), C# (`roslyn`, `csharp-ls`), Java (`jdtls`), PHP (`intelephense`), Lua (`lua-language-server`), Ruby (`solargraph`, `ruby-lsp`), Dart (`dart`), Elixir (`elixir-ls`), Kotlin (`kotlin-language-server`), Swift (`sourcekit-lsp`).
- **Infra, Dados & Web:** Shell/Bash (`bash-language-server`, `shellcheck`), HTML/CSS/JSON (`vscode-langservers-extracted`), YAML/Helm (`yaml-language-server`, `helm_ls`), SQL (`sqls`, `sqlfluff`), Docker (`docker-langserver`, `hadolint`), Terraform (`terraform-ls`).

### 1. Ferramentas LSP Universais (Todas as Linguagens)

Use via chamada MCP nativa ou via CLI (`run_command`) antes de `view_file`:

| Objetivo | Tool MCP | Equivalente CLI (para Agentes e Subagentes) |
|---|---|---|
| Checar erros de compilação / tipagem / sintaxe após editar | `lsp_diagnostics` | `node .agents/mcp-server.cjs lsp diagnostics [arquivo]` |
| Ir para a definição exata de um símbolo (função, classe, struct, tipo) | `lsp_definition` | `node .agents/mcp-server.cjs lsp definition "<símbolo>" [arquivo]` |
| Listar todas as referências a um símbolo antes de alterar assinatura | `lsp_references` | `node .agents/mcp-server.cjs lsp references "<símbolo>" [caminho]` |
| Inspecionar assinatura completa, tipo e docstring de um símbolo | `lsp_hover` | `node .agents/mcp-server.cjs lsp hover "<símbolo>" [arquivo]` |
| Listar todos os símbolos estruturais de um arquivo | `lsp_hover` (`file_path`) | `node .agents/mcp-server.cjs lsp symbols "<arquivo>"` |
| Renomear um símbolo com segurança em múltiplos arquivos | `lsp_rename` | `node .agents/mcp-server.cjs lsp rename "<antigo>" "<novo>" [caminho]` |
| Verificar saúde dos servidores LSP da stack atual | — | `node .agents/mcp-server.cjs lsp health` |

> **Nota para projetos Go com `gopls` MCP dedicado:** Se as tools do servidor `gopls` MCP (`go_workspace`, `go_search`, `go_file_context`, `go_package_api`, `go_symbol_references`, `go_diagnostics`, `go_vulncheck`) também estiverem ativas na sessão, utilize-as em conjunto com `lsp_*`.

### 2. Fluxo de Leitura e Navegação (Read Workflow)

1. `graphify query "<pergunta>"` → entender arquitetura macro e dependências entre módulos
2. `lsp_definition` / `lsp_hover` (ou `view_skeleton`) → localizar símbolos e ver assinaturas sem abrir arquivos inteiros
3. `ast_query` (`ast-grep`) → localizar padrões sintáticos específicos
4. `view_file` cirúrgico (com `StartLine` e `EndLine` <= 100 linhas) → ler apenas o trecho exato necessário

### 3. Fluxo de Edição Segura (Edit Workflow)

1. **Antes de alterar assinatura/contrato:** Execute `lsp_references` ou `impact_analysis` para mapear todos os pontos de chamada no projeto.
2. **Aplicar alteração:** Use `replace_file_content` cirúrgico (ou `lsp_rename` para renomeações de identificadores).
3. **Imediatamente após editar:** Execute `lsp_diagnostics` no arquivo alterado para validar sintaxe e tipagem com custo mínimo de tokens antes de rodar suítes de teste.

