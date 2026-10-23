---
name: safe-refactor
description: Reestruturação de código com preservação estrita de comportamento e verificação bracketing.
---

# Safe Refactor — Refatoração Segura e Comportamento Preservado

Defina a fronteira de preservação de comportamento e estabeleça a verificação antes de qualquer edição estrutural.

- Mantenha alterações de novas funcionalidades completamente fora da refatoração.
- Mova uma fronteira de responsabilidade por vez.
- Preserve interfaces públicas, contratos de erro, ordenação e retrocompatibilidade.
- Mantenha todos os estados intermediários compiláveis e testáveis.
- Execute a mesma prova antes e depois da alteração; pare assim que o comportamento idêntico for verificado.
