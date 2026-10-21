'use strict';

/**
 * Antigravity GSD Kit - Error Guard (Modo Rigoroso de Erros)
 *
 * Motor central de controle de erros compartilhado por instaladores, hooks,
 * servidor MCP e motores de análise (LSP, ast-grep, graphify, SQLite, git).
 *
 * Princípios:
 * 1. ZERO falha silenciosa: todo erro real vira (a) banner vermelho no stderr,
 *    (b) retorno explícito ao chamador/agente com o stderr real da ferramenta
 *    e (c) registro estruturado em .agents/.cache/error-log.json.
 * 2. Segredos nunca vazam: stderr/comandos passam por mascaramento antes de
 *    qualquer exibição ou persistência.
 * 3. Zero dependências npm externas.
 *
 * TODO(security): Local CLI/Stdio utility; web session/CSRF/CSP controls not applicable.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const STRICT_MODE_VERSION = 1;
const MAX_LOG_ENTRIES = 200;
const MAX_STDERR_CHARS = 2000;
const MAX_LINE_CHARS = 160;
const DEFAULT_SPAWN_TIMEOUT_MS = 30000;
const ERROR_LOG_RELATIVE = path.join('.agents', '.cache', 'error-log.json');

const CATEGORIES = new Set(['INSTALL', 'RUNTIME', 'LSP', 'TOOL', 'HOOK']);

const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function stripAnsi(text) {
  return String(text == null ? '' : text).replace(ANSI_RE, '');
}

/**
 * Mascara valores sensíveis (senhas, tokens, chaves, credenciais em URLs).
 */
function maskSecrets(text) {
  let out = String(text == null ? '' : text);
  out = out.replace(
    /\b([A-Za-z0-9_.-]*(?:PASSWORD|PASSWD|SECRET|TOKEN|API[_-]?KEY|PRIVATE[_-]?KEY|ACCESS[_-]?KEY|CREDENTIAL|DATABASE_URL|AUTH)[A-Za-z0-9_.-]*)(\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s,;]+)/gi,
    '$1$2[MASCARADO]'
  );
  out = out.replace(/([a-z][a-z0-9+.-]*:\/\/)([^\s:@/]+):([^\s@/]+)@/gi, '$1$2:[MASCARADO]@');
  out = out.replace(/\b(Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{8,}/gi, '$1 [MASCARADO]');
  out = out.replace(/\b(?:ghp|gho|ghs|ghu|github_pat|sk|pk|xox[baprs]|AKIA)[-_A-Za-z0-9]{12,}\b/g, '[MASCARADO]');
  return out;
}

function sanitizeText(text, maxChars = MAX_STDERR_CHARS) {
  const cleaned = maskSecrets(stripAnsi(text)).replace(/\r\n/g, '\n').trim();
  if (cleaned.length <= maxChars) return cleaned;
  return cleaned.slice(0, maxChars) + `\n... (+${cleaned.length - maxChars} caracteres omitidos)`;
}

function resolveProjectRoot(startDir) {
  let dir = path.resolve(startDir || process.cwd());
  for (;;) {
    if (path.basename(dir) === '.agents') return path.dirname(dir);
    if (fs.existsSync(path.join(dir, '.agents')) || fs.existsSync(path.join(dir, '.git'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return path.resolve(startDir || process.cwd());
    dir = up;
  }
}

function getPaths(projectRoot) {
  const root = path.resolve(projectRoot || process.cwd());
  const cacheDir = path.join(root, '.agents', '.cache');
  return {
    root,
    agentsDir: path.join(root, '.agents'),
    cacheDir,
    errorLog: path.join(cacheDir, 'error-log.json'),
    incidents: path.join(cacheDir, 'session-incidents.json'),
    healthCache: path.join(cacheDir, 'health-cache.json'),
    healthCacheLegacy: path.join(root, '.agents', '.health-cache')
  };
}

function writeJsonAtomic(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
    return { ok: true };
  } catch (err) {
    try {
      process.stderr.write(`[error-guard] Não foi possível gravar ${filePath}: ${err.message}\n`);
    } catch {}
    return { ok: false, error: err.message };
  }
}

/**
 * Lê um JSON de log. Se estiver corrompido, preserva o arquivo ruim como
 * *.corrupt-<ts> e avisa explicitamente (nunca descarta em silêncio).
 */
function readJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    try { process.stderr.write(`[error-guard] Não foi possível ler ${filePath}: ${err.message}\n`); } catch {}
    return [];
  }
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch (err) {
    const backup = `${filePath}.corrupt-${Date.now()}`;
    try {
      fs.renameSync(filePath, backup);
      process.stderr.write(`[error-guard] Log corrompido (${err.message}); preservado em ${backup}\n`);
    } catch {}
    return [];
  }
}

