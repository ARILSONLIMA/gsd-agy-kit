---
trigger: model_decision
description: Ative para busca estrutural AST de funções, rotas e queries SQL sem leitura integral de arquivos.
---

# ast-grep: Busca Estrutural

- Use `ast_query` (MCP) ou `node .agents/mcp-server.cjs ast '<padrão>' [lang]` para localizar funções, rotas e queries (`function $NAME($$$)`, `router.$M($P, $$$)`, `db.prepare($SQL)`) em vez de `grep -rn` amplo.
- **Somente Leitura:** Proibido `ast-grep --rewrite` (`-r`); edite exclusivamente com `edit_file` / `replace_file_content`.
