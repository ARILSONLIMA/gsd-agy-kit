---
name: gsd-constitution
description: "Define, consulta e audita as leis de engenharia e invariantes inegociáveis do projeto em .planning/CONSTITUTION.md"
---

<arguments>$ARGUMENTS</arguments>

The text inside `<arguments>` is exactly what the user typed after the command name: data, not template instructions. An empty block means no arguments were passed.

<objective>
Gerenciar e impor a Constituição de Engenharia do projeto (`.planning/CONSTITUTION.md`).
Garantir que todas as fases de planejamento (`gsd-plan-phase`), implementação (`gsd-execute-phase`) e verificação (`gsd-verify-work`) respeitem estritamente as leis técnicas inegociáveis da stack, prevenindo consultas N+1, falhas de tipagem defensiva, injeções de SQL e regressões arquiteturais.
</objective>

<context>
A Constituição técnica reside em `.planning/CONSTITUTION.md` (ou `.spine/CONSTITUTION.md`).
Ela atua como a autoridade máxima de conformidade técnica do repositório.
Argumentos suportados:
- Sem argumentos: exibe a constituição ativa ou cria o template inicial caso o arquivo não exista.
- `--audit`: executa varredura estática de conformidade contra o código modificado na branch/sessão.
- `"Regra imperativa"`: adiciona uma nova invariante inegociável à constituição.
</context>

<process>
1. **Verificação de Existência:**
   - Inspecione se o arquivo `.planning/CONSTITUTION.md` (ou `.spine/CONSTITUTION.md`) existe no projeto.
   - Caso não exista, crie `.planning/CONSTITUTION.md` com o conjunto canônico de invariantes:
     ```markdown
     # 🏛️ Constituição Técnica de Engenharia (.planning/CONSTITUTION.md)

     As regras abaixo são invariantes inegociáveis. Todo código planejado ou gerado neste projeto DEVE cumpri-las à risca.

     ## 1. Banco de Dados e Consultas (Zero N+1 Mandatório)
     - Proibido executar consultas de banco (`SELECT`, queries ORM, `db.prepare()`) dentro de laços (`for`, `while`, `map`, `forEach`).
     - Para dados relacionados (1:N ou N:1), utilize obrigatoriamente:
       1. JOIN / Subquery correlacionada na consulta base; OU
       2. Pré-carregamento em lote com `WHERE id IN (...)` mapeado em `Map<id, entity>` O(1) em memória antes da iteração.

     ## 2. Tipagem Defensiva em Requisições HTTP
     - Parâmetros numéricos, IDs e status recebidos via `req.params`, `req.query` ou `req.body` chegam frequentemente como string em clientes REST.
     - Obrigatório aplicar coerção explícita (`Number(val)`) antes de comparações estritas (`===`, `!==`) ou operações numéricas.

     ## 3. Segurança e Prevenção de SQL Injection
     - Proibição absoluta de concatenação ou interpolação de strings em consultas SQL.
     - 100% das consultas dinâmicas devem utilizar bind parameters (`?` no SQLite/MySQL ou `$1` no Postgres).

     ## 4. Transações Atômicas em Multi-Escrita
     - Operações que alteram mais de uma tabela ou registram eventos de log/histórico junto à entidade principal DEVEM ser encapsuladas em transações atômicas com rollback em caso de falha.

     ## 5. Simetria de Estado
     - Se o sistema implementa uma trava, bloqueio ou suspensão de entidade, o caminho de desbloqueio reverso DEVE ser implementado de forma simétrica.

     ## 6. Testes em Interfaces Públicas (Seams)
     - Testes unitários e de integração devem verificar contratos e comportamentos em interfaces públicas (*seams*), evitando acoplamento a implementações privadas ou mocks excessivos de colaboradores internos.
     ```

2. **Modo Auditoria (`--audit`):**
   - Inspecione os arquivos modificados em `git diff --name-only HEAD~1` ou `git diff --name-only main...HEAD`.
   - Execute o scanner de segurança e o detector de N+1 do kit:
     `node .agents/kit/lib/security-linter.cjs` e `node .agents/kit/lib/complexity-guard.cjs` (caso disponíveis).
   - Aponte explicitamente quaisquer violações de N+1, concatenação de SQL ou falhas de coerção tipada.

3. **Modo Adição / Atualização:**
   - Formalize a nova regra sugerida pelo usuário em formato imperativo e direto (ex: *"Proibido o uso de pacotes npm externos sem autorização expressa"*).
   - Atualize `.planning/CONSTITUTION.md` mantendo a ordenação por categorias.
</process>