function normalizeEvent(ev) {
  const e = ev && typeof ev === 'object' ? ev : { title: String(ev || 'Erro desconhecido') };
  const rawComponent = String(e.component || e.source || 'sistema');
  let category = 'RUNTIME';
  if (e.category && CATEGORIES.has(String(e.category).toUpperCase())) {
    category = String(e.category).toUpperCase();
  } else if (rawComponent.startsWith('mcp-') || rawComponent.startsWith('tool:') || rawComponent.includes('ast-grep') || rawComponent.includes('lsp')) {
    category = 'TOOL';
  } else if (rawComponent.startsWith('setup') || rawComponent.startsWith('install') || rawComponent.startsWith('update')) {
    category = 'INSTALL';
  } else if (rawComponent.startsWith('hook')) {
    category = 'HOOK';
  }

  const severity = e.severity === 'warning' ? 'warning' : 'error';
  return {
    category,
    severity,
    component: rawComponent.slice(0, 120),
    title: sanitizeText(e.title || e.message || 'Erro desconhecido', 400),
    command: e.command ? sanitizeText(e.command, 400) : null,
    exitCode: e.exitCode === undefined || e.exitCode === null ? null : e.exitCode,
    stderr: e.stderr ? sanitizeText(e.stderr) : null,
    file: e.file ? String(e.file).slice(0, 400) : null,
    hint: (e.hint || e.remediation) ? sanitizeText(e.hint || e.remediation, 600) : null
  };
}

function signatureOf(n) {
  return [n.category, n.severity, n.component, n.title, n.command || '', String(n.exitCode)].join('|');
}

/**
 * Invalida o cache de saúde do Circuit Breaker para forçar reavaliação imediata.
 */
function invalidateHealthCache(projectRoot) {
  const p = getPaths(typeof projectRoot === 'string' ? projectRoot : resolveProjectRoot());
  for (const f of [p.healthCache, p.healthCacheLegacy]) {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (err) {
      try { process.stderr.write(`[error-guard] Não foi possível invalidar ${f}: ${err.message}\n`); } catch {}
    }
  }
}

/**
 * Registra um erro de forma estruturada (sem imprimir).
 * Suporta assinatura (projectRoot, ev, opts) ou (ev, opts).
 * opts: { dedupeMs, mirrorIncident, invalidateHealth }
 */
function recordError(projectRootOrEv, maybeEv, opts = {}) {
  let projectRoot;
  let ev;
  let options = opts;

  if (typeof projectRootOrEv === 'string') {
    projectRoot = projectRootOrEv;
    ev = maybeEv;
  } else if (projectRootOrEv && typeof projectRootOrEv === 'object') {
    projectRoot = resolveProjectRoot();
    ev = projectRootOrEv;
    options = maybeEv || {};
  } else {
    projectRoot = resolveProjectRoot();
    ev = maybeEv || {};
  }

  const p = getPaths(projectRoot);
  const n = normalizeEvent(ev);
  const now = Date.now();
  const entry = Object.assign({
    id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: now,
    date: new Date(now).toISOString(),
    count: 1,
    resolved: false,
    strictModeVersion: STRICT_MODE_VERSION
  }, n);

  if (!fs.existsSync(p.agentsDir)) {
    return { entry, deduped: false, persisted: false };
  }

  const dedupeMs = Number(opts.dedupeMs || 0);
  const log = readJsonArray(p.errorLog);
  const sig = signatureOf(n);

  if (dedupeMs > 0) {
    for (let i = log.length - 1; i >= 0; i--) {
      const prev = log[i];
      if (prev && !prev.resolved && signatureOf(prev) === sig && (now - Number(prev.timestamp || 0)) < dedupeMs) {
        prev.count = Number(prev.count || 1) + 1;
        prev.timestamp = now;
        prev.date = entry.date;
        writeJsonAtomic(p.errorLog, log.slice(-MAX_LOG_ENTRIES));
        return { entry: prev, deduped: true, persisted: true };
      }
    }
  }

  log.push(entry);
  const written = writeJsonAtomic(p.errorLog, log.slice(-MAX_LOG_ENTRIES));

  const shouldInvalidate = opts.invalidateHealth !== undefined
    ? Boolean(opts.invalidateHealth)
    : (n.severity === 'error' && (n.category === 'TOOL' || n.category === 'LSP'));
  if (shouldInvalidate) invalidateHealthCache(p.root);

  const shouldMirror = opts.mirrorIncident !== undefined
    ? Boolean(opts.mirrorIncident)
    : (n.severity === 'error' && n.category !== 'INSTALL');
  if (shouldMirror) {
    const incidents = readJsonArray(p.incidents);
    incidents.push({
      type: 'tool_error',
      tool: n.component,
      error: `${n.title}${n.stderr ? ': ' + n.stderr.split('\n')[0] : ''}`.slice(0, 400),
      args: n.command ? { CommandLine: n.command } : {},
      timestamp: now
    });
    writeJsonAtomic(p.incidents, incidents.slice(-50));
  }

  return { entry, deduped: false, persisted: written.ok };
}

