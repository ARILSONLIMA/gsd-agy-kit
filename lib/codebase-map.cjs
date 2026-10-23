'use strict';

/**
 * Antigravity GSD Kit - Codebase Map Engine (Ponytail Native)
 * 
 * Mapeia rapidamente os símbolos públicos (funções, classes, tipos, structs, rotas e exports)
 * do projeto sem carregar dependências externas (Zero-npm).
 * 
 * Objetivo:
 * - Alimentar o passo 2 da Escada de Decisão do Ponytail ("Já existe no projeto? Reutilize!").
 * - Injetado no SessionStart hook (orçamento configurável de ~2.000 caracteres, ~450 tokens).
 * - Executa em < 30ms via git ls-files com fallback para directory walk eficiente.
 */

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

const DEFAULT_BUDGET = Number(process.env.PONYTAIL_MAP_CHARS || 2000);
const MAX_FILES = 3000;
const SRC_EXTS = /\.(js|jsx|mjs|cjs|ts|tsx|go|rs|py|java|kt|kts|cs|php|rb|swift|dart|c|cpp|cc|h|hpp|ex|exs|sql)$/i;

const SKIP_DIR = /(^|\/)(node_modules|\.git|dist|build|out|vendor|venv|\.venv|__pycache__|coverage|\.next|target|migrations|versions|fixtures|tests?|__tests__|spec|\.agents|\.gemini|\.planning|graphify-out)(\/|$)/i;
const SKIP_FILE = /(^|\/)(test_[^/]*|[^/]*(_test|\.test|\.spec|\.gen|\.min|\.d)\.[a-z]+)$/i;
const SHARED_HINT = /(util|helper|lib|common|shared|service|component|hook|core|model|schema|api|repo|store|client)/i;

const PATTERNS = {
  js: [
    /^(?:export\s+(?:default\s+)?)?(?:async\s+)?(?:function\*?|class)\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s+(?:const|let|var|interface|type|enum)\s+([A-Za-z_$][\w$]*)/gm,
    /^export\s*\{([^}]*)\}/gm,
    /^(?:module\.)?exports\.([A-Za-z_$][\w$]*)\s*=/gm,
    /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?\([^)]*\)\s*=>/gm
  ],
  py: [
    /^(?:async\s+)?def\s+([A-Za-z]\w*)/gm,
    /^class\s+([A-Za-z]\w*)/gm
  ],
  go: [
    /^func\s+(?:\([^)]*\)\s*)?([A-Z]\w*)/gm,
    /^type\s+([A-Z]\w*)/gm
  ],
  rs: [
    /^pub\s+(?:async\s+)?(?:fn|struct|enum|trait|type)\s+(\w+)/gm
  ],
  jvm: [
    /^\s*(?:public\s+)?(?:static\s+)?(?:final\s+)?(?:class|interface|enum|record)\s+(\w+)/gm
  ],
  php: [
    /^\s*(?:final\s+)?(?:abstract\s+)?(?:class|interface|trait|enum)\s+(\w+)/gm,
    /^\s*(?:public\s+)?function\s+([a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*)/gm
  ],
  rb: [
    /^\s*(?:def|class|module)\s+([A-Za-z][\w.]*)/gm
  ],
  dart: [
    /^\s*(?:abstract\s+)?class\s+(\w+)/gm,
    /^(?:[A-Za-z_$][\w$]*\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/gm
  ],
  c: [
    /^[A-Za-z_]\w*[\s*]+([A-Za-z_]\w*)\s*\([^)]*\)\s*\{/gm,
    /^(?:typedef\s+)?(?:struct|enum|union)\s+(\w+)/gm
  ],
  ex: [
    /^\s*def(?:module|p)?\s+([A-Za-z0-9_.]+)/gm
  ]
};

const EXT_LANG = {
  js: 'js', jsx: 'js', mjs: 'js', cjs: 'js', ts: 'js', tsx: 'js',
  py: 'py',
  go: 'go',
  rs: 'rs',
  java: 'jvm', kt: 'jvm', kts: 'jvm', cs: 'jvm',
  php: 'php',
  rb: 'rb',
  dart: 'dart',
  c: 'c', cpp: 'c', cc: 'c', h: 'c', hpp: 'c',
  ex: 'ex', exs: 'ex'
};

function listProjectFiles(root) {
  try {
    const stdout = execFileSync('git', ['ls-files'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 3000,
      maxBuffer: 32 * 1024 * 1024
    });
    const tracked = stdout.split(/\r?\n/).filter(Boolean).slice(0, MAX_FILES * 3);
    if (tracked.length > 0) return tracked;
  } catch {}

  const files = [];
  function walk(dir, depth = 0) {
    if (depth > 6 || files.length >= MAX_FILES * 3) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.name.startsWith('.')) continue;
        const full = path.join(dir, ent.name);
        const rel = path.relative(root, full).replace(/\\/g, '/');
        if (ent.isDirectory()) {
          if (!SKIP_DIR.test(rel + '/')) walk(full, depth + 1);
        } else if (ent.isFile()) {
          files.push(rel);
        }
      }
    } catch {}
  }
  walk(root, 0);
  return files;
}

