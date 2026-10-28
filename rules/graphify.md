---
trigger: model_decision
description: Ative quando precisar mapear dependências macro entre módulos desconhecidos ou consultar o grafo arquitetural canônico em .planning/graphs/.
---

# graphify: Grafo de Arquitetura

- O grafo de dependências canônico do projeto reside exclusivamente em `.planning/graphs/graph.json`.
- Para entender dependências macro entre módulos desconhecidos sem abrir múltiplos arquivos, consulte o grafo canônico sempre com a flag explícita `--graph`:
  - `graphify query --graph .planning/graphs/graph.json "<pergunta>"`
  - `graphify path --graph .planning/graphs/graph.json "<A>" "<B>"`
  - `graphify explain --graph .planning/graphs/graph.json "<símbolo>"`
- Para atualizar o grafo sob demanda após alterações na estrutura de módulos: execute a skill oficial `/graphify` ou dispare o utilitário do kit (`node .agents/kit/gsd-graphify-update.cjs`), que reindexa e centraliza o resultado em `.planning/graphs/` sem duplicar pastas.
