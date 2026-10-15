# Antigravity GSD Kit 🚀

> **Adaptador Universal de Governança, Compatibilidade e Auto-Cura para GSD no Antigravity CLI**

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

   - **`sanitize-output.cjs` / `sanitize-command.ps1`:** Truncador no estilo Headroom que limita saídas longas a head + tail e preserva o dump integral em `.planning/debug/` ou `.project/debug/`.

10. **Servidor MCP Padronizado & Motores de Economia (`mcp-server.cjs` & `lib/`):**
    - **Servidor Stdio Nativo:** Comunicação via JSON-RPC 2.0 padrão em `.agents/mcp_config.json`, com zero dependências npm.
    - **`mempalace_recall` / `mempalace_capture`:** Memória episódica estruturada persistida em SQLite (`.agents/memory/palace.db`) com busca FTS5 para decisões arquiteturais e soluções de bugs históricos sem amnésia.
    - **`query_docs` (Mini-RAG para Markdown):** Indexação e busca semântica em arquivos `.md` do projeto, extraindo apenas os trechos e seções exatas das regras de negócio sem despejar arquivos de especificação inteiros.
    - **`check_dependency` (Lente de Lockfiles):** Inspeção cirúrgica de pacotes e versões diretamente em `package-lock.json`, `go.sum`, `Cargo.lock` e `requirements.txt` sem sobrecarregar a janela de contexto.
    - **`view_skeleton` (Esqueleto Estrutural):** Extração de assinaturas, structs, interfaces e tipos com números de linha para navegação cirúrgica.

11. **Compatibilidade Universal Dual-Engine (`gsd-path` + `gsd-core`):**
    - Suporte automático e transparente para **GSD Path** (`.project/STATE.md`, `.gsd-path/`) e **GSD Core** (`.planning/STATE.md`, `.agents/gsd-core`).
    - O instalador detecta a arquitetura do projeto e aplica a governança ideal sem quebras ou conflitos.

---

## 🚀 Instalação Rápida

Durante a instalação, o assistente perguntará interativamente se o projeto possui interface **Front-End**:
- **Sem Front-End (Padrão/Enter):** Desativa fases de UI (`ui_phase: false`, `ui_safety_gate: false`, `ui_review: false`) e ativa o perfil enxuto `backend` (arquivando 43 skills de UI/design).
- **Com Front-End (s/sim):** Habilita governança de UI e restaura o perfil `full` com 100% das skills ativas.

### No Windows (PowerShell)
```powershell
# Interativo (pergunta se terá Front-End)
pwsh gsd-agy-kit/setup.ps1

# Não-interativo (direto para Backend ou Fullstack)
pwsh gsd-agy-kit/setup.ps1 -HasFrontend:$false
pwsh gsd-agy-kit/setup.ps1 -HasFrontend:$true
```

### No Linux / macOS / WSL (Bash)
```bash
# Interativo
chmod +x gsd-agy-kit/setup.sh
gsd-agy-kit/setup.sh

# Não-interativo via flags
gsd-agy-kit/setup.sh --no-frontend
gsd-agy-kit/setup.sh --frontend
```

---

## 📦 Como Transportar para Outros Projetos

Para blindar qualquer outro projeto que utilize GSD:

1. **Copie a pasta:**
   Cole a pasta `gsd-agy-kit` diretamente na pasta raiz do seu projeto.
2. **Execute o setup:**
   - No Windows: `pwsh gsd-agy-kit/setup.ps1`
   - No Linux: `bash gsd-agy-kit/setup.sh`
3. **Pronto!** O projeto estará imediatamente compatibilizado e protegido.

---

## 📜 Ordem Rígida de Prioridade (Token Protocol)

Ao inspecionar ou alterar código, a esteira obrigatória é:

1. **`graphify query "<pergunta>"`** (via `run_command`): Análise de arquitetura macro e dependências de pacotes.
2. **`gopls` MCP** (via `call_mcp_tool`): Para resolver assinaturas, tipos, structs e referências cruzadas com custo zero de leitura.
3. **`ast-grep` CLI** (via `run_command: ast-grep run -p '<padrão>' --lang go`): Buscas sintáticas e estruturais na AST.
4. **`view_file` Cirúrgico:** Máximo de 100 linhas com `StartLine` e `EndLine` estritos.
5. **`replace_file_content` Cirúrgico:** Modificações de código sempre por substituição pontual de linhas, nunca sobrescrita total.

---

## 🧪 Bateria de Testes Automatizados (Instantânea)

Para validar a integridade de todas as proteções, execute o validador incluído:

- **No Windows (PowerShell):**
  ```powershell
  pwsh gsd-agy-kit/test-kit.ps1
  ```
- **No Linux / WSL (Bash):**
  ```bash
  chmod +x gsd-agy-kit/test-kit.sh
  gsd-agy-kit/test-kit.sh
  ```

O validador testa e confirma 100% dos 40 cenários e regras de proteção:
- ✅ **Normalização dos subagentes:** ausência de `glob`/`grep_search` e protocolo injetado em todos os agentes ativos e no pool.
- ✅ **Hard Gate `view_file`:** bloqueio sem paginação, bloqueio com range > 100 linhas, liberação cirúrgica (≤ 100 linhas) e liberação irrestrita para documentação.
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
- ✅ **Defaults Enxutos e Governança:** validação automática de `response_language: pt-BR`, `source_grounding_authority: ast-grep`, `graphify`, `mempalace` e flags econômicas em `.planning/config.json`.
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

- **No Windows (PowerShell):**
  ```powershell
  pwsh gsd-agy-kit/uninstall.ps1
  ```
- **No Linux / WSL (Bash):**
  ```bash
  chmod +x gsd-agy-kit/uninstall.sh
  gsd-agy-kit/uninstall.sh
  ```

O script de desinstalação:
1. Remove o gate de tokens do `.agents/hooks.json`.
2. Remove os arquivos de hooks e regras instalados.
3. Remove os Git hooks criados.
4. Remove os blocos de protocolo injetados nos subagentes em `.agents/agents/*.md`.


