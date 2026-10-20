#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - Security AST Linter
 * 
 * Detecta vulnerabilidades de SQL Injection (concatenação de strings, template strings
 * sem parametrização) e práticas inseguras de banco de dados em tempo real.
 */

const fs = require('fs');
const path = require('path');

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

class SecurityLinter {
  constructor(projectRoot = process.cwd()) {
    this.projectRoot = projectRoot;
    this.sqlKeywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'WHERE',
      'FROM', 'JOIN', 'TABLE', 'AND', 'OR', 'UNION', 'LIMIT'
    ];
  }

  /**
   * Varre um arquivo individual em busca de vulnerabilidades de SQL Injection.
   * @param {string} filePath Caminho absoluto ou relativo do arquivo.
   * @returns {Array<object>} Lista de vulnerabilidades encontradas.
   */
  scanFile(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);
    if (!fs.existsSync(fullPath)) return [];

    const ext = path.extname(fullPath).toLowerCase();
    if (!['.js', '.ts', '.mjs', '.cjs'].includes(ext)) return [];

    let content;
    try {
      content = fs.readFileSync(fullPath, 'utf8');
    } catch {
      return [];
    }

    return this.scanSource(content, path.relative(this.projectRoot, fullPath));
  }

  /**
   * Varre o conteúdo textual de código-fonte.
   * @param {string} source Código-fonte.
   * @param {string} fileName Nome do arquivo para exibição.
   * @returns {Array<object>}
   */
  scanSource(source, fileName = 'unknown.js') {
    const issues = [];
    const cleanContent = stripComments(source);
    const lines = source.split('\n');

    // Função utilitária para descobrir número de linha pelo índice do caractere
    const getLineNumber = (charIndex) => {
      const upTo = source.slice(0, charIndex);
      return upTo.split('\n').length;
    };

    const sqlKeywordsPattern = this.sqlKeywords.join('|');

    // 1. Template Strings com Interpolação Direta em Cláusulas SQL
    // Ex: `SELECT * FROM users WHERE name = '${user}'` ou `WHERE id = ${id}`
    const tplRegex = /`([^`]*\b(?:SELECT|INSERT|UPDATE|DELETE|FROM|WHERE|JOIN)\b[^`]*)`/gi;
    let tplMatch;
    while ((tplMatch = tplRegex.exec(cleanContent)) !== null) {
      const fullTpl = tplMatch[1];
      const matchStart = tplMatch.index;

      // Procura interpolações ${...} dentro da template string
      const interpRegex = /\$\{([^}]+)\}/g;
      let interpMatch;
      while ((interpMatch = interpRegex.exec(fullTpl)) !== null) {
        const varExpr = interpMatch[1].trim();

        // Ignora casos seguros comuns: placeholders de array para IN (?)
        // ex: ${placeholders}, ${ids.map(...).join(',')}, ${updates.join(', ')}
        const isSafePlaceholder = /placeholders|\.map\(|\.join\(/i.test(varExpr);
        if (!isSafePlaceholder) {
          const lineNum = getLineNumber(matchStart + interpMatch.index);
          const snippet = lines[lineNum - 1] ? lines[lineNum - 1].trim() : fullTpl.slice(0, 80);
          issues.push({
            file: fileName,
            line: lineNum,
            type: 'sql_template_interpolation',
            severity: 'CRITICAL',
            snippet: snippet,
            variable: varExpr,
            message: `Concatenação de variável '\${${varExpr}}' em template string SQL. Use bind parameter '?' no SQLite.`
          });
        }
      }
    }

    // 2. Concatenação de string com variáveis em queries SQL
    // Ex: sql += " AND garage = '" + garage + "'";
    // Ex: "SELECT * FROM users WHERE id = " + userId
    const strSqlPattern = `(?:\"[^\"\\n]*\\b(?:${sqlKeywordsPattern})\\b[^\"\\n]*\"|'[^'\\n]*\\b(?:${sqlKeywordsPattern})\\b[^'\\n]*')`;

    // 2.1 Padrão: String SQL + variável (ex: "... WHERE garage = '" + garage)
    const concatAfterRegex = new RegExp(strSqlPattern + `\\s*\\+\\s*(?!\\s*[\"'])(\\w[\\w.\\(\\)\\[\\]]*)`, 'gi');
    let concatMatch;
    while ((concatMatch = concatAfterRegex.exec(cleanContent)) !== null) {
      const matchIndex = concatMatch.index;
      const lineNum = getLineNumber(matchIndex);
      const varName = concatMatch[1];

      // Ignora quebra de linhas puras em SQL multilinha ou números estáticos
      if (varName && !/^(?:true|false|null|undefined)$/i.test(varName)) {
        const snippet = lines[lineNum - 1] ? lines[lineNum - 1].trim() : concatMatch[0].slice(0, 80);
        issues.push({
          file: fileName,
          line: lineNum,
          type: 'sql_string_concatenation',
          severity: 'CRITICAL',
          snippet: snippet,
          variable: varName,
          message: `Concatenação direta de variável '${varName}' na query SQL. Use bind parameter '?' para prevenir SQL Injection.`
        });
      }
    }

    // 2.2 Padrão: Variável + String SQL (ex: sql += " AND status = ?")
    // Se o lado esquerdo é sql e concatena com valor sem bind
    const appendConcatRegex = /(?:sql|query|stmt)\s*\+=\s*(?:\"|')[^\"'\n]*(?:WHERE|AND|OR)\s+[\w.]+\s*=\s*['\"]?\s*\+\s*([a-zA-Z_$][\w.$]*)/gi;
    let appendMatch;
    while ((appendMatch = appendConcatRegex.exec(cleanContent)) !== null) {
      const lineNum = getLineNumber(appendMatch.index);
      const varName = appendMatch[1];
      const snippet = lines[lineNum - 1] ? lines[lineNum - 1].trim() : appendMatch[0].slice(0, 80);

      // Evita duplicatas se o primeiro regex já pegou na mesma linha
      const alreadyReported = issues.some(i => i.file === fileName && i.line === lineNum && i.type === 'sql_string_concatenation');
      if (!alreadyReported) {
        issues.push({
          file: fileName,
          line: lineNum,
          type: 'sql_string_concatenation',
          severity: 'CRITICAL',
          snippet: snippet,
          variable: varName,
          message: `Concatenação de '${varName}' via operador '+='. Substitua por '?' e adicione aos params do statement.`
        });
      }
    }

    return issues;
  }

  /**
   * Varre uma lista de arquivos.
   * @param {Array<string>} files Lista de caminhos relativos ou absolutos.
   * @returns {Array<object>}
   */
  scanFiles(files = []) {
    const allIssues = [];
    for (const f of files) {
      const issues = this.scanFile(f);
      allIssues.push(...issues);
    }
    return allIssues;
  }
}

module.exports = SecurityLinter;
