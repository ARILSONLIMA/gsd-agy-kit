---
trigger: always_on
description: Guardrails universais de qualidade, performance de banco (zero N+1), tipagem defensiva HTTP, consistência e ciclo de vida.
---

# Guardrails Obrigatórios de Qualidade de Código

## 1. Banco de Dados e Performance (Zero N+1)
- **NUNCA** execute consultas de banco (`db.prepare().get()`, `db.query()`, `SELECT`, queries ORM) dentro de loops (`for`, `while`, `map`, `forEach`).
- Pré-carregue todos os dados necessários antes do laço em um dicionário/`Map` de lookup em memória ($O(1)$) ou resolva via `SQL JOIN` / cláusula `IN (...)`.
- Em paginações e relatórios, filtre e agregue diretamente no SQL em vez de puxar coleções brutas para processar na aplicação.

## 2. Tipagem Defensiva em Requisições HTTP
- Campos de ID, status e numéricos recebidos via `req.body`, `req.params` ou `req.query` chegam frequentemente como `string` em clientes REST.
- **Sempre aplique coerção explícita** (`Number(val)` ou `parseInt(val, 10)`) antes de comparações estritas (`===`, `!==`) ou operações matemáticas.
- Valide payload e campos obrigatórios no início do controlador antes de invocar serviços ou tocar o banco.

## 3. Transações Atômicas e Consistência (Multi-Escrita)
- Operações que alteram mais de uma tabela ou registram eventos de auditoria/histórico junto à entidade principal **DEVEM** ser atômicas.
- Envolva em bloco de transação (`BEGIN TRANSACTION` / `COMMIT` ou `db.transaction(() => { ... })`). Em caso de erro, garanta `ROLLBACK`.

## 4. Prepared Statements & Anti-SQL Injection
- Proibição absoluta de interpolação de strings em consultas SQL (`SELECT ... WHERE id = ${id}`).
- Use exclusivamente bind parameters (`?` no SQLite/MySQL ou `$1` no PostgreSQL).

## 5. Máquinas de Estado e Ciclo de Vida (Auditoria Inicial)
- Ao calcular tempos de SLA ou pausas baseadas em log de eventos (`ticket_history`), verifique se o registro já nasceu no estado de pausa.
- Se não houver histórico de transição prévio, utilize a data de criação da entidade (`created_at`) como marco inicial do cálculo.

## 6. Tratamento de Erros e Respostas Semânticas
- Proibido engolir erros com blocos silenciosos (`catch (e) {}`). Sempre registre log estruturado ou propague.
- Respeite status codes HTTP: `201 Created` (com header `Location` ou entidade criada), `200 OK` (leitura/atualização), `204 No Content` (deleção vazia), `400 Bad Request` (validação), `404 Not Found` (recurso inexistente), `409 Conflict` (duplicidade).

## 7. Criação Atômica de Arquivos Novos vs Diffs Cirúrgicos
- **Arquivos NOVOS:** Crie de forma integral em uma única chamada `write_to_file` (zero churn).
- **Arquivos EXISTENTES:** Modifique estritamente via `replace_file_content` com intervalos mínimos de linhas.

## 8. Documentação Equilibrada e Concisa
- **JSDoc/Docstrings:** Objetivos e restritos a 2-4 linhas (`@param`, `@returns`) apenas em funções públicas de módulos de negócio. Proibido blocos narrativos prolixos em funções auxiliares óbvias.
- **Especificações .md:** Atualize documentação apenas quando contratos públicos de API forem alterados ou quando o requisito solicitar expressamente.
