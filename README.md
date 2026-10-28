# Antigravity GSD Kit v2.5.1 🚀

[![Release](https://img.shields.io/badge/release-v2.5.1-blue.svg)](CHANGELOG.md)
[![Ponytail](https://img.shields.io/badge/Ponytail-Senior%20Dev%20Mode-darkgreen.svg)](#-ponytail--senior-dev-mode--yagni-estrito)
[![Caveman](https://img.shields.io/badge/Caveman-Terse%20pt--BR-orange.svg)](#-caveman--voz-concisa-asd-ste100--shrink-compressor)
[![Tests](https://img.shields.io/badge/tests-100%25%20passing%20(122%20tests)-brightgreen.svg)](#-bateria-de-testes-nativos-instantânea)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

> **Adaptador Universal de Governança, Compatibilidade, Auto-Cura e Economia de Tokens com Ponytail Senior Dev e Caveman Terse Voice para GSD no Antigravity CLI**

Este módulo transforma o ecossistema **GSD (Get Stuff Done)** para funcionar com **100% de compatibilidade** com o **Antigravity CLI**, integrando nativamente os paradigmas **Ponytail** (desenvolvedor sênior pragmático, YAGNI estrito e reutilização) e **Caveman** (voz ultraconcisa em pt-BR padrão ASD-STE100, payload verbatim e corte drástico de tokens).

---

## 🐴 Ponytail & 🪨 Caveman — Motores Nativos Integrados

A versão 2.0.0 traz integração nativa e profunda das abordagens **Ponytail** e **Caveman** em **todos os 35 subagentes GSD**, no **briefing de sessão** e via comandos universais de chat:

### 🐴 Ponytail — Senior Dev Mode & YAGNI Estrito
- **Escada de Decisão Obrigatória:** Em cada tarefa, o modelo é obrigado a descer a escada do menor esforço antes de escrever qualquer código novo:
  1. `Reutilizar`: Buscar funções, utilitários e componentes existentes no projeto (via `codebase_map`).
  2. `Standard Library`: Usar recursos nativos da linguagem/runtime.
  3. `Plataforma / Framework`: Usar utilitários já presentes nas dependências do framework.
  4. `Dependências Instaladas`: Usar bibliotecas já listadas no lockfile/manifesto.
  5. `Função Utilitária de 1 Linha`: Escrever helper pontual simples.
  6. `Mínimo Código Cirúrgico Novo`: Implementar estritamente o necessário (zero abstrações prematuras, zero herança complexa).
- **Motor Codebase Map (`lib/codebase-map.cjs`):** Varredura regex de alta performance em Node.js puro cobrindo 20+ stacks (TS, JS, Go, Python, Rust, Java, C#, PHP, Ruby, etc.) gerando mapa condensado de símbolos exportados sob teto rígido de 2.000 caracteres (~450 tokens), injetado no Briefing Zero-Read.
- **Rastreamento de Débito Técnico (`/ponytail-debt`):** Padrão de comentários no código `// shortcut: <limite>, <quando refatorar>` com auditoria via MCP `ponytail_debt`.
- **Declaração Obrigatória de Omissões e Riscos:** Toda resposta técnica declara explicitamente o que foi deliberadamente omitido e riscos conhecidos.
- **Comandos Slash:**
  - `/ponytail full`: Modo sênior dev padrão ativo (escada + YAGNI estrito).
  - `/ponytail ultra`: Nível sênior rigoroso (questionamento ativo de requisitos e YAGNI extremo).
  - `/ponytail lite`: Nível suave apontando apenas soluções menores.
  - `/ponytail off`: Desativa o modo sênior dev.
  - `/ponytail-review`: Checklist de auditoria sênior contra overengineering.
  - `/ponytail-audit`: Auditoria de PR/diff focando em simplicidade.
  - `/ponytail-debt`: Inspeciona atalhos e débitos técnicos no código.

### 🪨 Caveman — Voz Concisa ASD-STE100 & Shrink Compressor
- **Voz Concisa em Português Técnico (pt-BR):** Resposta direta no formato `[alvo] [ação] [motivo]`. Zero cumprimentos ocos ("Olá! Certamente posso ajudar..."), desculpas ou cerimônias de encerramento ("Espero que ajude, se precisar de algo mais...").
- **Payload 100% Verbatim:** Códigos, diffs, comandos de terminal, caminhos de arquivo e identificadores preservados com crases exatas e sem simplificações.
- **Auto-Claridade:** Em caso de ambiguidade com mais de uma interpretação válida, suspende a concisão temporariamente para perguntar ao usuário com clareza.
- **Motor Caveman Shrink (`lib/caveman-shrink.cjs`):** Compressor em Node.js puro para arquivos de estado e memória (`.planning/`, `STATE.md`, logs), sanitizando cerimônias e compactando texto mantendo backup com hash e timestamp em `.agents/.cache/backups/`.
- **Comandos Slash:**
  - `/caveman on`: Modo conciso padrão ativo (ASD-STE100 em pt-BR).
  - `/caveman ultra` ou `/ultracave`: Modo fragmentos telegráficos para economia máxima.
  - `/caveman off`: Desativa o modo conciso.
  - `/caveman-review`: Análise crítica de código sem prolixidade.
  - `/caveman-commit`: Geração de mensagens de commit concisas em formato Conventional Commits.
  - `/caveman-compress`: Comprime arquivos de estado ou documentação local com backup.

### 👥 Subagentes Especializados Cavecrew
- `cavecrew-investigator`: Subagente estritamente read-only para localização rápida de símbolos e referências em tabela condensada `<caminho:linha> — <símbolo> — <nota>`.
- `cavecrew-builder`: Subagente de implementação enxuta (1-2 arquivos por vez) com recibo de diff e validação imediata.
- `cavecrew-reviewer`: Auditor de PR/diff focado em 1 linha por apontamento com severidade e risco.

### ⚡ Padrões de Trabalho Cirúrgicos
- `/investigate-first`: Localiza símbolos antes de sugerir ou editar código.
- `/lean-build`: Constrói a menor solução funcional possível.
- `/surgical-patch`: Aplica patches pontuais sem reescrita de arquivos.
- `/safe-refactor`: Refatora código mantendo testes verdes e sem alterar comportamento externo.
- `/verify-and-stop`: Valida a execução e conclui sem turnos residuais.

---

## 🎯 Problemas Resolvidos

1. **Incompatibilidade no Registry de Ferramentas:** Subagentes que declaravam ferramentas legadas (`glob`, `grep_search`) ou ferramentas não-registradas no frontmatter YAML do executor Antigravity (como `call_mcp_tool`) falhavam na inicialização com erro fatal (`tool not found in registry`).
2. **Isolamento de Regras:** Subagentes não herdam o `GEMINI.md` da sessão principal por padrão.
3. **Sobrescrita por Updates do GSD:** Ao rodar `/gsd-update` ou atualizar a CLI do GSD, todos os arquivos de agentes eram restaurados para os padrões incompatíveis do Cursor/Claude Code.

---

## 🛠️ Arquitetura da Solução

O kit opera em 4 camadas complementares:

```
┌─────────────────────────────────────────────────────────────┐
│                 Antigravity CLI (Sessão)                    │
└──────────────────────────────┬──────────────────────────────┘
                               │
       ┌───────────────────────┴───────────────────────┐
       ▼                                               ▼
┌──────────────────────────────┐        ┌──────────────────────────────┐
│  PreInvocation Hook          │        │  PreToolUse Hook             │
│  - Self-Healing pós-update   │        │  - Circuit Breaker           │
│  - Injeção de prioridade     │        │  - Bloqueio mecânico de      │
│    (token-guard-preinvocation)│       │    despejo e leitura massiva │
└──────────────────────────────┘        └──────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Subagentes GSD Normalizados (.agents/agents)    │
│  - Tools Antigravity: view_file, write_to_file,             │
│    replace_file_content, run_command                        │
│  - Protocolo de tokens injetado diretamente no prompt       │
└─────────────────────────────────────────────────────────────┘
```

1. **Normalizador de Subagentes (`patch-agents.cjs`):**
   - Remove tools inválidas/incompatíveis (`glob`, `grep_search`, `call_mcp_tool`).
   - Corrige `write_file` para `write_to_file`.
   - Assegura ferramentas nativas (`view_file`, `write_to_file`, `replace_file_content`, `run_command`).
   - Injeta a seção `<token_efficiency_protocol>` diretamente no corpo de cada subagente.

2. **Mecanismo de Auto-Cura (Self-Healing):**
   - O hook `PreInvocation` monitora se algum arquivo em `.agents/agents/` reintroduziu `glob` após um comando de update do GSD.
   - Caso positivo, o patch é reaplicado em milissegundos de forma transparente.

3. **Hard Gate de Ferramentas Universal (`token-guard-pretool.cjs`):**
   - **Suporte Universal de Linguagens:** Bloqueia `view_file` sem limites cirúrgicos (`StartLine`/`EndLine`) ou acima de 100 linhas em arquivos de código em qualquer stack (`.go`, `.ts`, `.tsx`, `.js`, `.jsx`, `.py`, `.java`, `.c`, `.cpp`, `.rs`, `.vue`, `.svelte`, `.cs`, `.php`, `.rb`, `.swift`, `.kt`, `.kts`, `.sql`, `.dart`).
   - **Higienização de URIs e Caminhos:** Aceita e normaliza de forma transparente URIs com prefixo `file:///` e caminhos com til (`~`).
   - Bloqueia comandos de despejo bruto (`cat`, `Get-Content`, `gc`, `type`, `head`, `tail`) em qualquer arquivo de código.
   - Bloqueia sobrescrita integral de arquivos existentes com `write_to_file` (exigindo `replace_file_content`).
   - Bloqueia `ast-grep` com flags de reescrita em massa (`-r`, `--rewrite`).
   - Bloqueia `go test -v` em lote.
   - **Circuit Breaker Estrito por Stack:** Testa a saúde operacional de `ast-grep`, `graphify` e das ferramentas LSP/compiladores de cada linguagem detectada no projeto (`gopls`, `typescript-language-server`/`tsc`/`node`, `pyright`, `rust-analyzer`/`cargo`, `intelephense`/`php`, `clangd`/`clang++`, `jdtls`/`javac`, `csharp-ls`, `solargraph`) antes de permitir execuções de ferramentas.
   - **JIT Auto-Promoter Reativo (Agentes & Skills):** Intercepta chamadas a `invoke_subagent` e leituras de skills via `view_file`/`read_file`, promovendo itens adormecidos do pool (`.agents/agents-pool/` e `.agents/skills-pool/`) para o catálogo ativo em tempo real (<2ms), com busca case-insensitive para Linux/POSIX e ciclo de vida cirúrgico com recolhimento automático no turno seguinte (TTL = 1 turno).

4. **Motor de Otimização de Tokens & Dynamic Agent Pool (`optimize-tokens.cjs`):**
   - **Dynamic Agent Pool (`.agents/agents-pool/`):** Preserva 100% dos 35 subagentes únicos de forma segura fora do catálogo ativo.
   - **Zero-Baseline Proporcional sob Demanda:** Em vez de carregar lotes estáticos no prompt, opera em **Zero-Baseline (0 subagentes ativos por padrão)**, mantendo os recursos no pool e promovendo-os cirurgicamente apenas quando requisitados via JIT.
   - **Catálogo Sintético Ultra-leve:** Lista condensada (~200 tokens) em `rules/token-protocol.md` mapeando subagentes oficiais de governança do GSD (`gsd-planner`, `gsd-executor`, `gsd-verifier`, `gsd-doc-writer`), agentes Cavecrew (`cavecrew-builder`, `cavecrew-investigator`, `cavecrew-reviewer`) e skills principais.
   - **Menor Privilégio em Ferramentas:** Subagentes estritamente de análise e checagem recebem apenas ferramentas de leitura (`view_file`, `run_command`), eliminando schemas de escrita desnecessários no prompt.
   - **Progressive Disclosure para Regras:** Converte regras redundantes em `.agents/rules/` (`idioma.md` e `token-protocol.md`) em pontes com `trigger: model_decision`, evitando a injeção tripla das mesmas regras contidas em `GEMINI.md`.
   - **Estabilidade de Prompt Caching:** Ordenação alfabética estrita (`.sort()`) em todos os catálogos para garantir prefixos estáveis e maximizar Cache Hits no Gemini.
   - **Portabilidade Dinâmica:** Elimina qualquer dependência de caminhos absolutos hardcoded.
   - Arquiva automaticamente os 29 subagentes duplicados (`.compact.md`).
   - Enxuga o despejo de tabelas do `STACK.md` de dentro de `GEMINI.md`, substituindo por referências diretas.
   - Desduplica `.agents/GEMINI.md` para evitar que as regras sejam enviadas duas vezes em cada prompt.
   - Corta mais de **370.000 bytes** de peso morto do contexto inicial e poupa de 15.000 a 20.000 tokens por turno.

5. **Dynamic Skill Pool & Gerenciador de Perfis (`skills-manager.cjs` / `skills-profile.ps1`):**
   - **Dynamic Skill Pool (`.agents/skills-pool/`):** Mantém 75+ skills em repouso no pool, sincronizando apenas as **8 a 13 skills** relevantes da fase atual + globais essenciais (`gsd-progress`, `gsd-help`, `gsd-tokens`, `gsd-dev-preferences`, `gsd-settings`, `gsd-health`, `gsd-fast`, `graphify`).
   - **Ativação JIT Transparente:** Promove qualquer skill inativa para `.agents/skills/` instantaneamente caso seja requisitada.
   - **Sincronização por Fase:** Suporta `pwsh skills-profile.ps1 -Sync` e auto-sync a cada turno via hook `PreInvocation`.
   - **Perfis Manuais:** Suporta `-Profile backend`, `-Profile core`, `-Profile full`, `-Enable <skill>` e `-Disable <skill>`.

6. **Terminal UI & Animações em Tempo Real (`setup-ui.cjs`):**
   - Motor de interface 100% nativo em Node.js (sem dependências npm).
   - Card interativo estruturado para seleção de arquitetura (Backend vs Fullstack) e **seletor interativo para baixar e instalar servidores LSP por linguagem** (`--lsp`).
   - Barra de progresso geral no topo `[████████░░░░] 50%`.
   - Stepper com spinners animados em tempo real (`⠋ ⠙ ⠹`) e cronometragem precisa por etapa.
   - Dashboard final em estilo Bento com status de governança e métricas de tokens.

7. **Deduplicação de Leituras Recentes (`token-guard-pretool.cjs`):**
   - Rastreia mtime e intervalo das leituras em arquivos de código nos últimos 60 segundos.
   - Bloqueia releituras idênticas em passos consecutivos causadas por hesitação ou loops, orientando o agente a usar o contexto já existente.

8. **Auto-Limitador Inteligente de Comandos (`run_command` Overwrite):**
   - Reescreve comandos perigosos automaticamente via hook `PreToolUse`:
     - `git log` sem limitador ➔ `git log -n 20`
     - `docker compose logs` sem flag ➔ `docker compose logs --tail 100`
     - `Get-ChildItem -Recurse` sem `-Depth` ➔ `Get-ChildItem -Recurse -Depth 3` (com isolamento estrito de pipeline)
     - `find .` sem `-maxdepth` ➔ `find . -maxdepth 3`
     - `npm list` / `pnpm list` sem `--depth` ➔ `--depth=0`
     - **Preservação de URLs:** Normaliza letras de drive Windows (`D:/` ➔ `D:\`) sem corromper URLs de rede (`http://`, `https://`, `ftp://`).

   - **`sanitize-output.cjs` / `sanitize-command.ps1`:** Truncador no estilo Headroom que limita saídas longas a head + tail e preserva o dump integral em `.planning/debug/` ou `.agents/debug/`.

10. **Servidor MCP Padronizado & Motores de Economia Dual-Mode (`mcp-server.cjs` & `lib/`):**
    - **Dual-Mode Transparente:** Opera como Servidor MCP Stdio JSON-RPC 2.0 em `.agents/mcp_config.json` e `.agents/plugins/gsd-economy/` quando montado pelo Antigravity, E simultaneamente como utilitário CLI ultra-rápido via `run_command` (`node .agents/mcp-server.cjs <cmd>`) com zero dependências npm.
    - **Motor Multi-LSP Híbrido (`lib/lsp-engine.cjs`):** Suporte unificado a **20 ecossistemas** — **Go (`gopls`), TypeScript/JavaScript (`vtsls`, `ts_ls`), Python (`pyright`, `basedpyright`, `ruff`), Rust (`rust-analyzer`), C/C++ (`clangd`), C# (`roslyn`, `csharp-ls`), Java (`jdtls`), Lua (`lua-language-server`), PHP (`intelephense`), Shell/Bash (`bash-language-server`, `shellcheck`), HTML/CSS/JSON (`vscode-langservers-extracted`), YAML/Helm (`yaml-language-server`, `helm_ls`), SQL (`sqls`, `sqlfluff`), Docker (`docker-langserver`, `hadolint`), Ruby (`solargraph`, `ruby-lsp`), Dart (`dart`), Elixir (`elixir-ls`), Kotlin (`kotlin-language-server`), Swift (`sourcekit-lsp`) e Terraform (`terraform-ls`)**, combinando binários LSP/compiladores nativos com fallback AST/estrutural:
      - `lsp_diagnostics` (`node .agents/mcp-server.cjs lsp diagnostics [arquivo]`): checagem ultra-compacta de erros de tipagem e sintaxe.
      - `lsp_definition` (`node .agents/mcp-server.cjs lsp definition "<símbolo>"`): localização exata da declaração de funções, classes, structs, tabelas SQL, estágios Docker e recursos Terraform.
      - `lsp_references` (`node .agents/mcp-server.cjs lsp references "<símbolo>"`): mapeamento de todas as referências cruzadas no projeto antes de editar assinaturas.
      - `lsp_hover` (`node .agents/mcp-server.cjs lsp hover "<símbolo>"` ou `lsp symbols "<arquivo>"`): inspeção de assinatura, tipo e docstring sem ler o arquivo inteiro.
      - `lsp_rename` (`node .agents/mcp-server.cjs lsp rename "<antigo>" "<novo>" [caminho] [--dry-run]`): renomeação segura de símbolos em múltiplos arquivos.
    - **`ast_query` (Busca Estrutural AST Segura):** Executa buscas sintáticas no `ast-grep` via JSON-RPC/CLI sem risco de corrupção por aspas ou expansão de variáveis `$` no PowerShell/Bash. CLI: `node .agents/mcp-server.cjs ast "<pattern>" [lang] [path]`.
    - **`test_isolate` (Isolador Cirúrgico de Testes):** Detecta testes que falharam recentemente e gera comandos pontuais para rodar apenas o teste quebrado (Node `--test`, Jest/Vitest, Go, Pytest) sem rodar a suíte completa. CLI: `node .agents/mcp-server.cjs test-isolate`.
    - **`checkpoint_manager` (Micro-Checkpoints Git & Anti-Alucinação):** Cria tags e snapshots git antes/depois de refatorações críticas e permite rollback instantâneo caso o modelo entre em loops de quebra de código. CLI: `node .agents/mcp-server.cjs checkpoint <create|list|rollback> [arg]`.
    - **`mempalace_recall` / `mempalace_capture` (MemPalace v2):** Memória episódica estruturada persistida em SQLite (`.agents/memory/palace.db`) com busca FTS5 para decisões arquiteturais e soluções de bugs com auto-captura heurística silenciosa na transição vermelho ➔ verde. CLI: `node .agents/mcp-server.cjs recall "<query>"` e `capture <room> "<tópico>" "<conteúdo>"`.
    - **`query_docs` (Mini-RAG para Markdown):** Indexação e busca semântica em arquivos `.md` do projeto, extraindo apenas os trechos e seções exatas das regras de negócio sem despejar arquivos de especificação inteiros. CLI: `node .agents/mcp-server.cjs docs "<query>"`.
    - **`check_dependency` (Lente Multi-Stack de Lockfiles):** Inspeção cirúrgica de pacotes e versões em `package-lock.json`, `go.sum`, `Cargo.lock`, `requirements.txt`, `composer.json`, `Gemfile` e `pubspec.yaml` sem sobrecarregar a janela de contexto. CLI: `node .agents/mcp-server.cjs dep "<pacote>"`.
    - **`view_skeleton` (Esqueleto Estrutural Universal):** Extração de assinaturas, structs, interfaces, tabelas SQL, estágios Docker, recursos Terraform, chaves YAML/JSON e tipos com números de linha para 20 ecossistemas. CLI: `node .agents/mcp-server.cjs skeleton "<arquivo>"`.
    - **`impact_analysis` (Análise de Raio de Explosão Pré-Edição):** Combina o grafo de dependências do Graphify, referências cruzadas do `LspEngine` e descoberta automática de testes correlatos para classificar o risco (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`) antes de refatorar qualquer símbolo ou arquivo. CLI: `node .agents/mcp-server.cjs impact "<símbolo>" [arquivo]`.
    - **`env_skeleton` (Inspeção Zero-Leak de `.env` & Secret Shield):** Lista apenas nomes de variáveis e status (`[SET]`, `[EMPTY]`, `[PLACEHOLDER]`) cruzando com `.env.example` sem jamais expor segredos, aliado ao **Secret Shield** no `PreToolUse` que bloqueia leituras brutas de `.env`. CLI: `node .agents/mcp-server.cjs env [.env]`.

11. **Modo Smart-Assist, Auto-Slicing & Auto-Isolamento Proativo de Testes (`res.overwrite`):**
    - Substitui rejeições mecânicas (`deny`) que custavam turnos extras e milhares de tokens de repetição por correções automáticas e transparentes via `overwrite`.
    - Auto-injeta limites cirúrgicos de 100 linhas em arquivos não paginados ou trunca ranges excessivos sem quebrar o fluxo do agente.
    - **Auto-Isolamento Proativo de Testes:** Reescreve automaticamente suítes globais (`npm test`, `pytest`, `go test ./...`, `cargo test`) para rodar apenas o teste/arquivo que falhou nos últimos 5 minutos via `res.overwrite`.
    - Suporta modos configuráveis: `smart-assist` (padrão), `strict` (hard gates) e `permissive`.

12. **Protocolo Context-Aware (Greenfield Fast-Track vs Brownfield):**
    - O normalizador detecta automaticamente a maturidade do projeto (contagem de arquivos de código existentes).
    - Em projetos novos (**Greenfield**): elimina varreduras forenses pesadas de AST/Graphify/MemPalace na Phase 1, focando em scaffolding direto e contratos, cortando mais de 50.000 tokens de overhead.
    - Em projetos existentes (**Brownfield**): mantém a esteira analítica profunda completa.

13. **Blindagem de Grafos e Índices (`.graphifyignore` & `.astgrepignore`):**
    - Instala templates de exclusão que impedem o `graphify` e o `ast-grep` de indexarem os scripts do kit, saídas de grafos (`graphify-out/`) e arquivos internos de controle, eliminando centenas de milhares de nós e arestas inúteis do grafo de conhecimento.

14. **Governança Cognitiva Autônoma (`SessionStart`, `PreInvocation` Anti-Loop, `Stop` Gate & ROI):**
    - **Briefing Zero-Read (`token-guard-sessionstart.cjs`):** Injeta um resumo executivo efêmero (~150 tokens) no `SessionStart` com fase atual do `.planning/STATE.md`, últimas decisões do `MemPalace`, testes pendentes e último checkpoint, eliminando 3 a 5 chamadas de leitura iniciais.
    - **Detector de Loop de Alucinação (`token-guard-preinvocation.cjs`):** Detecta 3+ falhas consecutivas na mesma ferramenta/arquivo ou em testes e injeta `ephemeralMessage` corretivo enriquecido com soluções do `MemPalace` (`problems`) e o ID do último checkpoint seguro.
    - **Gate Anti-Parada Prematura (`token-guard-diagnostics.cjs --summary`):** No evento `Stop` (`NO_TOOL_CALL`), verifica se o último teste falhou ou se arquivos recém-editados possuem erros de sintaxe/LSP e retorna `{"decision": "continue", "reason": "..."}` (com trava anti-loop de 1 retry).
    - **Telemetria de ROI & Orçamento (`token-report.cjs` v2 + `lib/token-savings.cjs`):** Contabiliza tokens reais poupados por cada motor do kit (`pretool_redirect`, `test_isolation`, `output_sanitizer`, `session_briefing`, `loop_prevention`), exibe o ranking `topTools` da sessão e monitora o orçamento de tokens.

15. **Controle Rigoroso Contra Erros (ErrorGuard, Zero Silent Fallbacks & Visibilidade Tripla):**
    - **Visibilidade Tripla:** Card visual vermelho no terminal (`process.stderr`), bloqueio imediato do agente (`deny` ou alerta de erro) e persistência atômica em `.agents/.cache/error-log.json`.
    - **Tolerância Zero a Falhas Ocultas:** Captura real de `stderr` de compiladores, LSPs, `ast-grep`, `graphify`, `node:sqlite` e `git`.
    - **Central de Erros:** Inspecione e limpe incidentes a qualquer momento com `node .agents/mcp-server.cjs errors` ou `./setup.sh --errors`.
    - **Permanência Automática:** Atualizações via `/gsd-agy-update` ou `gsd-update.cjs` preservam e forçam `strict_errors: true` em `.planning/config.json`.

16. **Batching Paralelo Obrigatório & Zero Re-exploração em Execução (`token-protocol.md`, `compact-planning.md`, `SessionStart`):**
    - **Batching Paralelo de Turno:** Obrigatoriedade de agrupamento de leituras independentes (`read_file`, `gsd_read_strip`, `query_docs`, `ast_query`) e edições multi-arquivo (`edit_file`) no mesmo turno, reduzindo chamadas sequenciais ociosas.
    - **Blueprint de Coordenadas (`PLAN.md`):** Teto rígido calibrado de 55 linhas, zero prosa explicativa e exigência de coordenadas exatas (`arquivo:L_ini-L_fim`), utilitários legados e contratos extraídos (proibindo wildcards).
    - **Injeção Turno 0 no `SessionStart`:** Injeta o Blueprint de Coordenadas diretamente no Turno 0 das Fases 2–5 com diretiva estrita de Zero Re-exploração e supressão de `codebaseMapText` redundante.

17. **SkeletonEngine v2 & Inspetor Cirúrgico `gsd-read-strip.cjs` v2:**
    - **SkeletonEngine v2 para JS/TS:** Extração completa de métodos de classe, construtores, getters/setters, rotas HTTP Express/Fastify (`app.get/post/...`, `router.use/...`), arrow functions atribuídas e `module.exports` com linhas 1-based exatas.
    - **Inspetor Cirúrgico v2:** Preserva 100% da numeração original de linhas do disco (`42: código`) mesmo após suprimir comentários de bloco e linhas vazias, mantendo tags Ponytail (`// shortcut:`, `// ponytail:`, `// TODO(gsd):`).
    - **Limiar Calibrado:** Limiar de esqueleto e strip alinhado para arquivos `> 100` linhas (arquivos `<= 100` linhas lidos direto em 1 turno).

18. **Runner Unificado de Verificação (`verify.cjs`) & AmbiguityGuard (`lib/ambiguity-guard.cjs`):**
    - **Verificação em 1 Turno:** Execução simultânea de checagem sintática (`node --check`), code smells de Fowler (aninhamento $\le 3$, tamanho $\le 48$, complexidade ciclomática $\le 12$, zero concatenação SQL) e testes automatizados em < 1s.
    - **Fast-Path no Stop Gate:** Gravação atômica de `last-verify-pass.json` permitindo aprovação instantânea sem retrabalho redundante.
    - **AmbiguityGuard:** Validação temática cruzada 1-para-1 dos itens `[AMB-XX]` de `TASK.md` contra `AMBIGUITIES.md`, barrando desvios e alucinações de escopo.

19. **Meta-Tool Gateway Dinâmico & Zero-Overhead de Schemas (`mcp-server.cjs`):**
    - **Corte Drástico de Overhead:** Manifesto expõe apenas ferramentas essenciais e o Gateway Universal (`quick_verify`, `tool_catalog`, `mcp_exec`, `lsp_diagnostics`, `gsd_read_strip`), cortando o overhead de schemas de ~4.500 para ~250 tokens/turno.
    - **Execução Sob Demanda:** `tool_catalog` e `mcp_exec` permitem consultar e disparar todas as ferramentas do ecossistema sem custo permanente de prompt.
    - **Resiliência Universal de Aliases:** Normalizador `resolveFilePath` aceita transparentemente `file_path`, `filePath`, `path`, `Path`, `target`, `TargetFile`, `AbsolutePath` em todas as ferramentas.
    - **Zero Falsos-Erros:** `ast_query` com 0 matches e `quick_verify` com falhas de domínio retornam `isError: false` via JSON-RPC, eliminando incidentes falsos no `ErrorGuard`.
    - **Compatibilidade Nativa com Lazy MCP:** Manifesto completo sob demanda no Antigravity CLI.

20. **Ponte Efêmera `PostToolUse` → `PreInvocation` & Progressive Disclosure:**
    - Diagnósticos pós-edição salvos em cache efêmero e consumidos em 1 único turno pelo `PreInvocation` com fast-exit de 150ms (`readStdin(150)`).
    - Regras situacionais migradas para `trigger: model_decision`, cortando 43,7% do footprint permanente de regras.
    - Windowed sub-range dedup (180s) e blindagem contra inspeção desperdiçada de arquivos internos do kit (`.agents/`).

---

## 🚀 Instalação Rápida com 1 Comando (Direto na Raiz do Projeto)

Durante a instalação, o assistente perguntará interativamente se o projeto possui interface **Front-End**, permitirá selecionar quais **servidores LSP** deseja instalar na máquina e limpará automaticamente qualquer arquivo temporário ao final:
- **Sem Front-End (Padrão/Enter):** Desativa fases de UI (`ui_phase: false`, `ui_safety_gate: false`, `ui_review: false`) e ativa o perfil enxuto `backend` (arquivando 43 skills de UI/design).
- **Com Front-End (2/s/sim):** Habilita governança de UI e restaura o perfil `full` com 100% das skills ativas.

### ⚡ Opção 1: Universal via `npx` (Windows, Linux, macOS, WSL)
Execute diretamente na pasta raiz do seu projeto GSD (não deixa nenhuma pasta residual):

```bash
# Interativo (pergunta Backend vs Fullstack)
npx --yes --allow-git=all github:ARILSONLIMA/gsd-agy-kit

# Não-interativo (direto para Backend ou Fullstack)
npx --yes --allow-git=all github:ARILSONLIMA/gsd-agy-kit --no-frontend
npx --yes --allow-git=all github:ARILSONLIMA/gsd-agy-kit --frontend
```

### 🐧 Opção 2: One-Liner via `curl` (Linux / macOS / WSL)
```bash
# Interativo com limpeza automática de temporários
curl -fsSL https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.sh | bash

# Não-interativo via flags
curl -fsSL https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.sh | bash -s -- --no-frontend
curl -fsSL https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.sh | bash -s -- --frontend
```

### 🪟 Opção 3: One-Liner via `irm` (Windows PowerShell)
```powershell
# Interativo com limpeza automática de temporários
irm https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.ps1 | iex

# Não-interativo (Backend ou Fullstack)
$env:GSD_FRONTEND="false"; irm https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.ps1 | iex
$env:GSD_FRONTEND="true"; irm https://raw.githubusercontent.com/ARILSONLIMA/gsd-agy-kit/main/install.ps1 | iex
```

### 📂 Opção 4: Via `git clone` ou Pasta Local
```bash
# Linux / macOS / WSL (baixa, instala interativamente e remove a pasta gsd-agy-kit automaticamente ao final)
git clone --depth 1 https://github.com/ARILSONLIMA/gsd-agy-kit.git && bash gsd-agy-kit/setup.sh

# Windows PowerShell
git clone --depth 1 https://github.com/ARILSONLIMA/gsd-agy-kit.git; pwsh gsd-agy-kit/setup.ps1
```
*(Caso queira manter a pasta clonada `gsd-agy-kit` após a instalação, passe `--no-cleanup` no Bash ou `-NoCleanup` no PowerShell).*

---

## 📦 Onde o Kit Fica Instalado?

O kit instala toda a sua infraestrutura de forma **nativa e permanente** dentro de `.agents/`:
- **`.agents/kit/`**: Bateria de testes, painel de controle (`setup-ui.cjs`), motor de atualização (`gsd-update.cjs`), utilitários e desinstalador.
- **`.agents/hooks/` & `.agents/hooks.json`**: Hard gates (`PreInvocation`, `PreToolUse`, `PostToolUse`, `Stop`).
- **`.agents/skills/gsd-test/`, `gsd-tokens/` & `gsd-agy-update/`**: Skills nativas `/gsd-test`, `/gsd-tokens` e `/gsd-agy-update` (otimizadas com `disable-model-invocation: true`).
- **`scripts/test-kit.sh` & `scripts/test-kit.ps1`**: Atalhos rápidos de validação para terminal.

---

## 🔄 Atualização Inteligente (`/gsd-agy-update`)

Para verificar se você está na última versão do **Antigravity GSD Kit**, conhecer detalhadamente todas as novas melhorias (`CHANGELOG.md` + últimos commits do GitHub) e atualizar preservando suas configurações locais (`.planning/config.json`, `MemPalace` e snapshots):

1. **Direto no Chat do Antigravity CLI:**
   ```markdown
   /gsd-agy-update
   ```
   O agente verificará a versão atual vs. remota, explicará todas as novidades em Português (pt-BR) e pedirá sua confirmação antes de atualizar (ou atualizará direto caso você digite `/gsd-agy-update --yes`).

2. **Direto no Terminal (CLI ou Menu Interativo):**
   ```bash
   # Apenas verificar versão e ver resumo de melhorias
   node .agents/kit/gsd-update.cjs --check

   # Verificar e atualizar interativamente
   node .agents/kit/setup-ui.cjs --update

   # Atualizar direto sem confirmação interativa
   node .agents/kit/gsd-update.cjs --yes
   ```

---

## 📜 Ordem Rígida de Prioridade (Token Protocol)

Ao inspecionar ou alterar código, a esteira obrigatória é:

1. **`graphify query --graph .planning/graphs/graph.json "<pergunta>"`** (via `run_command`): Análise de arquitetura macro e dependências de pacotes.
2. **Motor Multi-LSP Híbrido (`lsp_*` MCP ou `node .agents/mcp-server.cjs lsp ...`)**: Para resolver definições (`definition`), referências cruzadas (`references`), assinaturas (`hover`/`symbols`), renomeações (`rename`) e diagnósticos (`diagnostics`) com precisão em Go, TS/JS, Python, Rust, PHP, C/C++, Java, C#, Ruby e Dart.
3. **`ast-grep` CLI** (via `run_command: ast-grep run -p '<padrão>'` ou `mcp-server.cjs ast`): Buscas sintáticas e estruturais na AST.
4. **`view_file` Cirúrgico:** Máximo de 100 linhas com `StartLine` e `EndLine` estritos.
5. **`replace_file_content` Cirúrgico:** Modificações de código sempre por substituição pontual de linhas, nunca sobrescrita total.

---

## 🧪 Bateria de Testes Nativos (Instantânea)

Após a instalação (mesmo tendo deletado a pasta temporária `gsd-agy-kit`), você pode verificar a integridade de todas as proteções das seguintes maneiras:

### 1. Via Skill Nativa no Antigravity CLI
Basta digitar a skill no chat do agente:
```markdown
/gsd-test
```
O agente executará a suíte de testes automaticamente via `run_command` no terminal do projeto e reportará os resultados.

### 2. Diretamente pelo Terminal

- **No Linux / macOS / WSL (Bash):**
  ```bash
  # Via atalho em scripts/
  bash scripts/test-kit.sh

  # Ou diretamente do pacote nativo .agents/kit/
  bash .agents/kit/test-kit.sh
  ```

- **No Windows (PowerShell):**
  ```powershell
  # Via atalho em scripts/
  pwsh scripts/test-kit.ps1

  # Ou diretamente do pacote nativo .agents/kit/
  pwsh .agents/kit/test-kit.ps1
  ```

### 3. Painel de Controle / Hub Interativo Nativo
Para abrir o menu interativo a qualquer momento mesmo sem a pasta do instalador:
```bash
node .agents/kit/setup-ui.cjs . --menu
```

O validador testa e confirma 100% dos testes e regras de proteção:
- ✅ **Normalização dos subagentes:** ausência de `glob`/`grep_search` e protocolo injetado em todos os agentes ativos e no pool.
- ✅ **Hard Gate `view_file`:** bloqueio sem paginação em modo estrito, bloqueio com range > 100 linhas, liberação cirúrgica (≤ 100 linhas) e liberação irrestrita para documentação.
- ✅ **Smart-Assist Auto-Slicing:** auto-correção proativa de ranges e paginação cirúrgica via `res.overwrite` sem penalidade de turnos.
- ✅ **Greenfield Fast-Track:** detecção automática de maturidade do projeto e supressão de esteira forense pesada para projetos novos.
- ✅ **Tool MCP `ast_query`:** busca estrutural segura via ast-grep eliminando erros de escape no shell.
- ✅ **Test Isolate Engine:** detecção e isolamento de testes falhos para reexecução cirúrgica via Node, Jest, Go e Pytest.
- ✅ **Git Micro-Checkpoints:** criação de snapshots e rollback instantâneo para prevenção de loops de alucinação.
- ✅ **Expansão Multi-Stack:** Skeleton Engine e Lockfile Lens para TypeScript, Go, Python, Rust, C#, Java, PHP, Ruby, Dart e Elixir.
- ✅ **Blindagem de Índices:** arquivos `.graphifyignore` e `.astgrepignore` garantindo isolamento total do kit, saída de grafos (`graphify-out/`) e cache.
- ✅ **Gate Universal de Linguagens:** bloqueio cirúrgico estendido para `.vue`, `.svelte`, `.cs`, `.php`, `.rb`, `.swift`, `.kt`, `.sql`, `.dart`.
- ✅ **Higienização de URIs:** suporte transparente a esquemas `file:///` e caminhos com til (`~`).
- ✅ **Hard Gate `run_command`:** bloqueio de despejo cego (`cat`/`Get-Content`/`gc`/`head`), bloqueio de `go test -v`, bloqueio de reescrita em massa com `ast-grep` (`-r -u`) e bloqueio de aspas duplas com `$` no Windows.
- ✅ **Normalização de caminhos Windows com preservação de URLs:** conversão de drives (`/` ➔ `\`) sem corromper URLs `https://`.
- ✅ **Preservação de Scripts Remotos (.ps1):** preservação de URLs remotas HTTP/HTTPS terminadas em `.ps1` sem corrupção de barras.
- ✅ **Hard Gate `write_to_file`:** bloqueio mecânico de sobrescrita de arquivos de código existentes com exceção segura para rascunhos em pastas efêmeras (`scratch/`, `temp/`).
- ✅ **Hook PreInvocation:** auto-cura silenciosa instantânea e execução limpa sem banners repetidos.
- ✅ **Otimização de tokens:** arquivamento de `.compact.md` e desduplicação de `.agents/GEMINI.md`.
- ✅ **Dynamic Agent Pool & Zero-Baseline:** preservação dos 35 agentes em `.agents/agents-pool/` e catálogo ativo operando em Zero-Baseline (0 agentes ativos por padrão, ativados sob demanda JIT).
- ✅ **Dynamic Skill Pool & Zero-Baseline:** preservação de 75+ skills em `.agents/skills-pool/` (Golden Master imutável), 0 skills ativas no prompt e promoção instantânea sob demanda via `view_file`/`read_file`.
- ✅ **JIT Auto-Promoter Cirúrgico:** promoção instantânea com busca case-insensitive e recolhimento imediato no turno seguinte (TTL = 1 turno).
- ✅ **Governança e Git Hooks:** integridade de `.agents/hooks.json` (com matchers para ferramentas e subagentes) e hooks `post-merge`/`post-checkout` em `.git/hooks/`.
- ✅ **Telemetria de tokens:** operacionalidade do comando `/gsd-tokens` (`token-report.cjs`).
- ✅ **Hard Stop de Pré-requisitos:** detecção estrita de `Node.js`, `ast-grep`, `graphify` e `gsd-core`.
- ✅ **Defaults Enxutos e Governança:** validação automática de `response_language: pt-BR`, `kit_mode: smart-assist`, `source_grounding_authority: ast-grep`, `graphify`, `mempalace` e flags econômicas em `.planning/config.json`.
- ✅ **Motor de UI do Instalador:** integridade, paridade e validação sintática do `setup-ui.cjs`.
- ✅ **Deduplicação de Leituras Recentes:** bloqueio imediato de releituras idênticas do mesmo trecho de código em turnos consecutivos.
- ✅ **Auto-Limitador Inteligente:** reescrita preventiva de `git log` (`-n 20`), `docker logs` (`--tail 100`), `Get-ChildItem -Recurse` (`-Depth 3`), `find .` (`-maxdepth 3`) e `npm list` (`--depth=0`) com respeito aos limites sintáticos de comandos.
- ✅ **State Compactor:** validação estrutural e operacional de `compact-state.cjs`.
- ✅ **JSON Stream Compact:** validação de filtragem e expurgo de valores nulos via `compact-json.cjs`.
- ✅ **Output Sanitizer:** truncamento inteligente de saídas extensas no estilo Headroom com persistência integral de log.
- ✅ **Motores Nativos Ponytail & Caveman:** operacionalidade de `codebase-map.cjs` (<= 2000 chars) e `caveman-shrink.cjs`.
- ✅ **Ferramentas MCP & CLI:** comandos `map`, `debt` e `shrink` integrados no `mcp-server.cjs`.
- ✅ **Suíte Completa Ponytail & Caveman:** integridade e frontmatter válido de 16 skills especializadas.
- ✅ **Subagentes Cavecrew:** presença e protocolo de concisão em `cavecrew-investigator`, `builder` e `reviewer`.
- ✅ **Rastreamento de Modos em Tempo Real:** interceptação e confirmação efêmera de `/caveman` e `/ponytail` no `PreInvocation`.
- ✅ **Batching Paralelo & Blueprint de Coordenadas:** PLAN.md com coordenadas exatas (`arquivo:L_ini-L_fim`) e teto calibrado de 55 linhas sem prosa.
- ✅ **SkeletonEngine v2:** extração estrutural JS/TS com métodos de classe, rotas Express/Fastify e arrow functions.
- ✅ **gsd-read-strip v2:** preservação de numeração original de linhas (1-based) e tags Ponytail (`// shortcut:`, `// ponytail:`).
- ✅ **AmbiguityGuard & Verificador Unificado:** validação temática cruzada 1-para-1 dos itens `[AMB-XX]` e verificação simultânea de sintaxe, smells e testes via `verify.cjs`.
- ✅ **Ponte Efêmera PostToolUse ➔ PreInvocation:** injeção transitória de linter em 1 turno com fast-exit de 150ms.
- ✅ **Resiliência MCP v2.5:** suporte universal a aliases camelCase (`filePath`, `file_path`, etc.) e zero falsos erros em `ast_query` ou `quick_verify`.
- ✅ **Deduplicação em Janela de 180s:** bloqueio de sub-ranges contidos mesmo intercalados e blindagem de foco em `.agents/`.

---

## 🔄 Git Hooks Automáticos (Equipes & CI/CD)

Ao executar o `setup.ps1` ou `setup.sh`, o kit instala automaticamente hooks em `.git/hooks/`:
- **`post-merge`:** Toda vez que você ou sua equipe rodar `git pull`, o patch é reaplicado silenciosamente.
- **`post-checkout`:** Toda vez que alternar entre branches, os subagentes são auto-curados caso a branch contenha definições antigas.

---

## 🧹 Desinstalação e Reversão Limpa

Se desejar remover o kit e reverter os subagentes para o estado padrão:

- **Universal (Node.js):**
  ```bash
  node .agents/kit/setup-ui.cjs . --uninstall
  ```
- **No Windows (PowerShell):**
  ```powershell
  pwsh .agents/kit/uninstall.ps1
  ```
- **No Linux / macOS / WSL (Bash):**
  ```bash
  bash .agents/kit/uninstall.sh
  ```

O script de desinstalação:
1. Remove o gate de tokens do `.agents/hooks.json`.
2. Remove os arquivos de hooks e regras instalados.
3. Remove os Git hooks criados.
4. Remove os blocos de protocolo injetados nos subagentes em `.agents/agents/*.md`.