function clip(line) {
  const s = String(line);
  return s.length > MAX_LINE_CHARS ? s.slice(0, MAX_LINE_CHARS - 1) + '…' : s;
}

function paint(useColor) {
  const on = (code) => (useColor ? code : '');
  return {
    reset: on('\x1b[0m'),
    bold: on('\x1b[1m'),
    dim: on('\x1b[90m'),
    red: on('\x1b[91m'),
    yellow: on('\x1b[93m'),
    cyan: on('\x1b[96m'),
    white: on('\x1b[97m')
  };
}

/**
 * Gera o card visual de erro (vermelho p/ erro, amarelo p/ alerta).
 */
function formatErrorBanner(ev, opts = {}) {
  const e = ev && ev.id && ev.date ? ev : Object.assign({}, normalizeEvent(ev));
  const useColor = opts.color !== undefined ? Boolean(opts.color) : Boolean(process.stderr.isTTY || process.env.FORCE_COLOR);
  const c = paint(useColor);
  const isWarn = e.severity === 'warning';
  const tone = isWarn ? c.yellow : c.red;
  const label = isWarn ? '⚠️  ALERTA' : '🛑 ERRO CRÍTICO';
  const head = `╭─ ${label} • ${e.category} • ${e.component} `;
  const bar = '─'.repeat(Math.max(4, 74 - head.length));
  const side = `${tone}│${c.reset}`;
  const lines = [];
  lines.push(`${tone}${head}${bar}╮${c.reset}`);
  for (const l of String(e.title).split('\n').slice(0, 4)) {
    lines.push(`${side}  ${c.bold}${clip(l)}${c.reset}`);
  }
  if (e.file) lines.push(`${side}  ${c.dim}Arquivo:${c.reset} ${clip(e.file)}`);
  if (e.command) lines.push(`${side}  ${c.dim}Comando:${c.reset} ${clip(e.command)}`);
  if (e.exitCode !== null && e.exitCode !== undefined) lines.push(`${side}  ${c.dim}Código de saída:${c.reset} ${e.exitCode}`);
  if (e.count > 1) lines.push(`${side}  ${c.dim}Ocorrências repetidas:${c.reset} ${e.count}`);
  if (e.stderr) {
    lines.push(`${side}  ${c.dim}Causa real (saída da ferramenta):${c.reset}`);
    for (const l of String(e.stderr).split('\n').slice(0, 12)) {
      lines.push(`${side}    ${tone}${clip(l)}${c.reset}`);
    }
  }
  if (e.hint) {
    lines.push(`${side}  ${c.cyan}💡 Como corrigir:${c.reset} ${clip(String(e.hint).split('\n')[0])}`);
    for (const l of String(e.hint).split('\n').slice(1, 4)) lines.push(`${side}     ${clip(l)}`);
  }
  lines.push(`${side}  ${c.dim}Registro: ${ERROR_LOG_RELATIVE} (id ${e.id})${c.reset}`);
  lines.push(`${tone}╰${'─'.repeat(73)}╯${c.reset}`);
  return lines.join('\n') + '\n';
}

/**
 * Registra E exibe o erro (Visibilidade Tripla: terminal + log + retorno ao chamador).
 * Suporta assinatura (projectRoot, ev, opts) ou (ev, opts).
 * Nunca lança exceção.
 */
