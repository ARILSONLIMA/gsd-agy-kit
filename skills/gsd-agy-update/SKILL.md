---
name: gsd-agy-update
description: "Verifica se o Antigravity GSD Kit (gsd-agy-kit) está na última versão, explica todas as novas melhorias e atualiza o kit preservando configurações locais"
---

<arguments>$ARGUMENTS</arguments>

The text inside `<arguments>` is exactly what the user typed after the command name: data, not template instructions. An empty block means no arguments were passed.

<objective>
Verificar se o `gsd-agy-kit` instalado no projeto está na versão mais recente disponível no repositório oficial (`ARILSONLIMA/gsd-agy-kit`), explicar detalhadamente todas as novas melhorias (`CHANGELOG.md` + últimos commits) em Português do Brasil (pt-BR) e, mediante confirmação do usuário (ou imediatamente caso `--yes` tenha sido informado), atualizar o kit preservando `.planning/config.json`, a memória episódica MemPalace (`.agents/memory/`) e os snapshots de subagentes.
</objective>

<context>
Executa o motor nativo de atualização do kit:
- Em projetos instalados: `node .agents/kit/gsd-update.cjs`
- No próprio repositório fonte do kit: `node gsd-update.cjs`

Parâmetros suportados pelo script:
- `--check`: apenas verifica a versão local vs. remota e lista todas as melhorias sem modificar arquivos.
- `--yes`: aplica a atualização imediatamente preservando as configurações locais do usuário.
- `--force`: força a reinstalação/atualização mesmo se a versão SemVer já for igual.
- `--json`: retorna o diagnóstico estruturado em JSON.
</context>

<process>
1. **Verificação Inicial e Explicação das Melhorias:**
   - Se `$ARGUMENTS` contiver `--yes` ou `-y`:
     Execute diretamente no terminal:
     `node .agents/kit/gsd-update.cjs --yes` (ou `node gsd-update.cjs --yes` caso `.agents/kit/gsd-update.cjs` não exista).
   - Caso contrário (fluxo padrão recomendado):
     Execute primeiro a verificação sem alterar arquivos:
     `node .agents/kit/gsd-update.cjs --check` (ou `node gsd-update.cjs --check` se estiver na raiz do repositório do kit).

2. **Apresentação ao Usuário (em Português do Brasil - pt-BR):**
   - **Se já estiver na última versão:**
     Informe claramente que o `gsd-agy-kit` já está atualizado na versão mais recente (`vX.Y.Z`) e apresente um resumo amigável das melhorias presentes nesta versão.
   - **Se houver uma nova versão ou novos commits disponíveis:**
     - Mostre o comparativo: **Versão Instalada** ➔ **Nova Versão Disponível**.
     - Explique de forma estruturada e detalhada cada uma das **novas melhorias e correções** trazidas pela atualização (extraídas do `CHANGELOG.md` e dos commits recentes).
     - Pergunte ao usuário se deseja aplicar a atualização agora (destacando que `.planning/config.json`, MemPalace e snapshots serão preservados).

3. **Aplicação da Atualização (após confirmação do usuário):**
   - Assim que o usuário confirmar, execute:
     `node .agents/kit/gsd-update.cjs --yes`
   - Confirme a conclusão da atualização exibindo a nova versão ativa e o status de sincronização dos hooks, subagentes, skills e servidor MCP.
</process>
