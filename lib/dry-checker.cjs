#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - DRY Duplication Checker
 * 
 * Detecta blocos idênticos de código duplicado (janelas >= 6 linhas)
 * entre arquivos tocados ou dentro do mesmo serviço.
 */

const fs = require('fs');
const path = require('path');

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

function normalizeLine(line) {
  return line.trim().replace(/\s+/g, ' ');
}

class DryChecker {
  constructor(windowSize = 6) {
    this.windowSize = windowSize;
  }

  /**
   * Analisa um conjunto de arquivos em busca de duplicação exata de blocos lógicos.
   * @param {Array<string>} files Lista de caminhos de arquivos.
   * @returns {Array<object>} Lista de blocos duplicados.
   */
  checkFiles(files = []) {
    const windowMap = new Map();

    for (const filePath of files) {
      if (!fs.existsSync(filePath)) continue;
      const ext = path.extname(filePath).toLowerCase();
      if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const clean = stripComments(content);
      const rawLines = clean.split('\n');
      const lines = [];

      // Mapeia linhas com número de linha original
      for (let idx = 0; idx < rawLines.length; idx++) {
        const norm = normalizeLine(rawLines[idx]);
        if (norm.length > 0 && norm !== '{' && norm !== '}' && norm !== '};' && !norm.startsWith('import ') && !norm.startsWith('const ') && !norm.startsWith('require(')) {
          lines.push({ text: norm, origLine: idx + 1 });
        }
      }

      // Cria janelas deslizantes de N linhas
      for (let i = 0; i <= lines.length - this.windowSize; i++) {
        const windowSlice = lines.slice(i, i + this.windowSize);
        const windowKey = windowSlice.map(l => l.text).join(' | ');

        // Filtra janelas triviais (muito curtas no total)
        if (windowKey.length < 50) continue;

        if (!windowMap.has(windowKey)) {
          windowMap.set(windowKey, []);
        }
        windowMap.get(windowKey).push({
          file: filePath,
          line: windowSlice[0].origLine,
          sample: windowKey.slice(0, 100)
        });
      }
    }

    const duplicates = [];
    for (const [key, occurrences] of windowMap.entries()) {
      if (occurrences.length > 1) {
        // Verifica se as ocorrências são de arquivos distintos ou posições distantes (> 10 linhas)
        const uniqueLocations = [];
        for (const occ of occurrences) {
          const isNearby = uniqueLocations.some(u => u.file === occ.file && Math.abs(u.line - occ.line) < this.windowSize);
          if (!isNearby) {
            uniqueLocations.push(occ);
          }
        }

        if (uniqueLocations.length > 1) {
          duplicates.push({
            occurrencesCount: uniqueLocations.length,
            locations: uniqueLocations,
            snippet: occurrences[0].sample
          });
        }
      }
    }

    return duplicates;
  }
}

module.exports = DryChecker;
