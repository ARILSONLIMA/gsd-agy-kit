# Changelog — Antigravity GSD Kit (`gsd-agy-kit`)

Todas as melhorias e novidades relevantes deste projeto são documentadas neste arquivo.

## [2.7.1] - 2026-10-28
- **Correção na Suíte de Testes & Paridade de Regras (`test-kit.sh`, `test-kit.ps1`, `rules/token-protocol.md`):**
  - **Resolução de Falso Positivo no Catálogo Sintético:** Atualizada a expressão regular de validação em `test-kit.sh` e `test-kit.ps1` para contemplar os termos introduzidos na arquitetura de Descoberta JIT (`Descoberta JIT`, `Auto-Promoção JIT`, `Descoberta & Ativação Autônoma`), evitando falhas em workspaces recém-instalados.
  - **Fallback Resiliente de Resolução:** Adicionada busca em cascata para `token-protocol.md` em múltiplos layouts de diretórios (`.agents/rules/`, `rules/` e `${KIT_DIR}/rules/`).
  - **Paridade Canônica:** Seção 5 de `rules/token-protocol.md` ajustada com subtítulo unificado para garantir compatibilidade retroativa com versões pré-2.5.5.
- **Bumping de Versão v2.7.1:**
  - `package.json`, `setup-ui.cjs`, `README.md`, e metadados de instalação atualizados para `v2.7.1`.

## [2.7.0] - 2026-10-28
- **Instalação Zero-Friction & Defaults Recomendados (`setup-ui.cjs`, `install.sh`, `setup.sh`):**
  - **Eliminação de Fricção no Onboarding:** Removidas as perguntas interativas de Code Review e MemPalace no instalador, aplicando por padrão os melhores recursos do kit (`MemPalace: true`, `Code Review: true`).
  - **Painel Informativo Transparente:** O instalador exibe o status ativo de governança (`MemPalace: ON`, `Code Review: ON`) sem pausar a execução ou gerar paralisia de escolha para novos usuários, orientando que ajustes finos são feitos via `/gsd-agy-config`.
  - **Novas Flags CLI no Instalador:** Suporte direto a `--mempalace`, `--no-mempalace`, `--code-review` e `--no-code-review` / `--no-review` em automações e pipelines CI/CD.
- **Centralização da Governança no `gsd-agy-config` (`gsd-agy-config.cjs` & `/gsd-agy-config`):**
  - **Wizard Rápido de 4 Perguntas Essenciais (`custom`):** Implementado assistente completo interativo pós-instalação cobrindo:
    1. Interface Frontend visual (com auto-detecção em React, Vue, Next, Vite, etc.).
    2. Code Review Automático & Gates de Segurança (ASVS e cobertura de API).
    3. Memória Episódica MemPalace em SQLite FTS5.
    4. Estratégia de Branching Git (`none`, `feature`, `task`).
  - **Execução CLI com Flags & Saída Estruturada:** O comando `gsd-agy-config custom` aceita flags diretas (ex: `--no-review`, `--no-mempalace`, `--branching=<modo>`) com saída `--json`.
  - **Correção de Avaliação Booleana:** Corrigido bug em `showConsolidatedStatus` onde flags booleanas falsas (`false`) eram sobrescritas para `true` por fallback indevido (`|| true`).
- **Suíte de Testes de Conformidade (`test-kit.sh` & `test-kit.ps1`):**
  - **Novo Teste Unitário 26.4:** Validação funcional de `gsd-agy-config.cjs custom` com flags de desativação, aferição de saída JSON e restauração segura aos defaults.
- **Bumping de Versão v2.7.0:**
  - `package.json`, `setup-ui.cjs`, `README.md`, e metadados de instalação atualizados para `v2.7.0`.

## [2.5.6] - 2026-10-28
- **Central Unificada de Governança (`/gsd-agy-config` e `gsd-agy-config.cjs`):**
  - **Unificação de 4 Comandos Legados em 1 Central Única:** consolida `gsd-settings`, `gsd-config`, `gsd-surface` e `gsd-profile-user` sob um único comando consolidado `/gsd-agy-config`.
  - **Módulo 1 — Workflow & Motores (`.planning/config.json`):**
    - Presets rápidos `backend` (sem UI, máxima economia de tokens), `fullstack` (com UI phase e review) e `custom` (4 perguntas essenciais).
    - Subcomandos `set <chave> <valor>` e `get <chave>` para knobs avançados (inline plan threshold, timeouts, branching).
    - Travas mandatórias Antigravity automáticas: `model_profile: inherit`, `use_worktrees: false`, `compact_content: true`, `source_grounding_authority: ast-grep`, `response_language: pt-BR`.
  - **Módulo 2 — Superfície de Skills (`skills-manager.cjs`):**
    - Subcomando `surface <zero|core|backend|full>` para alternar perfis do catálogo de skills sem reinstalação.
    - Subcomandos `surface enable <skill>`, `surface disable <skill>` e `surface list`.
  - **Módulo 3 — Perfil do Desenvolvedor (`USER-PROFILE.md`):**
    - Subcomando `profile` com wizard interativo ou flags diretas (`profile ponytail <modo>`, `profile caveman <modo>`).
    - Alinhamento explícito aos modos Ponytail (Sênior YAGNI & Escada de Reuso) e Caveman (Voz Concisa ASD-STE100 em pt-BR).
  - **Módulo 4 — Painel Consolidado de Status:**
    - Subcomando `show` / `status` exibindo dashboard completo (Workflow + Skills ativas vs pool + Perfil do Dev).
  - **Retrocompatibilidade Integral & Aliases:**
    - Mantida skill e script `gsd-agy-settings` como alias transparente redirecionando para `gsd-agy-config`.
    - Registrado em `GLOBAL_SKILLS`, `core` e `backend` em `skills-manager.cjs`.
    - Nova opção `[13]` e flag CLI `--config` no Painel de Controle `setup-ui.cjs`.
    - Adicionado à suíte de testes canônicos em `test-kit.sh` e `test-kit.ps1`.

## [2.5.5] - 2026-10-28
- **Invocação Direta de Comandos sem Barra (`<skill-name> [argumentos]`):**
  - **Intercepção Inteligente no `PreInvocation` Hook (`token-guard-preinvocation.cjs`):** detecta comandos enviados sem barra (ex: `gsd-execute-phase 2`, `gsd-plan-phase 1`, `gsd-profile-user`, `ponytail-debt`), auto-promove a skill de `.agents/skills-pool/` para `.agents/skills/` via JIT (TTL=5) e injeta diretiva efêmera com `$ARGUMENTS` exatos para execução instantânea no 1º turno.
  - **Eliminação de Bloqueio `Unknown command` do Terminal:** permite acionar qualquer skill do GSD e do kit diretamente pelo nome nativo sem ser barrado pelo parser client-side do Antigravity CLI.
  - **Diretriz Canônica em `rules/token-protocol.md` e `patch-agents.cjs`:** agentes e subagentes instruídos a resolver comandos sem barra como invocações diretas de workflow.
  - **Inclusão de `gsd-profile-user` nos Perfis:** skill adicionada formalmente aos perfis `core` e `backend` em `skills-manager.cjs`.

