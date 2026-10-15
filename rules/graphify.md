---
trigger: always_on
description: Protocolo obrigatório de consulta e manutenção do grafo de conhecimento graphify em graphify-out/.
---

## graphify: Protocolo Obrigatório de Navegação e Arquitetura

Este projeto possui um grafo de conhecimento gerado pelo **graphify** localizado em `graphify-out/`.

### Regras Mandatórias de Execução:
1. **Inicialização Imediata (se ausente):** Se `graphify-out/graph.json` ainda não existir no início da sessão, execute **imediatamente** `graphify update .` (via `run_command`). A extração é instantânea (~1s), local (via AST) e sem consumo de tokens de API.
2. **Primeiro Passo de Forense e Planejamento:** Antes de abrir arquivos ou suítes de testes com `view_file` para entender requisitos, componentes, funções ou rotas, execute **obrigatoriamente**:
   - `graphify query "<sua pergunta ou componente>"` (via `run_command` ou MCP `query_graph`).
   - Retorna um subgrafo cirúrgico com os nós, conexões e arquivos exatos relacionados ao problema.
3. **Mapeamento de Relações e Símbolos:**
   - Use `graphify path "<Origem>" "<Destino>"` para inspecionar relações e chamadas entre componentes.
   - Use `graphify explain "<símbolo>"` para obter um resumo contextual focado de um nó e seus vizinhos.
4. **Proibição de Leitura Cega:** É terminantemente proibido tentar entender a arquitetura do projeto lendo arquivos de código ou de teste inteiros com `view_file`. Sempre utilize `graphify query` para identificar os pontos de interesse e restrinja `view_file` a trechos cirúrgicos (máximo 100 linhas).
5. **Navegação Wiki:** Se `graphify-out/wiki/index.md` existir, priorize a navegação pela wiki estruturada antes de inspecionar arquivos brutos.
6. **Visão Ampla do Grafo:** Leia `graphify-out/GRAPH_REPORT.md` apenas para revisões de arquitetura macro quando queries específicas não fornecerem contexto suficiente.
7. **Sincronização Pós-Edição:** Sempre que criar, renomear ou modificar arquivos de código (`src/`), execute `graphify update .` para sincronizar o grafo com as novas alterações.
8. **Status e Saúde:** Para checar o frescor ou nós do grafo, utilize `graphify status` ou `graphify god-nodes`.
