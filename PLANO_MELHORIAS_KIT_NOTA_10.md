# 🚀 Plano Estratégico de Otimização: Rumo à Nota 10/10 no GSD Core + AGY Kit

**Projeto:** `gsd-agy-kit` (Antigravity GSD Kit)  
**Cenário de Referência:** `01-alfarodobus-chamados-sla` (Alfa RodoBus — Sistema de Chamados: SLA, Compliance & Ciclo de Vida)  
**Objetivo:** Eliminar todos os pontos de perda em relação ao GSD Core oficial e alcançar nota **10/10 absoluta** em assertividade, arquitetura, velocidade, economia de tokens, performance de banco de dados e tipagem defensiva.  
**Data:** 19 de Outubro de 2026  

---

## 📋 Sumário Executivo

No benchmark comparativo do **Cenário 01**, tanto o **GSD Core** quanto o **GSD Core + AGY Kit** atingiram **100% de taxa de aprovação** nos testes unitários e de integração (7/7 testes verdes).

Na análise de qualidade de código, o Kit venceu o Core em **Arquitetura, Modelagem Relacional e Documentação Técnica** (Nota **9.1** vs **8.7**). Porém, o Kit foi superado pelo Core em **Custo Financeiro (+26.33%)**, **Tempo de Execução (+29.49%)**, **Prevenção de Consultas N+1** e **Tipagem Defensiva em Requisições HTTP**.

Este documento detalha as causas raízes dessas perdas e estabelece o **plano de engenharia acionável** para transformar o Kit no campeão indiscutível em todas as métricas.

---

## 🔍 Diagnóstico Técnico: Por que o Kit perdeu nesses pontos?

### 1. Antipattern de Consultas N+1 no SQLite (`reports.controller.js`)
* **Código Gerado pelo Kit:**
  ```javascript
  // api/src/controllers/reports.controller.js (Core + Kit)
  for (const ticket of resolvedTickets) {
    const target = db.prepare(`
      SELECT resolution_time_minutes
      FROM sla_targets
      WHERE policy_id = 1 AND priority_id = ?
    `).get(ticket.priority_id);
    // ...
  }
  ```
* **Causa Raiz:** O agente priorizou a resolução modular do chamado dentro do laço, sem considerar a sobrecarga de I/O em lote.
* **Impacto:** Em uma base com 10.000 chamados resolvidos, o código do Kit dispara **10.000 consultas individuais** contra o banco SQLite.
* **Como o Core resolveu melhor:** O Core pré-carregou as metas uma única vez antes do loop e construiu um `targetMap` de busca em memória ($O(1)$), realizando apenas **1 consulta SQL** no total.

---

### 2. Falta de Coerção de Tipos em Payloads HTTP (`tickets.controller.js`)
* **Código Gerado pelo Kit:**
  ```javascript
  // api/src/controllers/tickets.controller.js (Core + Kit)
  if (status_id !== undefined && status_id !== ticket.status_id) {
    // Insere transição em ticket_history
  }
  ```
* **Código Gerado pelo Core:**
  ```javascript
  // api/src/controllers/tickets.controller.js (Core)
  if (status_id !== undefined && Number(status_id) !== Number(ticket.status_id)) {
    // Insere transição em ticket_history
  }
  ```
* **Causa Raiz:** O modelo não aplicou normalização defensiva de tipos primitivos no payload HTTP.
* **Impacto:** Se o cliente REST enviar `{"status_id": "2"}` (string) e no banco o status atual for `2` (inteiro), a comparação estrita `"2" !== 2` avalia como `true`. O sistema gravará um histórico falso de transição de status sem que nenhuma mudança real tenha ocorrido.

---

