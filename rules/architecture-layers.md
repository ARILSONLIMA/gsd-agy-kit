---
trigger: always_on
description: Arquitetura homogênea obrigatória de 3 camadas (Rotas ➔ Serviços ➔ Repositórios) e extração de validadores dedicados (Single Responsibility Principle).
---

# Diretrizes de Arquitetura de 3 Camadas & Separação de Responsabilidades

Para garantir que o código seja manutenível, testável e livre de débito técnico, todo novo recurso ou modificação (inclusive em demandas de Change Request) **DEVE** respeitar a separação estrita de responsabilidades:

## 1. Camada de Apresentação / Transporte (`routes/` ou `controllers/`)
- **Papel:** Exclusivamente tratar o protocolo HTTP (express, fastify).
- **Responsabilidades permitidas:**
  - Validar a presença de parâmetros básicos na query, rota e corpo (`req.params`, `req.query`, `req.body`).
  - Proteger o endpoint com middlewares de autenticação e RBAC (`requirePermission`).
  - Invocar o método correspondente no **Service** e retornar o código HTTP semântico (200, 201, 400, 404, 422).
- **PROIBIDO:**
  - **NUNCA** execute queries de banco de dados (`db.prepare()`, `SELECT`, `UPDATE`) diretamente em arquivos de rota.
  - **NUNCA** implemente lógica de cálculo de domínio, loops analíticos ou processamento complexo de regras de negócio dentro de rotas.

## 2. Camada de Aplicação e Negócio (`services/`)
- **Papel:** Orquestrar o fluxo de regras de negócio e regras sindicais/legais.
- **Responsabilidades permitidas:**
  - Invocar validações de elegibilidade ou regras de domínio.
  - Realizar cálculos e apurações matemáticas puras.
  - Gerenciar transações atômicas de banco (`db.transaction(() => { ... })`).
  - Delegar a persistência e recuperação de dados exclusivamente para a camada de **Repository**.

## 3. Camada de Acesso a Dados (`repositories/`)
- **Papel:** Encapsular todas as operações com o banco de dados.
- **Responsabilidades obrigatórias:**
  - Todas as queries SQL **DEVEM** usar exclusivamente parâmetros parametrizados (`?`).
  - Proibição absoluta de interpolação ou concatenação de strings em cláusulas SQL (`" AND garage = '" + g + "'"` é inaceitável).

## 4. Extração de Validadores Dedicados (`validators/`) — Princípio de Responsabilidade Única
- Se a validação de uma entidade (como alocações, jornadas, cadastros complexos) possuir múltiplas regras e passar de **50 linhas de código**:
  - **Extraia** para um validador puro em `src/validators/` (ex: `allocationValidator.js`).
  - Mantenha o arquivo do Service enxuto (< 100 linhas), focado na orquestração.
