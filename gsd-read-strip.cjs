#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function stripComments(content, ext) {
  let result = content;
  
  if (['.go', '.ts', '.js', '.tsx', '.jsx', '.cs', '.java', '.c', '.cpp', '.rs'].includes(ext)) {
    // Remove /* ... */
    result = result.replace(/\/\*[\s\S]*?\*\//g, '');
    // Remove // ...
    result = result.replace(/\/\/.*$/gm, '');
  } else if (ext === '.py' || ext === '.rb' || ext === '.sh' || ext === '.ps1') {
    // Remove # ...
    result = result.replace(/#.*$/gm, '');
    if (ext === '.py') {
      // Remove docstrings """ ... """
      result = result.replace(/"""[\s\S]*?"""/g, '');
      result = result.replace(/'''[\s\S]*?'''/g, '');
    }
  } else if (ext === '.html' || ext === '.vue' || ext === '.svelte') {
    // Remove <!-- ... -->
    result = result.replace(/<!--[\s\S]*?-->/g, '');
  }
  
  // Remove blank lines caused by stripping
  return result.replace(/^\s*[\r\n]/gm, '');
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: node gsd-read-strip.cjs <arquivo>");
    process.exit(1);
  }
  
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`Arquivo não encontrado: ${absPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(absPath, 'utf8');
  const ext = path.extname(absPath);
  const stripped = stripComments(content, ext);
  
  console.log(`=== STRIPPED CONTENT: ${path.basename(absPath)} ===\n`);
  console.log(stripped);
}

main();
