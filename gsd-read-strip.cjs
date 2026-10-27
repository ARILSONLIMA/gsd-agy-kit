#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function stripComments(content, ext) {
  let result = content;

  if (['.go', '.ts', '.js', '.tsx', '.jsx', '.cs', '.java', '.c', '.cpp', '.rs', '.cjs', '.mjs'].includes(ext)) {
    // Preserve line count by replacing comment lines with single newlines or stripping inline
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    result = result.replace(/\/\/.*$/gm, '');
  } else if (['.py', '.rb', '.sh', '.bash', '.ps1'].includes(ext)) {
    result = result.replace(/#.*$/gm, '');
    if (ext === '.py') {
      result = result.replace(/"""[\s\S]*?"""/g, '');
      result = result.replace(/'''[\s\S]*?'''/g, '');
    }
  } else if (['.html', '.vue', '.svelte', '.xml'].includes(ext)) {
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  }

  // Remove trailing whitespace and limit multiple empty lines to one
  return result
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter((line, idx, arr) => line.length > 0 || (idx > 0 && arr[idx - 1].length > 0))
    .join('\n');
}

function stripFile(filePath) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Arquivo não encontrado: ${absPath}`);
  }
  const ext = path.extname(absPath).toLowerCase();
  const raw = fs.readFileSync(absPath, 'utf8');
  const clean = stripComments(raw, ext);
  const rawLines = raw.split(/\r?\n/).length;
  const cleanLines = clean.split(/\r?\n/).length;
  const savedPct = Math.round((1 - (clean.length / (raw.length || 1))) * 100);

  return {
    path: absPath,
    filename: path.basename(absPath),
    rawLines,
    cleanLines,
    savedPct: Math.max(0, savedPct),
    content: clean
  };
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: node gsd-read-strip.cjs <caminho_do_arquivo>');
    process.exit(1);
  }
  try {
    const res = stripFile(target);
    console.log(`=== STRIPPED: ${res.filename} (${res.cleanLines} linhas limpas, economizou ~${res.savedPct}% tokens) ===\n`);
    console.log(res.content);
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { stripComments, stripFile };
