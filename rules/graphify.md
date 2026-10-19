---
trigger: always_on
description: Navegação arquitetural cirúrgica via grafo de conhecimento graphify (consultas, caminhos e sincronização).
---

# graphify: Navegação e Grafo de Arquitetura

- **Inicialização:** Se `graphify-out/graph.json` não existir e você precisar entender relações arquiteturais, execute `graphify update .` (local, instantâneo, 0 tokens).
- **Mapeamento Macro (JIT):** Use `graphify query "<pergunta>"` quando precisar entender fluxos entre múltiplos módulos desconhecidos.
- **Relações e Contexto:**
  - Inspecionar dependências entre componentes: `graphify path "<Origem>" "<Destino>"`
  - Resumo de vizinhança de um símbolo: `graphify explain "<símbolo>"`
- **Proibição de Leitura Cega:** Não abra arquivos inteiros com `view_file` para entender estrutura macro; use queries no grafo para achar os nós exatos e leia trechos cirúrgicos (<= 100 linhas).
- **Sincronização:** Após criar ou alterar módulos estruturais em código, execute `graphify update .` para atualizar o grafo.
