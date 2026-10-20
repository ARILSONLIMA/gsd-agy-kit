---
name: gsd-diagnose
description: "Protocolo científico rigoroso em 5 fases para reprodução, isolamento e resolução de bugs complexos sem palpites"
---

<arguments>$ARGUMENTS</arguments>

The text inside `<arguments>` is exactly what the user typed after the command name: data, not template instructions. An empty block means no arguments were passed.

<objective>
Conduzir um diagnóstico científico, sistemático e de alta precisão para bugs difíceis, intermitentes ou regressões de performance.
Proibir expressamente especulações prematuras ou modificações em arquivos de código antes de estabelecer um loop de feedback automatizado e reproduzível.
</objective>

<context>
Diferente do `/gsd-debug` (que realiza verificações rápidas em fluxo de trabalho direto), o `/gsd-diagnose` é uma disciplina cirúrgica de engenharia para problemas que resistem à primeira vista.
Ferramentas recomendadas para o diagnóstico:
- Isolamento cirúrgico de testes: `test_isolate` via MCP ou runner direto (`npm test -- -t "nome"`, `pytest -k "nome"`, `go test -run "nome"`)
- Diagnóstico estático de tipos: `lsp diagnostics <arquivo>`
- Busca estrutural de padrões de código: `ast_query` via MCP ou `ast-grep`
- Consulta a decisões e histórico de erros: `mempalace_recall`
- Redação estrita de segredos: qualquer token, chave de API ou dado sensível deve ser mascarado como `<REDACTED>`
</context>

<process>
Execute rigorosamente as 5 fases do protocolo científico. Pular fases só é permitido mediante justificativa explícita.

### Fase 1: Construir o Loop de Feedback Apertado (Hard Gate Obrigatório)
Esta é a fase mais crítica de todo o protocolo. Se você tiver um sinal rápido e determinístico de aprovado/reprovado (PASS/FAIL) que fique vermelho especificamente neste bug, a causa raiz será descoberta. Se você não tiver, inspecionar código às cegas desperdiçará tokens e tempo.

1. **Construir um comando único de reprodução:**
   - Teste unitário, de integração ou e2e que alcance o caminho do erro.
   - Script curl / HTTP contra o servidor local.
   - Invocação de comando CLI com fixture, comparando stdout com snapshot esperado.
   - Script headless (Playwright/Puppeteer) se envolver interface.
2. **Critérios do comando da Fase 1:**
   - **Capaz de falhar (Red-Capable):** Aciona o caminho real do bug e afirma o sintoma exato relatado.
   - **Determinístico:** Mesmo resultado a cada execução.
   - **Rápido:** Responde em poucos segundos (use mocks para I/O externo não essencial ou `test_isolate`).
   - **Autônomo:** Executável via `run_command` sem requerer intervenção humana.
3. **STOP GATE DA FASE 1:**
   - **NÃO leia arquivos de código nem formule teorias antes de ter executado este comando pelo menos uma vez e visto ele falhar com o sintoma exato.**

### Fase 2: Reproduzir e Minimizar
1. Execute o comando da Fase 1 e confirme que a falha reproduzida é exatamente a relatada pelo usuário (não outro erro acidental ao redor).
2. **Minimizar o caso de teste:** Reduza payloads, inputs, chamadas e configurações descartáveis **um a um**, reexecutando o loop.
3. Pare quando cada elemento restante no teste for estritamente necessário para reproduzir a falha. Isso reduz drasticamente o espaço de hipóteses da Fase 3.

### Fase 3: Formular 3 a 5 Hipóteses Falsificáveis Ranqueadas
1. Proibido fixar-se na primeira impressão. Formule entre 3 e 5 hipóteses ranqueadas por probabilidade.
2. Cada hipótese DEVE ser estritamente **falsificável**:
   > Formato: *"Se [Causa X for a culpada], então alterar [Y] fará o erro desaparecer / alterar [Z] fará o erro piorar de forma previsível."*
3. Apresente a lista ranqueada ao usuário de forma concisa. Se o usuário estiver ausente, proceda testando a hipótese número 1.

### Fase 4: Instrumentar e Inspecionar
1. Use `lsp diagnostics`, `ast_query` ou inserções cirúrgicas de log temporário para confirmar ou descartar a hipótese sob teste.
2. Redija imediatamente chaves de API, senhas ou cabeçalhos de autorização com `<REDACTED>`.
3. Se a hipótese for refutada, desfaça os logs temporários e teste a próxima hipótese da lista da Fase 3.

### Fase 5: Corrigir e Fixar Regressão
1. Uma vez isolada a causa raiz real, implemente a correção mínima necessária utilizando `replace_file_content` (nunca reescreva arquivos inteiros com `write_to_file`).
2. Execute novamente o comando da Fase 1: ele DEVE ficar **VERDE (PASS)**.
3. Execute a suíte de testes de regressão para garantir que nada foi quebrado ao redor.
4. Mantenha o teste criado na Fase 1 como teste permanente de regressão no repositório.
5. Se a solução envolveu um aprendizado não óbvio, armazene no MemPalace via `mempalace_capture` para prevenção em sessões futuras.
</process>
