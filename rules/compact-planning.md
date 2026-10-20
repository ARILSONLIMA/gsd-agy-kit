---
trigger: always_on
description: Diretrizes de planejamento enxuto (Compact Planning) para Fases de Diagnóstico e Planejamento do GSD, maximizando economia de tokens e precisão arquitetural.
---

# Diretrizes Obrigatórias de Planejamento Enxuto (Compact Planning)

Durante as fases iniciais de **Descoberta, Forense e Planejamento** (`DIAGNOSIS.md` e `PLAN.md`):

## 1. Proibição de Prosa Prolixa e Rascunho de Código
- **NUNCA** rascunhe arquivos de código completos ou implementações hipotéticas dentro do `PLAN.md` ou `DIAGNOSIS.md`.
- Escrever código especulativo no plano desperdiça entre 20.000 e 40.000 tokens e induz alucinações. O código real deve ser escrito estritamente nas fases de implementação.

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

## 3. Benefício
Seguir este padrão reduz o tamanho do `PLAN.md` de ~40 KB para ~6 KB, economizando até **45% dos tokens faturados** nas fases preliminares sem perder nenhuma precisão técnica.
