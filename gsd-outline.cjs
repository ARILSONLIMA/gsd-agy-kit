#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function loadSkeletonEngine() {
  const candidates = [
    path.join(__dirname, 'lib', 'skeleton-engine.cjs'),
    path.join(__dirname, '..', 'lib', 'skeleton-engine.cjs')
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return require(candidate);
    }
  }
  return null;
}

function main() {
  const filePath = process.argv[2];
  if (!filePath) {
    console.error('Uso: node gsd-outline.cjs <arquivo>');
    process.exit(1);
  }

  const absPath = path.resolve(filePath);
  if (!fs.existsSync(absPath)) {
    console.error(`Arquivo não encontrado: ${absPath}`);
    process.exit(1);
  }

  const SkeletonEngine = loadSkeletonEngine();
  if (SkeletonEngine) {
    try {
      const engine = new SkeletonEngine(process.cwd());
      console.log(engine.getOutline(absPath));
      return;
    } catch (err) {
      console.error(err.message);
      process.exit(1);
    }
  }

  const content = fs.readFileSync(absPath, 'utf8');
  const lines = content.split(/\r?\n/);
  const outline = [];
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (/^(export\s+)?(async\s+)?(function|class|interface|type|def|defp|defmodule|fn|pub\s+fn|struct|pub\s+struct|enum|pub\s+enum|func)\s+/.test(trimmed)) {
      outline.push(`${i + 1}: ${lines[i]}`);
    }
  }
  console.log(`=== SKELETON OUTLINE: ${path.basename(absPath)} ===\n`);
  console.log(outline.length > 0 ? outline.join('\n') : '(Nenhuma assinatura estrutural identificada. Tente ast-grep)');
}

main();
