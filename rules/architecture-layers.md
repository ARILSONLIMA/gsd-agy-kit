---
trigger: model_decision
description: Ative ao projetar, criar ou refatorar rotas HTTP, serviços de domínio, repositórios SQL e validadores em camadas.
---

# Arquitetura em 3 Camadas

1. **Rotas/Controllers:** Apenas HTTP, coerção de entrada e RBAC; delegue toda regra e SQL aos Services.
2. **Serviços:** Regras de domínio, cálculos puros e `db.transaction`; persistência delegada aos Repositories.
3. **Repositórios e Validadores:** SQL 100% parametrizado (`?`) em `repositories/` e validações extensas (> 40 linhas) extraídas em `validators/` ou `utils/`.
