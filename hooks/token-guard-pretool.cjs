'use strict';

/**
 * Token Guard - PreToolUse Hook
 * Hard gate that blocks wasteful token usage and enforces the Circuit Breaker:
 * 1. CIRCUIT BREAKER: Verifies ast-grep and graphify operational status before tool execution.
 * 2. Blocks view_file on code files (.go, .ts, etc.) without surgical StartLine/EndLine.
 * 3. Blocks reading ranges greater than 100 lines on code files.
 * 4. Blocks raw terminal dumps (cat/Get-Content) of source code files.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

function resolveProjectRoot() {
  const hooksParent = path.resolve(__dirname, '..');
  if (path.basename(hooksParent) === '.agents') return path.dirname(hooksParent);
  let dir = process.cwd();
  for (;;) {
    if (path.basename(dir) === '.agents') return path.dirname(dir);
    if (fs.existsSync(path.join(dir, '.agents'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
}
const PROJECT_ROOT = resolveProjectRoot();

const CACHE_DIR = path.join(PROJECT_ROOT, '.agents', '.cache');
try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

const HEALTH_CACHE_FILE = path.join(CACHE_DIR, 'health-cache.json');
const HEALTH_CACHE_LEGACY = path.join(PROJECT_ROOT, '.agents', '.health-cache');
const HEALTH_CACHE_TTL_MS = 300000;
const JIT_PROMOTIONS_FILE = path.join(CACHE_DIR, 'jit-promotions.json');
const JIT_PROMOTIONS_LEGACY = path.join(PROJECT_ROOT, '.agents', '.jit-promotions.json');

function writeJsonAtomic(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
  } catch {}
}

function findLibModule(name) {
  const candidates = [
    path.resolve(__dirname, '..', 'lib', name),
    path.resolve(__dirname, '..', 'kit', 'lib', name),
    path.join(PROJECT_ROOT, '.agents', 'lib', name),
    path.join(PROJECT_ROOT, 'lib', name)
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function verifyToolsHealth() {
  const now = Date.now();
  try {
    const cacheFile = fs.existsSync(HEALTH_CACHE_FILE) ? HEALTH_CACHE_FILE : (fs.existsSync(HEALTH_CACHE_LEGACY) ? HEALTH_CACHE_LEGACY : null);
    if (cacheFile) {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      if (now - data.timestamp < HEALTH_CACHE_TTL_MS && data.health) {
        return data.health;
      }
    }
  } catch {}

  let health;
  try {
    try {
      execSync('ast-grep --version', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, encoding: 'utf8' });
    } catch {
      execSync('npx -y --package @ast-grep/cli ast-grep --version', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, encoding: 'utf8' });
    }

    let warnings = [];
    try {
      execSync('graphify --version', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, encoding: 'utf8' });
    } catch {
      warnings.push('graphify não encontrado no PATH');
    }

    const lspPath = findLibModule('lsp-engine.cjs');
    if (lspPath) {
      const LspEngine = require(lspPath);
      const lsp = new LspEngine(PROJECT_ROOT);
      const stackHealth = lsp.checkStackHealth(PROJECT_ROOT);
      if (!stackHealth.ok) {
        warnings.push(`LSP: ${stackHealth.error}`);
      }
    } else if (fs.existsSync(path.join(PROJECT_ROOT, 'go.mod'))) {
      try {
        execSync('gopls version', { stdio: ['ignore', 'pipe', 'pipe'], timeout: 5000, encoding: 'utf8' });
      } catch {
        warnings.push('gopls não encontrado no PATH');
      }
    }
    health = { ok: true, warnings: warnings.length > 0 ? warnings : null };
  } catch (err) {
    const errDetail = (err.stderr ? err.stderr.toString().trim() : '') || err.message;
    health = { ok: false, error: errDetail };
  }

  writeJsonAtomic(HEALTH_CACHE_FILE, { timestamp: now, health });

  return health;
}

function getKitMode() {
  if (process.env.GSD_KIT_MODE) {
    return process.env.GSD_KIT_MODE.toLowerCase().trim();
  }
  const configPaths = [
    path.join(PROJECT_ROOT, '.planning', 'config.json'),
    path.join(PROJECT_ROOT, '.agents', 'config.json')
  ];
  for (const cfgPath of configPaths) {
    if (fs.existsSync(cfgPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (data.kit_mode) return data.kit_mode.toLowerCase().trim();
        if (data.mode) return data.mode.toLowerCase().trim();
      } catch {}
    }
  }
  return 'smart-assist';
}

function sanitizePath(rawPath) {
  if (typeof rawPath !== 'string') return '';
  let p = rawPath.trim();
  if (/^file:\/\/\/?/i.test(p)) {
    p = p.replace(/^file:\/\/\/?/i, '');
    if (process.platform === 'win32' && /^\/[A-Za-z]:/i.test(p)) {
      p = p.slice(1);
    }
  }
  if (p === '~' || p.startsWith('~/') || p.startsWith('~\\')) {
    p = path.join(os.homedir(), p.slice(1));
  }
  return p;
}

function findCaseInsensitiveFile(dir, fileName) {
  if (!fs.existsSync(dir)) return null;
  const exact = path.join(dir, fileName);
  if (fs.existsSync(exact)) return exact;
  const targetLower = fileName.toLowerCase();
  try {
    const entries = fs.readdirSync(dir);
    const match = entries.find(e => e.toLowerCase() === targetLower);
    return match ? path.join(dir, match) : null;
  } catch {
    return null;
  }
}

function recordJitPromotion(type, name, customTtl) {
  try {
    let data = { skills: {}, agents: {} };
    const promoFile = fs.existsSync(JIT_PROMOTIONS_FILE) ? JIT_PROMOTIONS_FILE : (fs.existsSync(JIT_PROMOTIONS_LEGACY) ? JIT_PROMOTIONS_LEGACY : null);
    if (promoFile) {
      try { data = JSON.parse(fs.readFileSync(promoFile, 'utf8')); } catch {}
    }
    if (!data[type]) data[type] = {};
    // Sustentabilidade de execução: 5 turnos para skills (com auto-renovação), 1 turno para subagentes pontuais
    const defaultTtl = type === 'skills' ? 5 : 1;
    const ttl = typeof customTtl === 'number' ? customTtl : defaultTtl;
    data[type][name] = { promotedAt: Date.now(), turnsRemaining: ttl };
    writeJsonAtomic(JIT_PROMOTIONS_FILE, data);
  } catch {}
}

function readStdin(maxWaitMs = 800) {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    let settled = false;

    const cleanup = () => {
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.removeListener('error', onError);
      try { process.stdin.pause(); } catch {}
    };

    const done = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(globalTimer);
      cleanup();
      resolve(result);
    };

    const globalTimer = setTimeout(() => done(data), maxWaitMs);

    const onData = chunk => {
      data += chunk;
      const trimmed = data.trim();
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        try {
          JSON.parse(trimmed);
          done(trimmed);
        } catch {}
      }
    };
    const onEnd = () => done(data);
    const onError = () => done('');

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
    process.stdin.on('error', onError);

    try {
      process.stdin.resume();
    } catch {
      done('');
    }
  });
}

function copyFolderRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

let currentToolName = '';
let currentArgs = {};

function respond(decision, reason, overwrite) {
  if (decision === 'deny' && reason) {
    try {
      const incidentsFile = path.join(CACHE_DIR, 'session-incidents.json');
      let incidents = [];
      if (fs.existsSync(incidentsFile)) {
        try { incidents = JSON.parse(fs.readFileSync(incidentsFile, 'utf8')); } catch {}
      }
      const shouldRedactArgs = /SANDBOX SHIELD|SECRET SHIELD/i.test(reason);
      incidents.push({
        type: 'hard_gate_block',
        tool: currentToolName || 'circuit_breaker',
        reason: reason.split('\n')[0],
        args: shouldRedactArgs ? { redacted: true } : (currentArgs || {}),
        timestamp: Date.now()
      });
      writeJsonAtomic(incidentsFile, incidents.slice(-50));
    } catch {}
  }

  const res = { decision };
  if (reason) res.reason = reason;
  if (overwrite && typeof overwrite === 'object' && Object.keys(overwrite).length > 0) {
    res.overwrite = overwrite;
  }
  
  const payload = JSON.stringify(res) + '\n';
  const flushed = process.stdout.write(payload, () => {
    process.exit(0);
  });
  if (!flushed) {
    process.stdout.once('drain', () => process.exit(0));
  }
  setTimeout(() => process.exit(0), 500).unref();
}

async function main() {
  // 0. Circuit Breaker check
  const health = verifyToolsHealth();
  if (!health.ok) {
    const egMod = findLibModule('error-guard.cjs');
    if (egMod) {
      try {
        const ErrorGuard = require(egMod);
        ErrorGuard.emitError(PROJECT_ROOT, {
          category: 'LSP',
          component: 'circuit-breaker',
          title: 'Circuit Breaker Acionado: Ferramenta essencial ou LSP inoperante',
          stderr: health.error || '',
          hint: 'Instale ast-grep/graphify ou o compilador/LSP correspondente à stack do projeto.',
          severity: 'error'
        });
      } catch {}
    }
    return respond(
      'deny',
      '🛑 CIRCUIT BREAKER ACIONADO (HARD STOP):\n' +
      'Uma das ferramentas obrigatórias (ast-grep, graphify ou LSP da stack do projeto) não respondeu ou falhou no teste de execução.\n' +
      'Conforme a Regra 5 do Projeto e o Modo Rigoroso de Erros, todas as ações estão INTERROMPIDAS imediatamente até que as ferramentas estejam operacionais.\n' +
      `Detalhes do erro: ${health.error}`
    );
  }

  const stdinData = (await readStdin(400)).trim();
  if (!stdinData) {
    return respond('allow');
  }

  let payload;
  try {
    payload = JSON.parse(stdinData);
  } catch {
    return respond('allow');
  }

  const toolCall = payload.toolCall || {};
  const toolName = (toolCall.name || payload.tool_name || '').toLowerCase();
  const args = toolCall.args || payload.tool_input || {};
  currentToolName = toolName;
  currentArgs = args;

function recordTokenSaving(category, estimatedTokens = 500) {
  try {
    const candidates = [
      path.resolve(__dirname, '..', 'lib', 'token-savings.cjs'),
      path.resolve(__dirname, '..', 'kit', 'lib', 'token-savings.cjs'),
      path.join(PROJECT_ROOT, '.agents', 'lib', 'token-savings.cjs'),
      path.join(PROJECT_ROOT, 'lib', 'token-savings.cjs')
    ];
    const modPath = candidates.find(p => fs.existsSync(p));
    if (modPath) {
      const TokenSavingsTracker = require(modPath);
      const tracker = new TokenSavingsTracker(PROJECT_ROOT);
      tracker.recordSaving(category, estimatedTokens);
    }
  } catch {}
}

  // 1. Gate for view_file / read_file
  if (toolName === 'view_file' || toolName === 'read_file') {
    const rawTarget = sanitizePath(args.Path || args.AbsolutePath || args.TargetFile || args.path || args.file_path || '');
    const target = rawTarget.replace(/\\/g, '/');

    // STATE.md Blocker
    if (target.endsWith('.planning/STATE.md') || target.endsWith('.planning\\STATE.md')) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE PROTEÇÃO DE TOKENS: A leitura bruta do STATE.md gasta milhares de tokens inúteis em formatação de tabelas Markdown.\n' +
        'Utilize o arquivo estruturado pré-compilado: leia .planning/state_summary.json ou execute "node gsd-state-summary.cjs" para obter o resumo cirúrgico.'
      );
    }

    // Secret Shield Gate (.env* reais bloqueados; .env.example/.sample/.template permitidos)
    const baseTargetName = path.basename(target);
    if (/^\.env(?:\.(?!example$|sample$|template$)[a-zA-Z0-9_-]+)?$/i.test(baseTargetName)) {
      recordTokenSaving('secret_shield', 400);
      return respond(
        'deny',
        '🛑 SECRET SHIELD (PROTEÇÃO DE SEGREDOS E TOKENS): É proibido ler arquivos .env diretamente com view_file/read_file para evitar exposição de credenciais no contexto!\n' +
        'Utilize a ferramenta MCP "env_skeleton" para inspecionar variáveis de ambiente de forma segura.'
      );
    }

    // Sandbox Shield Gate (Bloqueia vazamento/contaminação de scenario.json, cold_start, holdout e internos de .agents/)
    const holdoutDirSeg = ['.gsd', 'bench', 'holdout'].join('-');
    const hiddenPrefixSeg = ['__hid', 'den_'].join('');
    const holdoutPathRe = new RegExp(`(?:^|[\\\\/])(?:scenario\\.json|${holdoutDirSeg.replace(/\./g, '\\.')}|\\.benchmark_cold_start\\.json|holdout(?:\\/.*)?|${hiddenPrefixSeg}[a-zA-Z0-9_-]+)`, 'i');
    const isHoldoutPath = holdoutPathRe.test(target) ||
      target.toLowerCase().includes(holdoutDirSeg) ||
      target.endsWith('/scenario.json') || target === 'scenario.json' ||
      target.endsWith('.benchmark_cold_start.json');
    if (isHoldoutPath) {
      recordTokenSaving('sandbox_shield', 500);
      return respond(
        'deny',
        '🛑 SANDBOX SHIELD (ZERO-LEAKAGE): O acesso direto a arquivos de orquestração interna, benchmarks e suítes de teste ocultas é estritamente proibido.\n' +
        'Concentre a análise exclusivamente nos arquivos locais do projeto (TASK.md, src/, docs/, tests/).'
      );
    }

    // Proteção contra inspeção desnecessária dos motores internos e suítes de autoteste do próprio Kit
    const isInternalKitEngine = /(?:^|[\\/])(?:\.agents[\\/](?:lib|hooks|kit)[\\/]|scripts[\\/]test-kit\.(?:sh|ps1)$)/i.test(target);
    if (isInternalKitEngine) {
      recordTokenSaving('sandbox_shield', 350);
      return respond(
        'deny',
        '🛑 ECONOMIA DE TOKENS: Não inspecione o código interno dos linters/hooks em .agents/lib ou .agents/hooks.\n' +
        'Atue diretamente na refatoração do código da aplicação (src/) seguindo a mensagem de diagnóstico recebida.'
      );
    }

    // 1.1 JIT Auto-Promoter para Skills: Se view_file/read_file acessar uma skill no pool ou skills
    const skillMatch = target.match(/\.agents\/(skills|skills-pool|skills-archive)\/([a-zA-Z0-9_-]+)/i);
    let modifiedArgs = null;
    if (skillMatch) {
      const folderType = skillMatch[1];
      const skillName = path.basename(skillMatch[2]);
      const projectRoot = PROJECT_ROOT;
      const activeSkillDir = path.join(projectRoot, '.agents', 'skills', skillName);
      const poolSkillDir = path.join(projectRoot, '.agents', 'skills-pool', skillName);
      const archiveSkillDir = path.join(projectRoot, '.agents', 'skills-archive', skillName);

      if (!fs.existsSync(activeSkillDir)) {
        if (fs.existsSync(poolSkillDir)) {
          try { copyFolderRecursive(poolSkillDir, activeSkillDir); } catch {}
          recordJitPromotion('skills', skillName, 5);
        } else if (fs.existsSync(archiveSkillDir)) {
          try { copyFolderRecursive(archiveSkillDir, activeSkillDir); } catch {}
          recordJitPromotion('skills', skillName, 5);
        }
      } else {
        // Renova o TTL por mais 5 turnos a cada acesso subsequente
        recordJitPromotion('skills', skillName, 5);
      }

      if (folderType === 'skills-pool' || folderType === 'skills-archive') {
        const redirected = target.replace(`/.agents/${folderType}/`, '/.agents/skills/');
        if (args.Path) {
          modifiedArgs = { Path: path.normalize(redirected) };
        } else {
          modifiedArgs = { AbsolutePath: path.normalize(redirected) };
        }
      }
    }

    const isCodeFile = /\.(go|ts|tsx|js|jsx|cjs|mjs|py|java|c|cpp|cc|cxx|h|hpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|sql|dart|lua|sh|bash|ex|exs|tf)$/i.test(target);

    // If it's a documentation/config file or planning artifact, allow directly
    if (!isCodeFile) {
      return respond('allow', null, modifiedArgs);
    }

    let startLine = parseInt(args.StartLine, 10);
    let endLine = parseInt(args.EndLine, 10);

    // Contagem lazy de linhas no disco (apenas quando necessária)
    let cachedTotalLines = null;
    const getFileTotalLines = () => {
      if (cachedTotalLines !== null) return cachedTotalLines;
      cachedTotalLines = 0;
      try {
        const resolved = path.resolve(rawTarget);
        if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
          const content = fs.readFileSync(resolved, 'utf8');
          cachedTotalLines = content.split('\n').length;
        }
      } catch {}
      return cachedTotalLines;
    };

    // Dicas específicas por stack de linguagem
    const ext = path.extname(target).toLowerCase();
    const lspCmd = "node .agents/mcp-server.cjs lsp <definition|references|hover|diagnostics>";
    let langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>'`;
    if (ext === '.go') {
      langToolHint = `Use gopls / ${lspCmd} ou ast-grep run -p '<padrão>' --lang go`;
    } else if (['.js', '.jsx', '.cjs', '.mjs'].includes(ext)) {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang js`;
    } else if (['.ts', '.tsx'].includes(ext)) {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang ts`;
    } else if (ext === '.py') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang py`;
    } else if (ext === '.rs') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang rust`;
    } else if (ext === '.php') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang php`;
    } else if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang cpp`;
    } else if (ext === '.java') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang java`;
    } else if (ext === '.cs') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang cs`;
    } else if (ext === '.rb') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang rb`;
    } else if (ext === '.dart') {
      langToolHint = `Use ${lspCmd} ou ast-grep run -p '<padrão>' --lang dart`;
    }

    const outlineScriptPath = fs.existsSync(path.join(PROJECT_ROOT, '.agents', 'kit', 'gsd-outline.cjs'))
      ? 'node .agents/kit/gsd-outline.cjs'
      : (fs.existsSync(path.join(PROJECT_ROOT, 'gsd-outline.cjs'))
          ? 'node gsd-outline.cjs'
          : 'node .agents/kit/gsd-outline.cjs');

    const kitMode = getKitMode();

    // 1.1 Se linhas não foram especificadas:
    if (isNaN(startLine) || isNaN(endLine)) {
      if (kitMode === 'permissive') {
        return respond('allow', null, modifiedArgs);
      }

      const fileTotalLines = getFileTotalLines();

      const setLineRangeArgs = (base, s, e) => {
        const out = Object.assign({}, base || {});
        out.StartLine = s;
        out.EndLine = e;
        if (args.Path && !out.Path) out.Path = args.Path;
        return out;
      };

      // Auto-injeção transparente para arquivos pequenos (<= 100 linhas no disco)
      if (fileTotalLines > 0 && fileTotalLines <= 100) {
        startLine = isNaN(startLine) ? 1 : Math.max(1, startLine);
        endLine = isNaN(endLine) ? fileTotalLines : Math.min(fileTotalLines, endLine);
        modifiedArgs = setLineRangeArgs(modifiedArgs, startLine, endLine);
      } else if (kitMode === 'smart-assist' && fileTotalLines > 0) {
        // Smart-Assist Auto-Slicing: Em vez de fail/deny, aplica overwrite cirúrgico de 100 linhas
        startLine = isNaN(startLine) ? 1 : Math.max(1, startLine);
        endLine = Math.min(fileTotalLines, startLine + 99);
        modifiedArgs = setLineRangeArgs(modifiedArgs, startLine, endLine);
        recordTokenSaving('auto_slice', Math.max(200, (fileTotalLines - (endLine - startLine + 1)) * 10));
      } else {
        return respond(
          'deny',
          '🛑 BLOQUEIO DE PROTEÇÃO DE TOKENS: É proibido ler arquivos de código (.go, .ts, .js, etc.) inteiros com read_file / view_file!\n' +
          'Ordem obrigatória:\n' +
          '1) Para código > 100 linhas sem comentários/docstrings (com linhas 1-based): node .agents/mcp-server.cjs strip "<arquivo>" (gsd_read_strip).\n' +
          '2) Para mapear classes, métodos, rotas e exports: node .agents/mcp-server.cjs skeleton "<arquivo>" (view_skeleton).\n' +
          `3) ${langToolHint} para localizar símbolos específicos.\n` +
          '4) Para read_file/view_file, informe StartLine e EndLine cirúrgicos (máximo de 100 linhas).'
        );
      }
    }

    const range = endLine - startLine + 1;
    if (range > 100) {
      if (kitMode === 'permissive') {
        return respond('allow', null, modifiedArgs);
      }

      const fileTotalLines = getFileTotalLines();
      if (kitMode === 'smart-assist' && fileTotalLines > 0) {
        // Smart-Assist: Auto-slicing suave cortando para teto de 100 linhas
        endLine = Math.min(fileTotalLines, startLine + 99);
        const setLineRangeArgs = (base, s, e) => {
          const out = Object.assign({}, base || {});
          out.StartLine = s;
          out.EndLine = e;
          if (args.Path && !out.Path) out.Path = args.Path;
          return out;
        };
        modifiedArgs = setLineRangeArgs(modifiedArgs, startLine, endLine);
        recordTokenSaving('auto_slice', Math.max(200, (range - 100) * 10));
      } else {
        return respond(
          'deny',
          `🛑 BLOQUEIO DE PROTEÇÃO DE TOKENS: O intervalo de ${range} linhas excede o limite permitido (máximo 100 linhas para arquivos de código). ` +
          `Utilize node .agents/mcp-server.cjs strip "<arquivo>" [ini] [fim] (gsd_read_strip), ${outlineScriptPath} <arquivo>, ou ${langToolHint} para reduzir o range.`
        );
      }
    }

    // 1.2 Deduplicação de Leituras Recentes em arquivos de código
    const RECENT_READS_FILE = path.join(CACHE_DIR, 'recent-reads.json');
    const RECENT_READS_LEGACY = path.join(PROJECT_ROOT, '.agents', '.recent-reads.json');
    try {
      const resolvedPath = path.isAbsolute(rawTarget)
        ? path.normalize(rawTarget)
        : path.resolve(PROJECT_ROOT, rawTarget);
      let fileMtime = 0;
      try { fileMtime = fs.statSync(resolvedPath).mtimeMs; } catch {}

      if (fileMtime > 0) {
        let recentReads = [];
        const readsFile = fs.existsSync(RECENT_READS_FILE) ? RECENT_READS_FILE : (fs.existsSync(RECENT_READS_LEGACY) ? RECENT_READS_LEGACY : null);
        if (readsFile) {
          try { recentReads = JSON.parse(fs.readFileSync(readsFile, 'utf8')); } catch {}
        }

        const now = Date.now();
        recentReads = recentReads.filter(r => r && (now - r.timestamp) < 180000);

        const coveringRead = recentReads.find(r =>
          r.target === resolvedPath &&
          r.mtime === fileMtime &&
          r.startLine <= startLine &&
          r.endLine >= endLine &&
          (now - r.timestamp) < 180000
        );
        if (coveringRead) {
          recordTokenSaving('dedup_block', Math.max(150, (endLine - startLine + 1) * 10));
          return respond(
            'deny',
            `ℹ️ DEDUPLICAÇÃO DE LEITURAS (ECONOMIA DE TOKENS):\n` +
            `O trecho de ${path.basename(rawTarget)} (linhas ${startLine}-${endLine}) já está presente no contexto (coberto pela leitura recente das linhas ${coveringRead.startLine}-${coveringRead.endLine}) e o arquivo não sofreu alterações no disco.\n` +
            `Consulte o histórico da conversa para evitar releituras redundantes.`
          );
        }

        recentReads.push({
          target: resolvedPath,
          startLine,
          endLine,
          mtime: fileMtime,
          timestamp: now
        });
        if (recentReads.length > 15) recentReads = recentReads.slice(-15);
        writeJsonAtomic(RECENT_READS_FILE, recentReads);
      }
    } catch {}

    return respond('allow', null, modifiedArgs);
  }

  // 2. Gate for run_command dumping code or verbose logs or mass rewrites
  if (toolName === 'run_command' || toolName === 'bash' || toolName === 'shell') {
    const cmd = typeof args.CommandLine === 'string' ? args.CommandLine : (typeof args.command === 'string' ? args.command : '');

    // 2.0 Secret Shield Gate para despejo de .env no terminal
    const isEnvDump = /(?:^|[;&|(]\s*|&&\s*)(cat|type|Get-Content|gc|head|tail|less|more|bat|nl)\s+[^\n|><]*?(?:^|[\\/\s"'])\.env(?:\.(?!example\b|sample\b|template\b)[a-zA-Z0-9_-]+)?(?:\s|$|["'|><;&])/i.test(cmd);
    if (isEnvDump) {
      recordTokenSaving('secret_shield', 400);
      return respond(
        'deny',
        '🛑 SECRET SHIELD (PROTEÇÃO DE SEGREDOS): Não despeje arquivos .env no console com cat/type/Get-Content/head!\n' +
        'Utilize a lente segura que mascara valores sensíveis: node .agents/mcp-server.cjs env (ou tool MCP env_skeleton).'
      );
    }

    // 2.0.1 Sandbox Shield Gate para comandos direcionados a holdout, cold_start ou scenario.json
    const holdoutDirSeg = ['.gsd', 'bench', 'holdout'].join('-');
    const hiddenPrefixSeg = ['__hid', 'den_'].join('');
    const holdoutCmdRe = new RegExp(`(?:^|\\s|[\\\\/"'])(${holdoutDirSeg.replace(/\./g, '\\.')}|\\.benchmark_cold_start\\.json|holdout(?:\\/.*)?|scenario\\.json|${hiddenPrefixSeg}[a-zA-Z0-9_-]+)(?:$|\\s|[\\\\/"'])`, 'i');
    const isHoldoutOrScenario = holdoutCmdRe.test(cmd);
    if (isHoldoutOrScenario) {
      recordTokenSaving('sandbox_shield', 500);
      return respond(
        'deny',
        '🛑 SANDBOX SHIELD (ZERO-LEAKAGE): Comandos direcionados a arquivos de orquestração interna de benchmark ou suítes ocultas são estritamente proibidos!\n' +
        'Concentre o trabalho apenas nos testes unitários e arquivos locais do projeto (ex: npm test).'
      );
    }

    const isRawCodeDump = /(?:^|[;&|(]\s*|&&\s*)(cat|type|Get-Content|gc|head|tail|less|more|bat|nl)\s+[^\n|><]+\.(go|ts|tsx|js|jsx|cjs|mjs|py|java|c|cpp|cc|cxx|h|hpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|sql|dart|lua|sh|bash|ex|exs|tf)\b/i.test(cmd);

    if (isRawCodeDump) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE TOKENS: Não despeje código bruto no console com cat/type/Get-Content/head!\n' +
        'Utilize:\n' +
        '- graphify query "<pergunta>" para arquitetura e relações.\n' +
        '- Multi-LSP Híbrido: node .agents/mcp-server.cjs lsp <definition|references|hover|symbols|diagnostics> (ou tools MCP lsp_*).\n' +
        '- ast-grep run -p \'<padrão>\' para busca sintática.'
      );
    }

    // 2.1 Gate para logs prolixos de testes
    const isVerboseTest = /\bgo\s+test\b.*(-v\b|--verbose\b)/i.test(cmd);
    if (isVerboseTest) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE TOKENS EM TESTES: O uso da flag -v em testes Go despeja centenas de linhas de logs no contexto!\n' +
        'Utilize:\n' +
        '- go test ./... (sem -v, exibe apenas sumário conciso e falhas)\n' +
        '- pwsh scripts/test-sanitized.ps1 (sanitizador otimizado com filtro de stack trace)\n' +
        '- Se precisar rodar um único teste pontual: go test -run NomeDoTeste ./pacote'
      );
    }

    // 2.2 Gate para reescrita em massa com ast-grep
    const isAstGrepMassRewrite = /\b(ast-grep|sg)\b.*(-r|--rewrite)\b.*(-u|--update)\b/i.test(cmd);
    if (isAstGrepMassRewrite) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE REESCRITA EM MASSA: ast-grep não deve ser usado com -r/--rewrite e -u para reescrever arquivos em lote!\n' +
        'Regra do Projeto: ast-grep é restrito a busca sintática e localização (ast-grep run -p).\n' +
        'Para aplicar modificações no código, utilize sempre diffs cirúrgicos via replace_file_content.'
      );
    }

    // 2.3 Gate PowerShell / ast-grep: aspas duplas com $ no argumento -p/--pattern (expansão indevida no PowerShell).
    // Só dispara para invocação real (ast-grep|sg seguido de run/scan/-p), nunca por mera menção ao nome.
    const isAstGrepCmd = /(?:^|[;&|(]\s*|&&\s*)(?:\S*[\\/])?(?:ast-grep|sg)(?:\.cmd|\.exe)?\s+(?:run|scan|-p\b|--pattern\b)/i.test(cmd);
    if (isAstGrepCmd) {
      const hasDoubleQuotedDollar = /(?:-p|--pattern)(?:\s+|=)"[^"\r\n]*\$[^"\r\n]*"/i.test(cmd);
      const hasEscapedDoubleQuotedDollar = /(?:-p|--pattern)(?:\s+|=)\\"[^"\r\n]*\$[^"\r\n]*\\"/i.test(cmd);
      if (hasDoubleQuotedDollar || hasEscapedDoubleQuotedDollar) {
        return respond(
          'deny',
          '🛑 BLOQUEIO POWERSHELL / AST-GREP: Aspas duplas ("...") com variáveis ($) detectadas no comando ast-grep!\n' +
          'No PowerShell (pwsh), aspas duplas expandem prematuramente variáveis e metavariáveis (ex: $NAME, $$$, $PKG), corrompendo a consulta sintática antes de chegar ao ast-grep.\n' +
          'Regra do Projeto: Utilize OBRIGATORIAMENTE aspas simples (\'...\') para os padrões do ast-grep.\n' +
          'Exemplo correto: ast-grep run -p \'type $NAME struct { $$$ }\' --lang go'
        );
      }
    }

    // 2.4 Auto-Limitador de comandos prolixos para economizar tokens
    let modifiedArgs = null;
    let sanitizedCmd = cmd;
    let sanitizedCwd = args.Cwd;
    let cmdChanged = false;
    let limiterApplied = false;

    if (/(?:^|[;&|(]\s*|&&\s*)git\s+log\b/i.test(sanitizedCmd) && !/(-n\b|--max-count\b|-\d)/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(^|[;&|(]\s*|&&\s*)git\s+log\b/i, '$1git log -n 20');
      cmdChanged = true;
      limiterApplied = true;
    }
    if (/(?:^|[;&|(]\s*|&&\s*)docker(?:\s+compose)?\s+logs\b/i.test(sanitizedCmd) && !/(--tail\b|-n\b)/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/((?:^|[;&|(]\s*|&&\s*)docker(?:\s+compose)?\s+logs\b)/i, '$1 --tail 100');
      cmdChanged = true;
      limiterApplied = true;
    }
    // Auto-limitar varreduras recursivas em PowerShell sem profundidade (Get-ChildItem -Recurse sem -Depth)
    if (/(\b(?:Get-ChildItem|gci)\b[^|;\r\n]*?-Recurse\b)(?![^|;\r\n]*?-Depth\b)/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(\b(?:Get-ChildItem|gci)\b[^|;\r\n]*?-Recurse\b)(?![^|;\r\n]*?-Depth\b)/i, '$1 -Depth 3');
      cmdChanged = true;
      limiterApplied = true;
    }
    // Auto-limitar find . sem -maxdepth
    if (/\bfind\s+(?:\.|\.\/)\s+/i.test(sanitizedCmd) && !/-maxdepth\b/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(\bfind\s+(?:\.|\.\/)\s+)/i, '$1-maxdepth 3 ');
      cmdChanged = true;
      limiterApplied = true;
    }
    // Auto-limitar listagem prolixa de npm / pnpm
    if (/\b(?:npm|pnpm)\s+list\b/i.test(sanitizedCmd) && !/--depth\b/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(\b(?:npm|pnpm)\s+list\b)/i, '$1 --depth=0');
      cmdChanged = true;
      limiterApplied = true;
    }

    if (limiterApplied) {
      recordTokenSaving('command_limiter', 600);
    }

    // 2.4.1 Auto-Isolamento Proativo de Testes (TestIsolate via res.overwrite em modo smart-assist)
    if (!cmdChanged && getKitMode() === 'smart-assist') {
      try {
        const tiCandidates = [
          path.resolve(__dirname, '..', 'lib', 'test-isolate.cjs'),
          path.resolve(__dirname, '..', 'kit', 'lib', 'test-isolate.cjs'),
          path.join(PROJECT_ROOT, '.agents', 'lib', 'test-isolate.cjs'),
          path.join(PROJECT_ROOT, 'lib', 'test-isolate.cjs')
        ];
        const tiPath = tiCandidates.find(p => fs.existsSync(p));
        if (tiPath) {
          const TestIsolate = require(tiPath);
          const ti = new TestIsolate(PROJECT_ROOT);
          const isolatedCmd = ti.getProactiveOverwrite(sanitizedCmd);
          if (isolatedCmd) {
            sanitizedCmd = isolatedCmd;
            cmdChanged = true;
            recordTokenSaving('test_isolate', 1500);
          }
        }
      } catch {}
    }

    // 2.5 Normalização de caminhos Windows com barras invertidas (PowerShell / Windows)
    if (process.platform === 'win32' || /(?:^|[\s"'=])([A-Za-z]):\/[^\s"']*/.test(sanitizedCmd) || /\.ps1\b/i.test(sanitizedCmd)) {
      // Normaliza letras de drive Windows com barras normais para barras invertidas (ex: D:/caminho -> D:\caminho)
      // Preserva estritamente esquemas de protocolo de rede (http://, https://, ftp://)
      if (/(?:^|[\s"'=])([A-Za-z]):\/[^\s"']*/.test(sanitizedCmd)) {
        sanitizedCmd = sanitizedCmd.replace(/(^|[\s"'=])([A-Za-z]):\/([^\s"']*)/g, (match, prefix, drive, rest) => {
          return `${prefix}${drive}:\\${rest.replace(/\//g, '\\')}`;
        });
        cmdChanged = true;
      }

      // Normaliza separadores de scripts PowerShell locais (ex: scripts/script.ps1 -> scripts\script.ps1)
      // Preserva rigorosamente URLs remotas (ex: https://site.com/script.ps1)
      if (/(?:^|\s|\.|\/|[a-zA-Z0-9_-]+)\/(?:[a-zA-Z0-9_-]+\.ps1)\b/i.test(sanitizedCmd)) {
        sanitizedCmd = sanitizedCmd.replace(/(^|[\s"'=])([a-zA-Z0-9_\-\.\/]+)\.ps1/gi, (match, prefix, scriptPath) => {
          if (/^https?:\/\/|^ftp:\/\//i.test(scriptPath) || /https?:\/\/|ftp:\/\//i.test(match)) {
            return match;
          }
          return `${prefix}${scriptPath.replace(/\//g, '\\')}.ps1`;
        });
        cmdChanged = true;
      }

      let cwdChanged = false;
      if (sanitizedCwd && typeof sanitizedCwd === 'string' && sanitizedCwd.includes('/')) {
        const normalizedCwd = path.normalize(sanitizedCwd);
        if (normalizedCwd !== sanitizedCwd) {
          sanitizedCwd = normalizedCwd;
          cwdChanged = true;
        }
      }

      if (cmdChanged || cwdChanged) {
        modifiedArgs = {};
        if (cmdChanged) modifiedArgs.CommandLine = sanitizedCmd;
        if (cwdChanged) modifiedArgs.Cwd = sanitizedCwd;
      }
    } else if (cmdChanged) {
      modifiedArgs = { CommandLine: sanitizedCmd };
    }

    return respond('allow', null, modifiedArgs);
  }

  // 3. Gate for write_to_file / Write / write_file (garantir diffs cirúrgicos em vez de sobrescrita integral de código)
  if (toolName === 'write_to_file' || toolName === 'write' || toolName === 'write_file') {
    const rawTarget = sanitizePath(args.Path || args.TargetFile || args.path || args.file_path || args.filePath || args.AbsolutePath || '');
    const target = path.resolve(rawTarget);
    const isCodeFile = /\.(go|ts|tsx|js|jsx|cjs|mjs|py|java|c|cpp|cc|cxx|h|hpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|sql|dart|lua|sh|bash|ex|exs|tf)$/i.test(target);
    const isScratchOrTemp = /[\\/](\.cache|\.agents[\\/](scratch|temp|tmp)|brain[\\/][^\\/]+[\\/]scratch)[\\/]/i.test(target) || /[\\/]scratch[\\/]/i.test(target);
    const overwrite = args.Overwrite === true || args.overwrite === true;

    if (isCodeFile && overwrite && !isScratchOrTemp && fs.existsSync(target)) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE REESCRITA INTEGRAL (DIFFS CIRÚRGICOS): O arquivo de código já existe!\n' +
        'É proibido sobrescrever arquivos de código inteiros com write_file / write_to_file.\n' +
        'Utilize edit_file (ou replace_file_content) para aplicar diffs cirúrgicos apenas no trecho estritamente necessário.'
      );
    }

    return respond('allow');
  }

  // 4. JIT Auto-Promoter para invoke_subagent (acorda agentes adormecidos no pool sob demanda)
  if (toolName === 'invoke_subagent') {
    const requested = [];
    if (Array.isArray(args.Subagents)) {
      for (const s of args.Subagents) {
        if (s && s.TypeName) requested.push(s.TypeName);
      }
    }
    if (args.TypeName && typeof args.TypeName === 'string') {
      requested.push(args.TypeName);
    }

    if (requested.length > 0) {
      const projectRoot = PROJECT_ROOT;
      const agentsDir = path.join(projectRoot, '.agents', 'agents');
      const poolDir = path.join(projectRoot, '.agents', 'agents-pool');
      const onDemandDir = path.join(projectRoot, '.agents', 'agents-on-demand');

      for (const rawAgentName of requested) {
        const agentName = path.basename(String(rawAgentName));
        const fileName = agentName.endsWith('.md') ? agentName : `${agentName}.md`;
        const activePath = path.join(agentsDir, fileName);

        if (fs.existsSync(activePath)) {
          recordJitPromotion('agents', fileName);
        } else {
          const inPool = findCaseInsensitiveFile(poolDir, fileName);
          const inOnDemand = findCaseInsensitiveFile(onDemandDir, fileName);

          if (inPool) {
            try { fs.copyFileSync(inPool, activePath); } catch {}
            recordJitPromotion('agents', path.basename(inPool));
          } else if (inOnDemand) {
            try { fs.copyFileSync(inOnDemand, activePath); } catch {}
            recordJitPromotion('agents', path.basename(inOnDemand));
          }
        }
      }
    }

    return respond('allow');
  }

  return respond('allow');
}

main().catch(() => respond('allow'));
