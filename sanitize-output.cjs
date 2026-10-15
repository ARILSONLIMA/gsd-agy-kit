'use strict';

/**
 * Antigravity GSD Kit - Output Sanitizer & Headroom Truncator
 * Trunca saídas de terminal extensas para prevenir poluição de tokens no contexto.
 * Salva a saída integral em log para auditoria e exibe head + tail compactados.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function resolveLogPath() {
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.project'))) {
      const debugDir = path.join(dir, '.project', 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      return path.join(debugDir, 'last-command-output.log');
    }
    if (fs.existsSync(path.join(dir, '.planning'))) {
      const debugDir = path.join(dir, '.planning', 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      return path.join(debugDir, 'last-command-output.log');
    }
    if (fs.existsSync(path.join(dir, '.agents'))) {
      const debugDir = path.join(dir, '.agents', 'debug');
      if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
      return path.join(debugDir, 'last-command-output.log');
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return path.join(process.cwd(), 'last-command-output.log');
}

function sanitizeText(text, maxLines = 50, headCount = 20, tailCount = 20) {
  const lines = text.split(/\r?\n/);
  if (lines.length <= maxLines) {
    return text;
  }

  const logFile = resolveLogPath();
  try {
    fs.writeFileSync(logFile, text, 'utf8');
  } catch {}

  const head = lines.slice(0, headCount);
  const tail = lines.slice(-tailCount);
  const truncatedCount = lines.length - headCount - tailCount;

  const banner = [
    '',
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ [TOKEN GUARD] Saída truncada para economizar contexto!`,
    `   ${truncatedCount} linhas intermediárias foram omitidas.`,
    `   Log integral preservado em: ${logFile}`,
    `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    ''
  ];

  return [...head, ...banner, ...tail].join('\n');
}

function main() {
  const args = process.argv.slice(2);
  let execCmd = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--exec' && args[i + 1]) {
      execCmd = args.slice(i + 1).join(' ');
      break;
    }
  }

  if (execCmd) {
    try {
      const out = execSync(execCmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
      process.stdout.write(sanitizeText(out) + '\n');
      process.exit(0);
    } catch (err) {
      const errOut = (err.stdout || '') + (err.stderr || '') || err.message;
      process.stderr.write(sanitizeText(errOut) + '\n');
      process.exit(err.status || 1);
    }
  }

  if (process.stdin.isTTY) {
    console.error('Uso: comando | node sanitize-output.cjs OU node sanitize-output.cjs --exec "<comando>"');
    process.exit(1);
  }

  let buffer = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { buffer += chunk; });
  process.stdin.on('end', () => {
    process.stdout.write(sanitizeText(buffer) + '\n');
  });
}

if (require.main === module) {
  main();
}

module.exports = { sanitizeText };
