---
trigger: always_on
description: Guardrails estritos de banco de dados (zero N+1/SQLi), limites de complexidade Fowler, tipagem defensiva e blindagem aritmética.
---

# Guardrails Obrigatórios de Qualidade e Segurança

## 1. Banco de Dados: Zero N+1 e Anti-SQL Injection
- **Zero N+1:** Proibido executar queries dentro de loops (`for`, `while`, `map`, `forEach`). Use `JOIN`/subquery ou carregue em lote (`WHERE id IN (...)`) indexando em `Map` ($O(1)$).
- **Prepared Statements Estritos:** Proibida qualquer concatenação (`+`) ou interpolação (`` `${...}` ``) em SQL. Monte cláusulas dinâmicas apenas com placeholders `?` e array de parâmetros (`clauses.push('col = ?'); params.push(val)`).
- **Atomicidade:** Escritas múltiplas exigem `db.transaction(() => { ... })`.

## 2. Limites Fowler e Teto Estrito de Aninhamento
- **Teto Estrito de Aninhamento (≤ 3 Níveis):** Aplique *Guard Clauses* (`if (!ok) return;`) para achatar condicionais e laços.
- **Tamanho (≤ 48 Linhas Úteis) e Complexidade Ciclomática (≤ 14):** Extraia validações, transformações e cálculos em helpers puros ou lookup maps; elimine blocos duplicados (≥ 6 linhas) compartilhando utilitários de `src/utils/`.
- **Achatamento de Middlewares Web:** Declare objetos de resposta em constante antes do `return` (`const body = { error: 'Msg' }; return res.status(400).json(body);`) para não somar nível de chaves ao aninhamento da rota.

## 3. Tipagem Defensiva, Séries Temporais e Blindagem Aritmética
- **Coerção e UTC:** Converta IDs/números de `req.params`/`query`/`body` com `Number()` antes de `===` ou cálculos. Normalize timestamps sem fuso (`YYYY-MM-DD HH:MM:SS`) para ISO UTC (`str.trim().replace(' ', 'T') + 'Z'`).
- **Blindagem Aritmética (Zero NaN/Infinity):** Proteja toda divisão (`denom > 0 ? Number((num / denom).toFixed(2)) : 0.0`). Sem produção/deslocamento útil, métricas de eficiência retornam `0.0` estrito, segregando consumo em repouso/espera.
- **Anti-Magic Sampling Caps:** Nunca descarte intervalos legítimos usando tetos mágicos arbitrários; agregue pelo delta real entre eventos válidos e retorne campos zerados tipados (`0.0`) em janelas vazias.

## 4. Integridade Simétrica de Estado e Rotas
- **Simetria e Paridade:** Travas booleanas/estados bloqueados devem possuir reversão explícita no ramo complementar (`else`), e invariantes de domínio devem ser validadas simetricamente em `POST`, `PUT`, `PATCH` e `DELETE`, filtrando registros ativos nas agregações.
