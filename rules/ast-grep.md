---
trigger: always_on
description: Busca estrutural baseada em AST via ast-grep para localização precisa de nós e símbolos sem leitura integral de arquivos.
---

# ast-grep: Busca Estrutural de Código

- **Prioridade de Busca:** Para localizar funções, structs, métodos ou chamadas de API, use `ast-grep run -p '<padrão>'` em vez de ler arquivos inteiros ou usar grep textual.
- **Padrões Chave:**
  - Struct/Tipo: `ast-grep run -p 'type $NAME struct { $$$ }' --lang go`
  - Função: `ast-grep run -p 'func $NAME($$$) { $$$ }' --lang go`
  - Chamadas: `ast-grep run -p '$PKG.$FUNC($$$)'`
- **Inspeção Cirúrgica:** Use as linhas retornadas pelo `ast-grep` para abrir apenas o trecho exato com `view_file` (`StartLine`/`EndLine`).
- **PowerShell (Windows):** Sempre use aspas simples (`'...'`) para padrões (ex: `'type $NAME struct { $$$ }'`) para evitar expansão indevida de `$$$`.
- **Apenas Busca:** Proibido usar `ast-grep --rewrite` (`-r`). Edições em arquivos existentes devem ser cirúrgicas via `replace_file_content`.
