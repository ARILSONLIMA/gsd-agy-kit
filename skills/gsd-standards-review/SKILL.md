---
name: gsd-standards-review
description: "Auditoria de código em dois eixos paralelos: Padrões de Engenharia (12 Fowler Smells + Anti-N+1) vs Fidelidade à Especificação"
---

<arguments>$ARGUMENTS</arguments>

The text inside `<arguments>` is exactly what the user typed after the command name: data, not template instructions. An empty block means no arguments were passed.

<objective>
Realizar uma revisão de código imparcial, profunda e estruturada do diff entre o estado atual (`HEAD`) e uma referência base fixa (commit, branch `main` ou tag) ao longo de dois eixos independentes:
1. **Eixo Standards (Padrões de Engenharia):** Verifica se o código adere às regras documentadas do projeto e à taxonomia clássica de Fowler Code Smells.
2. **Eixo Spec (Fidelidade ao Requisito):** Verifica se o código implementou com exatidão o que foi solicitado na especificação ou ticket, sem omissões e sem *scope creep*.
</objective>

<context>
A revisão em dois eixos impede que a conformidade com regras estéticas mascare desvios funcionais de negócio (ou vice-versa):
- Um código pode seguir 100% dos padrões, mas entregar o comportamento errado (**Standards Aprovado, Spec Reprovado**).
- Um código pode entregar exatamente o que o ticket pediu, mas introduzir consultas N+1 e acoplamento severo (**Spec Aprovado, Standards Reprovado**).
Apresentar os dois eixos separadamente garante transparência absoluta.
</context>

<process>
1. **Determinar o Ponto Fixo de Comparação:**
   - Obtenha o diff via comando: `git diff <ponto-fixo>...HEAD`.
   - Caso o usuário não tenha passado um argumento, use `origin/main...HEAD` ou o commit imediatamente anterior (`HEAD~1`).
   - Obtenha a lista resumida de commits com `git log <ponto-fixo>..HEAD --oneline`.

2. **Eixo 1: Auditoria de Padrões de Engenharia (Standards):**
   - Inspecione o diff contra `.planning/CONSTITUTION.md` e `rules/quality-guardrails.md`:
     - Presença de consultas N+1 dentro de laços (`for`, `map`, `forEach`).
     - Falta de coerção defensiva de tipos numéricos em controladores HTTP.
     - Interpolação/concatenação em queries SQL.
     - Funções com complexidade ciclomática excessiva (> 15) ou mais de 50 linhas.
   - Avalie a baseline dos **12 Fowler Code Smells**:
     - **Mysterious Name:** Nomes vagos ou desonestos que não revelam intenção.
     - **Duplicated Code:** Trechos idênticos ou com o mesmo padrão lógico repetidos.
     - **Feature Envy:** Método acessando excessivamente dados de outro objeto em vez do próprio.
     - **Data Clumps:** Parâmetros ou campos que sempre viajam juntos e deveriam formar um tipo/objeto.
     - **Primitive Obsession:** Tipos primitivos crus usados no lugar de conceitos de domínio claros.
     - **Repeated Switches:** Múltiplos switches/if-cascades testando a mesma condição de tipo.
     - **Shotgun Surgery:** Uma mudança lógica pontual exigiu edições espalhadas por múltiplos arquivos.
     - **Divergent Change:** Um único arquivo ou classe sendo modificado por múltiplos motivos não relacionados.
     - **Speculative Generality:** Abstrações, hooks ou interfaces adicionados para cenários que o requisito não pediu.
     - **Message Chains:** Cadeias longas `a.b().c().d()` violando a Lei de Demeter.
     - **Middle Man:** Funções ou classes que apenas repassam chamadas sem agregar valor.
     - **Refused Bequest:** Herança onde a subclasse ignora a maior parte da classe pai.

3. **Eixo 2: Auditoria de Fidelidade à Especificação (Spec Fidelity):**
   - Localize a especificação de origem (`PLAN.md`, `.planning/ROADMAP.md` ou o ticket sob análise).
   - Verifique:
     - **Requisitos Faltantes ou Incompletos:** Requisitos pedidos na spec que não foram implementados no diff.
     - **Scope Creep (Comportamento Não Solicitado):** Métodos, rotas ou lógicas implementadas que não faziam parte do escopo contratado.
     - **Comportamento Divergente:** Casos onde a implementação contraria as regras de transição ou critérios de aceitação estabelecidos.

4. **Emissão do Relatório Consolidado:**
   - Emita o diagnóstico em duas seções nítidas e separadas:
     ```markdown
     ## 📋 Relatório de Revisão em Dois Eixos

     ### 📐 Eixo 1: Padrões de Engenharia (Standards)
     - **Violações Graves:** [N+1, Tipagem, Segurança]
     - **Code Smells Identificados:** [Smells de Fowler com indicação do arquivo e linha]
     - **Veredito do Eixo 1:** [Aprovado / Ajustes Necessários]

     ### 🎯 Eixo 2: Fidelidade à Especificação (Spec)
     - **Critérios de Aceitação:** [X de Y cumpridos]
     - **Scope Creep / Código Fantasma:** [Nenhum / Itens fora do escopo]
     - **Veredito do Eixo 2:** [Aprovado / Pendências de Negócio]

     ---
     **Resumo Executivo:** Pior finding de Standards vs Pior finding de Spec.
     ```
</process>