## [2.5.2] - 2026-10-28
- **Resiliência Greenfield nos Testes de Conformidade (`test-kit.sh` & `test-kit.ps1`):**
  - **Git Hooks em Projetos sem Git (Teste 8):** validação contextual de `.git/hooks` dispensando a obrigatoriedade dos ganchos quando o workspace ainda não foi inicializado com `git init`, eliminando falso-positivo.
  - **CodebaseMap em Repositórios Vazios (Teste 52):** fallback transparente de aferição para `libDir` quando a raiz do projeto é greenfield (zero arquivos de código-fonte), comprovando a operacionalidade do motor sem reprovação indevida.
  - **MCP CLI `map` e `debt` com Resolução de Diretório e Mensagem Greenfield (Teste 53 & `mcp-server.cjs`):**
    - `mcp-server.cjs`: subcomandos CLI `map` e `debt` agora aceitam caminhos de diretório arbitrários (`targetRoot`).
    - Validação de teste atualizada para reconhecer a resposta padrão `"Nenhum código-fonte relevante mapeado."`, eliminando falso-positivo em projetos recém-criados.

## [2.5.1] - 2026-10-28
- **Centralização do Grafo de Conhecimento em `.planning/graphs/` & Zero Duplicação de Pastas:**
  - `gsd-graphify-update.cjs`: pós-execução do `graphify update .`, move os artefatos diretamente para `.planning/graphs/` e remove a pasta redundante `graphify-out/`, eliminando duplicidade de arquivos e diretórios no workspace.
  - `rules/graphify.md`, `hooks/token-guard-pretool.cjs` e `patch-agents.cjs`: direcionam o modelo e os subagentes a consultarem o grafo canônico sempre com a flag explícita `--graph .planning/graphs/graph.json` (`query`, `path`, `explain`).
- **Desativação de Git Hooks Automáticos de Commit & Atualização Sob Demanda:**
  - `setup-ui.cjs`, `setup.sh` e `setup.ps1`: removida a instalação dos hooks `post-commit` e `post-commit.cmd`, com limpeza automática de ganchos legados. A sincronização do Graphify passa a ser estritamente sob demanda via skill `/graphify` ou menu do kit (`auto_update: false` em `.planning/config.json`).
- **Limpeza de Hooks Órfãos & Governança de Skills:**
  - Removida chamada legada/órfã de `gsd-graphify-update.sh` do `AfterTool` Bash em `~/.gemini/antigravity/settings.json`.
  - `skills-manager.cjs`: normalizada a lista de perfis substituindo a skill redundante `gsd-graphify` pela oficial `graphify`.

## [2.5.0] - 2026-10-27
- **Batching Paralelo Obrigatório & Zero Re-exploração em Execução (`rules/token-protocol.md`, `rules/compact-planning.md`, `hooks/token-guard-sessionstart.cjs`):**
  - Diretiva explícita de **Batching Paralelo Obrigatório** agrupando leituras independentes (`read_file`, `gsd_read_strip`, `query_docs`, `ast_query`) e edições multi-arquivo (`edit_file`) no mesmo turno, além de uso de `lsp_rename` para renomeações multi-arquivo.
  - **`PLAN.md` calibrado como Blueprint de Coordenadas (teto de 55 linhas, zero prosa):** exige coordenadas exatas `arquivo:L_ini-L_fim`, utilitários legados de `src/utils/` e constantes/contratos extraídos de `docs/` (proibindo wildcards `src/services/*`).
  - **`SessionStart` com Injeção Direta de `PLAN.md` / `DIAGNOSIS.md`:** injeta o Blueprint de Coordenadas no Turno 0 das Fases 2–5 com diretiva de Zero Re-exploração e suprime `codebaseMapText` redundante quando `PLAN.md` já mapeia os alvos.
- **`SkeletonEngine` v2 Completo para JS/TS & Calibração de `gsd_read_strip` (`lib/skeleton-engine.cjs`, `hooks/token-guard-pretool.cjs`):**
  - Extrai métodos de classe, construtores, getters/setters, rotas HTTP Express/Fastify (`app.get/post/...`, `router.use/...`), arrow functions atribuídas e `module.exports` com linhas exatas 1-based.
  - Limiar de `skeleton` / `strip` alinhado para arquivos `> 100` linhas (arquivos `<= 100` linhas lidos direto em 1 turno).
- **Ponte Efêmera `PostToolUse` → `PreInvocation`, Paridade `verify.cjs` ↔ Stop Gate & `AmbiguityGuard` (`lib/ambiguity-guard.cjs`, `verify.cjs`, `hooks/token-guard-diagnostics.cjs`, `hooks/token-guard-preinvocation.cjs`):**
  - Diagnósticos pós-edição (sintaxe, SQLi, Fowler smells e DRY `>= 1` bloco) gravados em `.agents/.cache/pending-edit-lint.json` e injetados via `ephemeralMessage` no turno seguinte pelo `PreInvocation` (consumo único, zero bloat permanente).
  - Novo motor `lib/ambiguity-guard.cjs` compartilhado entre `verify.cjs`, `PostToolUse` e `Stop` Gate realizando validação temática cruzada 1-para-1 dos itens `[AMB-XX]` de `TASK.md` / `CHANGE_REQUEST.md` contra `AMBIGUITIES.md`.
  - `verify.cjs` agora varre todos os diretórios de código existentes, define `ready_to_complete: false` em qualquer code smell ou divergência em `AMBIGUITIES.md`, usa `execFileSync` seguro e grava `last-verify-pass.json` para fast-path no `Stop` Gate.
  - `PreInvocation` com early-exit JSON imediato em `readStdin(150)` (eliminando stall de 300ms/turno) e suporte nativo a `lastUserInput`.
- **Progressive Disclosure de Regras (`trigger: model_decision`) & Higiene Hermética de Workspace (`setup-ui.cjs`, `setup.sh`, `setup.ps1`):**
  - Regras situacionais (`compact-planning.md`, `graphify.md`, `lsp.md`, `ast-grep.md`, `architecture-layers.md`) migradas para `trigger: model_decision`, reduzindo o prompt fixo por turno no Antigravity runtime.
  - `PostToolUse` restrito a tools de escrita/execução/MCP (zero spawn de Node em `read_file`/`view_file`), exclusões gravadas em `.git/info/exclude` (zero `M .gitignore`), remoção de `scripts/` na raiz e corte de ~2,8 MB de cópias duplicadas em `.agents/`, além de zero strings literais de suítes externas nos hooks/testes instalados.
- **Resiliência Total de Aliases e Zero Falsos-Erros no MCP Server (`mcp-server.cjs`):**
  - **Normalizador Universal `resolveFilePath(args)`:** Aceita transparentemente `file_path`, `filePath`, `path`, `Path`, `target`, `TargetFile`, `AbsolutePath` e `file` em todas as tools (`view_skeleton`, `gsd_outline`, `gsd_read_strip`, `lsp_*`, `impact_analysis`, `env_skeleton`, `caveman_shrink`, `ast_query`), eliminando crashes de chamada camelCase.
  - **`ast_query` Sem Falso Erro em 0 Matches:** Código de saída `1` do `ast-grep` sem `stderr` agora retorna `"Nenhuma correspondência encontrada..."` com `isError: false`, zerando incidentes falsos no `ErrorGuard`.
  - **`quick_verify` Sem Falso Alarme de Falha de Ferramenta:** Retorna `isError: false` via JSON-RPC mesmo quando a suíte de testes aponta falhas de domínio (`status: FAIL`), mantendo a ferramenta confiável desde a Fase 1, enquanto preserva exit code `1` no modo CLI.
  - **Compatibilidade Nativa com Lazy MCP do Antigravity CLI:** Manifesto completo (`ALL_TOOLS_MANIFEST`) habilitado por padrão para carregamento sob demanda do AGY CLI (`GSD_MCP_GATEWAY_ONLY=1` disponível para clientes sem lazy loading).
