# Changelog — Antigravity GSD Kit (`gsd-agy-kit`)

Todas as melhorias e novidades relevantes deste projeto são documentadas neste arquivo.

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
