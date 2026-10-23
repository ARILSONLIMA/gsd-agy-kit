---
name: ponytail-review
description: >
  Revisão de código com a mentalidade do desenvolvedor sênior: avalia se a lógica
  está correta, se é segura, se aguenta carga real, se o código crítico tem testes,
  se é veloz e se cada linha de código é estritamente necessária. Trigger: /ponytail-review.
---

# Ponytail Review — Revisão de Código Minimalista e Robusta

Revise a alteração ou pull request como o desenvolvedor sênior de plantão que será chamado às 3h da manhã se o código quebrar.

Ordem rígida de prioridade:
1. **Corretude:** edge cases, tipos nulos, off-by-one, comportamento funcional.
2. **Segurança & Dados:** blindagem contra injeção SQL/XSS, atomicidade de transações, prevenção de perda de dados.
3. **Escala & Carga Real:** consultas N+1, deadlocks de concorrência, loops aninhados desnecessários.
4. **Testes Mínimos:** lógica nova com branches ou segurança sem asserção correspondente.
5. **Enxugamento (Lean):** código que não deveria existir, helpers duplicados, bibliotecas desnecessárias.

## Formato do Relatório

Comece com 2 linhas resumindo `O que esta alteração faz:`

Em seguida, liste os achados numerados em três grupos (omita grupos vazios):
- **Obrigatório Corrigir (Must fix):** bugs reais, segurança, quebra sob carga.
- **Deveria Corrigir (Should fix):** código arriscado sem teste, lentidão clara, código redundante que pode ser deletado.
- **Bom ter (Nice to have):** simplificações e formas menores.

Cada achado possui 4 pontos objetivos:
1. **Nome do problema** (`arquivo:Linha`)
   - **O que é:** contexto em 1 frase.
   - **Problema:** o que dá errado em caso concreto.
   - **Correção:** o menor código que resolve (preferência por apagar linhas).
   - **Se ignorarmos:** consequência real.

Encerre com:
- `Veredito: Aprovar para Produção.` ou `Veredito: Corrigir itens X e Y primeiro.`
- `Potencial Lean: -<N> linhas possíveis.`
