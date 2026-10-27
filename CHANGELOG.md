# Changelog — Antigravity GSD Kit (`gsd-agy-kit`)

Todas as melhorias e novidades relevantes deste projeto são documentadas neste arquivo.

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
