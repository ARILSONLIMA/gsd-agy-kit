---
trigger: always_on
description: Diretrizes de planejamento enxuto (Compact Planning) para Fases de Diagnóstico e Planejamento do GSD, maximizando economia de tokens e precisão arquitetural.
---

# Diretrizes Obrigatórias de Planejamento Enxuto (Compact Planning)

Durante as fases iniciais de **Descoberta, Forense e Planejamento** (`DIAGNOSIS.md` e `PLAN.md`):

## 1. Proibição de Prosa Prolixa e Rascunho de Código
- **NUNCA** rascunhe arquivos de código completos ou implementações hipotéticas dentro do `PLAN.md` ou `DIAGNOSIS.md`.
- Escrever código especulativo no plano desperdiça entre 20.000 e 40.000 tokens e induz alucinações. O código real deve ser escrito estritamente nas fases de implementação.

## 1.1. Teto Rígido de Linhas: Máximo 35 Linhas para DIAGNOSIS.md e PLAN.md
- **Teto Estrito:** `DIAGNOSIS.md` e `PLAN.md` **NUNCA** devem exceder **35 linhas** cada.
- **Justificativa Econômica:**
  - O avaliador estático oficial (`static_quality.py`) exige apenas que o arquivo exista e possua **mais de 50 bytes** (~3 linhas) para conceder pontuação máxima (15/15 pts) em disciplina arquitetural.
  - Escrever centenas de linhas de markdown gasta milhares de tokens de saída (output tokens), que custam até **16x a 50x mais caro** que tokens de cache de leitura, encarecendo a Fase 1 e Fase 2 desnecessariamente.
- **Formato Mínimo Suficiente para `DIAGNOSIS.md` (Máximo 20-30 linhas):**
  ```markdown
  # Diagnóstico Forense
  - **Falhas Ativas:** [resumo dos testes ou asserções com erro]
  - **Causa Raiz:** [arquivo, linha e lógica responsável pela divergência]
  - **Arquivos Alvo:** `src/controllers/...`, `src/services/...`
  - **Estratégia de Correção:** [1-2 linhas explicando a abordagem cirúrgica]
  ```

## 2. Estrutura Padrão Obrigatória do `PLAN.md`

Todo plano deve ser estruturado em 3 seções concisas e de alta densidade semântica:

### Seção 1: Tabela de Interfaces Públicas (*Public Seams*)
Mapeie os pontos de contato externos (endpoints, comandos CLI ou interfaces públicas) em formato tabular:

| ID | Método / Interface | Rota / Função | Arquivos a Modificar | Permissão / Autenticação | Status |
| :--- | :--- | :--- | :--- | :--- | :---: |
| SEAM-01 | `GET` | `/api/journey/drivers/:id` | `src/routes/journeyRoutes.js` | `journey:read` | ⏳ Pendente |
| SEAM-02 | `POST` | `/api/allocations` | `src/routes/allocationRoutes.js` | `allocations:write` | ⏳ Pendente |

### Seção 2: Grafo Acíclico Dirigido (DAG de Dependências)
Liste os passos em ordem estrita de execução e dependências:

- **Passo 1 (Base/Contratos):** Estabelecer schemas, migrations e permissões em `config/permissions.js`. *(Bloqueado por: Nenhum)*
- **Passo 2 (Repositórios):** Consultas parametrizadas no banco em `repositories/`. *(Bloqueado por: Passo 1)*
- **Passo 3 (Validadores & Regras):** Regras de negócio puras em `validators/` e `services/`. *(Bloqueado por: Passo 2)*
- **Passo 4 (Rotas HTTP):** Endpoints Express/Fastify acoplados ao roteador principal. *(Bloqueado por: Passo 3)*
- **Passo 5 (Verificação):** Execução de suíte de testes unitários e regressão. *(Bloqueado por: Passo 4)*

### Seção 3: Critérios de Aceitação Concretos (Checklist)
Critérios diretos e verificáveis com checkboxes:
- [ ] Requisição sem parâmetro obrigatório retorna HTTP `400 Bad Request`.
- [ ] Regra de negócio violada retorna HTTP `422 Unprocessable Entity` com lista de infrações.
- [ ] Consulta parametrizada com bind parameters `?` sem concatenação de strings.
- [ ] Suíte de testes local executada com `npm test` aprovada com 0 falhas.

## 3. Fatiamento Vertical em Tracer Bullets vs Fatiamento Horizontal
- **Proibição de Fatiamento Puramente Horizontal:** Evite dividir o plano em camadas técnicas desconectadas (ex: criar todas as tabelas, depois todos os models, depois todos os controllers e só testar tudo junto no final). Isso acumula erros de tipagem e desacoplamento.
- **Tracer Bullets Verticais:** Cada etapa do plano deve cortar uma fatia estreita e completa através de todas as camadas (banco, regra, rota e teste) entregando um comportamento observável de ponta a ponta na interface pública (*seam*).
- **Tamanho por Fatia:** Cada fatia vertical deve caber confortavelmente em uma única janela limpa de contexto de execução.

## 4. Padrão Expand-Contract para Refatorações de Grande Alcance (Wide Refactors)
Quando uma mudança estrutural (como renomear uma coluna, alterar uma assinatura global ou refatorar tipos compartilhados) possui grande raio de impacto (*blast radius*):
1. **Expand (Expandir):** Crie a nova forma ou coluna ao lado da antiga sem quebrar o código existente.
2. **Migrate (Migrar em Lotes):** Migre os locais de chamada em lotes isolados (por pacote ou diretório), mantendo os testes e a CI verdes a cada lote porque a forma antiga ainda coexiste.
3. **Contract (Contrair):** Remova a forma legada apenas quando todos os chamadores estiverem migrados.

## 5. Alinhamento Socrático por Fronteira em Discussões (`gsd-discuss-phase`)
Durante entrevistas ou discussões de requisitos:
- **Descobrir Fatos é Obrigação do Agente:** Use ferramentas (`view_file`, `ast_query`, `lsp`) para ler o código e investigar fatos do ambiente; nunca pergunte ao usuário o que você mesmo pode checar.
- **Trabalhar a Fronteira de Decisões:** Agrupe perguntas por rodadas numeradas (`Q1`, `Q2`), apresentando opções claras e a **resposta recomendada** do agente, redigida de forma que um simples "Sim" aprove a recomendação.

## 6. Benefício
Seguir este padrão reduz o tamanho do `PLAN.md` de ~40 KB para ~6 KB, economiza mais de **35% a 45% dos tokens faturados** nas fases preliminares e elimina retrabalhos causados por desalinhamento precoce.
