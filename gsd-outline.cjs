#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function getOutline(content, ext) {
  const lines = content.split('\n');
  const outline = [];
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    
    if (ext === '.go') {
      if (trimmed.startsWith('func ') || trimmed.startsWith('type ')) {
        outline.push(`${i+1}: ${line}`);
      }
    } else if (ext === '.ts' || ext === '.js' || ext === '.tsx' || ext === '.jsx') {
      if (
        trimmed.startsWith('function ') || 
        trimmed.startsWith('class ') || 
        trimmed.startsWith('interface ') || 
        trimmed.startsWith('type ') || 
        trimmed.startsWith('export const') ||
        trimmed.startsWith('export function') ||
        trimmed.startsWith('export class')
      ) {
        outline.push(`${i+1}: ${line}`);
      }
    } else if (ext === '.py') {
      if (trimmed.startsWith('def ') || trimmed.startsWith('class ') || trimmed.startsWith('async def ')) {
        outline.push(`${i+1}: ${line}`);
      }
    } else if (ext === '.cs' || ext === '.java') {
      if (
        (trimmed.includes(' class ') || trimmed.includes(' interface ') || trimmed.includes(' record ')) ||
        (trimmed.includes('public ') || trimmed.includes('private ') || trimmed.includes('protected ')) && trimmed.includes('(')
      ) {
        // very basic heuristic
        if (!trimmed.endsWith(';')) outline.push(`${i+1}: ${line}`);
      }
    } else {
      // generic fallback: looking for brackets at end of line and some keywords
      if (trimmed.endsWith('{') && (trimmed.includes('function') || trimmed.includes('class'))) {
        outline.push(`${i+1}: ${line}`);
      }
    }
  }
  
  return outline.join('\n');
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error("Uso: node gsd-outline.cjs <arquivo>");
    process.exit(1);
  }
  
  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`Arquivo não encontrado: ${absPath}`);
    process.exit(1);
  }
  
  const content = fs.readFileSync(absPath, 'utf8');
  const ext = path.extname(absPath);
  const outline = getOutline(content, ext);
  
  console.log(`=== SKELETON OUTLINE: ${path.basename(absPath)} ===\n`);
  if (!outline.trim()) {
    console.log("(Nenhuma assinatura estrutural identificada com regras simples. Tente ast-grep)");
  } else {
    console.log(outline);
  }
}

main();
