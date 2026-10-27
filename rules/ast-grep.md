---
trigger: always_on
description: Busca estrutural baseada em AST via ast-grep para localização precisa de símbolos.
---

# ast-grep: Busca Estrutural

- **Busca Sintática:** Use `ast-grep run -p '<padrão>'` (ou MCP `ast_query`) para localizar símbolos sem ler arquivos inteiros:
  - JS/TS: `ast-grep run -p 'function $NAME($$$)'` | `router.$METHOD($PATH, $$$)` | `db.prepare($SQL)`
  - Go: `ast-grep run -p 'type $NAME struct { $$$ }' --lang go` | `func $NAME($$$)`
  - Python: `ast-grep run -p 'def $NAME($$$):'`
- **Estrutura por Outline:** Use `gsd_outline` (MCP) ou `node .agents/mcp-server.cjs skeleton <arquivo>` para obter linhas e assinaturas.
- **Apenas Busca:** Proibido `ast-grep --rewrite`. Edições sempre via `replace_file_content` / `edit_file`.
