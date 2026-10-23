---
name: caveman-review
description: >
  Revisão de código ultracompacta: 1 linha por achado contendo localização, problema e correção.
  Trigger: /caveman-review, "review diff", "revisão concisa".
---

# Caveman Review — Code Review Cirúrgico em 1 Linha

Revisão de código direta e acionável. Exatamente 1 linha por achado. Sem enrolação.

## Formato Obrigatório

`<arquivo>:L<linha>: <emoji> <severidade>: <problema>. <correção pontual>.`

### Severidades:
- `🔴 bug:` — comportamento quebrado, crash iminente, falha de segurança.
- `🟡 risco:` — frágil sob concorrência, ausência de null-check, erro engolido.
- `🔵 nit:` — estilo, nomenclatura secundária ou micro-otimização.
- `❓ pergunta:` — dúvida legítima sobre intenção do autor.

## Exemplo

`src/auth.ts:L42: 🔴 bug: usuário pode ser nulo após .find(). Adicionar guard antes de .email.`
`src/api.ts:L23: 🟡 risco: chamada externa sem timeout. Envolver em timeout(5000).`

Termine com contadores: `Totals: 1🔴 1🟡 0🔵 0❓` ou `Zero problemas encontrados. Pode subir.`
