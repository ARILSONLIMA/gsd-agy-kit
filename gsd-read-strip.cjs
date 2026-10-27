#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Preserva marcadores deliberados de governança (Ponytail/GSD/Security)
const GOVERNANCE_TAG_RE = /(?:\/\/|#)\s*(?:shortcut|ponytail|TODO\((?:gsd|security)\)):/i;

function stripCommentsWithLines(content, ext, options = {}) {
  const withLineNumbers = options.lineNumbers !== false;
  const startLine = Number.isInteger(Number(options.startLine)) && Number(options.startLine) > 0
    ? Number(options.startLine)
    : 1;

  let masked = content;

  if (['.go', '.ts', '.js', '.tsx', '.jsx', '.cs', '.java', '.c', '.cpp', '.rs', '.cjs', '.mjs'].includes(ext)) {
    // Substitui comentários de bloco preservando quebras de linha (\n) para manter numeração exata do disco
    masked = masked.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\r\n]/g, ''));
  } else if (ext === '.py') {
    masked = masked.replace(/"""[\s\S]*?"""/g, (m) => m.replace(/[^\r\n]/g, ''));
    masked = masked.replace(/'''[\s\S]*?'''/g, (m) => m.replace(/[^\r\n]/g, ''));
  } else if (['.html', '.vue', '.svelte', '.xml'].includes(ext)) {
    masked = masked.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\r\n]/g, ''));
  }

  const rawLines = masked.split(/\r?\n/);
  const endLine = Number.isInteger(Number(options.endLine)) && Number(options.endLine) > 0
    ? Math.min(rawLines.length, Number(options.endLine))
    : rawLines.length;

  const outputLines = [];
  for (let idx = startLine - 1; idx < endLine && idx < rawLines.length; idx++) {
    let line = rawLines[idx];

    if (!GOVERNANCE_TAG_RE.test(line)) {
      if (['.go', '.ts', '.js', '.tsx', '.jsx', '.cs', '.java', '.c', '.cpp', '.rs', '.cjs', '.mjs'].includes(ext)) {
        // Evita cortar URLs http:// ou https:// dentro de strings
        line = line.replace(/(^|[^:\\])\/\/.*$/, '$1');
      } else if (['.py', '.rb', '.sh', '.bash', '.ps1'].includes(ext)) {
        if (idx > 0 || !line.startsWith('#!')) {
          line = line.replace(/(^|\s)#.*$/, '$1');
        }
      }
    }

    const trimmedEnd = line.trimEnd();
    if (trimmedEnd.trim().length === 0) continue;

    outputLines.push(withLineNumbers ? `${idx + 1}: ${trimmedEnd}` : trimmedEnd);
  }

  return {
    text: outputLines.join('\n'),
    rawLinesCount: rawLines.length,
    cleanLinesCount: outputLines.length
  };
}

function stripComments(content, ext) {
  return stripCommentsWithLines(content, ext, { lineNumbers: false }).text;
}

function stripFile(filePath, options = {}) {
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    throw new Error(`Arquivo não encontrado: ${absPath}`);
  }
  const ext = path.extname(absPath).toLowerCase();
  const raw = fs.readFileSync(absPath, 'utf8');
  const parsed = stripCommentsWithLines(raw, ext, {
    lineNumbers: options.lineNumbers !== false,
    startLine: options.startLine,
    endLine: options.endLine
  });
  const savedPct = Math.round((1 - (parsed.text.length / (raw.length || 1))) * 100);

  return {
    path: absPath,
    filename: path.basename(absPath),
    rawLines: parsed.rawLinesCount,
    cleanLines: parsed.cleanLinesCount,
    savedPct: Math.max(0, savedPct),
    content: parsed.text
  };
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Uso: node gsd-read-strip.cjs <caminho_do_arquivo> [startLine] [endLine]');
    process.exit(1);
  }
  try {
    const startLine = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
    const endLine = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;
    const res = stripFile(target, { startLine, endLine, lineNumbers: true });
    console.log(`=== STRIPPED: ${res.filename} (${res.cleanLines} linhas úteis com numeração original, economizou ~${res.savedPct}% tokens) ===\n`);
    console.log(res.content);
  } catch (err) {
    console.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

module.exports = { stripComments, stripCommentsWithLines, stripFile };
