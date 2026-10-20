---
trigger: always_on
description: Guardrails universais de qualidade, performance de banco (zero N+1), simetria de estado, paridade de rotas, tipagem defensiva HTTP, consistência e ciclo de vida.
---

# Guardrails Obrigatórios de Qualidade de Código

## 1. Banco de Dados e Performance (Anti-N+1 Mandatório)
- **NUNCA** execute consultas de banco (`db.prepare().get()`, `db.query()`, `SELECT`, queries ORM) dentro de laços (`for`, `while`, `map`, `forEach`). Fazer queries em laço é terminantemente proibido.
- **Padrões Obrigatórios para Dados Relacionados (1:N ou N:1):**
  1. **Subconsulta Correlacionada ou JOIN no SQL Principal:** Traga o dado diretamente na query base:
     ```sql
     SELECT t.id, t.severity, t.opened_at,
            (SELECT a.status FROM ticket_appeals a WHERE a.ticket_id = t.id ORDER BY a.id DESC LIMIT 1) as appeal_status
     FROM tickets t
     WHERE t.driver_id = ?
     ```
  2. **Pré-Carregamento em Lote com Map O(1):** Colete os IDs necessários, execute uma única consulta `WHERE entity_id IN (...)` e monte um `Map<id, data>` em memória antes de iterar.

## 2. Simetria de Estado e Desbloqueio Reverso (State Symmetry Guardrail)
- Ao implementar regras de suspensão, bloqueio ou desativação condicional (`cnh_blocked = 1`, `active = 0`, `is_locked = 1`):
  - **SEMPRE** implemente o caminho reverso explícito no bloco `else` para reverter o bloqueio (`cnh_blocked = 0`, `active = 1`, `is_locked = 0`) caso a condição restritiva deixe de ser atendida (ex: pontuação expirou após 365 dias, recurso deferido anulou a penalidade ou dívida foi quitada).
  - Nunca deixe flags de bloqueio órfãs sem lógica de liberação.

## 3. Paridade de Segurança em Rotas HTTP (Route Security Parity)
- Se uma regra de negócio, trava de integridade ou controle de acesso (RBAC) protege ou proíbe a alteração de uma entidade em determinado estado (ex: ocorrências concluídas não podem ser reabertas por operadores):
  - Essa validação **DEVE** ser aplicada simetricamente em **TODAS** as rotas que modificam a entidade: `PUT /:id`, `PATCH /:id`, `PATCH /:id/status`, `DELETE /:id`.
  - Nunca proteja apenas o `PUT` deixando o `PATCH` vulnerável (ou vice-versa).
  - Utilize preferencialmente middlewares declarativos (`requireRoles(...)`) nas rotas do Express/Fastify.

## 4. Filtro Mandatório de Registros Ativos (Active / Soft-Delete)
- Em relatórios analíticos, dashboards de risco, rankings e listagens agregadas:
  - **Sempre** inspecione se as tabelas de domínio (`lines`, `drivers`, `vehicles`, `users`) contam com coluna de status ou exclusão lógica (`active`, `is_active`, `status`).
  - Aplique obrigatoriamente o filtro de conformidade (`WHERE active = 1` ou equivalente) conforme especificado nos requisitos de negócio.

## 5. Normalização Temporal e Fuso Horário UTC
- Bancos de dados relacionais e SQLite frequentemente armazenam datas e carimbos de hora como strings puras (`YYYY-MM-DD HH:MM:SS`).
- Em cálculos de expiração temporal (ex: janela móvel de 365 dias, SLAs de atendimento):
  - **Sempre normalize a string para formato ISO 8601 UTC** adicionando `'T'` e `'Z'` (`t.opened_at.trim().replace(' ', 'T') + 'Z'`) antes de instanciar `new Date(...)`.
  - Isso impede distorções de fuso horário causadas pelo horário local da máquina do servidor/cliente.

