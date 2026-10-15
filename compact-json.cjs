'use strict';

/**
 * Antigravity GSD Kit - JSON Stream Compact & Filter
 * Utilitário CLI para enxugar payloads JSON extensos antes de exibir no contexto.
 * Uso: cat data.json | node compact-json.cjs --pick field
 *      node compact-json.cjs data.json --keys "id,name,status" --limit 5
 */

const fs = require('fs');

function cleanObject(obj, maxDepth = 4, currentDepth = 0) {
  if (currentDepth >= maxDepth) return '[Truncated Depth]';
  if (obj === null || obj === undefined) return undefined;
  if (typeof obj !== 'object') return obj;

  if (Array.isArray(obj)) {
    return obj
      .map(item => cleanObject(item, maxDepth, currentDepth + 1))
      .filter(item => item !== undefined);
  }

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined || value === '') continue;
    const cleaned = cleanObject(value, maxDepth, currentDepth + 1);
    if (cleaned !== undefined) {
      result[key] = cleaned;
    }
  }
  return result;
}

function pickPath(obj, pathStr) {
  const parts = pathStr.split('.');
  let curr = obj;
  for (const p of parts) {
    if (curr === null || curr === undefined) return undefined;
    curr = curr[p];
  }
  return curr;
}

function processJson(rawText, options = {}) {
  let parsed;
  try {
    const sanitized = rawText.replace(/^\uFEFF/, '').trim();
    parsed = JSON.parse(sanitized);
  } catch (err) {
    return { error: 'JSON inválido: ' + err.message };
  }

  let result = parsed;

  if (options.pick) {
    result = pickPath(result, options.pick);
  }

  if (options.keys && typeof result === 'object' && result !== null && !Array.isArray(result)) {
    const allowed = options.keys.split(',').map(k => k.trim());
    const filtered = {};
    for (const k of allowed) {
      if (k in result) filtered[k] = result[k];
    }
    result = filtered;
  }

  if (options.limit && Array.isArray(result)) {
    const lim = parseInt(options.limit, 10);
    if (!isNaN(lim) && result.length > lim) {
      const remaining = result.length - lim;
      result = result.slice(0, lim);
      result.push(`... (+${remaining} itens omitidos para economia de tokens)`);
    }
  }

  if (options.clean) {
    result = cleanObject(result, options.depth ? parseInt(options.depth, 10) : 4);
  }

  return result;
}

function parseCliArgs() {
  const args = process.argv.slice(2);
  const options = { clean: true };
  let filePath = null;

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--pick' && args[i + 1]) {
      options.pick = args[++i];
    } else if (a === '--keys' && args[i + 1]) {
      options.keys = args[++i];
    } else if (a === '--depth' && args[i + 1]) {
      options.depth = args[++i];
    } else if (a === '--limit' && args[i + 1]) {
      options.limit = args[++i];
    } else if (a === '--no-clean') {
      options.clean = false;
    } else if (!a.startsWith('-') && !filePath) {
      filePath = a;
    }
  }

  return { filePath, options };
}

function main() {
  const { filePath, options } = parseCliArgs();

  if (filePath && fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    const out = processJson(content, options);
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (process.stdin.isTTY) {
    console.error('Uso: node compact-json.cjs <arquivo.json> [--pick <campo>] [--keys <k1,k2>] [--limit <n>]');
    process.exit(1);
  }

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { buffer += chunk; });
  process.stdin.on('end', () => {
    const out = processJson(buffer, options);
    console.log(JSON.stringify(out, null, 2));
  });
}

if (require.main === module) {
  main();
}

module.exports = { processJson, cleanObject };
