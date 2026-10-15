'use strict';

/**
 * Antigravity GSD Kit - State Compactor & Phase History Pruner
 * Arquiva métricas e tabelas de fases concluídas antigas de .planning/STATE.md
 * para .planning/STATE-ARCHIVE.md, mantendo o contexto do turno enxuto.
 */

const fs = require('fs');
const path = require('path');

function resolveProjectRoot(customTarget) {
  if (customTarget && fs.existsSync(customTarget)) return path.resolve(customTarget);
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.planning'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

function compactState(targetDir) {
  const root = resolveProjectRoot(targetDir);
  const statePath = path.join(root, '.planning', 'STATE.md');
  const archivePath = path.join(root, '.planning', 'STATE-ARCHIVE.md');

  if (!fs.existsSync(statePath)) {
    return { success: false, reason: 'STATE.md não encontrado' };
  }

  const rawState = fs.readFileSync(statePath, 'utf8');
  const initialBytes = Buffer.byteLength(rawState, 'utf8');

  // Detecta seções de tabelas de Performance Metrics com muitas linhas de histórico passado
  const tableRegex = /(### Performance Metrics[\s\S]*?\| Phase \| Plans \| Total \| Avg\/Plan \|[\s\S]*?\n\n)/i;
  const match = rawState.match(tableRegex);

  let compactedContent = rawState;
  let bytesSaved = 0;

  if (match) {
    const tableBlock = match[1];
    const lines = tableBlock.split('\n');
    // Se a tabela tiver mais de 8 linhas de histórico
    if (lines.length > 8) {
      // Separa cabeçalho e linhas
      const headerLines = lines.slice(0, 5);
      const dataLines = lines.slice(5).filter(l => l.trim().startsWith('|'));
      
      if (dataLines.length > 3) {
        // Mantém as últimas 3 fases ativas
        const keepLines = dataLines.slice(-3);
        const archiveLines = dataLines.slice(0, -3);

        const archiveHeader = `\n## Arquivo de Métricas Históricas (${new Date().toISOString()})\n\n| Phase | Plans | Total | Avg/Plan |\n|---|---|---|---|\n`;
        const archiveContent = archiveHeader + archiveLines.join('\n') + '\n';
        
        fs.appendFileSync(archivePath, archiveContent, 'utf8');

        const newTableBlock = headerLines.join('\n') + '\n' +
          `| *(Fases anteriores arquivadas em STATE-ARCHIVE.md)* | - | - | - |\n` +
          keepLines.join('\n') + '\n\n';

        compactedContent = rawState.replace(tableBlock, newTableBlock);
        fs.writeFileSync(statePath, compactedContent, 'utf8');
        bytesSaved = initialBytes - Buffer.byteLength(compactedContent, 'utf8');
      }
    }
  }

  return {
    success: true,
    compacted: bytesSaved > 0,
    initialBytes,
    finalBytes: Buffer.byteLength(compactedContent, 'utf8'),
    bytesSaved,
    archivePath: fs.existsSync(archivePath) ? archivePath : null
  };
}

if (require.main === module) {
  const target = process.argv[2];
  const res = compactState(target);
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`\n🧹 [State Compactor] Resultado:`);
    console.log(`   Sucesso:      ${res.success ? 'Sim' : 'Não'}`);
    console.log(`   Compactado:   ${res.compacted ? 'Sim (' + res.bytesSaved + ' bytes poupados)' : 'Já otimizado'}`);
    if (res.archivePath) console.log(`   Arquivo:      ${res.archivePath}`);
  }
}

module.exports = { compactState };