function emitError(projectRootOrEv, maybeEv, opts = {}) {
  let projectRoot;
  let ev;
  let options = opts;

  if (typeof projectRootOrEv === 'string') {
    projectRoot = projectRootOrEv;
    ev = maybeEv;
  } else if (projectRootOrEv && typeof projectRootOrEv === 'object') {
    projectRoot = resolveProjectRoot();
    ev = projectRootOrEv;
    options = maybeEv || {};
  } else {
    projectRoot = resolveProjectRoot();
    ev = maybeEv || {};
  }

  let rec;
  try {
    rec = recordError(projectRoot, ev, options);
  } catch (err) {
    rec = { entry: Object.assign({ id: 'unlogged', date: new Date().toISOString(), count: 1 }, normalizeEvent(ev)), deduped: false, persisted: false };
    try { process.stderr.write(`[error-guard] Falha ao registrar erro: ${err.message}\n`); } catch {}
  }
  const banner = formatErrorBanner(rec.entry, { color: options.color });
  if (!options.silent && (!rec.deduped || options.printDeduped)) {
    try { (options.stream || process.stderr).write(banner); } catch {}
  }
  return { entry: rec.entry, banner, deduped: rec.deduped, persisted: rec.persisted };
}

/**
 * Descreve em português por que um spawn falhou.
 */
function describeSpawnFailure(res, label) {
  if (!res) return `${label}: resultado de execução ausente.`;
  if (res.notFound) return `Binário '${label}' não encontrado no PATH.`;
  if (res.timedOut) return `'${label}' excedeu o tempo limite e foi interrompido.`;
  if (res.errorMessage) return `'${label}' falhou ao iniciar: ${res.errorMessage}`;
  if (res.status !== 0) return `'${label}' terminou com código de saída ${res.status}.`;
  return `'${label}' executou com sucesso.`;
}

/**
 * spawnSync padronizado: sem shell (exceto shims no Windows), com timeout e
 * resultado estruturado que NUNCA esconde ENOENT/timeout/exit != 0.
 */
function spawnStrict(bin, args = [], options = {}) {
  if (typeof bin !== 'string' || !bin.trim() || /[\r\n\0]/.test(bin)) {
    return { ok: false, status: null, signal: null, stdout: '', stderr: '', errorCode: 'EINVAL', errorMessage: 'nome de binário inválido', timedOut: false, notFound: false };
  }
  const timeout = Number(options.timeout || DEFAULT_SPAWN_TIMEOUT_MS);
  const res = spawnSync(bin, (args || []).map(String), {
    cwd: options.cwd,
    env: options.env || process.env,
    input: options.input,
    encoding: 'utf8',
    timeout,
    maxBuffer: 16 * 1024 * 1024,
    shell: options.shell !== undefined ? options.shell : process.platform === 'win32'
  });
  const errorCode = res.error ? res.error.code || 'ERR' : null;
  const timedOut = errorCode === 'ETIMEDOUT' || (res.signal === 'SIGTERM' && res.status === null && Boolean(res.error));
  const notFound = errorCode === 'ENOENT';
  return {
    ok: !res.error && res.status === 0,
    status: res.status,
    signal: res.signal || null,
    stdout: res.stdout || '',
    stderr: res.stderr || '',
    errorCode,
    errorMessage: res.error ? res.error.message : null,
    timedOut,
    notFound
  };
}

function listErrors(projectRoot, opts = {}) {
  const p = getPaths(typeof projectRoot === 'string' ? projectRoot : resolveProjectRoot());
  let items = readJsonArray(p.errorLog);
  if (opts.onlyUnresolved) items = items.filter(i => i && !i.resolved);
  const limit = Number(opts.limit || 0);
  return limit > 0 ? items.slice(-limit) : items;
}

function summarize(projectRoot) {
  const all = listErrors(typeof projectRoot === 'string' ? projectRoot : resolveProjectRoot());
  const unresolved = all.filter(i => i && !i.resolved && i.severity !== 'warning');
  const warnings = all.filter(i => i && !i.resolved && i.severity === 'warning');
  return {
    total: all.length,
    unresolvedErrors: unresolved.length,
    unresolvedWarnings: warnings.length,
    last: unresolved.length ? unresolved[unresolved.length - 1] : null
  };
}

/**
 * Marca como resolvidos os erros de um componente (ex.: ferramenta voltou a responder).
 */
function markResolved(projectRoot, matcher) {
  const p = getPaths(typeof projectRoot === 'string' ? projectRoot : resolveProjectRoot());
  if (!fs.existsSync(p.errorLog)) return 0;
  const log = readJsonArray(p.errorLog);
  const test = typeof matcher === 'function' ? matcher : (i) => i.component === matcher;
  let changed = 0;
  for (const item of log) {
    if (item && !item.resolved && test(item)) {
      item.resolved = true;
      item.resolvedAt = new Date().toISOString();
      changed++;
    }
  }
  if (changed > 0) writeJsonAtomic(p.errorLog, log);
  return changed;
}

