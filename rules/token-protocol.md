---
trigger: always_on
description: Protocolo JIT de economia de tokens, diagnóstico test-driven, criação atômica e diffs cirúrgicos.
---

# Protocolo de Economia de Tokens e Diagnóstico JIT

## 1. Diagnóstico Rápido e Preciso (JIT — Sob Demanda)
- **Test-Driven First:** Em projetos com testes (`npm test`, `go test`, `pytest`), execute PRIMEIRO a suíte pontual para capturar o stack trace e a asserção exata da falha.
- **Navegação Sob Demanda:**
  - `graphify query "<pergunta>"`: Use apenas para entender arquitetura macro e relações entre múltiplos módulos desconhecidos.
  - `view_skeleton "<arquivo>"` (`node .agents/mcp-server.cjs skeleton "<arquivo>"`): Use para ver assinaturas e números de linhas antes de abrir o arquivo.
  - `query_docs` (`node .agents/mcp-server.cjs docs "<query>"`): Busque especificações em `.md` sem carregar arquivos inteiros.
  - `check_dependency` (`node .agents/mcp-server.cjs dep "<pacote>"`): Cheque versões sem ler lockfiles gigantes.
  - `mempalace_recall` (`node .agents/mcp-server.cjs recall "<query>"`): Consulte decisões e bugs resolvidos anteriormente.
  - `lsp_*` (`node .agents/mcp-server.cjs lsp <diagnostics|definition|references|hover>`): Resolva tipos, contratos e diagnósticos de compilação.
- **Proibido Encadeamento Cego:** Nunca convoque ferramentas em sequência burocrática fixa. Acione apenas a ferramenta relevante para a hipótese investigada.
- **`view_file` Cirúrgico:** Restrito a arquivos de código com `StartLine` e `EndLine` (máximo 100 linhas por bloco).

## 2. Criação Atômica de Arquivos Novos vs Diffs Cirúrgicos
- **Arquivos NOVOS:** Devem ser criados de forma atômica e integral em uma única chamada `write_to_file` (zero churn).
- **Arquivos EXISTENTES:** Modificações devem ser feitas cirurgicamente via `replace_file_content` com intervalos mínimos de linhas. É terminantemente proibido sobrescrever arquivos de código existentes com `write_to_file` ou usar `ast-grep --rewrite` (`-r`).

## 3. Sanitização de Comandos e Terminal
- Proibido comandos de despejo cego no terminal (`cat`, `Get-Content`, `type`, `head`, `tail`) em arquivos de código.
- Testes em lote: Nunca execute com flags excessivamente verbosas (`-v`) em suítes inteiras; use filtros pontuais (ex: `-run <Teste>` ou arquivo específico).

## 4. Memória Contínua e Circuit Breaker
- Ao validar uma solução de bug ou decisão arquitetural: `node .agents/mcp-server.cjs capture <decisions|problems> "<tópico>" "<conteúdo>"`.
- Circuit Breaker: `ast-grep`, `graphify` e o verificador da linguagem devem estar operacionais para garantir a blindagem do repositório.
