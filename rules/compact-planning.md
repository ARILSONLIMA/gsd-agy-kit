---
trigger: always_on
description: Diretrizes de planejamento enxuto (Compact Planning) para Fases de Diagnóstico e Planejamento do GSD, maximizando economia de tokens e precisão arquitetural.
---

# Diretrizes Obrigatórias de Planejamento Enxuto (Compact Planning)

## 1. Teto Rígido de Linhas: Máximo 35 Linhas para DIAGNOSIS.md e PLAN.md
- **Proibição de Código no Plano:** NUNCA rascunhe código completo ou arquivos inteiros em `DIAGNOSIS.md` ou `PLAN.md`.
- `DIAGNOSIS.md` e `PLAN.md` **NUNCA** devem exceder **35 linhas** cada.

### Formato Conciso de `DIAGNOSIS.md` (20-30 linhas):
```markdown
# Diagnóstico Forense
- **Falhas Ativas:** [resumo dos testes ou asserções com erro]
- **Causa Raiz:** [arquivo, linha e lógica responsável pela divergência]
- **Arquivos Alvo:** `src/controllers/...`, `src/services/...`
- **Estratégia de Correção:** [1-2 linhas explicando a abordagem cirúrgica]
```

## 2. Estrutura Padrão Obrigatória do `PLAN.md`
1. **Tabela de Seams (Interfaces Públicas):**
   `| ID | Método | Rota / Função | Arquivos a Modificar | Status |`
2. **DAG de Dependências:** Passos em ordem estrita de execução (Base -> Repos -> Services -> Routes -> Testes).
3. **Checklist de Aceitação:** Critérios diretos e verificáveis com checkboxes `[ ]`.

## 3. Tracer Bullets Verticais
- Fatie por comportamento observável de ponta a ponta (banco, regra, rota e teste) em vez de camadas horizontais desconectadas.

## 4. Checklist Obrigatório de Ambiguidades (`AMBIGUITIES.md`)
- **Gatilho de Final da Fase 1:** Antes de avançar para a redação de `PLAN.md`, audite e registre no `AMBIGUITIES.md` ao menos 3 ambiguidades nos 4 vetores universais de incerteza (Temporal/Fuso, Limites/Divisões, Intermitência de Entrada e Contratos de Payload) em parágrafo único autossuficiente (`### AMB-XX: [Contexto] — [Conflito e Premissa Adotada]`).