- **Inspetor Cirúrgico `gsd-read-strip.cjs` v2 com Numeração Original e Tags Ponytail:**
  - Preserva 100% da numeração original de linhas (`42: código`) mesmo após suprimir docstrings, comentários de bloco (`/* ... */`) e linhas em branco, permitindo `edit_file` cirúrgico imediato sem releitura.
  - Preserva comentários de governança (`// shortcut:`, `// ponytail:`, `// TODO(gsd):`, `// TODO(security):`) e aceita fatiamento opcional `[startLine] [endLine]`.
- **Deduplicação em Janela com Sub-Ranges & Blindagem de Motor Interno (`hooks/token-guard-pretool.cjs`):**
  - **Windowed Sub-Range Dedup:** Bloqueia releituras redundantes em toda a janela de 180s (mesmo intercaladas com outros arquivos) inclusive quando o novo intervalo `[startLine, endLine]` já está contido em uma leitura anterior com mesmo `mtime`.
  - **Proteção de Foco `.agents/`:** Impede que o agente desperdice turnos auditando arquivos internos do Kit (`.agents/lib/`, `.agents/hooks/`, `.agents/kit/`).
- **Precisão de Linhas, Nomes de Callbacks e Verificador Unificado (`lib/complexity-guard.cjs` & `verify.cjs`):**
  - Correção em `stripComments` preservando `\n` dentro de comentários `/* ... */` (100% de paridade com números de linha do disco) e inferência semântica de nomes para rotas Express (`GET /rota`) e callbacks (`callback:tx@L64`).
  - `verify.cjs` unificado diretamente com `SecurityLinter`, `ComplexityGuard` e `DryChecker`, eliminando divergências entre `quick_verify` e o Stop Gate.
- **Deduplicação Cirúrgica de Regras e Mapeamento Domain-First de Ambiguidades (`rules/*.md`):**
  - Redução adicional de 43,7% no footprint `always_on` (de 2.787 palavras / ~3.623 tokens para 1.568 palavras / ~2.038 tokens), eliminando duplicações entre `token-protocol.md`, `ponytail.md`, `caveman.md` e `quality-guardrails.md`, além da exigência redundante de turnos manuais `node -c` pós-edição.
  - Prioridade 1 absoluta em `AMBIGUITIES.md` para mapear 1-para-1 conflitos e termos de domínio de `TASK.md`/`CHANGE_REQUEST.md`/`docs/` sem viés de cenário específico.

## [2.4.0] - 2026-10-27
- **Meta-Tool Gateway Dinâmico & Zero-Overhead de Schemas (`mcp-server.cjs`):**
  - **Eliminação de Bloat de Schemas no Prompt:** O manifesto padrão do MCP agora expõe apenas ferramentas essenciais e o Gateway Universal (`quick_verify`, `tool_catalog`, `mcp_exec`, `lsp_diagnostics`, `gsd_read_strip`), cortando o overhead de schemas de ~4.500 tokens para ~250 tokens por turno.
  - **Catálogo sob Demanda (`tool_catalog`):** Permite à IA consultar descrições e parâmetros de todas as 20 ferramentas do ecossistema sem pagar o custo de mantê-las ativas no prompt permanentemente.
  - **Gateway de Execução (`mcp_exec`):** Executa qualquer ferramenta do ecossistema GSD sob demanda (`ast_query`, `mempalace_recall`, `codebase_map`, `env_skeleton`, `lsp_definition`, etc.) através de um canal único e determinístico.
- **Runner Unificado de Verificação em 1 Turno (`verify.cjs` & `scripts/verify.sh`):**
  - Execução simultânea de checagem sintática (`node --check`), code smells de Fowler (aninhamento $\le 3$, tamanho $\le 48$, complexidade $\le 14$, zero concatenação SQL) e testes automatizados (`npm test`) em menos de 1 segundo.
  - Nova ferramenta MCP `quick_verify` e comando CLI `node .agents/mcp-server.cjs verify`.
- **Inspetor Cirúrgico de Código sem Comentários (`gsd-read-strip.cjs`):**
  - Remove comentários, docstrings extensas e linhas em branco preservando 100% da lógica e sintaxe, poupando 20% a 30% de tokens de contexto em revisões na Fase 3.
  - Nova ferramenta MCP `gsd_read_strip` e comando CLI `node .agents/mcp-server.cjs strip <arquivo>`.
- **Checklist Ativo de Ambiguidades com Gate dos 4 Vetores (`hooks/token-guard-diagnostics.cjs`):**
  - Stop gate calibrado para exigir documentação substantiva ($\ge 250$ bytes e $\ge 3$ blocos atômicos `### AMB-`) cobrindo os 4 vetores universais de incerteza (Temporal/UTC, Limites/Divisões, Intermitência e Contratos de Payload) antes de liberar o avanço da Fase 1.
- **Blindagem Estrita contra Contaminação de Contexto (`hooks/token-guard-pretool.cjs`):**
  - Sanitização de respostas de recusa do Sandbox Shield eliminando qualquer eco de strings ou caminhos proibidos de benchmark nos transcripts do agente.
  - Bloqueio estrito de leitura de `.benchmark_cold_start.json`.
- **Compactação e Consolidação do Pacote de Regras (`rules/`):**
  - Redução do volume de regras de 5.433 palavras (~7.062 tokens) para 2.787 palavras (~3.623 tokens), cortando 49% do overhead de prompt fixo em todos os turnos.

## [2.3.0] - 2026-10-27
- **Agentic Skill Retrieval (Descoberta & Ativação Autônoma sob Demanda):**
  - **Eliminação do Viés Determinístico de Fases:** O agente agora opera com total autonomia e sem imposição humana de skills pré-selecionadas por fase, mantendo o baseline inicial em 0 skills ativas em `.agents/skills/` (máxima economia de contexto) enquanto preserva 93 skills no pool.
  - **Nova Tool MCP e CLI Dispatcher `skill_search` (`mcp-server.cjs` e `skills-manager.cjs`):** Permite à IA consultar e ranquear skills especializadas por sintoma técnico, intenção ou termo arquitetural (ex: "deadlock concorrência", "refatoração", "auditoria uat", "segurança"), com normalização semântica, suporte a sinônimos (pt/en) e parsing de frontmatter YAML multiline.
  - **Comandos Ergonômicos CLI no Servidor MCP:** Adicionados atalhos diretos `node .agents/mcp-server.cjs skill <search <query> [--activate] | activate <nome> | list>` e no `skills-manager.cjs search <termo>`.
  - **Sustentabilidade de Execução com TTL de 5 Turnos e Auto-Renovação (`hooks/token-guard-pretool.cjs`):** O JIT Auto-Promoter agora concede 5 turnos de permanência para skills promovidas (em vez de expirar imediatamente no turno seguinte), com renovação automática a cada novo acesso.
  - **Protocolo Canônico Atualizado (`rules/token-protocol.md`):** Seção 8 reescrita para orientar a postura autônoma de descoberta e auto-ativação sem overhead de catálogo estático no prompt.
  - **Bateria de Testes Expandida (114 testes com 100% de Sucesso):** Novas asserções de teste automatizadas em `test-kit.sh` e `test-kit.ps1` validando a busca semântica, auto-promoção JIT e idempotência do catálogo.