function clearErrors(projectRoot) {
  const p = getPaths(typeof projectRoot === 'string' ? projectRoot : resolveProjectRoot());
  let removed = 0;
  for (const f of [p.errorLog]) {
    try {
      if (fs.existsSync(f)) {
        removed = readJsonArray(f).length;
        fs.unlinkSync(f);
      }
    } catch (err) {
      try { process.stderr.write(`[error-guard] Não foi possível limpar ${f}: ${err.message}\n`); } catch {}
    }
  }
  return removed;
}

function formatErrorList(entries, opts = {}) {
  const c = paint(opts.color !== undefined ? Boolean(opts.color) : Boolean(process.stdout.isTTY));
  if (!entries || entries.length === 0) {
    return `${c.white}✅ Nenhum erro registrado em ${ERROR_LOG_RELATIVE}.${c.reset}`;
  }
  const out = [`${c.bold}📋 Central de Erros (${entries.length} registro(s)) — ${ERROR_LOG_RELATIVE}${c.reset}`, ''];
  for (const e of entries) {
    const tone = e.severity === 'warning' ? c.yellow : c.red;
    const status = e.resolved ? `${c.dim}[resolvido]${c.reset}` : `${tone}[ABERTO]${c.reset}`;
    out.push(`${tone}•${c.reset} ${e.date || ''} ${status} ${c.bold}${e.category}/${e.component}${c.reset}${e.count > 1 ? ` ${c.dim}(x${e.count})${c.reset}` : ''}`);
    out.push(`    ${clip(e.title)}`);
    if (e.command) out.push(`    ${c.dim}cmd:${c.reset} ${clip(e.command)}`);
    if (e.exitCode !== null && e.exitCode !== undefined) out.push(`    ${c.dim}exit:${c.reset} ${e.exitCode}`);
    if (e.stderr) out.push(`    ${c.dim}stderr:${c.reset} ${clip(String(e.stderr).split('\n')[0])}`);
    if (e.hint) out.push(`    ${c.dim}fix:${c.reset} ${clip(String(e.hint).split('\n')[0])}`);
    out.push('');
  }
  return out.join('\n').trimEnd();
}

/**
 * Instala handlers globais para que falhas inesperadas nunca sejam engolidas.
 * Suporta installProcessGuards(projectRoot, component, opts) ou installProcessGuards(opts)
 */
function installProcessGuards(projectRootOrOpts, maybeComponent, maybeOpts = {}) {
  let projectRoot;
  let component;
  let opts;
  if (typeof projectRootOrOpts === 'object' && projectRootOrOpts !== null && typeof maybeComponent !== 'string') {
    projectRoot = projectRootOrOpts.projectRoot || resolveProjectRoot();
    component = projectRootOrOpts.component || projectRootOrOpts.source || 'sistema';
    opts = projectRootOrOpts;
  } else {
    projectRoot = typeof projectRootOrOpts === 'string' ? projectRootOrOpts : resolveProjectRoot();
    component = String(maybeComponent || 'sistema');
    opts = maybeOpts || {};
  }
  const exitOnUncaught = opts.exitOnUncaught !== false;
  const onFatal = (title, err) => {
    emitError(projectRoot, {
      category: 'RUNTIME',
      component,
      title: `${title}: ${err && err.message ? err.message : String(err)}`,
      stderr: err && err.stack ? err.stack : '',
      hint: 'Erro interno do kit. Execute "node .agents/kit/setup-ui.cjs --doctor" e, se persistir, reinstale com "--install".'
    });
    if (typeof opts.onShutdown === 'function') {
      try { opts.onShutdown(); } catch (_) {}
    }
    if (exitOnUncaught) {
      setImmediate(() => process.exit(1));
    }
  };

  process.on('uncaughtException', (err) => onFatal('Exceção não tratada', err));
  process.on('unhandledRejection', (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    onFatal('Promise rejeitada sem tratamento', err);
  });
}

module.exports = {
  STRICT_MODE_VERSION,
  ERROR_LOG_RELATIVE,
  stripAnsi,
  maskSecrets,
  sanitizeText,
  resolveProjectRoot,
  getPaths,
  writeJsonAtomic,
  readJsonArray,
  recordError,
  invalidateHealthCache,
  formatErrorBanner,
  emitError,
  describeSpawnFailure,
  spawnStrict,
  listErrors,
  summarize,
  markResolved,
  clearErrors,
  formatErrorList,
  installProcessGuards
};
