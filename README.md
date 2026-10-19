# Antigravity GSD Kit v1.4.0 🚀

> **Adaptador Universal de Governança, Compatibilidade, Auto-Cura e Economia de Tokens para GSD no Antigravity CLI**

Este módulo transforma o ecossistema **GSD (Get Stuff Done)** para funcionar com **100% de compatibilidade** com o **Antigravity CLI**, garantindo a imposição estrita do protocolo de economia de tokens e proteção contra updates do GSD.

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
   - **Circuit Breaker Completo:** Testa a saúde operacional de `gopls` (em projetos Go), `ast-grep` e `graphify` antes de permitir execuções de ferramentas.
   - **JIT Auto-Promoter Reativo (Agentes & Skills):** Intercepta chamadas a `invoke_subagent` e leituras de skills via `view_file`, promovendo itens adormecidos do pool (`.agents/agents-pool/` e `.agents/skills-pool/`) para o catálogo ativo em tempo real (2ms), com busca case-insensitive para Linux/POSIX e renovação automática de TTL (5 turnos por acesso ativo).

4. **Motor de Otimização de Tokens & Dynamic Agent Pool (`optimize-tokens.cjs`):**
   - **Dynamic Agent Pool (`.agents/agents-pool/`):** Preserva 100% dos 35 subagentes únicos de forma segura fora do catálogo ativo.
   - **Sincronização Inteligente por Fase:** Detecta automaticamente a fase do projeto em `.planning/STATE.md` (`planning`, `execution`, `verification`, `core`) e mantém **apenas 5 a 6 agentes ativos no prompt por vez**, reduzindo drasticamente o consumo de tokens.
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
   - Card interativo estruturado para seleção de arquitetura (Backend vs Fullstack).
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
    - **`ast_query` (Busca Estrutural AST Segura):** Executa buscas sintáticas no `ast-grep` via JSON-RPC/CLI sem risco de corrupção por aspas ou expansão de variáveis `$` no PowerShell/Bash. CLI: `node .agents/mcp-server.cjs ast "<pattern>" [lang] [path]`.
    - **`test_isolate` (Isolador Cirúrgico de Testes):** Detecta testes que falharam recentemente e gera comandos pontuais para rodar apenas o teste quebrado (Node `--test`, Jest/Vitest, Go, Pytest) sem rodar a suíte completa. CLI: `node .agents/mcp-server.cjs test-isolate`.
    - **`checkpoint_manager` (Micro-Checkpoints Git & Anti-Alucinação):** Cria tags e snapshots git antes/depois de refatorações críticas e permite rollback instantâneo caso o modelo entre em loops de quebra de código. CLI: `node .agents/mcp-server.cjs checkpoint <create|list|rollback> [arg]`.
    - **`mempalace_recall` / `mempalace_capture` (MemPalace v2):** Memória episódica estruturada persistida em SQLite (`.agents/memory/palace.db`) com busca FTS5 para decisões arquiteturais e soluções de bugs com auto-captura heurística silenciosa na transição vermelho ➔ verde. CLI: `node .agents/mcp-server.cjs recall "<query>"` e `capture <room> "<tópico>" "<conteúdo>"`.
    - **`query_docs` (Mini-RAG para Markdown):** Indexação e busca semântica em arquivos `.md` do projeto, extraindo apenas os trechos e seções exatas das regras de negócio sem despejar arquivos de especificação inteiros. CLI: `node .agents/mcp-server.cjs docs "<query>"`.
    - **`check_dependency` (Lente Multi-Stack de Lockfiles):** Inspeção cirúrgica de pacotes e versões em `package-lock.json`, `go.sum`, `Cargo.lock`, `requirements.txt`, `composer.json`, `Gemfile` e `pubspec.yaml` sem sobrecarregar a janela de contexto. CLI: `node .agents/mcp-server.cjs dep "<pacote>"`.
    - **`view_skeleton` (Esqueleto Estrutural Universal):** Extração de assinaturas, structs, interfaces e tipos com números de linha para TypeScript, JavaScript, Go, Python, Rust, C#, Java, PHP, Ruby, Dart e Elixir. CLI: `node .agents/mcp-server.cjs skeleton "<arquivo>"`.