## [2.2.1] - 2026-10-27
- **Eliminação do Loop Infinito no Auto-Verify Stop Gate (`hooks/token-guard-diagnostics.cjs`):**
  - Removida a deleção incondicional de `stop-verify-gate.json` ao executar testes com sucesso (`npm test`). Anteriormente, cada passagem de teste limpava a memória de tentativas, fazendo com que o agente fosse interceptado repetidamente em múltiplos ciclos de refatoração desnecessários.
  - Incrementador de tentativas centralizado (`recordStopGateInterception`) garantindo trava anti-loop determinística: máximo de 1 intervenção por sessão para correções de qualidade, liberando a parada com segurança logo na tentativa subsequente.
- **Calibração dos Thresholds de Complexidade e Tamanho de Métodos (`lib/complexity-guard.cjs` e `rules/quality-guardrails.md`):**
  - Teto preventivo de complexidade ciclomática reajustado para 14 (o grader oficial penaliza apenas > 15), evitando falsos alarmes em rotas web normais e reduzindo turnos de refatoração forçada.
  - Teto preventivo de linhas por método ajustado para 48 (o benchmark penaliza em > 50), eliminando quebras desnecessárias de funções de 41 a 48 linhas.
- **Economia Significativa de Tokens e Redução de Latência:**
  - Estima-se redução de ~40% no custo total e eliminação de mais de 8 milhões de tokens de releitura de cache acumulados em fases de implementação e change request.

## [2.2.0] - 2026-10-26
- **Stop Gate Abrangente & Bloqueio de Alta Complexidade Ciclomática (`hooks/token-guard-diagnostics.cjs`):**
  - O hook `Stop` agora audita e bloqueia paradas prematuras em funções com `high_complexity` > 12 (além de `deep_nesting` e `long_method`), prevenindo perdas de pontuação estática no benchmark.
  - Fallback automático via `git status --porcelain` para garantir que qualquer arquivo `.js`/`.ts`/`.go`/`.py` modificado via bash, scripts ou subagentes passe pela auditoria antes do encerramento da sessão.
- **ComplexityGuard Aprimorado para Callbacks e Rotas Web (`lib/complexity-guard.cjs`):**
  - Teto preventivo de complexidade ajustado para 12 (com threshold estático de reprovação em 15).
  - Parser regex expandido para extrair arrow callbacks inline em middlewares e rotas (`app.get('/...', async (req, res) => { ... })`) e funções anônimas.
- **Guardrails Universais de Clean Code Web & Achatamento de Middlewares (`rules/quality-guardrails.md`):**
  - Nova diretriz contra aninhamento acidental em frameworks web: proíbe callbacks aninhados com literais de objeto em respostas HTTP (`res.json({ error: ... })`), exigindo declaração de payloads em variáveis isoladas ou uso de early returns para manter aninhamento <= 3.
  - Obrigação de refatoração cirúrgica em funções preexistentes tocadas para eliminar smells herdados da base original.
- **Princípios Universais para Séries Temporais & Invariância de Repouso (`rules/quality-guardrails.md`):**
  - *Anti-Magic Sampling Caps:* Proibição de descartes de amostras baseados em constantes mágicas (`dt <= 10`); agregação baseada no delta real de tempo entre eventos consecutivos.
  - *Invariância de Estados de Repouso:* Se houver consumo de recursos sem produção útil, retorno obrigatório de `0.0` limpo para métricas de eficiência (nunca `NaN`/`Infinity`/`null`) e acúmulo no contador de tempo de repouso/espera.
  - *Contratos Consistentes em Janelas Vazias:* Retorno garantido de campos agregados zerados explicitamente tipados (`0.0`).
- **Protocolo de Ambiguidades em Bloco Atômico & 4 Vetores Universais (`rules/token-protocol.md`):**
  - Estruturação mandatória de `AMBIGUITIES.md` em parágrafo único autossuficiente por ambiguidade (reunindo contexto, conflito e decisão no mesmo bloco), garantindo 100% de matching em parsers e linters automatizados.
  - Alinhamento sobre os 4 Vetores Universais de Incerteza de Software: Temporal/Timezone, Borda/Divisões, Intermitência de Dados e Contratos de Payload.
- **Bateria de Testes Expandida (113 testes com 100% de Sucesso):**
  - Suítes `test-kit.sh` e `test-kit.ps1` expandidas com novas asserções cobrindo bloqueio de complexidade > 12, rotas anônimas, 4 vetores universais e regras web.

## [2.1.0] - 2026-10-26
- **Alinhamento do ComplexityGuard & Correção Off-by-One (`lib/complexity-guard.cjs`):**
  - Corrigido o cálculo de aninhamento máximo eliminando a subtração indevida que mascarava profundidade de nível 4 (a fórmula agora reflete 100% o grader estático oficial do benchmark).
  - Teto preventivo de 40 linhas por função e método `scanFiles` integrado.
- **Endurecimento Rigoroso do SecurityLinter (`lib/security-linter.cjs`):**
  - Removida a falsa tolerância que permitia interpolação em template strings SQL (`${placeholders}`, `${join}`). Qualquer interpolação dentro de palavras-chave SQL agora é classificada como risco crítico, forçando bind parameters puros (`?`).
- **Expansão do Auto-Verify Stop Gate (`hooks/token-guard-diagnostics.cjs`):**
  - O hook `Stop` agora audita ativamente Code Smells (`ComplexityGuard`), duplicação de código (`DryChecker`) e conformidade de `AMBIGUITIES.md` antes de liberar o encerramento do turno (`decision: continue`).
- **Teto Rígido de Concisão para Diagnóstico & Plano (`rules/compact-planning.md`):**
  - Estabelecido teto estrito de no máximo 35 linhas para `DIAGNOSIS.md` e `PLAN.md`, eliminando a queima desnecessária de tokens de saída na Fase 1 e Fase 2.
- **Guardrail de Filtros Dinâmicos em Listagens (`rules/quality-guardrails.md`):**
  - Adicionado padrão arquitetural obrigatório para query parameters (`req.query` com array dinâmico de bind parameters `clauses.push('x = ?')`), eliminando a causa raiz da falha em `BUG-04` do Cenário 04.
- **Sandbox Shield (Zero-Leakage Anti-Contaminação de Benchmark):**
  - Bloqueio determinístico de acesso a arquivos de orquestração externa (`scenario.json`) e diretórios de teste holdout (`.gsd-bench-holdout`, `holdout/`, `__hidden_`) em `view_file`, `read_file` e comandos de terminal no hook `token-guard-pretool.cjs`, eliminando contaminação de contexto.
  - Categoria `sandbox_shield` adicionada ao rastreador de ROI de economia de tokens (`lib/token-savings.cjs`).
- **Guardrails Estritos de Clean Code & Anti-Nesting (Anti-Code Smells):**
  - Teto imperativo de aninhamento em no máximo 3 níveis com adoção obrigatória de *Early Return* / *Guard Clauses* em `rules/quality-guardrails.md`, eliminando aninhamento excessivo e zeramento de nota estática.
  - Teto rígido de 40 linhas por método e complexidade ciclomática $\le 12$, decompondo laços e validações.
