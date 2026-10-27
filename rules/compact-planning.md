---
trigger: model_decision
description: Ative ao criar ou atualizar DIAGNOSIS.md e PLAN.md em fases de diagnóstico, arquitetura ou planejamento compacto.
---

# Diretrizes de Planejamento Enxuto (Blueprint de Coordenadas)

## 1. Teto Calibrado sem Prosa: Máximo 55 Linhas
- Zero prosa narrativa ou blocos de código colados: `DIAGNOSIS.md` ≤ **35 linhas** e `PLAN.md` ≤ **55 linhas**.
- **`DIAGNOSIS.md` (15–35 linhas):** Falhas ativas, causa raiz exata (`arquivo:L_ini-L_fim`), utilitários legados reutilizáveis (`src/utils/*.js`) e decisões chave.
- **`PLAN.md` (30–55 linhas — Blueprint Autossuficiente para Fase 3):** Deve eliminar 100% da releitura de `docs/` e `tests/` na execução contendo:
  1. **Tabela de Coordenadas Exatas:** `| ID | Arquivo:L_ini-L_fim | Função/Rota + Utilitário Legado (src/utils/*.js) |` — **proibido usar wildcards** (`src/services/*`).
  2. **Constantes e Contratos Extraídos de `docs/`:** Chaves de env, pesos/fórmulas numéricas, códigos HTTP, nomes exatos de campos/tabelas e regras de borda.
  3. **Lotes Paralelos de Execução** (Utils/Repos -> Services -> Routes -> Tests) e Checklist `[ ]`.
- **Gatilho de Fase 1:** Conclua `AMBIGUITIES.md` cobrindo 1-para-1 todos os itens `AMB-XX` de `TASK.md`/`docs/` antes de redigir `PLAN.md`.