11. **Modo Smart-Assist & Auto-Slicing Proativo (`res.overwrite`):**
    - Substitui rejeições mecânicas (`deny`) que custavam turnos extras e milhares de tokens de repetição por correções automáticas e transparentes via `overwrite`.
    - Auto-injeta limites cirúrgicos de 100 linhas em arquivos não paginados ou trunca ranges excessivos sem quebrar o fluxo do agente.
    - Suporta modos configuráveis: `smart-assist` (padrão), `strict` (hard gates) e `permissive`.

12. **Protocolo Context-Aware (Greenfield Fast-Track vs Brownfield):**
    - O normalizador detecta automaticamente a maturidade do projeto (contagem de arquivos de código existentes).
    - Em projetos novos (**Greenfield**): elimina varreduras forenses pesadas de AST/Graphify/MemPalace na Phase 1, focando em scaffolding direto e contratos, cortando mais de 50.000 tokens de overhead.
    - Em projetos existentes (**Brownfield**): mantém a esteira analítica profunda completa.

13. **Blindagem de Grafos e Índices (`.graphifyignore` & `.astgrepignore`):**
    - Instala templates de exclusão que impedem o `graphify` e o `ast-grep` de indexarem os scripts do kit, saídas de grafos (`graphify-out/`) e arquivos internos de controle, eliminando centenas de milhares de nós e arestas inúteis do grafo de conhecimento.

---

## 🚀 Instalação Rápida com 1 Comando (Direto na Raiz do Projeto)

Durante a instalação, o assistente perguntará interativamente se o projeto possui interface **Front-End** e limpará automaticamente qualquer arquivo temporário ao final:
- **Sem Front-End (Padrão/Enter):** Desativa fases de UI (`ui_phase: false`, `ui_safety_gate: false`, `ui_review: false`) e ativa o perfil enxuto `backend` (arquivando 43 skills de UI/design).
- **Com Front-End (2/s/sim):** Habilita governança de UI e restaura o perfil `full` com 100% das skills ativas.

### ⚡ Opção 1: Universal via `npx` (Windows, Linux, macOS, WSL)
Execute diretamente na pasta raiz do seu projeto GSD (não deixa nenhuma pasta residual):

```bash
# Interativo (pergunta Backend vs Fullstack)
npx github:ARILSONLIMA/gsd-agy-kit

# Não-interativo (direto para Backend ou Fullstack)
npx github:ARILSONLIMA/gsd-agy-kit --no-frontend
npx github:ARILSONLIMA/gsd-agy-kit --frontend
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
- **`.agents/kit/`**: Bateria de testes, painel de controle (`setup-ui.cjs`), utilitários e desinstalador.
- **`.agents/hooks/` & `.agents/hooks.json`**: Hard gates (`PreInvocation`, `PreToolUse`, `PostToolUse`, `Stop`).
- **`.agents/skills/gsd-test/` & `.agents/skills/gsd-tokens/`**: Skills nativas `/gsd-test` e `/gsd-tokens`.
- **`scripts/test-kit.sh` & `scripts/test-kit.ps1`**: Atalhos rápidos de validação para terminal.

---

## 📜 Ordem Rígida de Prioridade (Token Protocol)

Ao inspecionar ou alterar código, a esteira obrigatória é:

1. **`graphify query "<pergunta>"`** (via `run_command`): Análise de arquitetura macro e dependências de pacotes.
2. **`gopls` MCP** (via `call_mcp_tool`): Para resolver assinaturas, tipos, structs e referências cruzadas com custo zero de leitura.
3. **`ast-grep` CLI** (via `run_command: ast-grep run -p '<padrão>' --lang go`): Buscas sintáticas e estruturais na AST.
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
- ✅ **Dynamic Agent Pool:** preservação dos 35 agentes em `.agents/agents-pool/` e catálogo ativo enxuto consciente de fase (≤ 10 agentes).
- ✅ **Dynamic Skill Pool & JIT:** preservação de 75+ skills em `.agents/skills-pool/` (Golden Master imutável), catálogo ativo enxuto consciente de fase e promoção instantânea de skills via `view_file`.
- ✅ **JIT Auto-Promoter Reativo:** promoção instantânea com busca case-insensitive e renovação contínua de TTL (5 turnos).
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


