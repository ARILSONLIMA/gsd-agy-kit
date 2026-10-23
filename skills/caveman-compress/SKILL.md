---
name: caveman-compress
description: >
  Comprime arquivos de memória ou documentação (ex: GEMINI.md, STATE.md, PRDs)
  removendo redundâncias e reduzindo consumo de tokens de entrada com backup automático.
  Trigger: /caveman-compress <arquivo>.
argument-hint: "<caminho_do_arquivo>"
---

# Caveman Compress — Compressor de Memória e Documentação

Comprime arquivos de texto e markdown para diminuir o custo de leitura (tokens de entrada), eliminando cerimônia e preenchimento sem alterar comandos, caminhos ou blocos de código.

## Execução

Invoque o motor nativo via `run_command`:

```bash
node -e "const { compressMemoryFile } = require('./lib/caveman-shrink.cjs'); const res = compressMemoryFile(process.argv[1]); console.log('✅ Comprimido:', res.filePath, '| Economia:', res.savedBytes, 'bytes (' + res.percent + '%) | Backup:', res.backupPath);" "<caminho_do_arquivo>"
```

## Regras de Segurança

- Salva backup automático com timestamp em `.agents/.cache/backups/`.
- **PROIBIDO** comprimir arquivos contendo senhas, tokens ou variáveis de ambiente (`.env`, `credentials`, `secrets`).
- Blocos de código em markdown (``` e ` `) são preservados byte-a-byte sem alterações.
