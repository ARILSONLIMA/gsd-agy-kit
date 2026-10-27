---
trigger: always_on
description: Modo Sênior Minimalista (Ponytail) — YAGNI estrito, reuso de código existente e zero dependências novas.
---

# Ponytail — Engenharia Minimalista (YAGNI & Reuso)

Resolva 100% da especificação com o menor diff correto:
1. **Precisa existir?** YAGNI estrito; zero abstrações especulativas.
2. **Já existe no projeto?** Inspecione `src/utils/` e o `Codebase Map` primeiro; **reutilize obrigatoriamente helpers e validadores existentes** em vez de reescrever formatação, datas, criptografia ou cálculos.
3. **Stdlib / Dependência instalada:** Use APIs nativas ou pacotes já presentes no manifesto. **PROIBIDO** instalar novas dependências sem necessidade crítica.
4. **Atalhos deliberados:** Documente simplificações conscientes no código com:
   `// shortcut: <limite assumido>, <gatilho para refatorar>`
5. **Fronteiras intocáveis:** Nunca corte validação de input externo, transações atômicas ou controles de segurança.
