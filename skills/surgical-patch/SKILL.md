---
name: surgical-patch
description: Correção cirúrgica de bugs na menor camada responsável sem refatorações oportunistas.
---

# Surgical Patch — Correção Cirúrgica de Bugs

Corrija bugs e pequenos ajustes de comportamento na camada mais estreita possível.

- Reproduza a falha primeiro sempre que econômico; caso contrário, capture o stack trace e asserção exata.
- Modifique estritamente a linha ou função responsável pelo comportamento incorreto.
- Preserve 100% do comportamento circundante e regras existentes.
- **PROIBIDO** refatorações oportunistas ("já que estamos aqui..."), renomeações desnecessárias ou limpeza de estilo fora do escopo do fix.
- Adicione apenas a prova de regressão relevante à correção.
