---
trigger: always_on
description: Use ast-grep for structural code search and targeted extraction instead of reading entire files or using text regex.
---

## ast-grep

Este projeto possui o `ast-grep` configurado globalmente para busca e navegação estrutural baseada em AST (Go, TypeScript, etc.).

Regras:
- **Prioridade de Busca Estrutural:** Para localizar definições de funções, structs, métodos, interfaces ou chamadas de API, utilize `ast-grep run -p '<pattern>'` em vez de carregar arquivos inteiros com `view_file` ou utilizar `grep`/`ripgrep` textual amplo.
- **Padrões Comuns para Go:**
  - Encontrar uma struct ou tipo: `ast-grep run -p 'type $NAME struct { $$$ }' --lang go`
  - Encontrar declaração de função: `ast-grep run -p 'func $NAME($$$) { $$$ }' --lang go`
  - Encontrar método com receiver: `ast-grep run -p 'func ($RECV) $NAME($$$) { $$$ }' --lang go`
  - Encontrar chamada de função específica: `ast-grep run -p '$PKG.$FUNC($$$)' --lang go`
- **Economia de Contexto:** Após identificar o arquivo e o bloco via `ast-grep`, utilize os números de linha retornados para inspecionar cirurgicamente apenas as linhas necessárias (`StartLine` e `EndLine` no `view_file`), evitando despejar arquivos inteiros na conversa.
- **Aviso Obrigatório para PowerShell (Windows):** Sempre utilize aspas simples (`'...'`) para os padrões do `ast-grep` (ex: `'type $NAME struct { $$$ }'`). O uso de aspas duplas faz o PowerShell interpretar `$$$` como variável interna antes de repassar ao ast-grep, causando falha de parsing.
- **Diffs Cirúrgicos Obrigatórios (Sem Reescrita em Massa):** O `ast-grep` deve ser utilizado estritamente para busca e navegação estrutural (`ast-grep run -p`). É terminantemente proibido utilizar `ast-grep --rewrite` (`-r` ou `-u`) para reescrever arquivos em massa, ou sobrescrever arquivos inteiros (`write_to_file`) em código existente. Toda modificação de código deve ser realizada cirurgicamente via `replace_file_content` com intervalos mínimos de linhas.
