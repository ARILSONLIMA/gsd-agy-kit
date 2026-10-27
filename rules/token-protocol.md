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
- **Localização de Símbolos e Chamadas:** Para rastrear onde uma função, método ou rota é utilizada, convoque SEMPRE `lsp_references` ou `ast_query` (`ast-grep run -p '<padrão>'`). NUNCA faça varreduras com `grep -rn` massivo nem abra múltiplos arquivos inteiros com `view_file`.
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

## 8. Descoberta & Ativação Autônoma de Skills (Agentic Skill Retrieval)
O ambiente opera em **Zero-Baseline** (0 subagentes e 0 skills ativos no prompt por padrão para máxima economia de contexto). O agente possui **autonomia total** para diagnosticar o código e puxar sob demanda o conhecimento técnico que julgar necessário, sem viés ou amarras de fases engessadas:

### Como Descobrir e Ativar Skills Autonomamente:
1. **Via MCP Tool:** Invoque a ferramenta `skill_search({ query: "<problema ou intenção>", activate: true })`.
2. **Via Linha de Comando:** Execute `node .agents/mcp-server.cjs skill search "<termo>"` ou `${CLI_CMD} skill activate "<nome>"`.
3. **Via Leitura Direta:** Executar `read_file` em `.agents/skills/<nome>/SKILL.md` ou `.agents/skills-pool/<nome>/SKILL.md` ativa a skill instantaneamente via hook JIT com TTL sustentável de 5 turnos (auto-renovado a cada acesso).

### Principais Clusters Especializados no Pool Permanente:
- **Governança & Fases GSD:** `gsd-plan-phase`, `gsd-execute-phase`, `gsd-verify-work`, `gsd-progress`.
- **Senior Dev & YAGNI:** `ponytail`, `ponytail-review`, `ponytail-debt`, `ponytail-audit`.
- **Modo Cirúrgico Terse:** `caveman`, `ultracave`, `caveman-review`.
- **Refatoração Segura & Patches:** `safe-refactor`, `surgical-patch`, `investigate-first`, `lean-build`.
- **Diagnóstico & Testes:** `gsd-debug`, `gsd-test`, `gsd-add-tests`, `gsd-tokens`.

### Subagentes Cirúrgicos sob Demanda (`invoke_subagent`):
- **Governança Documental:** `gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-debugger`, `gsd-code-reviewer`, `gsd-doc-writer`.
- **Cavecrew Cirúrgicos:** `cavecrew-builder` (código conciso), `cavecrew-investigator` (varredura read-only), `cavecrew-reviewer` (revisão rápida).

## 9. Protocolo Obrigatório de Documentação de Ambiguidades (`AMBIGUITIES.md`)
O agente deve auditar e registrar ambiguidades de especificação e contratos técnicos no arquivo `AMBIGUITIES.md` durante a Fase 1 (Forensics), Fase 2 (Planning) e obrigatoriamente após receber Change Requests na Fase 5.

### Formato Obrigatório em Bloco Atômico (Parágrafo Único Autossuficiente):
Para garantir máxima clareza, rastreabilidade e pontuação em avaliadores automatizados, **cada ambiguidade DEVE ser descrita em um parágrafo contínuo único e autossuficiente** sob o título, reunindo o conflito identificado, o impacto técnico e a premissa adotada:

```markdown
### AMB-01: [Contexto/Entidade] — [Conflito Técnico ou Omissão Identificada]
Identificada indefinição em [módulo/fluxo] quanto a [descrever o conflito, termos vagos ou omissão de contrato]. Decisão de engenharia adotada: [declarar a premissa determinística implementada no código-fonte, cobrindo o tratamento de exceção, fallback ou política de normalização].
```

### Os 4 Vetores Universais de Incerteza de Software a Auditar:
1. **Vetor Temporal e Fusos Horários:** Conflito entre fuso local operacional vs persistência canônica UTC (ISO 8601 com sufixo `Z`), normalização de datas para `new Date()` e agregações em janelas temporais móveis.
2. **Vetor de Borda, Divisões e Estados Inativos:** Divisão por zero em indicadores de taxa/eficiência quando volume ou produção for nulo (retorno estrito de `0.0`), e contabilidade de consumo de recursos durante períodos ociosos, de espera ou repouso.
3. **Vetor de Intermitência de Entrada e Sinais:** Falhas de comunicação, perda de sinal ou pacotes parciais (política de descarte vs interpolação), e suavização de ruídos em séries de dados (filtro por média ou mediana em janelas de tempo/amostras).
4. **Vetor de Contratos de Payload e APIs:** Diferenciação de propriedades nulas, strings vazias e campos omitidos em requisições parciais (PATCH vs PUT) e valores padrão de retorno em consultas sem dados.