function extractNames(filePath, content) {
  const ext = path.extname(filePath).slice(1).toLowerCase();
  const langKey = EXT_LANG[ext];
  if (!langKey || !PATTERNS[langKey]) return [];

  const names = [];
  const patterns = PATTERNS[langKey];
  for (const re of patterns) {
    re.lastIndex = 0;
    let match;
    while ((match = re.exec(content)) !== null) {
      const captured = match[1];
      if (!captured) continue;
      const parts = captured.split(',').map(s => {
        const cleaned = s.trim().replace(/^type\s+/, '').replace(/\s+as\s+.*$/, '');
        return cleaned.split(/\s+/)[0];
      }).filter(Boolean);
      for (const name of parts) {
        if (!name.startsWith('_') && !names.includes(name) && /^[A-Za-z0-9_$]+$/.test(name)) {
          names.push(name);
          if (names.length >= 15) break;
        }
      }
      if (names.length >= 25) break;
    }
  }
  return names;
}

function buildCodebaseMap(root = process.cwd(), budget = DEFAULT_BUDGET) {
  try {
    const rawFiles = listProjectFiles(root);
    const candidateFiles = rawFiles
      .filter(f => SRC_EXTS.test(f) && !SKIP_DIR.test(f) && !SKIP_FILE.test(f))
      .slice(0, MAX_FILES)
      .sort((a, b) => (SHARED_HINT.test(b) - SHARED_HINT.test(a)) || a.localeCompare(b));

    if (candidateFiles.length === 0) return '';

    const dirsMap = new Map();
    for (const relFile of candidateFiles) {
      const fullPath = path.join(root, relFile);
      let content = '';
      try {
        if (!fs.lstatSync(fullPath).isFile()) continue;
        content = fs.readFileSync(fullPath, 'utf8').slice(0, 48000);
      } catch {
        continue;
      }

      const names = extractNames(relFile, content);
      if (names.length === 0) continue;

      const dirName = path.dirname(relFile).replace(/\\/g, '/');
      const normalizedDir = dirName === '.' ? './' : `${dirName}/`;
      if (!dirsMap.has(normalizedDir)) {
        dirsMap.set(normalizedDir, []);
      }
      dirsMap.get(normalizedDir).push({ file: path.basename(relFile), names });
    }

    if (dirsMap.size === 0) return '';

    const lines = [];
    let currentLength = 0;
    let omittedFolders = 0;

    for (const [dir, fileEntries] of dirsMap) {
      const allNames = [];
      for (const entry of fileEntries) {
        const topNames = entry.names.slice(0, fileEntries.length > 5 ? 2 : 4);
        for (const n of topNames) {
          if (!allNames.includes(n)) allNames.push(n);
        }
      }

      if (allNames.length === 0) continue;

      const summary = allNames.slice(0, 20).join(', ') + (allNames.length > 20 ? ', ...' : '');
      const line = `  • ${dir}: ${summary}`;

      if (currentLength + line.length > budget) {
        omittedFolders++;
        continue;
      }

      lines.push(line);
      currentLength += line.length + 1;
    }

    if (lines.length === 0) return '';

    const header = `🗺️ [Codebase Map - Ponytail / Reuso Imediato]\n`;
    const footer = omittedFolders > 0 ? `\n  (...e mais ${omittedFolders} pastas omitidas do mapa)` : '';
    return header + lines.join('\n') + footer;
  } catch {
    return '';
  }
}

if (require.main === module) {
  const root = process.argv[2] || process.cwd();
  const mapText = buildCodebaseMap(root);
  if (mapText) process.stdout.write(mapText + '\n');
}

module.exports = { buildCodebaseMap, generateMap: buildCodebaseMap, extractNames };