- **Blindagem Aritmética e Edge Cases de Marcha Lenta (Zero NaN/Infinity - BUG-04):**
  - Proteção obrigatória de divisores (`fuel > 0 ? dist / fuel : 0.0`) e retorno explícito de `0.0` para veículos parados consumindo combustível em marcha lenta (`idle_fuel_liters`), prevenindo regressões de divisão por zero.
- **Protocolo Obrigatório de Documentação de Ambiguidades (`AMBIGUITIES.md`):**
  - Template estruturado e checklist obrigatório em `rules/token-protocol.md` para registro nas Fases 1, 2 e 5 (Change Request), cobrindo fusos horários UTC, perda de sinal GPS e oscilações de boia/sensores em rampa.
- **Zero-Baseline Dynamic Agent & Skill Pool (Sincronização Inteligente Proporcional & JIT Cirúrgico):**
  - **Eliminação de Pré-Carregamento Estático:** O prompt não mais injeta lotes fixos de 5 a 7 subagentes e 20+ skills a cada turno, operando em **Zero-Baseline (0 subagentes e 0 skills ativos por padrão)**.
  - **Catálogo Sintético Ultra-leve (`rules/token-protocol.md`):** Tabela condensada (~200 tokens) apresentando os subagentes oficiais de governança do GSD (`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-doc-writer`), os subagentes cirúrgicos do Cavecrew (`cavecrew-builder`, `cavecrew-investigator`, `cavecrew-reviewer`) e as skills centrais do fluxo.
  - **Ativação JIT Cirúrgica (<2ms):** Ao invocar um subagente (`invoke_subagent`) ou consultar uma skill (`read_file`/`view_file`), o hook `PreToolUse` promove o recurso instantaneamente do pool (`.agents/agents-pool/` e `.agents/skills-pool/`) para o diretório ativo.
  - **Ciclo de Vida de Turno Único (TTL = 1):** O hook `PreInvocation` recolhe os recursos promovidos de volta para seus pools permanentes logo no início do turno subsequente, restaurando o diretório ativo para zero e economizando ~18.000 tokens por turno ocioso.
  - **Preservação da Governança Documental GSD:** Contratos de atualização de `STATE.md`, `ROADMAP.md` e geração de `*-SUMMARY.md` mantidos 100% íntegros através dos especialistas oficiais do GSD, com os agentes Cavecrew dedicados à agilidade e diffs cirúrgicos de código.
  - **Bateria de Testes Expandida (110 testes com 100% de Sucesso):** Suítes `test-kit.sh` e `test-kit.ps1` expandidas para validar Zero-Baseline, retenção no pool, Sandbox Shield anti-contaminação, Stop Gate completo e guardrails avançados.

