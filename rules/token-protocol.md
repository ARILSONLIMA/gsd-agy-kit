---
trigger: always_on
description: Protocolo JIT de economia de tokens, Escada de Decisão do Ponytail (YAGNI/reuso), Comunicação Concisa do Caveman, diagnóstico test-driven, criação atômica, diffs cirúrgicos e verificação enxuta.
---

# Protocolo Canônico de Economia de Tokens, Engenharia Minimalista e Comunicação Concisa

## 0. Escada de Decisão Minimalista (Ponytail Decision Ladder)
Antes de criar qualquer linha de código ou abstração, adote a primeira opção suficiente:
1. **Precisa existir?** Aplique YAGNI estrito. Descarte opções e abstrações que ninguém pediu.
2. **Já existe no projeto?** Verifique o `Codebase Map` e reutilize componentes, helpers e serviços existentes.
3. **Standard library / plataforma?** Utilize os recursos nativos do ecossistema antes de inventar funções utilitárias.
4. **Dependência instalada?** Reutilize bibliotecas já existentes no `package.json`, `go.mod`, `Cargo.toml`. **PROIBIDO** adicionar novas dependências sem justificativa crítica.
5. **Uma linha legível:** Prefira expressões diretas a wrappers de uso único.
6. **Código mínimo funcional:** O menor diff correto vence.
7. **Comentários de atalho deliberado:** Marque omissões intencionais com:
   `// shortcut: <o limite assumido>, <quando refatorar>`

## 1. Comunicação Concisa e Resposta Direta (Caveman Voice)
- Responda de forma direta e sem floreios: `[alvo] [ação] [motivo]. [próximo passo].`
- Elimine cerimônia e saudações ("Com certeza!", "Vou agora...", "Espero ter ajudado!").
- Mantenha código, caminhos e comandos 100% literais (byte-exact).
- Encerre respostas técnicas com 1-2 linhas sobre: o que foi omitido/ignorado e riscos conhecidos.
- Auto-Clarity: Libere explicações completas para alertas de segurança e ações destrutivas.

## 2. Diagnóstico Rápido e Preciso (JIT — Sob Demanda)
- **Test-Driven First:** Em projetos com testes (`npm test`, `go test`, `pytest`), execute PRIMEIRO a suíte pontual para capturar o stack trace e a asserção exata da falha.
- **Navegação Sob Demanda:**
  - `view_skeleton "<arquivo>"` (`node .agents/mcp-server.cjs skeleton "<arquivo>"`): Para arquivos de código existentes com mais de 50 linhas, execute obrigatoriamente view_skeleton para mapear assinaturas e intervalos exatos de linhas antes de ler trechos de código.
  - `graphify query "<pergunta>"`: Use apenas para entender arquitetura macro e relações entre múltiplos módulos desconhecidos.
  - `query_docs` (`node .agents/mcp-server.cjs docs "<query>"`): Busque especificações em `.md` sem carregar arquivos inteiros.
  - `check_dependency` (`node .agents/mcp-server.cjs dep "<pacote>"`): Cheque versões sem ler lockfiles gigantes.
  - `mempalace_recall` (`node .agents/mcp-server.cjs recall "<query>"`): Consulte decisões e bugs resolvidos anteriormente.
  - `lsp_*` (`node .agents/mcp-server.cjs lsp <diagnostics|definition|references|hover>`): Resolva tipos, contratos e diagnósticos de compilação.
- **Proibido Encadeamento Cego:** Nunca convoque ferramentas em sequência burocrática fixa. Acione apenas a ferramenta relevante para a hipótese investigada.
- **`read_file` / `view_file` Cirúrgico:** Restrito a arquivos de código com `StartLine` e `EndLine` (máximo 100 linhas por bloco).

## 3. Criação Atômica de Arquivos Novos vs Diffs Cirúrgicos
- **Arquivos NOVOS:** Devem ser criados de forma atômica e integral em uma única chamada `write_file` / `write_to_file` (zero churn).
- **Arquivos EXISTENTES:** Modificações devem ser feitas cirurgicamente via `edit_file` / `replace_file_content` com intervalos mínimos de linhas. É terminantemente proibido sobrescrever arquivos de código existentes com `write_file`/`write_to_file` ou usar `ast-grep --rewrite` (`-r`).

## 4. Validação Contínua Pós-Edição (Syntax & LSP Validation)
- Imediatamente após alterar qualquer arquivo de código existente, valide a sintaxe com `node .agents/mcp-server.cjs lsp diagnostics <arquivo>` (ou tool MCP `lsp_diagnostics`), ou através do validador rápido da linguagem (ex: `node -c <arquivo>`, `go vet`, `python -m py_compile`). Nunca prossiga para testes complexos sem certificar-se de zero erros sintáticos.

## 5. Sanitização de Comandos e Terminal
- Proibido comandos de despejo cego no terminal (`cat`, `Get-Content`, `type`, `head`, `tail`) em arquivos de código.
- Testes em lote: Nunca execute com flags excessivamente verbosas (`-v`) em suítes inteiras; use filtros pontuais (ex: `-run <Teste>` ou arquivo específico).

## 6. Memória Contínua e Circuit Breaker
- Ao validar uma solução de bug ou decisão arquitetural: `node .agents/mcp-server.cjs capture <decisions|problems> "<tópico>" "<conteúdo>"`.
- Circuit Breaker: `ast-grep`, `graphify` e o verificador da linguagem devem estar operacionais para garantir a blindagem do repositório.

## 7. Fase de Verificação Enxuta (Frugal Verification Protocol)
- Em fases ou instruções de verificação (`Verification`, `npm test`, validação final de testes):
  - Execute estritamente o comando de teste focado.
  - Se todos os testes passarem (100% verde), encerre o turno de forma concisa e direta, SEM convocar leituras adicionais, queries no banco ou ferramentas auxiliares redundantes.
  - Invoque inspeção de código ou ferramentas MCP apenas se houver falhas ativas remanescentes a serem corrigidas.
