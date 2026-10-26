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
  // ❌ NUNCA FAÇA (Vulnerabilidade Crítica de SQL Injection - reprova BUG-04 e nota de segurança):
  sql += " AND garage = '" + garage + "'";
  sql += ` AND status = '${status}'`;
  const query = `SELECT * FROM vehicles WHERE id IN (${placeholders})`; // O avaliador estático reprova QUALQUER interpolação em template strings!
  ```
- **Padrão Obrigatório para Filtros Dinâmicos em Listagens (`req.query`):**
  ```javascript
  // ✅ CORRETO (100% Parametrizado com Array de Bind - Blindagem Total):
  const clauses = [];
  const params = [];
  if (req.query.garage) {
    clauses.push('garage = ?');
    params.push(req.query.garage);
  }
  if (req.query.status) {
    clauses.push('status = ?');
    params.push(req.query.status);
  }
  const whereSql = clauses.length > 0 ? ' WHERE ' + clauses.join(' AND ') : '';
  const stmt = db.prepare('SELECT * FROM vehicles' + whereSql);
  const rows = stmt.all(...params);
  ```
- Use exclusivamente bind parameters (`?` no SQLite/MySQL ou `$1` no PostgreSQL).
- O **Security Stop Gate** do Kit interceptará e bloqueará a conclusão da sessão caso detecte qualquer concatenação ou interpolação de strings em SQL.

## 8.1. Limites de Complexidade Ciclomática e Clean Code (Anti-Code Smells)
- **Teto Estrito de Aninhamento (Máximo 3 Níveis):** Mantenha a profundidade máxima de aninhamento estritamente em **3 níveis** (o avaliador estático penaliza com nota zero funções com profundidade $\ge 4$).
  - **Uso Obrigatório de Guard Clauses (Early Return):** Em vez de aninhar múltiplos blocos `if` dentro de loops ou try-catch, reverta a condição com `if (!cond) return;` ou `if (!cond) continue;` para achatar a estrutura.
  - **Exemplo de Refatoração:**
    ```javascript
    // ❌ ERRADO (Nesting depth 4 - Dispara Code Smell):
    for (const item of batch) {
      if (item.valid) {
        if (item.speed > 0) {
          if (item.fuel < 10) { ... }
        }
      }
    }
    // ✅ CORRETO (Nesting depth <= 2 com Early Return):
    for (const item of batch) {
      if (!item.valid || item.speed <= 0 || item.fuel >= 10) continue;
      // processa diretamente sem aninhamento
    }
    ```
- **Teto de Linhas por Método (Máximo 40 Linhas Úteis):** Funções com mais de **50 linhas de código** disparam penalidade como *long method*. Mantenha funções abaixo de **40 linhas úteis**, decompondo validações, cálculos de métricas e persistência em funções auxiliares puras e isoladas.
- **Complexidade Ciclomática (Máximo 12 Pontos):** Mantenha o total de ramificações (`if`, `for`, `while`, `case`, `catch`, `&&`, `||`, `?`) abaixo de **12** (o threshold estático reprova em 15). Extraia matrizes de lookup em objetos/Maps em vez de longas cadeias condicionais.

## 8.2. Blindagem Aritmética, Divisão por Zero e Marcha Lenta (Zero NaN/Infinity)
- **Proteção Obrigatória de Divisores:**
  - Em qualquer cálculo de taxa, proporção, média ou eficiência (ex: `km/l`, `l/100km`, consumo horário, SLA):
  - **SEMPRE** proteja o denominador contra zero ou valor nulo:
    ```javascript
    const kmPerLiter = (fuelConsumed > 0 && totalDistance > 0) 
      ? Number((totalDistance / fuelConsumed).toFixed(2)) 
      : 0.0;
    ```
- **Veículo Parado e Marcha Lenta (Idle Fuel):**
  - Quando um veículo permanece parado (`totalDistance === 0` ou velocidade zero) com consumo de combustível registrado (`fuelConsumed > 0` em marcha lenta):
    - O campo de eficiência `km_per_liter` **DEVE** retornar estritamente `0.0` (número float, nunca `NaN`, `null` ou `Infinity`).
    - Registre o combustível consumido no campo dedicado de marcha lenta (`idle_fuel_liters`).
- **Períodos Sem Telemetria ou Movimentação:**
  - Consultas com período vazio ou sem dados devem retornar contratos consistentes com valores zerados (`total_distance_km: 0.0`, `fuel_consumed_liters: 0.0`, `km_per_liter: 0.0`), jamais propriedades omitidas, `undefined` ou `NaN`.

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
