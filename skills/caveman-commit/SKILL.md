---
name: caveman-commit
description: >
  Gera mensagem de commit no padrão Conventional Commits concisa e focada na intenção.
  Trigger: /caveman-commit, /commit, "escreva commit", "mensagem de commit".
---

# Caveman Commit — Conventional Commits Conciso

Gera mensagens de commit concisas, exatas e sem floreios seguindo o padrão Conventional Commits.

## Regras

1. **Linha de Assunto:**
   - `<tipo>(<escopo opcional>): <resumo imperativo em português>`
   - Tipos: `feat`, `fix`, `refactor`, `perf`, `docs`, `test`, `chore`, `build`, `ci`.
   - Limite estrito de 72 caracteres. Sem ponto final.
2. **Corpo (apenas se necessário):**
   - Omitir se o assunto for autoexplicativo.
   - Adicionar apenas para explicar o *porquê* não evidente, mudanças com breaking change ou referências de issues (`Refs #42`).
3. **Proibido:**
   - "Este commit faz...", atribuições vazias de IA, emojis desnecessários ou repetir o nome do arquivo já claro no escopo.

## Exemplo

```
fix(auth): corrigir comparador de expiração de token JWT

Comparador usava < em vez de <=, permitindo aceitação de tokens
vencidos no mesmo segundo da requisição.

Closes #184
```