## 6. Tipagem Defensiva em Requisições HTTP
- Campos de ID, status e numéricos recebidos via `req.body`, `req.params` ou `req.query` chegam frequentemente como `string` em clientes REST.
- **Sempre aplique coerção explícita** (`Number(val)` ou `parseInt(val, 10)`) antes de comparações estritas (`===`, `!==`) ou operações matemáticas.
- Valide payload e campos obrigatórios no início do controlador antes de invocar serviços ou tocar o banco.

## 7. Transações Atômicas e Consistência (Multi-Escrita)
- Operações que alteram mais de uma tabela ou registram eventos de auditoria/histórico junto à entidade principal **DEVEM** ser atômicas.
- Envolva em bloco de transação (`BEGIN TRANSACTION` / `COMMIT` ou `db.transaction(() => { ... })`). Em caso de erro, garanta `ROLLBACK`.

## 8. Prepared Statements & Anti-SQL Injection (Hard Gate Mandatório)
- **Proibição absoluta de concatenação ou interpolação de strings em consultas SQL:**
  ```javascript
  // ❌ NUNCA FAÇA (Vulnerabilidade Crítica de SQL Injection):
  sql += " AND garage = '" + garage + "'";
  const query = `SELECT * FROM vehicles WHERE id = ${vehicleId}`;

  // ✅ FORMA CORRETA OBRIGATÓRIA (Parâmetros Bind):
  sql += ' AND garage = ?';
  params.push(garage);
  const stmt = db.prepare('SELECT * FROM vehicles WHERE id = ?');
  const vehicle = stmt.get(vehicleId);
  ```
- Use exclusivamente bind parameters (`?` no SQLite/MySQL ou `$1` no PostgreSQL).
- O **Security Stop Gate** do Kit interceptará e bloqueará a conclusão da sessão caso detecte qualquer concatenação de strings em SQL.

## 8.1. Limites de Complexidade Ciclomática e Métodos Monolíticos
- **Métodos Longos:** Funções com mais de **50 linhas de código** são consideradas *code smells*. Decomponha em funções auxiliares puras.
- **Aninhamento Profundo:** Mantenha a profundidade de aninhamento abaixo de **4 níveis**. Use *guard clauses* (retorno antecipado) para achatar a estrutura do código.
- **Complexidade Ciclomática:** Mantenha a complexidade de cada função abaixo de **15** (contagem de ramificações `if`, `for`, `case`, `&&`, `||`). Extraia sub-rotinas de decisão.

## 9. Máquinas de Estado e Ciclo de Vida (Auditoria Inicial)
- Ao calcular tempos de SLA ou pausas baseadas em log de eventos (`ticket_history`), verifique se o registro já nasceu no estado de pausa.
- Se não houver histórico de transição prévio, utilize a data de criação da entidade (`created_at`) como marco inicial do cálculo.

## 10. Tratamento de Erros e Respostas Semânticas
- Proibido engolir erros com blocos silenciosos (`catch (e) {}`). Sempre registre log estruturado ou propague.
- Respeite status codes HTTP: `201 Created` (com header `Location` ou entidade criada), `200 OK` (leitura/atualização), `204 No Content` (deleção vazia), `400 Bad Request` (validação), `404 Not Found` (recurso inexistente), `409 Conflict` (duplicidade).

## 11. Criação Atômica de Arquivos Novos vs Diffs Cirúrgicos
- **Arquivos NOVOS:** Crie de forma integral em uma única chamada `write_to_file` (zero churn).
- **Arquivos EXISTENTES:** Modifique estritamente via `replace_file_content` com intervalos mínimos de linhas.

## 12. Documentação Equilibrada e Concisa
- **JSDoc/Docstrings:** Objetivos e restritos a 2-4 linhas (`@param`, `@returns`) apenas em funções públicas de módulos de negócio. Proibido blocos narrativos prolixos em funções auxiliares óbvias.
- **Especificações .md:** Atualize documentação apenas quando contratos públicos de API forem alterados ou quando o requisito solicitar expressamente.
