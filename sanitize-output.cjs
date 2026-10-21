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

function findProjectRootFrom(startPath) {
  let curr = path.dirname(startPath);
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, '.planning')) || fs.existsSync(path.join(curr, '.agents')) || fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    const up = path.dirname(curr);
    if (up === curr) break;
    curr = up;
  }
  return process.cwd();
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

  // Contabilizar economia de tokens gerada pelo truncamento Headroom
  try {
    const projectRoot = findProjectRootFrom(logFile);
    const savingsCandidates = [
      path.join(__dirname, 'lib', 'token-savings.cjs'),
      path.join(projectRoot, '.agents', 'lib', 'token-savings.cjs'),
      path.join(projectRoot, 'lib', 'token-savings.cjs')
    ];
    const savingsPath = savingsCandidates.find(p => fs.existsSync(p));
    if (savingsPath) {
      const TokenSavingsTracker = require(savingsPath);
      const tracker = new TokenSavingsTracker(projectRoot);
      tracker.recordSaving('output_sanitizer', Math.max(100, truncatedCount * 12));
    }
  } catch {}

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
      const out = execSync(execCmd, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024
      });
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
  const MAX_INPUT_BYTES = 16 * 1024 * 1024;
  let bytesReceived = 0;

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => {
    bytesReceived += Buffer.byteLength(chunk, 'utf8');
    if (bytesReceived <= MAX_INPUT_BYTES) {
      buffer += chunk;
    }
  });
  process.stdin.on('end', () => {
    if (bytesReceived > MAX_INPUT_BYTES) {
      buffer += `\n[... Truncado: fluxo de entrada excedeu ${MAX_INPUT_BYTES / (1024 * 1024)} MB ...]`;
    }
    process.stdout.write(sanitizeText(buffer) + '\n');
    process.exit(0);
  });
  process.stdin.on('error', err => {
    process.stderr.write(`[sanitize-output] Erro em stdin: ${err.message}\n`);
    process.exit(1);
  });
}

if (require.main === module) {
  main();
}

module.exports = { sanitizeText };
