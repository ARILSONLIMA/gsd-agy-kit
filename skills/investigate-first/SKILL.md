---
name: investigate-first
description: Diagnosticar falhas ambíguas antes de editar código. Coletar evidências empíricas antes de propor correções.
---

# Investigate First — Diagnóstico Baseado em Evidências

Colete evidências concretas antes de modificar qualquer arquivo de código.

- Separe o sintoma observado da causa raiz inferida.
- Rastreie entradas, transições de estado, fronteiras de ownership e logs de erro.
- Rankeie hipóteses por suporte empírico e custo de falsificação rápida.
- **NUNCA** edite código até que um mecanismo plausível e comprovado explique a falha.
- Encerre a exploração assim que a causa raiz ou o bloqueador for isolado com precisão.
