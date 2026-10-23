---
name: ponytail-debt
description: >
  Coleta e gera um relatório consolidado (ledger) de todos os comentários de atalhos
  deliberados (shortcut: ou TODO(gsd):) espalhados pelo repositório. Trigger: /ponytail-debt.
---

# Ponytail Debt — Livro-Razão de Débito Técnico

Varre o repositório em busca de marcas de atalho deliberado (`shortcut:` ou `TODO(gsd):`) para impedir que uma simplificação consciente se torne um débito invisível ou permanente.

## Execução da Varredura

Execute a busca via `run_command` ignorando diretórios de cache e dependências:

```bash
git grep -nE '(#|//|/\*)\s*(shortcut|TODO\(gsd\)|ponytail):'
```

## Formato do Relatório

Organizado por arquivo, listando:
`arquivo:linha — [O que foi simplificado]. Limite assumido: <limite>. Gatilho de refatoração: <gatilho>.`

Se a marcação não indicar quando deve ser revisitada, anote a tag `[sem-gatilho]` (risco de apodrecimento silencioso).

Encerre com:
- `Total: N atalhos mapeados (M sem gatilho definido).`
- Se nada for encontrado: `Nenhum débito técnico ou atalho pendente. Livro-razão limpo.`
