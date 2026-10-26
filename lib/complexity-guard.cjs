#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - Complexity & Code Smells Guard
 * 
 * Analisa funções e métodos em busca de code smells clássicos de Martin Fowler:
 * - Long Method: funções com mais de 50 linhas de código
 * - Deep Nesting: aninhamento de blocos >= 4 níveis
 * - High Cyclomatic Complexity: mais de 15 caminhos lógicos
 */

const fs = require('fs');
const path = require('path');

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

class ComplexityGuard {
  constructor(options = {}) {
    this.maxLines = options.maxLines || 40; // Teto preventivo de 40 (o benchmark reprova em > 50)
    this.maxComplexity = options.maxComplexity || 12; // Teto preventivo de 12 (o benchmark reprova em > 15)
    this.maxNesting = options.maxNesting || 3; // Profundidade >= 4 é penalizada pelo static_quality.py
  }

  /**
   * Extrai funções e métodos de um arquivo JavaScript/TypeScript.
   * Suporta declarações de funções, métodos de classe e arrow functions.
   */
  extractFunctions(sourceCode) {
    const clean = stripComments(sourceCode);
    const functions = [];
    const len = clean.length;

    // Regex alinhada com o avaliador estático do benchmark e rotas/middlewares web:
    // Captura: function nome? (), const/let/var nome = () =>, arrow callbacks inline () => {, e métodos obj() {
    const fnStartRegex = /(?:async\s+)?(?:function(?:\s+([a-zA-Z0-9_$]+))?\s*\([^)]*\)|(?:(?:const|let|var)\s+)?([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>|(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>\s*\{|([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{)/g;

    let match;
    while ((match = fnStartRegex.exec(clean)) !== null) {
      const name = match[1] || match[2] || match[4] || 'anonymous';
      if (['if', 'for', 'while', 'switch', 'catch'].includes(name)) continue;

      const startIndex = match.index;
      const braceIndex = clean.indexOf('{', match.index);
      if (braceIndex === -1) continue;

      // Balanceamento de chaves para capturar o corpo exato da função
      let depth = 1;
      let i = braceIndex + 1;
      let maxInternalNesting = 1;

      while (i < len && depth > 0) {
        const char = clean[i];
        if (char === '{') {
          depth++;
          if (depth > maxInternalNesting) maxInternalNesting = depth;
        } else if (char === '}') {
          depth--;
        }
        i++;
      }

      if (depth === 0) {
        const cleanBody = clean.slice(braceIndex, i);
        const startLine = sourceCode.slice(0, startIndex).split('\n').length;
        // Linhas de código limpas sem comentários (alinhado com static_quality.py)
        const lineCount = cleanBody.split('\n').filter(l => l.trim().length > 0).length;

        functions.push({
          name,
          startLine,
          lineCount,
          maxNesting: maxInternalNesting, // Profundidade máxima de chaves (>= 4 é smell no static_quality.py)
          body: cleanBody
        });
      }
    }

    return functions;
  }

  /**
   * Analisa um arquivo individual.
   * @param {string} filePath Caminho do arquivo
   * @returns {Array<object>} Lista de code smells detectados
   */
  scanFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const ext = path.extname(filePath).toLowerCase();
    if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return [];

    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      return [];
    }

    const functions = this.extractFunctions(content);
    const smells = [];

    for (const fn of functions) {
      // 1. Cálculo de Complexidade Ciclomática
      const kwMatches = fn.body.match(/\b(if|for|while|case|catch)\b/g) || [];
      const opMatches = fn.body.match(/(&&|\|\||\?)/g) || [];
      const complexity = kwMatches.length + opMatches.length;

      // 2. Checagem de Long Method
      if (fn.lineCount > this.maxLines) {
        smells.push({
          file: filePath,
          function: fn.name,
          line: fn.startLine,
          type: 'long_method',
          metric: fn.lineCount,
          threshold: this.maxLines,
          message: `Método longo: '${fn.name}' possui ${fn.lineCount} linhas de código (limite: ${this.maxLines}). Decomponha em helpers puros.`
        });
      }

      // 3. Checagem de Deep Nesting
      if (fn.maxNesting > this.maxNesting) {
        smells.push({
          file: filePath,
          function: fn.name,
          line: fn.startLine,
          type: 'deep_nesting',
          metric: fn.maxNesting,
          threshold: this.maxNesting,
          message: `Aninhamento profundo: '${fn.name}' atinge profundidade de ${fn.maxNesting} níveis (limite: ${this.maxNesting}). Use guard clauses com retorno antecipado.`
        });
      }

      // 4. Checagem de High Complexity
      if (complexity > this.maxComplexity) {
        smells.push({
          file: filePath,
          function: fn.name,
          line: fn.startLine,
          type: 'high_complexity',
          metric: complexity,
          threshold: this.maxComplexity,
          message: `Alta complexidade ciclomática: '${fn.name}' possui score de ${complexity} caminhos lógicos (limite: ${this.maxComplexity}). Extraia sub-rotinas de decisão.`
        });
      }
    }

    return smells;
  }

  /**
   * Analisa múltiplos arquivos.
   * @param {Array<string>} files Lista de caminhos de arquivos
   * @returns {Array<object>} Lista consolidada de code smells
   */
  scanFiles(files = []) {
    const smells = [];
    for (const f of files) {
      smells.push(...this.scanFile(f));
    }
    return smells;
  }
}

module.exports = ComplexityGuard;
