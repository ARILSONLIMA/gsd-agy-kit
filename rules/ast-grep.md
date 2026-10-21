---
trigger: always_on
description: Busca estrutural baseada em AST via ast-grep para localização precisa de nós e símbolos sem leitura integral de arquivos.
---

# ast-grep: Busca Estrutural de Código

- **Prioridade de Busca:** Para localizar funções, classes, métodos ou chamadas de API sem consumir tokens com leituras completas de arquivos, use `ast-grep run -p '<padrão>'` ou a ferramenta MCP `ast_query`.
- **Padrões Chave por Stack:**
  - **JavaScript / TypeScript:**
    - Funções: `ast-grep run -p 'function $NAME($$$) { $$$ }'` ou `ast-grep run -p 'const $NAME = ($$$) => { $$$ }'`
    - Classes / Métodos: `ast-grep run -p 'class $NAME { $$$ }'` ou `ast-grep run -p '$NAME($$$) { $$$ }'`
    - Rotas Express / Fastify: `ast-grep run -p 'router.$METHOD($PATH, $$$)'` ou `ast-grep run -p 'app.$METHOD($PATH, $$$)'`
    - Queries SQL: `ast-grep run -p 'db.prepare($SQL)'` ou `ast-grep run -p '$DB.query($SQL, $$$)'`
  - **Go:**
    - Struct/Tipo: `ast-grep run -p 'type $NAME struct { $$$ }' --lang go`
    - Função: `ast-grep run -p 'func $NAME($$$) { $$$ }' --lang go`
    - Chamadas: `ast-grep run -p '$PKG.$FUNC($$$)'`
  - **Python:**
    - Funções: `ast-grep run -p 'def $NAME($$$): $$$'`
    - Classes: `ast-grep run -p 'class $NAME: $$$'`
- **Inspeção Cirúrgica via Outline:** Para obter a estrutura completa de assinaturas de qualquer arquivo de código sem ler o corpo, use a ferramenta MCP `view_skeleton` ou o comando:
  ```bash
  node .agents/kit/gsd-outline.cjs <caminho-do-arquivo>
  # ou alternativamente via MCP CLI:
  node .agents/mcp-server.cjs skeleton <caminho-do-arquivo>
  ```
- **Inspeção Cirúrgica:** Use os números de linha retornados pelo `ast-grep` para abrir apenas o trecho exato com `view_file` (`StartLine`/`EndLine`).
- **Apenas Busca:** Proibido usar `ast-grep --rewrite` (`-r`). Edições em arquivos existentes devem ser cirúrgicas via `replace_file_content` / `edit_file`.