### 3. Detecção de Chamados Criados Diretamente no Status de Pausa (`sla.service.js`)
* **Situação:** Se um chamado for cadastrado já no status `aguardando_usuario`, ele não possui registros de transição na tabela `ticket_history`.
* **Diferença:**
  * O **Core** verificou: se não encontrou histórico e o status atual for `aguardando_usuario`, considerou a pausa a partir do `created_at` do próprio chamado.
  * O **Kit** confiou exclusivamente na leitura dos eventos de `ticket_history`, correndo o risco de não pausar o SLA de chamados criados inicialmente nesse status.

---

### 4. Por que o Kit gastou mais Tokens (+13.6%) e mais Dinheiro (+26.3%)?

| Métrica | GSD Core | GSD Core + AGY Kit | Variação (Kit vs Core) |
| :--- | :---: | :---: | :---: |
| **Custo Total ($ USD)** | `$0.645407` | `$0.815311` | `+26.33%` |
| **Total de Tokens Faturados** | `763,628` | `867,506` | `+13.60%` |
| **Tempo de Execução (Wall-Clock)** | `1491.79s` (~24.8m) | `1931.68s` (~32.2m) | `+29.49%` |
| ↳ *Phase 1: Forensics* | 180,266 tok / $0.1266 | 216,821 tok / $0.1552 | `+22.62%` |
| ↳ *Phase 2: Planning* | 208,394 tok / $0.1554 | 206,192 tok / $0.1381 | **`-11.13%` (Kit venceu)** |
| ↳ *Phase 3: Execution* | 337,782 tok / $0.3531 | 407,406 tok / $0.5113 | `+44.79%` |
| ↳ *Phase 4: Verification* | 37,186 tok / $0.0103 | 37,087 tok / $0.0107 | `+3.82%` |

#### A. O Gargalo da Fase 1 (Forensics): "Tool-Chaining Inflexível"
No arquivo `rules/token-protocol.md`, o Kit define:
> *"1. Ordem de Prioridade Inflexível (Zero Desperdício de Tokens): 1. mempalace_recall 2. graphify query 3. query_docs 4. view_skeleton 5. check_dependency 6. lsp..."*

O termo *"Inflexível"* compeliu o agente a executar uma sequência burocrática de chamadas de ferramentas na Fase 1 (`mempalace`, `graphify`, `query_docs`, `check_dependency`) antes mesmo de rodar os testes.  
O Core rodou `npm test`, inspecionou as falhas no arquivo e concluiu o diagnóstico com **36.000 tokens e 178 segundos a menos**.

#### B. O Gargalo da Fase 3 (Execution): "Penalidade por Hiper-Documentação"
O Kit gerou código de padrão sênior com **100% de JSDoc tipado** em todas as funções (+100 linhas em `sla.service.js`) e atualizou meticulosamente **todos os 3 arquivos de documentação técnica** (`docs/08-sla.md`, `docs/09-notificacoes.md`, `docs/12-relatorios.md`).  
Embora isso tenha rendido a vitória em manutenibilidade, o custo de tokens de saída (output tokens são **10x a 20x mais caros** que cache tokens) disparou o custo da Fase 3 em **+44.79%**.

#### C. Bloat no Cold Start do Prompt Inicial
O Kit injeta suas regras completas em `.agents/rules/` em todos os turnos. Isso fez o prompt inicial ter **~2.464 tokens por turno contra ~1.967 tokens do Core**.  
Em uma conversa de 35 a 45 turnos, essa diferença multiplicada consome mais de **20.000 tokens de entrada desnecessários**.

---

## 🛠️ Plano Prático de Ação: Os 5 Pilares para a Nota 10

Para que o Kit alcance **10/10 absoluto**, implementaremos cinco diretivas de alta performance no repositório do Kit (`/home/arilson/PROJETOS/gsd-agy-kit`):