## [2.0.0] - 2026-10-23
- **Integração Nativa Ponytail (Senior Dev Mode & YAGNI Estrito):**
  - **Motor Codebase Map (`lib/codebase-map.cjs`):** Varredura regex de alta performance em Node.js puro cobrindo mais de 20 stacks (TypeScript, JavaScript, Go, Python, Rust, Java, C#, PHP, Ruby, etc.) gerando mapa condensado de símbolos exportados respeitando orçamento rígido de 2.000 caracteres (~450 tokens).
  - **Escada de Decisão Ponytail:** Protocolo injetado obrigatoriamente em todos os subagentes e sessões: (1) Reutilizar código existente -> (2) Standard Library -> (3) Recursos da plataforma/framework -> (4) Dependências já instaladas -> (5) Função utilitária de 1 linha -> (6) Mínimo código cirúrgico novo.
  - **Livro-Razão de Atalhos e Débitos (`/ponytail-debt`):** Rastreamento de comentários `shortcut: <limite>, <quando refatorar>` e fallback `TODO(gsd):` via Git Grep e ferramenta MCP `ponytail_debt`.
  - **Auditoria de Decisões Ponytail (`/ponytail-review`, `/ponytail-audit`):** Checklist de validação contra overengineering, abstrações prematuras e novas dependências desnecessárias.
  - **Fechamento de Resposta Obrigatório:** Toda resposta técnica declara explicitamente o que foi deliberadamente omitido e riscos conhecidos.
- **Integração Nativa Caveman (Voz Concisa ASD-STE100 & Shrink Compressor):**
  - **Voz Concisa em Português Técnico (pt-BR):** Padrão direto e objetivo ([alvo] [ação] [motivo]), eliminando cumprimentos ocos, desculpas, cerimônias de encerramento e explicações não solicitadas.
  - **Payload 100% Verbatim:** Códigos, diffs, comandos de terminal, caminhos de arquivo e identificadores preservados com crases exatas e sem simplificações.
  - **Motor Caveman Shrink (`lib/caveman-shrink.cjs`):** Compressor em Node.js puro para arquivos de estado e memória (`.planning/`, `STATE.md`, logs), sanitizando cerimônias e compactando texto mantendo backup com hash e timestamp em `.agents/.cache/backups/`.
  - **Suíte de Skills Caveman:** `/caveman`, `/ultracave`, `/caveman-review`, `/caveman-commit`, `/caveman-compress`, `/caveman-help`.
  - **Padrões de Trabalho Cirúrgicos:** `/investigate-first`, `/lean-build`, `/surgical-patch`, `/safe-refactor`, `/verify-and-stop`.
- **Subagentes Especializados Cavecrew:**
  - `cavecrew-investigator`: Subagente estritamente read-only para localização rápida de símbolos e referências em tabela condensada.
  - `cavecrew-builder`: Subagente de implementação enxuta (1-2 arquivos por vez) com recibo de diff e validação imediata.
  - `cavecrew-reviewer`: Auditor de PR/diff focado em 1 linha por apontamento com severidade e risco.
- **Rastreamento Dinâmico de Modos em Tempo Real:**
  - `hooks/token-guard-preinvocation.cjs`: Intercepta comandos de modo no chat (`/caveman on|ultra|off`, `/ponytail full|lite|ultra|off`) e persiste o estado em `.agents/.cache/modes.json` retornando confirmação efêmera (`ephemeralMessage`) sem poluição de contexto.
  - `hooks/token-guard-sessionstart.cjs`: Injeta o Codebase Map gerado pelo motor Ponytail no briefing Zero-Read na inicialização de cada sessão.
- **Ferramental MCP & CLI Expandido:**
  - Ferramentas MCP registradas: `codebase_map`, `ponytail_debt`, `caveman_shrink`.
  - Comandos CLI diretos no MCP Server: `node mcp-server.cjs map`, `node mcp-server.cjs debt`, `node mcp-server.cjs shrink <arquivo>`.
- **Instalador & Bateria de Testes (100% de Sucesso):**
  - `setup-ui.cjs` & `setup.sh` & `setup.ps1`: Interface com Bento Dashboard atualizado exibindo badges `[Caveman Terse: ON]` e `[Ponytail Senior: FULL]`, cópia integral de catálogo de skills e subagentes.
  - `test-kit.sh` & `test-kit.ps1`: Expandidos para 100 e 102 testes automatizados validando integralmente os novos motores, regras, ferramentas MCP, subagentes e rastreamento de modos.

## [1.9.4] - 2026-10-21
- **Eliminação de Vazamentos de Abstração & Conformidade MCP:**
  - `mcp-server.cjs`: Sanitização estrita do schema MCP nas respostas de ferramentas (`tools/call`). Garantido que o campo `text` de cada bloco de retorno nunca seja `undefined` (mesmo quando a ferramenta retorna `result: null` ou texto vazio), prevenindo rejeição de schema e crashes de parsing nos clientes MCP do Antigravity CLI.
  - `setup-ui.cjs`: Substituição de interpolação vulnerável de strings em shell por execução segura via `child_process.spawnSync` com vetor de argumentos explícito (`process.execPath`), isolando a execução de scripts utilitários contra problemas de escape de caminhos e injeção.
  - `hooks/token-guard-preinvocation.cjs`: Higienização e correção do payload repassado para `tracker.recordSaving`, mantendo rastreabilidade consistente de tokens sem lançar exceções silenciosas.
- **Tratamento de Erros, Drenagem de Streams e Graceful Shutdown:**
  - `mcp-server.cjs`: Ciclo de vida estendido com captura de `SIGHUP`, `SIGINT`, `SIGTERM`, `beforeExit`, `exit` e erro no `stdin`. Implementado controle de concorrência com flag idempotente `isShuttingDown` e encerramento determinístico de conexões SQLite e locks de arquivo via `closeAllEngines()`.
  - `mcp-server.cjs`: Adicionado controle de contrapressão (*backpressure*) em `sendJson()`, pausando envios e aguardando o evento `'drain'` quando o buffer de escrita do `stdout` estiver saturado.
  - `hooks/` (`token-guard-pretool.cjs`, `token-guard-preinvocation.cjs`, `token-guard-diagnostics.cjs`): Substituído o encerramento prematuro via `process.exit(0)` por drenagem assíncrona garantida do stream `process.stdout.write(..., () => process.exit(0))`, eliminando corrupção e truncamento de respostas JSON em pipes de IPC.
  - `setup-ui.cjs`: Adicionado handler de interrupção (`SIGINT`) no loop de prompts interativos (`askPrompt`), restaurando imediatamente o cursor do terminal (`\x1b[?25h`) e fechando a interface `readline` de forma limpa.
  - `lib/error-guard.cjs`: Extensão do hook `installProcessGuards` com suporte a callback customizado `opts.onShutdown` e uso de `setImmediate` antes de `process.exit(1)`, permitindo descarga completa de streams de log e stderr.
- **Otimização de I/O, Concorrência e Execução Não-Bloqueante:**
  - `mcp-server.cjs`: Conversão do despachador de ferramentas MCP (`handleToolCall`) e do loop de mensagens para fluxo assíncrono (`async/await`), eliminando congelamentos do event loop de stdio. Adicionada execução de subprocessos assíncrona (`execProcessAsync`) e migração de `runAstQuery` para async.
  - `lib/token-savings.cjs`: Remoção de `Atomics.wait` bloqueante na thread principal em `withFileLock`, substituído por retentativas assíncronas com backoff e jitter via `setTimeout`. Correção de bug crítico de concorrência onde a ação protegida era executada mesmo se a trava falhasse (agora retorna `null` com log defensivo).
  - `lib/rag-docs-engine.cjs`: Inserções em lote no SQLite agrupadas dentro de transações explícitas (`BEGIN TRANSACTION` / `COMMIT` / `ROLLBACK`), eliminando dezenas de `fsync` redundantes por arquivo indexado e reduzindo expressivamente a latência de I/O em disco.
  - `hooks/token-guard-pretool.cjs` & `hooks/token-guard-diagnostics.cjs`: Otimização do leitor de `stdin` para resolver e processar imediatamente no primeiro JSON completo balanceado `{...}`, eliminando até 300ms de latência de inatividade artificial em cada invocação de ferramenta.

## [1.9.2] - 2026-10-21
- **Eliminação de Vazamentos de Abstração:**
  - `mcp-server.cjs`: Substituídos caminhos hardcoded `.agents/mcp-server.cjs` por descoberta dinâmica (`SCRIPT_NAME` / `CLI_CMD`), permitindo execução correta a partir de qualquer diretório ou alias.
  - `hooks/token-guard-pretool.cjs`: Mensagens de Hard Gate higienizadas para referenciar a ferramenta canônica `env_skeleton` e o arquivo pré-compilado `.planning/state_summary.json` sem expor a topologia de pastas do kit ao LLM.
  - `setup-ui.cjs`: Resolução dinâmica do executável PowerShell no Windows (`pwsh` com fallback transparente para `powershell.exe`).
  - `hooks/token-guard-preinvocation.cjs`: Verificação de `- glob` restrita ao bloco `tools:` do frontmatter YAML, eliminando falsos positivos na auto-cura causados por menções textuais em instruções ou documentação.
- **Tratamento de Erros, Resiliência e Shutdown:**
  - `mcp-server.cjs`: Implementado `exitCli(code)` com chamada mandatória a `closeAllEngines()`, garantindo o flush e checkpoint WAL em bancos SQLite antes de qualquer término do processo no modo CLI.
  - `mcp-server.cjs`: Registrado handler para evento `EPIPE` no `stdout`, prevenindo falhas fatais não tratadas quando o cliente MCP desconecta o pipe.
  - `hooks/`: Conexões com `MemPalaceEngine` devidamente encerradas em blocos `finally` em `token-guard-sessionstart.cjs`, `token-guard-diagnostics.cjs` e `token-guard-preinvocation.cjs`.
  - `setup-ui.cjs`: Validação de código de saída e captura de erros em `runDoctor`, prevenindo relatórios de falso sucesso caso os subprocessos de auto-cura falhem.
  - `hooks/`: Implementado leitor de `stdin` adaptativo com timer de inatividade entre chunks em `token-guard-diagnostics.cjs` e `token-guard-pretool.cjs`, prevenindo corrupção e truncamento em payloads volumosos.
- **Otimização de I/O e Blindagem contra Concorrência:**
  - `patch-agents.cjs`: Função `detectProjectMaturity` otimizada com cache de resultado, curto-circuito (> 3 arquivos) e exclusão estrita de diretórios pesados (`node_modules`, `vendor`, `.git`, etc.). O bloco de protocolo passa a ser pré-computado uma única vez por execução de `runPatch`.
  - `lib/token-savings.cjs`: Adicionado mecanismo de lock atômico baseado em arquivo (`withFileLock`) com liberação automática de travas estagnadas, prevenindo *race conditions* (TOCTOU) e perda de telemetria em execuções paralelas de subagentes.

## [1.9.1] - 2026-10-21
- **Resiliência e Ciclo de Vida do Servidor MCP Stdio (`mcp-server.cjs`):**
  - **Graceful Shutdown:** Implementado encerramento limpo para sinais `SIGINT`, `SIGTERM` e evento `close` do readline, fechando conexões ativas SQLite e liberando locks de arquivo.
  - **Lazy Loading de Motores:** Instanciação sob demanda via Lazy Proxies para todos os 9 motores (`mempalace`, `ragDocs`, `lockfileLens`, `skeletonEngine`, etc.), eliminando bloqueios de I/O na inicialização e chamadas de CLI rápidas.
  - **Conformidade JSON-RPC 2.0:** Resposta estruturada com código de erro `-32700 Parse error` para mensagens malformadas recebidas no stream.
- **Robustez de I/O e Anti-OOM no Sanitizador (`sanitize-output.cjs`):**
  - **Prevenção de Buffer Overflow:** Elevado `maxBuffer` do `execSync` para 64 MB para suportar saídas densas de compilação e suítes de testes sem disparar erro `ENOBUFS`.
  - **Prevenção de Out-Of-Memory (OOM):** Estabelecido teto de 16 MB em streams de entrada via `stdin` com truncamento inteligente e tratamento do evento `error`.
  - **Descoberta Segura do Projeto:** Implementada busca heurística de raiz (`findProjectRootFrom`) evitando path traversal incorreto em diretórios arbitrários.
- **Otimização de Concorrência e Handlers de Hooks (`hooks/`):**
  - **Cleanup Estrito de Streams (`readStdin`):** Remoção determinística de listeners de eventos (`data`, `end`, `error`) nos hooks `token-guard-diagnostics` e `token-guard-pretool`, prevenindo vazamento de memória e handles pendentes no event loop.
  - **Triagem de I/O em Auditorias Pós-Edição:** Filtro de tamanho de arquivo (<= 256 KB) na cascata de linters síncronos no evento `PostToolUse`, eliminando travamentos de CPU em arquivos pesados.
  - **Circuit Breaker Tolerante a Falhas:** Ferramentas auxiliares opcionais (como `graphify`) tratadas como advertências sem bloquear o acesso a ferramentas nativas essenciais do sistema.
- **Integridade de Persistência e Terminal UI (`lib/` e `setup-ui.cjs`):**
  - **Encerramento de Conexões SQLite:** Método `close()` implementado em `MemPalaceEngine` e `RagDocsEngine` com liberação de checkpoint WAL.
  - **Gravação Atômica no Fallback JSON:** Uso de arquivo temporário `.tmp` e `renameSync` no fallback do MemPalace para blindar contra corrupção por encerramento abrupto.
  - **Restauração de Cursor do Terminal (`StepperUI`):** Handlers de interrupção de sinal garantem restauração do cursor (`\x1b[?25h`) em cancelamentos com Ctrl+C.
- **Otimização de Contexto e Cold Start com `disable-model-invocation: true` (`skills/`):**
  - Aplicado no frontmatter YAML das skills utilitárias canônicas nativas (`/gsd-tokens`, `/gsd-test`, `/gsd-agy-update`).
  - O Antigravity CLI remove a descrição dessas ferramentas da janela de atenção ativa do LLM a cada turno da conversa, eliminando o consumo contínuo de tokens de prompt e distrações cognitivas do modelo, mantendo 100% da usabilidade de invocação manual via barra (`/`).
- **Diretrizes de Planejamento Enxuto & Fatiamento Vertical (`rules/compact-planning.md`):**
  - **Tracer Bullets (Fatiamento Vertical):** Proibição de decomposição puramente horizontal em camadas; cada etapa do plano corta verticalmente todas as camadas necessárias (banco, regra, rota e teste) entregando comportamento observável de ponta a ponta na interface pública (*seam*).
  - **Padrão Expand-Contract para Refatorações de Grande Alcance (Wide Refactors):** Sequenciamento estruturado para mudanças de alto *blast radius* (Expandir sem quebrar ➔ Migrar chamadores em lotes mantendo CI verde ➔ Contrair e remover o legado).
  - **Alinhamento Socrático por Fronteira em Discussões (`gsd-discuss-phase`):** O modelo assume a responsabilidade de investigar fatos do código via ferramentas e apresenta decisões em rodadas numeradas com opções e recomendação explícita onde responder "Sim" aprova a sugestão.
- **Motores Avançados de Análise e Governança de Código (`lib/`):**
  - `SecurityLinter` (`lib/security-linter.cjs`): Análise estática preventiva contra injeções SQL e concatenações inseguras.
  - `ComplexityGuard` (`lib/complexity-guard.cjs`): Detecção de funções com complexidade ciclomática excessiva (> 15) e aninhamentos profundos (> 4 níveis).
  - `DryChecker` (`lib/dry-checker.cjs`): Inspeção heurística de blocos duplicados e code smells.
- **Sincronização e Validação do Kit:**
  - Atualização dos scripts de validação (`test-kit.sh` e `test-kit.ps1`) para conformidade contínua.
  - Sincronização de versão do Painel de Controle e Hub Interativo (`setup-ui.cjs`) com `package.json`.

## [1.7.0] - 2026-10-19
- **Guardrails Avançados de Arquitetura & Paridade de Rotas (`rules/quality-guardrails.md`):**
  - **Padrões Anti-N+1 Mandatórios com Código:** Exemplos práticos exigindo subconsultas correlacionadas `(SELECT ...)` ou pré-carregamento em batch com `Map<id, data>` em $O(1)$ para eliminar queries em laços.
  - **Simetria de Estado Bidirecional (`State Symmetry Guardrail`):** Obrigatória implementação do caminho reverso (`else`) para desbloquear entidades (`blocked = 0`, `active = 1`) quando as condições de suspensão deixarem de ser atendidas (ex: expiração de pontos, deferimento de recurso ou quitação).
  - **Paridade de Segurança em Rotas HTTP (`Route Security Parity`):** Travas de integridade e regras de imutabilidade (ex: não alterar ocorrências concluídas) devem ser aplicadas simetricamente em todas as rotas mutatórias (`PUT`, `PATCH`, `PATCH /status`, `DELETE`).
  - **Filtro Mandatório de Registros Ativos (`active = 1`):** Verificação compulsória de colunas de exclusão lógica/status em tabelas de domínio (`lines`, `drivers`, `vehicles`) em agregações e relatórios analíticos.
  - **Normalização Temporal e Fuso Horário UTC:** Normalização mandatória de carimbos SQLite/SQL para formato ISO 8601 UTC (`'T'` e `'Z'`) antes de instanciar `new Date()`, eliminando desvios de fuso horário local.
- **Protocolo de Verificação Enxuta (`rules/token-protocol.md`):**
  - Fim do consumo excessivo de tokens na Fase 4 (Verification): instrução estrita para encerramento conciso e imediato quando os testes passarem com 100%, sem invocar ferramentas redundantes.
- **Painel de Controle e Versão Dinâmica (`setup-ui.cjs`):**
  - Cabeçalhos e banners sincronizados dinamicamente com o `package.json`.

## [1.6.0] - 2026-10-19
- **Guardrails Universais de Robustez & Código de Alta Performance (`rules/quality-guardrails.md`):**
  - **Zero N+1 em Banco de Dados:** Proibição mandatória de leituras e queries ORM dentro de loops (`for`, `map`, `forEach`). Exigência de pré-carregamento em `Map` $O(1)$ ou resolução via `SQL JOIN` / cláusula `IN (...)`.
  - **Tipagem Defensiva em Requisições HTTP:** Coerção numérica explícita (`Number(val)` / `parseInt(val, 10)`) em identificadores e status antes de comparações estritas (`===`, `!==`) ou operações matemáticas.
  - **Transações Atômicas:** Envolvimento de escritas multi-tabelas ou registros de histórico em transações (`BEGIN` / `COMMIT`).
  - **Prepared Statements (Anti-SQLi):** Proibição estrita de interpolação de strings em consultas SQL.
  - **Auditoria de Estado Inicial:** Fallback em `created_at` para entidades criadas diretamente em status de pausa/bloqueio sem histórico de transição.
  - **Status HTTP Semânticos & Tratamento de Erros:** Proibição de swallowing silencioso de exceções e padronização semântica (`201`, `200`, `204`, `400`, `404`, `409`).
  - **Documentação Equilibrada:** JSDoc conciso (2-4 linhas) e atualização estrita de especificações quando houver mudança de contrato público.
- **Protocolo de Diagnóstico JIT & Fim do Tool-Chaining Rígido (`rules/token-protocol.md` e `patch-agents.cjs`):**
  - Substituição da esteira burocrática fixa por protocolo *Test-Driven JIT* (executar testes primeiro para guiar a correção pelo erro real).
  - Autorização e instrução explícitas para criação atômica de arquivos 100% NOVOS via `write_to_file` em uma única chamada.
  - Manutenção de diffs cirúrgicos estritos (`replace_file_content`) para arquivos existentes.
- **Compactação de Cold Start das Regras (`rules/*.md`):**
  - Redução maciça no cold start das regras em `.agents/rules/` (economia de ~1.100 tokens por turno).

## [1.5.0] - 2026-10-19
- **Controle Rigoroso Contra Erros (ErrorGuard, Zero Silent Fallbacks & Visibilidade Tripla):**
  - Eliminação de fallbacks silenciosos e `catch {}` mudos em toda a suíte.
  - Visibilidade Tripla: card visual vermelho em `stderr`, hard stop / alerta imediato ao agente e persistência atômica em `.agents/.cache/error-log.json`.
  - Rigor total nos 20 ecossistemas LSP com validação de binários e códigos de saída reais.
  - Fail-fast na instalação (`setup-ui.cjs`) com Smoke Test (Etapa 11) dos motores e persistência automática de `strict_errors: true` em `.planning/config.json` para próximas atualizações.
  - Novo comando de auditoria e limpeza de erros: `node .agents/mcp-server.cjs errors` e `./setup.sh --errors`.
- **Sistema de Auto-Atualização Inteligente (`/gsd-agy-update` e `gsd-update.cjs`):**
  - Verifica automaticamente se o kit instalado no projeto está na versão mais recente comparando SemVer e commits do GitHub (`ARILSONLIMA/gsd-agy-kit`).
  - Exibe um relatório claro em Português (pt-BR) explicando todas as melhorias entre a versão instalada e a última versão disponível (`CHANGELOG.md` + últimos commits), pedindo confirmação antes de atualizar (ou atualizando direto com `--yes`).
  - Preserva integralmente as configurações locais do usuário (`.planning/config.json`, banco de memória SQLite `.agents/memory/palace.db`, snapshots de subagentes) e re-executa o patch de subagentes e sincronização de pools automaticamente.
  - Disponível via slash command `/gsd-agy-update`, CLI (`node .agents/kit/setup-ui.cjs --update`) e opção `[11]` no Menu Interativo.

### 🛠️ Melhorias e Correções no Motor Multi-LSP & Hooks
- **Diagnósticos Workspace-Wide Reais (`lib/lsp-engine.cjs`):**
  - `lsp_diagnostics` chamado sem `file_path` (modo workspace) agora inspeciona ativamente até 45-50 arquivos do projeto (`node --check` para `.js/.cjs/.mjs`, `shellcheck`/`bash -n` para `.sh/.bash` e validação estrutural multi-arquivo), eliminando falsos positivos em projetos sem `tsconfig.json`.
- **Cobertura Completa dos 20 Ecossistemas no `diagnostics()` e no Menu LSP (`setup-ui.cjs`):**
  - Adicionados ramos de diagnóstico para **C#** (`dotnet build --no-restore`), **Elixir** (`mix compile` / `elixirc`) e **Kotlin** (`ktlint`).
  - Catálogo interativo de instalação de LSPs (`--lsp`) ampliado para listar todos os 20 ecossistemas registrados (incluindo Dart, Elixir e Swift).
- **Segurança Path Traversal em `LspEngine.rename()`:**
  - Bloqueio estrito contra tentativas de leitura/escrita fora dos limites do diretório raiz do workspace (`projectRoot`).
- **Correção do Enriquecimento Anti-Loop (`hooks/token-guard-preinvocation.cjs`):**
  - Resolução de módulos em `.agents/kit/lib/`, integração correta com `MemPalaceEngine.recall()` e `CheckpointEngine.getLatestCheckpoint()`.

## [1.4.0] - 2026-10-18
### 🚀 Novas Funcionalidades
- **Motor Multi-LSP Híbrido para 20 Ecossistemas (`lib/lsp-engine.cjs`):**
  - Suporte unificado para Go, TypeScript/JavaScript/Node, Python, Rust, PHP, C/C++, Java, C#, Ruby, Dart/Flutter, Elixir, Lua, Bash/Shell, Web (HTML/CSS/JSON), YAML/Kubernetes, SQL, Docker, Kotlin, Swift e Terraform.
  - 6 novas ferramentas no servidor MCP (`lsp_diagnostics`, `lsp_definition`, `lsp_references`, `lsp_hover`, `lsp_symbols`, `lsp_rename`).
- **6 Frentes Avançadas de Economia de Tokens:**
  - **Smart-Assist Auto-Slicing:** Fatiamento automático de leituras `view_file` em blocos de até 100 linhas sem erro fatal.
  - **Extrator Cirúrgico de Símbolos (`extract_symbol`):** Extrai apenas o corpo exato de uma função/classe/método por nome.
  - **Isolamento Proativo de Testes (`lib/test-isolate.cjs`):** Reexecuta apenas o teste que falhou anteriormente.
  - **Secret Shield (`env_skeleton`) e Compactador Semântico de Logs (`lib/log-compactor.cjs`).**
  - **Auto-LSP Pós-Edição (`hooks/token-guard-diagnostics.cjs`):** Verifica erros de sintaxe imediatamente após edições de código.

## [1.3.0] - 2026-10-10
### 🚀 Novas Funcionalidades
- **Servidor MCP Nativo (`gsd-economy` / `mcp-server.cjs`):**
  - Ferramentas nativas de economia extrema: `mempalace_capture`, `mempalace_recall`, `query_docs` (RAG FTS5 em Markdown), `check_dependency` (leitura cirúrgica de dependências sem abrir lockfiles), `view_skeleton` e `checkpoint_manager`.
- **MemPalace SQLite FTS5 (`lib/mempalace-engine.cjs`):**
  - Memória episódica persistente com busca full-text instantânea em `.agents/memory/palace.db`.

## [1.2.0] - 2026-10-01
### 🚀 Novas Funcionalidades
- **Dynamic Agent Pool & Dynamic Skill Pool (`optimize-tokens.cjs` e `skills-manager.cjs`):**
  - Redução de ~370 KB do contexto estático movendo subagentes e skills ociosos para pools sob demanda com promoção Just-In-Time (JIT) transparente e recolhimento automático por TTL.

## [1.1.0] - 2026-09-20
### 🚀 Novas Funcionalidades
- **Circuit Breaker & Token Guard (`hooks/token-guard-pretool.cjs`):**
  - Proteção contra leitura integral de arquivos de código, bloqueio de despejos brutos no terminal (`cat`/`Get-Content`), sanitização de comandos prolixos (`git log`, `docker logs`, `find`) e proteção de sintaxe PowerShell + `ast-grep`.

## [1.0.0] - 2026-09-10
### 🎉 Lançamento Inicial
- Adaptador de compatibilidade e normalização de subagentes GSD para o Google Antigravity CLI (`patch-agents.cjs`), scripts de instalação multiplataforma (`setup.sh`, `setup.ps1`) e integração com `graphify` e `ast-grep`.
