---
name: ponytail-audit
description: >
  Auditoria ampla de um repositório inteiro ou pasta: bugs latentes, gargalos de performance,
  riscos de segurança, ausência de testes e mapeamento de código morto para deleção. Trigger: /ponytail-audit.
---

# Ponytail Audit — Auditoria Ampla do Repositório

Audite o repositório como o engenheiro sênior que acabou de assumir a custódia do código.

## 1. Mapeamento Inicial
- Identifique os pontos de entrada (rotas, handlers, workers, comandos CLI).
- Identifique a carga esperada e os fluxos de dinheiro, dados sensíveis e autenticação.
- Foque a análise onde uma falha custaria mais caro.

## 2. Itens Avaliados
1. **Bugs:** inconsistências entre módulos, dados órfãos, desvios de regra de negócio.
2. **Segurança:** parâmetros sem bind SQL, rotas sem autenticação, segredos expostos.
3. **Escala:** N+1 queries, bloqueios em memória, falta de paginação.
4. **Testes:** ausência de testes para lógicas financeiras ou de concorrência.
5. **Lean & Bloat:** código morto, arquivos não utilizados, dependências que duplicam a standard library.

## 3. Saída Estruturada
- `O que este projeto faz:` (2 linhas e carga assumida).
- Lista numerada de achados categorizados (Must fix / Should fix / Nice to have) com localização exata e menor correção possível.
- `Veredito:` resumo direto do estado de saúde da base.
- `Potencial Lean:` total de linhas e dependências passíveis de remoção.
