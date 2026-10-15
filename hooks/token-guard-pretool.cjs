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
      execSync('ast-grep --version', { stdio: 'ignore', timeout: 5000 });
    } catch {
      execSync('npx -y --package @ast-grep/cli ast-grep --version', { stdio: 'ignore', timeout: 10000 });
    }
    execSync('graphify --version', { stdio: 'ignore', timeout: 10000 });
    if (fs.existsSync(path.join(PROJECT_ROOT, 'go.mod'))) {
      execSync('gopls version', { stdio: 'ignore', timeout: 10000 });
    }
    health = { ok: true };
  } catch (err) {
    health = { ok: false, error: err.message };
  }

  try {
    fs.writeFileSync(HEALTH_CACHE_FILE, JSON.stringify({ timestamp: now, health }), 'utf8');
  } catch {}

  return health;
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

function recordJitPromotion(type, name) {
  try {
    let data = { skills: {}, agents: {} };
    const promoFile = fs.existsSync(JIT_PROMOTIONS_FILE) ? JIT_PROMOTIONS_FILE : (fs.existsSync(JIT_PROMOTIONS_LEGACY) ? JIT_PROMOTIONS_LEGACY : null);
    if (promoFile) {
      try { data = JSON.parse(fs.readFileSync(promoFile, 'utf8')); } catch {}
    }
    if (!data[type]) data[type] = {};
    // Renovação reativa de TTL: 5 turnos a cada acesso
    data[type][name] = { promotedAt: Date.now(), turnsRemaining: 5 };
    fs.writeFileSync(JIT_PROMOTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch {}
}

function readStdin(timeoutMs = 500) {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      try { process.stdin.pause(); } catch {}
      resolve(data);
    }, timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
    try { process.stdin.resume(); } catch {
      clearTimeout(timer);
      resolve('');
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
      incidents.push({
        type: 'hard_gate_block',
        tool: currentToolName || 'circuit_breaker',
        reason: reason.split('\n')[0],
        args: currentArgs || {},
        timestamp: Date.now()
      });
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(incidentsFile, JSON.stringify(incidents.slice(-50), null, 2), 'utf8');
    } catch {}
  }

  const res = { decision };
  if (reason) res.reason = reason;
  if (overwrite && typeof overwrite === 'object' && Object.keys(overwrite).length > 0) {
    res.overwrite = overwrite;
  }
  process.stdout.write(JSON.stringify(res) + '\n');
  process.exit(0);
}

