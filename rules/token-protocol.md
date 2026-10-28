---
trigger: always_on
description: Protocolo JIT de economia de tokens, batching paralelo, blueprint de coordenadas, edição cirúrgica, quick_verify e ambiguidades.
---

# Protocolo Canônico de Economia de Tokens e Execução Cirúrgica

## 1. Diagnóstico Sob Demanda (JIT) e Batching Paralelo
- **Batching Paralelo Obrigatório:** Agrupe no **mesmo turno** todas as leituras independentes (`read_file`, `gsd_read_strip`, `query_docs`, `ast_query`) e edições em arquivos distintos (`edit_file`). Proibido loop sequencial de 1 tool por turno quando os alvos já são conhecidos.
- **Test-Driven First:** Em diagnósticos sem plano prévio, rode PRIMEIRO a suíte de testes (`npm test`, `go test`, `pytest`) para capturar falhas e linhas exatas.
- **Zero Re-exploração em Execução:** Se `PLAN.md` ou `DIAGNOSIS.md` já existir com coordenadas `arquivo:L_ini-L_fim` e constantes extraídas, vá **direto** aos ranges mapeados. Proibido reler `docs/`, `tests/` ou rodar `skeleton` em arquivos já mapeados no plano.
- **Navegação Calibrada por Tamanho:**
  - **Arquivos ≤ 100 linhas:** Leia direto em 1 turno com `read_file` (sem `skeleton` prévio).
  - **Arquivos > 100 linhas:** Use `gsd_read_strip` (`node .agents/mcp-server.cjs strip "<arquivo>" [ini] [fim]`) para ler código enxuto com linhas `N:` e tags `// shortcut:` em 1 turno, ou `view_skeleton` (`node .agents/mcp-server.cjs skeleton "<arquivo>"`) para mapear classes, métodos, rotas e exports antes de fatiar `StartLine`/`EndLine` ≤ 100 linhas.
  - **Specs e Deps:** Use `query_docs` / `check_dependency` / `mempalace_recall` sem abrir lockfiles brutos.

## 2. Escrita Atômica, Diffs Cirúrgicos e Rename Semântico
- **Arquivos NOVOS:** Crie integralmente em uma única chamada `write_file` / `write_to_file`.
- **Arquivos EXISTENTES:** Edite cirurgicamente via `edit_file` / `replace_file_content` no menor range. Para renomear símbolo em múltiplos arquivos, use `lsp_rename` (`node .agents/mcp-server.cjs lsp rename "<antigo>" "<novo>" src`). Proibido sobrescrever arquivo existente ou usar `ast-grep --rewrite`.

## 3. Sanitização de Terminal e Linter Pós-Edição Automático
- **Proibido:** Despejo bruto (`cat`, `Get-Content`, `type`, `head`, `tail`) em código ou flags verbosas (`-v`, `--verbose`) em suítes inteiras.
- **Pós-Edição Zero-Turno:** `PostToolUse` + `PreInvocation` validam sintaxe, SQLi, limites Fowler e DRY automaticamente e injetam alerta efêmero apenas se houver violação. **NÃO rode `node -c` manualmente após cada `edit_file`**.
- **Memória Contínua:** Registre decisões chave com `mempalace_capture`.

## 4. Verificação Unificada em 1 Turno (`quick_verify`)
- Ao concluir entregas de código, execute `quick_verify` (ou `node .agents/mcp-server.cjs verify`).
- Valida sintaxe, segurança SQL, complexidade/DRY, testes e integridade de `AMBIGUITIES.md` em 1 turno. Se `PASS`, encerre imediatamente sem comandos extras.

## 5. Invocação Direta de Comandos sem Barra & Descoberta JIT (Descoberta & Ativação Autônoma)
- **Comandos Diretos sem Barra (`<skill> [argumentos]`):** Qualquer mensagem iniciada pelo nome exato de uma skill (ex: `gsd-execute-phase 2`, `gsd-plan-phase 1`, `gsd-profile-user`, `ponytail-debt`, `gsd-progress`) é uma **invocação direta de workflow**. Trate a primeira palavra como a skill e o restante como `$ARGUMENTS`. Abra e execute imediatamente as instruções de `.agents/skills/<skill>/SKILL.md` (ou `.agents/skills-pool/<skill>/SKILL.md`) aplicando os argumentos passados, sem preâmbulos.
- **Zero-Baseline & Auto-Promoção JIT:** Skills no pool (`.agents/skills-pool/`) são auto-promovidas instantaneamente pelo hook ao serem invocadas pelo nome ou acessadas via `read_file`/`view_file` (TTL: 5 turnos). Para busca por intenção ou sintomas, use `skill_search({ query: "<termo>", activate: true })`.

## 6. Protocolo Obrigatório de Ambiguidades (`AMBIGUITIES.md`)
Audite e registre ≥ 3 ambiguidades em `AMBIGUITIES.md` ao final da Fase 1 (antes de `PLAN.md`) e atualize na Fase 5 (Change Requests). Mínimo: 3 blocos `### AMB-` e ≥ 250 bytes.

### Prioridade 1 Absoluta — Paridade 1-para-1 com `TASK.md` e `CHANGE_REQUEST.md`:
Verifique **todos os itens `[AMB-XX]` listados ou implícitos em `TASK.md`, `CHANGE_REQUEST.md` e `docs/`** antes de gravar `AMBIGUITIES.md`, preservando os substantivos exatos do domínio em cada bloco correspondente (ex.: prefixos de veículos não homologados na frota, dead-letter vs descarte, tolerância de arredondamento, idempotência). Nunca substitua um `AMB-XX` explícito do enunciado por descrição genérica de bug.

### Formato Obrigatório em Bloco Atômico:
Cada item DEVE ser escrito em **parágrafo contínuo único e autossuficiente** logo abaixo do título:
```markdown
### AMB-01: [Entidade/Fluxo do Domínio] — [Conflito Técnico ou Omissão de Contrato]
Identificada indefinição em [módulo/regra] quanto a [conflito, borda ou omissão na especificação]. Decisão de engenharia adotada: [premissa determinística implementada no código, cobrindo validação, fallback, dead-letter ou normalização].
```

### Os 4 Vetores Universais de Incerteza de Software:
1. **Temporal e Fusos:** Fuso local vs UTC canônico (ISO 8601 `Z`), janelas de corte e ordenação de eventos fora de ordem.
2. **Borda, Divisões e Estados Ociosos:** Divisão por zero retornando `0.0` estrito, tolerâncias numéricas e separação entre atividade produtiva e estado ocioso.
3. **Entradas Não Homologadas, Falhas e Intermitência:** Tratamento de cadastros/prefixos desconhecidos (rejeição/dead-letter vs auto-registro), pacotes duplicados/parciais e ruídos de leitura.
4. **Contratos de Payload e Estado:** Campos nulos vs omitidos (`PATCH` vs `PUT`), idempotência e defaults em agregações vazias.
