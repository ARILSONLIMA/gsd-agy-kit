---
name: verify-and-stop
description: Validação final focada e parada imediata após confirmação de sucesso sem expandir escopo.
---

# Verify and Stop — Prova Suficiente e Parada Imediata

Converta as condições de aceitação no menor conjunto suficiente de validação.

- Reutilize resultados recentes caso o estado do repositório não tenha mudado.
- Execute checagens focadas antes de suítes amplas.
- Distinga claramente: passou, falhou, indisponível e bloqueado.
- **NUNCA** edite código de produto durante um pedido de verificação, a menos que o pedido autorize expressamente correções.
- Pare imediatamente quando a prova de aceitação passar com sucesso (100% verde). Reporte apenas o comando executado, o resultado e riscos remanescentes.
