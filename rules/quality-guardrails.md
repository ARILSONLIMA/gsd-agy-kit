---
trigger: always_on
description: Guardrails obrigatórios de qualidade de código, banco de dados (zero N+1), tipagem defensiva, complexidade e segurança.
---

# Guardrails Obrigatórios de Qualidade de Código

## 1. Banco de Dados e Performance (Zero N+1)
- **NUNCA execute queries SQL em laços** (`for`, `while`, `map`, `forEach`). Proibido `db.prepare().get()` dentro de loops.
- **Padrão Obrigatório:** Use `JOIN` / subquery correlacionada na consulta principal ou colete IDs, faça uma única query `WHERE id IN (...)` e monte um `Map<id, data>` em memória ($O(1)$) antes da iteração.

## 2. Anti-SQL Injection (Prepared Statements Mandatórios)
- **Proibição absoluta de concatenação ou interpolação em queries SQL:**
  ```javascript
  // ❌ NUNCA: sql += " AND garage = '" + g + "'"; ou `WHERE id IN (${ids})`
  // ✅ CORRETO: 100% parametrizado com '?' e array de bind:
  const clauses = []; const params = [];
  if (req.query.garage) { clauses.push('garage = ?'); params.push(req.query.garage); }
  const whereSql = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const rows = db.prepare('SELECT * FROM vehicles' + whereSql).all(...params);
  ```

## 3. Limites de Complexidade e Fowler Code Smells
- **Aninhamento Máximo (≤ 3 Níveis):** Use Guard Clauses (`if (!cond) return;`) para achatar loops e condicionais.
- **Tamanho de Função (≤ 48 Linhas Úteis):** Funções > 50 linhas disparam *long method*. Extraia validações e cálculos em helpers puros.
- **Complexidade Ciclomática (≤ 14 Pontos):** Mantenha ramificações (`if`, `for`, `while`, `case`, `&&`, `||`, `?`) < 15. Use lookup maps.
- **Middlewares Web:** Declare objetos literais de erro em variáveis antes de retornar (`const err = { error: 'Msg' }; return res.status(400).json(err);`) para evitar aninhamento 4 devido a chaves de literais.

## 4. Tipagem Defensiva e Normalização HTTP
- **Coerção Numérica:** Aplique `Number(val)` ou `parseInt(val, 10)` em IDs, status e números de `req.body`, `req.params`, `req.query` antes de comparações estritas (`===`, `!==`) ou aritmética.
- **Fuso Horário UTC:** Converta datas de banco (`YYYY-MM-DD HH:MM:SS`) para ISO UTC (`str.trim().replace(' ', 'T') + 'Z'`) antes de `new Date()`.

## 5. Blindagem Aritmética e Estados de Repouso (Zero NaN/Infinity)
- **Divisores Protegidos:** Toda divisão deve checar denominador: `(denom > 0 && num > 0) ? Number((num / denom).toFixed(2)) : 0.0`.
- **Invariância de Repouso:** Sem produção/distância, o indicador de rendimento DEVE retornar estritamente `0.0`. Recursos consumidos em espera vão para acumulador ocioso (ex: `idle_fuel_liters`).

## 6. Integridade de Estado, Rotas e Ciclo de Vida
- **Simetria de Desbloqueio:** Toda trava condicional (`cnh_blocked = 1`) DEVE ter caminho reverso explícito no `else` (`cnh_blocked = 0`).
- **Paridade de Rotas:** Validações de transição de estado devem existir simetricamente em `PUT`, `PATCH` e `DELETE`.
- **Filtro de Ativos:** Sempre filtre registros ativos (`WHERE active = 1`) em relatórios e agregações.
- **Ciclo de Vida:** Se entidade não possui histórico em `ticket_history`, use `created_at` como marco inicial da contagem.
- **Transações:** Multi-escrita exige `db.transaction(() => { ... })` com rollback automático em exceções.

## 7. Operação Enxuta de Arquivos e Documentação
- **Arquivos NOVOS:** Crie integralmente em uma única chamada `write_to_file` (zero churn).
- **Arquivos EXISTENTES:** Modifique cirurgicamente via `replace_file_content` com ranges mínimos de linhas.
- **Documentação:** JSDoc conciso (≤ 3 linhas: `@param`, `@returns`) apenas em exports públicos. Atualize specs `.md` apenas se contratos de API mudarem.
