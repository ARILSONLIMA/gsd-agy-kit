---
trigger: always_on
description: Arquitetura homogênea de 3 camadas (Rotas -> Serviços -> Repositórios) e validadores dedicados.
---

# Diretrizes de Arquitetura de 3 Camadas

1. **Rotas/Controllers (`routes/`, `controllers/`):** Apenas HTTP. Valida parâmetros básicos, checa permissões RBAC e chama o Service. **PROIBIDO queries SQL ou cálculos de domínio em rotas.**
2. **Serviços (`services/`):** Orquestra regras de negócio, cálculos puros e transações (`db.transaction`). Delega persistência exclusivamente aos Repositories.
3. **Repositórios (`repositories/`):** Encapsula SQL 100% parametrizado com `?` (zero concatenação).
4. **Validadores Dedicados (`validators/`):** Se validações de regras excederem 40 linhas, extraia para módulo puro em `src/validators/`.