async function main() {
  // 0. Circuit Breaker check
  const health = verifyToolsHealth();
  if (!health.ok) {
    return respond(
      'deny',
      '🛑 CIRCUIT BREAKER ACIONADO (HARD STOP):\n' +
      'Uma das ferramentas obrigatórias (ast-grep ou graphify) não respondeu ou falhou no teste de execução.\n' +
      'Conforme a Regra 5 do Projeto, todas as ações estão INTERROMPIDAS imediatamente até que as ferramentas estejam operacionais.\n' +
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

  // 1. Gate for view_file
  if (toolName === 'view_file') {
    const rawTarget = sanitizePath(args.AbsolutePath || args.TargetFile || args.path || '');
    const target = rawTarget.replace(/\\/g, '/');

    // STATE.md Blocker
    if (target.endsWith('.planning/STATE.md') || target.endsWith('.planning\\STATE.md')) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE PROTEÇÃO DE TOKENS: A leitura bruta do STATE.md gasta milhares de tokens inúteis em formatação de tabelas Markdown.\n' +
        'Utilize o script de sumário rodando o comando: node .agents/kit/gsd-state-summary.cjs (ou node gsd-state-summary.cjs ou cat .planning/state_summary.json)'
      );
    }

    // 1.1 JIT Auto-Promoter para Skills: Se view_file acessar uma skill no pool ou skills
    const skillMatch = target.match(/\.agents\/(skills|skills-pool|skills-archive)\/([a-zA-Z0-9_-]+)/i);
    let modifiedArgs = null;
    if (skillMatch) {
      const folderType = skillMatch[1];
      const skillName = skillMatch[2];
      const projectRoot = PROJECT_ROOT;
      const activeSkillDir = path.join(projectRoot, '.agents', 'skills', skillName);
      const poolSkillDir = path.join(projectRoot, '.agents', 'skills-pool', skillName);
      const archiveSkillDir = path.join(projectRoot, '.agents', 'skills-archive', skillName);

      if (!fs.existsSync(activeSkillDir)) {
        if (fs.existsSync(poolSkillDir)) {
          try { copyFolderRecursive(poolSkillDir, activeSkillDir); } catch {}
          recordJitPromotion('skills', skillName);
        } else if (fs.existsSync(archiveSkillDir)) {
          try { copyFolderRecursive(archiveSkillDir, activeSkillDir); } catch {}
          recordJitPromotion('skills', skillName);
        }
      }

      if (folderType === 'skills-pool' || folderType === 'skills-archive') {
        const redirected = target.replace(`/.agents/${folderType}/`, '/.agents/skills/');
        modifiedArgs = { AbsolutePath: path.normalize(redirected) };
      }
    }

    const isCodeFile = /\.(go|ts|tsx|js|jsx|py|java|c|cpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|sql|dart)$/i.test(target);

    // If it's a documentation/config file or planning artifact, allow directly
    if (!isCodeFile) {
      return respond('allow', null, modifiedArgs);
    }

    let startLine = parseInt(args.StartLine, 10);
    let endLine = parseInt(args.EndLine, 10);

    // Detect file total lines on disk if available
    let fileTotalLines = 0;
    try {
      const resolved = path.resolve(rawTarget);
      if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
        const content = fs.readFileSync(resolved, 'utf8');
        fileTotalLines = content.split('\n').length;
      }
    } catch {}

    // Dicas específicas por stack de linguagem
    const ext = path.extname(target).toLowerCase();
    let langToolHint = "Use busca cirúrgica ou ast-grep run -p '<padrão>'";
    if (ext === '.go') {
      langToolHint = "Use gopls (MCP: go_search, go_package_api, go_file_context) ou ast-grep run -p '<padrão>' --lang go";
    } else if (['.js', '.jsx', '.cjs', '.mjs'].includes(ext)) {
      langToolHint = "Use ast-grep run -p '<padrão>' --lang js ou busca textual cirúrgica";
    } else if (['.ts', '.tsx'].includes(ext)) {
      langToolHint = "Use ast-grep run -p '<padrão>' --lang ts ou busca textual cirúrgica";
    } else if (ext === '.py') {
      langToolHint = "Use ast-grep run -p '<padrão>' --lang py ou busca textual cirúrgica";
    } else if (ext === '.rs') {
      langToolHint = "Use ast-grep run -p '<padrão>' --lang rust ou busca textual cirúrgica";
    }

    const outlineScriptPath = fs.existsSync(path.join(PROJECT_ROOT, '.agents', 'kit', 'gsd-outline.cjs'))
      ? 'node .agents/kit/gsd-outline.cjs'
      : (fs.existsSync(path.join(PROJECT_ROOT, 'gsd-outline.cjs'))
          ? 'node gsd-outline.cjs'
          : 'node .agents/kit/gsd-outline.cjs');

    // 1.1 Se linhas não foram especificadas:
    if (isNaN(startLine) || isNaN(endLine)) {
      // Auto-injeção transparente para arquivos pequenos (<= 100 linhas no disco)
      if (fileTotalLines > 0 && fileTotalLines <= 100) {
        startLine = isNaN(startLine) ? 1 : Math.max(1, startLine);
        endLine = isNaN(endLine) ? fileTotalLines : Math.min(fileTotalLines, endLine);
        modifiedArgs = Object.assign({}, modifiedArgs || {}, {
          StartLine: startLine,
          EndLine: endLine
        });
      } else {
        return respond(
          'deny',
          '🛑 BLOQUEIO DE PROTEÇÃO DE TOKENS: É proibido ler arquivos de código (.go, .ts, .js, etc.) inteiros com view_file!\n' +
          'Ordem obrigatória:\n' +
          '1) Para entender arquitetura e dependências, consulte o grafo: graphify query "<pergunta>"\n' +
          `2) ${langToolHint} para localizar o trecho exato.\n` +
          '3) Para ler o código via view_file, informe obrigatoriamente StartLine e EndLine cirúrgicos (máximo de 100 linhas).\n' +
          `4) Para ler toda a estrutura do arquivo de forma barata, use ${outlineScriptPath} <arquivo>.`
        );
      }
    }

    const range = endLine - startLine + 1;
    if (range > 100) {
      return respond(
        'deny',
        `🛑 BLOQUEIO DE PROTEÇÃO DE TOKENS: O intervalo de ${range} linhas excede o limite permitido (máximo 100 linhas para arquivos de código). ` +
        `Utilize ${outlineScriptPath} <arquivo> para ver a estrutura limpa, ou ${langToolHint} para o bloco exato, reduzindo o range do view_file.`
      );
    }

    // 1.2 Deduplicação de Leituras Recentes em arquivos de código
    const RECENT_READS_FILE = path.join(CACHE_DIR, 'recent-reads.json');
    const RECENT_READS_LEGACY = path.join(PROJECT_ROOT, '.agents', '.recent-reads.json');
    try {
      let fileMtime = 0;
      try { fileMtime = fs.statSync(path.resolve(rawTarget)).mtimeMs; } catch {}

      let recentReads = [];
      const readsFile = fs.existsSync(RECENT_READS_FILE) ? RECENT_READS_FILE : (fs.existsSync(RECENT_READS_LEGACY) ? RECENT_READS_LEGACY : null);
      if (readsFile) {
        try { recentReads = JSON.parse(fs.readFileSync(readsFile, 'utf8')); } catch {}
      }

      const now = Date.now();
      recentReads = recentReads.filter(r => (now - r.timestamp) < 120000);

      const resolvedPath = path.resolve(rawTarget);
      const lastRead = recentReads[recentReads.length - 1];
      if (lastRead &&
          lastRead.target === resolvedPath &&
          lastRead.startLine === startLine &&
          lastRead.endLine === endLine &&
          lastRead.mtime === fileMtime &&
          (now - lastRead.timestamp) < 60000) {
        return respond(
          'deny',
          `ℹ️ DEDUPLICAÇÃO DE LEITURAS (ECONOMIA DE TOKENS):\n` +
          `O trecho de ${path.basename(rawTarget)} (linhas ${startLine}-${endLine}) foi lido no turno imediatamente anterior e não sofreu alterações no disco.\n` +
          `Consulte o histórico da conversa para evitar releituras redundantes e economizar tokens de contexto.`
        );
      }

      recentReads.push({
        target: resolvedPath,
        startLine,
        endLine,
        mtime: fileMtime,
        timestamp: now
      });
      if (recentReads.length > 10) recentReads = recentReads.slice(-10);
      try { fs.writeFileSync(RECENT_READS_FILE, JSON.stringify(recentReads), 'utf8'); } catch {}
    } catch {}

    return respond('allow', null, modifiedArgs);
  }

  // 2. Gate for run_command dumping code or verbose logs or mass rewrites
  if (toolName === 'run_command' || toolName === 'bash' || toolName === 'shell') {
    const cmd = typeof args.CommandLine === 'string' ? args.CommandLine : (typeof args.command === 'string' ? args.command : '');
    const isRawCodeDump = /(?:^|[;&|(]\s*|&&\s*)(cat|type|Get-Content|gc|head|tail)\s+[^\n|><]+\.(go|ts|tsx|js|jsx|py|java|c|cpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|sql|dart)\b/i.test(cmd);

    if (isRawCodeDump) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE TOKENS: Não despeje código bruto no console com cat/type/Get-Content/head!\n' +
        'Utilize:\n' +
        '- graphify query "<pergunta>" para arquitetura e relações.\n' +
        '- gopls MCP (go_search, go_package_api) para assinaturas e tipos.\n' +
        '- ast-grep run -p \'<padrão>\' --lang go para busca sintática.'
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

    if (/(?:^|[;&|(]\s*|&&\s*)git\s+log\b/i.test(sanitizedCmd) && !/(-n\b|--max-count\b|-\d)/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(^|[;&|(]\s*|&&\s*)git\s+log\b/i, '$1git log -n 20');
      cmdChanged = true;
    }
    if (/(?:^|[;&|(]\s*|&&\s*)docker(?:\s+compose)?\s+logs\b/i.test(sanitizedCmd) && !/(--tail\b|-n\b)/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/((?:^|[;&|(]\s*|&&\s*)docker(?:\s+compose)?\s+logs\b)/i, '$1 --tail 100');
      cmdChanged = true;
    }
    // Auto-limitar varreduras recursivas em PowerShell sem profundidade (Get-ChildItem -Recurse sem -Depth)
    if (/(\b(?:Get-ChildItem|gci)\b[^|;\r\n]*?-Recurse\b)(?![^|;\r\n]*?-Depth\b)/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(\b(?:Get-ChildItem|gci)\b[^|;\r\n]*?-Recurse\b)(?![^|;\r\n]*?-Depth\b)/i, '$1 -Depth 3');
      cmdChanged = true;
    }
    // Auto-limitar find . sem -maxdepth
    if (/\bfind\s+(?:\.|\.\/)\s+/i.test(sanitizedCmd) && !/-maxdepth\b/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(\bfind\s+(?:\.|\.\/)\s+)/i, '$1-maxdepth 3 ');
      cmdChanged = true;
    }
    // Auto-limitar listagem prolixa de npm / pnpm
    if (/\b(?:npm|pnpm)\s+list\b/i.test(sanitizedCmd) && !/--depth\b/i.test(sanitizedCmd)) {
      sanitizedCmd = sanitizedCmd.replace(/(\b(?:npm|pnpm)\s+list\b)/i, '$1 --depth=0');
      cmdChanged = true;
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

  // 3. Gate for write_to_file / Write (garantir diffs cirurgicos em vez de sobrescrita integral de codigo)
  if (toolName === 'write_to_file' || toolName === 'write') {
    const rawTarget = sanitizePath(args.TargetFile || args.path || args.file_path || args.filePath || '');
    const target = path.resolve(rawTarget);
    const isCodeFile = /\.(go|ts|tsx|js|jsx|py|java|c|cpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|sql|dart)$/i.test(target);
    const isScratchOrTemp = /[\\/](scratch|temp|tmp|\.cache)[\\/]/i.test(target);
    const overwrite = args.Overwrite === true || args.overwrite === true;

    if (isCodeFile && overwrite && !isScratchOrTemp && fs.existsSync(target)) {
      return respond(
        'deny',
        '🛑 BLOQUEIO DE REESCRITA INTEGRAL (DIFFS CIRÚRGICOS): O arquivo de código já existe!\n' +
        'É proibido sobrescrever arquivos de código inteiros com write_to_file.\n' +
        'Utilize replace_file_content para aplicar diffs cirúrgicos apenas no trecho estritamente necessário.'
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

      for (const agentName of requested) {
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
