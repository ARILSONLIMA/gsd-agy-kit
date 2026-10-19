# Protocolo Obrigatório de Economia de Tokens e Análise de Código

## 1. Ordem de Prioridade Inflexível (Zero Desperdício de Tokens)
1. `mempalace_recall`: Consulte o MemPalace para verificar decisões anteriores e soluções de bugs já validadas antes de propor soluções ou re-ler históricos.
   - Execute: `node .agents/mcp-server.cjs recall "<query>"` (ou use a ferramenta MCP se disponível no schema).
2. `graphify query "<pergunta>"`: Entendimento de arquitetura macro, god nodes e dependências entre módulos. Se `graphify-out/` não existir, execute `graphify update .` imediatamente.
3. `query_docs`: Para buscar regras de negócio em arquivos `.md` (PRDs, especificações) sem ler arquivos inteiros.
   - Execute: `node .agents/mcp-server.cjs docs "<query>"` (ou use a ferramenta MCP se disponível no schema).
4. `view_skeleton`: Use para visualizar o esqueleto (assinaturas, structs, interfaces) com números de linha antes de ler trechos específicos.
   - Execute: `node .agents/mcp-server.cjs skeleton "<arquivo>"` (ou use a ferramenta MCP se disponível no schema).
5. `check_dependency`: Use para verificar se uma biblioteca está instalada e sua versão. NUNCA abra arquivos de lockfile (`package-lock.json`, `go.sum`).
   - Execute: `node .agents/mcp-server.cjs dep "<pacote>"` (ou use a ferramenta MCP se disponível no schema).
6. `lsp_*` (Multi-LSP Híbrido — 20 Ecossistemas): Para resolver definições (`lsp_definition`), referências cruzadas (`lsp_references`), assinaturas/tipos (`lsp_hover`), renomeações seguras (`lsp_rename`) e diagnósticos (`lsp_diagnostics`) em qualquer linguagem (Go, TS/JS/Node, Python, Rust, PHP, C/C++, Java, C#, Ruby, Dart, Elixir, Lua, Bash/Shell, Web/HTML/CSS/JSON, YAML/K8s, SQL, Docker, Kotlin, Swift, Terraform).
   - Execute: `node .agents/mcp-server.cjs lsp <diagnostics|definition|references|hover|symbols|rename>` (ou use as ferramentas MCP `lsp_*`).
7. `ast-grep` CLI (`ast-grep run -p '<padrão>'`): Buscas sintáticas e estruturais precisas na AST.
8. `view_file` CIRÚRGICO APENAS: É estritamente proibido ler arquivos sem limites de linhas (`StartLine`/`EndLine`), com mais de 100 linhas ou para explorar repositório sem antes consultar `graphify` e `view_skeleton`.

## 2. Memória Contínua (MemPalace)
- Ao tomar uma decisão técnica ou resolver um bug complexo, registre o fato no MemPalace para evitar retrabalho em sessões futuras:
  - Execute: `node .agents/mcp-server.cjs capture <decisions|problems|milestones> "<tópico>" "<conteúdo>" [motivo]` (ou use a ferramenta MCP `mempalace_capture` se disponível no schema).

## 3. Diffs Cirúrgicos Obrigatórios
- É terminantemente proibido sobrescrever arquivos de código inteiros (`write_to_file`) ou usar reescrita em massa com `ast-grep --rewrite` (`-r`).
- Toda e qualquer edição de código existente deve ser realizada cirurgicamente via `replace_file_content` com intervalos mínimos de linhas.

## 4. Sanitização de Testes e Builds
- Nunca execute `go test` com a flag `-v` em lote. Utilize testes pontuais com `-run <Teste>` ou suítes enxutas.
- Proibição de comandos de despejo cego no terminal (`cat`, `Get-Content`, `type`, `head`, `tail`) em arquivos de código.

## 5. Circuit Breaker (Hard Stop)
- É inegociável que `ast-grep`, `graphify` e o servidor/verificador LSP da linguagem do projeto estejam operacionais.
- Se qualquer uma falhar, todas as atividades devem parar imediatamente até o reparo da ferramenta.