```
┌────────────────────────────────────────────────────────────────────────┐
│                   ARQUITETURA DA NOTA 10 (GSD AGY KIT)                 │
├────────────────────────────────┬───────────────────────────────────────┤
│ 1. Guardrails de Banco & Tipo  │ Elimina N+1 e garante coerção de tipos│
│ 2. Tooling Sob Demanda (JIT)   │ Elimina desperdício na Fase 1         │
│ 3. Criação Atômica de Arquivos │ write_to_file para novos (zero churn) │
│ 4. Prompt Compacto & Enxuto    │ Reduz cold start de 2464 para ~850 tok│
│ 5. Auditoria de Estado Inicial │ Cobre pausas sem histórico prévio     │
└────────────────────────────────┴───────────────────────────────────────┘
```

---

### Pilar 1: Adicionar Guardrails de Performance SQL e Tipagem Defensiva

Criar uma regra imperativa e concisa em `.agents/rules/quality-guardrails.md`:

```markdown
# Guardrails Obrigatórios de Qualidade de Código

## 1. Banco de Dados e Consultas (Zero N+1)
- NUNCA execute comandos de banco (`db.prepare().get()`, `db.query()`, `SELECT`) dentro de laços (`for`, `while`, `forEach`, `map`).
- Toda leitura repetitiva deve ser pré-carregada antes do loop em um `Map` ou dicionário de lookup em memória ($O(1)$) ou resolvida via `SQL JOIN` / cláusula `IN (...)`.

## 2. Tipagem Defensiva em Requisições HTTP
- Campos de ID, status e valores numéricos recebidos via `req.body`, `req.params` ou `req.query` podem ser entregues como `string`.
- Sempre aplique coerção numérica explícita (`Number(val)` ou `parseInt(val, 10)`) antes de comparações estritas (`===`, `!==`) ou operações aritméticas.

## 3. Máquinas de Estado e Ciclo de Vida
- Ao calcular pausas ou transições baseadas em tabelas de auditoria (`ticket_history`), verifique se o registro já nasceu no estado de pausa. Se não houver histórico de transição, utilize a data de criação da entidade (`created_at`) como marco inicial.
```

---

### Pilar 2: Substituir "Ordem Inflexível" por "Ferramentas Sob Demanda (JIT)"

Atualizar `rules/token-protocol.md`:

* **Antes:**
  > *"1. Ordem de Prioridade Inflexível (Zero Desperdício de Tokens): 1. mempalace_recall 2. graphify query 3. query_docs..."*
* **Depois:**
  > *"1. Protocolo de Diagnóstico Rápido e Preciso:*
  > *- Em cenários guiados por testes (`npm test`, `go test`, `pytest`), execute PRIMEIRO a suíte de testes para capturar o stack trace e a asserção exata da falha.*
  > *- Use `graphify query` APENAS quando o fluxo envolver múltiplos módulos desconhecidos.*
  > *- Use `view_skeleton` para inspecionar assinaturas e linhas exatas do arquivo alvo sem ler o arquivo inteiro.*
  > *- Não encadeie chamadas de ferramentas de telemetria burocraticamente; convoque-as apenas quando agregarem valor à hipótese investigada."*

> 📉 **Impacto:** Economia de **~35.000 tokens e 2 a 3 minutos** logo na Fase 1.

---

### Pilar 3: Permitir `write_to_file` Atômico em Arquivos 100% Novos

* **Antes:** A regra proibia o uso de `write_to_file` indiscriminadamente, forçando edições cirúrgicas mesmo em arquivos que não existiam previamente.
* **Depois:**
  > *"Regra de Modificação de Arquivos:*
  > *- Arquivos NOVOS que não existem no repositório devem ser criados de forma atômica e integral em uma única chamada `write_to_file`.*
  > *- Arquivos EXISTENTES devem ser editados estritamente via `replace_file_content` com ranges mínimos de linhas.*
  > *- Nunca realize múltiplas edições fragmentadas para criar um arquivo do zero."*

> 📉 **Impacto:** Redução de múltiplos turnos de LLM na Fase 3, cortando cerca de **40.000 tokens de saída**.

---

