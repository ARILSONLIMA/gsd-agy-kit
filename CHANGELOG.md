# Changelog — Antigravity GSD Kit (`gsd-agy-kit`)

Todas as melhorias e novidades relevantes deste projeto são documentadas neste arquivo.

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
