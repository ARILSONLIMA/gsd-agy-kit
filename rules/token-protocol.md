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

## 8. Catálogo Sintético de Subagentes & Skills (Zero-Baseline JIT)
O ambiente opera em **Zero-Baseline** (0 subagentes e 0 skills ativos no prompt por padrão). Todos os recursos permanecem preservados no pool permanente e são ativados pontualmente (<2ms) via JIT com TTL cirúrgico de 1 turno.

### Subagentes de Governança Documental GSD (`invoke_subagent`):
- `gsd-planner`: Planejamento formal, fatiamento vertical e atualização de `STATE.md` e `ROADMAP.md`.
- `gsd-executor`: Execução de fases com geração obrigatória de `*-SUMMARY.md` e atualização de estado.
- `gsd-verifier`: Execução de critérios UAT e encerramento oficial de fase no `STATE.md`.
- `gsd-doc-writer`: Sincronização de documentação canônica, diagramas e arquitetura.
- `gsd-debugger`: Sessões isoladas de investigação forense e reprodução de erros.
- `gsd-code-reviewer`: Revisão estrita de conformidade com guardrails e clean code.
- `gsd-phase-researcher`: Investigação prévia de tecnologias, contratos e spikes.

### Subagentes Cirúrgicos Cavecrew (`invoke_subagent`):
- `cavecrew-builder`: Implementação de código ultraconcisa (1-2 arquivos) com recibo de diff.
- `cavecrew-investigator`: Varredura read-only rápida de símbolos, rotas e referências.
- `cavecrew-reviewer`: Revisão rápida e concisa pós-edição sem prolixidade.

### Skills do Fluxo (`read_file` em `.agents/skills/<nome>/SKILL.md`):
- `gsd-plan-phase` | `gsd-execute-phase` | `gsd-verify-work` | `gsd-progress`: Governança de fases GSD.
- `ponytail` | `ponytail-review` | `ponytail-debt`: Auditoria de simplicidade, YAGNI e reuso.
- `caveman` | `ultracave` | `caveman-review`: Modo de resposta cirúrgica e sem floreios.
- `gsd-tokens` | `gsd-test` | `gsd-agy-update`: Métricas de economia, execução de testes e updates.

## 9. Protocolo Obrigatório de Documentação de Ambiguidades (`AMBIGUITIES.md`)
O agente deve auditar e registrar ambiguidades de especificação e regras de negócio no arquivo `AMBIGUITIES.md` durante a Fase 1 (Forensics), Fase 2 (Planning) e obrigatoriamente após receber Change Requests na Fase 5.

### Formato Obrigatório por Ambiguidade:
```markdown
### AMB-XX: [Título Descritivo da Ambiguidade]
1. **Ambiguidade Identificada:** Descreva o conflito conceitual, termo vago ou omissão de contrato de dados entre documentação e requisitos.
2. **Impacto no Sistema:** Detalhe o risco de divergência (ex: inconsistência de métricas analíticas, distorção temporal, exceções não tratadas).
3. **Decisão de Engenharia Implementada:** Declare a premissa adotada no código-fonte para solucionar a indefinição de forma robusta e previsível.
```

### Checklist Essencial de Ambiguidades a Documentar:
- **Fusos Horários e Carimbos Temporais:** Tratamento de horário local operacional (ex: São Paulo UTC-3) vs persistência UTC (ISO 8601 com sufixo `Z`).
- **Estados Ociosos e Marcha Lenta:** Distância zero com motor ligado e consumo positivo: cálculo de eficiência km/l deve retornar 0.0 e classificar consumo em litros/hora ou marcha lenta.
- **Falha de Sinal e Telemetria Parcial:** Perda de GPS com motor/ignição ativa: interpolação de pontos vs descarte de pacotes incompletos.
- **Flutuações de Sensores (Janela Móvel):** Ruídos e oscilações em sensores de nível de tanque (boia) causados por rampas ou declives: tolerância percentual vs suavização por média/mediana móvel em janelas de tempo/amostras.
- **Contratos de Payload REST:** Valores nulos vs ausentes em requisições parciais (PATCH/PUT).