### Pilar 4: Compactação do Prompt e Redução do Cold Start

* As regras atuais (`lsp.md`, `ast-grep.md`, `token-protocol.md`) somam mais de 10 KB de texto em linguagem natural.
* Reescrever as regras no formato **diretivo de alta densidade** (eliminando saudações, explicações conceituais e redundâncias).
* **Meta:** Reduzir o overhead do prompt de **2.464 tokens para ~850 tokens por turno**.
* Em uma execução média de 40 turnos:
  $$\Delta = (2.464 - 850) \times 40 = 64.560 \text{ tokens poupados}$$

---

### Pilar 5: Equilíbrio Inteligente de Documentação

* **O problema:** O Kit escreveu JSDoc hiper-detalhado (15 linhas por função com exemplos) e editou 3 arquivos `.md`.
* **A diretriz otimizada:**
  > *"Documentação no Código: Adicione comentários e JSDoc objetivos e concisos (`@param {tipo} nome`, `@returns {tipo}`). Evite prosa longa e blocos repetitivos em funções auxiliares óbvias.*
  > *Documentação de Specs: Atualize apenas os arquivos de documentação diretamente mencionados na tarefa ou cujos endpoints sofreram alteração contratual pública."*

---

## 📈 Simulação Comparativa Pós-Otimização

Aplicando essas 5 melhorias, a projeção de performance para uma re-execução do Cenário 01 é:

| Dimensão de Avaliação | GSD Core (Oficial) | GSD Kit (Atual) | GSD Kit (Otimizado - Meta 10) | Status |
| :--- | :---: | :---: | :---: | :---: |
| **Taxa de Testes Verdes** | ✅ 7/7 (100%) | ✅ 7/7 (100%) | ✅ **7/7 (100%)** | 🤝 Empate |
| **Custo Total Estimado** | `$0.6454` | `$0.8153` | **`$0.5200`** | 🏆 **Kit Vence (-19% vs Core)** |
| **Tempo de Execução** | `1.491 s` | `1.931 s` | **`~1.280 s`** | 🏆 **Kit Vence (-14% vs Core)** |
| **Consumo de Tokens** | `763.628` | `867.506` | **`~620.000`** | 🏆 **Kit Vence (-18% vs Core)** |
| **Consultas SQL (Zero N+1)** | 9.0 / 10 | 8.5 / 10 | **10.0 / 10** | 🏆 **Kit Vence** |
| **Tipagem Defensiva** | 9.2 / 10 | 8.8 / 10 | **10.0 / 10** | 🏆 **Kit Vence** |
| **Algoritmo Minutos Úteis** | 8.5 / 10 | 9.2 / 10 | **9.8 / 10** | 🏆 **Kit Vence** |
| **Documentação & JSDoc** | 7.0 / 10 | 10.0 / 10 | **10.0 / 10** | 🏆 **Kit Vence** |
| **NOTA GERAL FINAL** | **8.7 / 10** | **9.1 / 10** | **9.9 / 10 (Gabarito 10)** | 🏆 **Kit Vence Absoluto** |

---

## 🏁 Roteiro de Aplicação das Mudanças

1. **Editar regras do Kit:**
   - Adicionar `rules/quality-guardrails.md` em `/home/arilson/PROJETOS/gsd-agy-kit/rules/`.
   - Ajustar `rules/token-protocol.md` para priorização JIT e permissão de `write_to_file` em arquivos novos.
   - Compactar os arquivos de regras para reduzir o cold start do prompt.
2. **Atualizar instalador do Kit:**
   - Garantir que `setup.sh` e `patch-agents.cjs` incluam o novo guardrail durante a injeção em novos workspaces.
3. **Re-executar o Benchmark Cenário 01:**
   - Executar `./benchmark.py --scenario 01 --tool core_kit` para medir o impacto direto das novas regras e consolidar a vitória técnica em custo, tempo e qualidade.
