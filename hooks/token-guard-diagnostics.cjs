#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - Hook de Diagnóstico e Rastreamento de Incidentes
 * 
 * Atua em dois estágios do ciclo de vida:
 * 1. PostToolUse: Monitora a execução de ferramentas e captura erros e falhas.
 * 2. Stop: Dispara no encerramento da sessão e exibe um sumário visual formatado
 *    de todos os incidentes/erros ocorridos, se houver.
 */

const fs = require('fs');
const path = require('path');

// ANSI Colors
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  yellow: '\x1b[33m',
  bYellow: '\x1b[93m',
  red: '\x1b[31m',
  bRed: '\x1b[91m',
  cyan: '\x1b[36m',
  bCyan: '\x1b[96m',
  green: '\x1b[32m',
  bGreen: '\x1b[92m',
  white: '\x1b[37m'
};

function findProjectRoot() {
  const hooksParent = path.resolve(__dirname, '..');
  if (path.basename(hooksParent) === '.agents') return path.dirname(hooksParent);
  let curr = process.cwd();
  for (let i = 0; i < 6; i++) {
    if (fs.existsSync(path.join(curr, '.agents')) || fs.existsSync(path.join(curr, '.git'))) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return process.cwd();
}

const PROJECT_ROOT = findProjectRoot();
const CACHE_DIR = path.join(PROJECT_ROOT, '.agents', '.cache');
const INCIDENTS_FILE = path.join(CACHE_DIR, 'session-incidents.json');
const REPORT_FILE = path.join(CACHE_DIR, 'latest-session-report.json');
const MODIFIED_FILES_PATH = path.join(CACHE_DIR, 'session-modified-files.json');
const STOP_GATE_PATH = path.join(CACHE_DIR, 'stop-verify-gate.json');
const LAST_TEST_STATUS_PATH = path.join(CACHE_DIR, 'last-test-status.json');
const FAILED_TESTS_PATH = path.join(CACHE_DIR, 'failed-tests.json');

function findLibModule(name) {
  const candidates = [
    path.resolve(__dirname, '..', 'lib', name),
    path.resolve(__dirname, '..', 'kit', 'lib', name),
    path.join(PROJECT_ROOT, '.agents', 'lib', name),
    path.join(PROJECT_ROOT, 'lib', name)
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function writeJsonAtomic(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
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

function loadIncidents() {
  if (!fs.existsSync(INCIDENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveIncidents(incidents) {
  writeJsonAtomic(INCIDENTS_FILE, incidents);
}

function recordIncident(incident) {
  const incidents = loadIncidents();
  incidents.push({
    ...incident,
    timestamp: Date.now()
  });
  // Manter no máximo os últimos 50 incidentes
  const trimmed = incidents.slice(-50);
  saveIncidents(trimmed);
}

function recordModifiedCodeFile(rawPath) {
  if (!rawPath || typeof rawPath !== 'string') return;
  if (!/\.(go|ts|tsx|js|jsx|cjs|mjs|py|java|c|cpp|cc|cxx|h|hpp|rs|vue|svelte|cs|php|rb|swift|kt|kts|dart|lua|sh|bash|ex|exs|tf|sql)$/i.test(rawPath)) {
    return;
  }
  try {
    const resolved = path.resolve(PROJECT_ROOT, rawPath);
    let list = [];
    if (fs.existsSync(MODIFIED_FILES_PATH)) {
      try { list = JSON.parse(fs.readFileSync(MODIFIED_FILES_PATH, 'utf8')) || []; } catch {}
    }
    const now = Date.now();
    list = list.filter(item => item && item.file !== resolved && (now - Number(item.timestamp || 0)) < 300000);
    list.push({ file: resolved, timestamp: now });
    writeJsonAtomic(MODIFIED_FILES_PATH, list.slice(-15));
  } catch {}
}

// -----------------------------------------------------------------------------
// Estágio: PostToolUse (Captura de Falhas)
// -----------------------------------------------------------------------------
function handlePostToolUse(payload) {
  const toolCall = payload.toolCall || {};
  const toolName = (toolCall.name || '').toLowerCase();
  const error = payload.error || '';
  const stepIdx = payload.stepIdx;
  const args = toolCall.args || {};
  const output = payload.output || payload.result || '';

  const egMod = findLibModule('error-guard.cjs');
  const ErrorGuard = egMod ? require(egMod) : null;

  const isErr = Boolean((error && typeof error === 'string' && error.trim().length > 0) || payload.isError);
  if (isErr) {
    const errMsg = String(error || payload.error || 'Falha na execução da ferramenta').trim();
    recordIncident({
      type: 'tool_error',
      tool: toolName,
      stepIdx: stepIdx,
      error: errMsg,
      args: args
    });
    if (ErrorGuard) {
      ErrorGuard.emitError(PROJECT_ROOT, {
        category: 'TOOL',
        component: `tool:${toolName}`,
        title: `Falha na execução da ferramenta "${toolName}" (Passo ${stepIdx || '?'})`,
        stderr: errMsg,
        command: args.CommandLine || args.command || null,
        file: args.AbsolutePath || args.TargetFile || args.file_path || null,
        hint: 'Verifique a saída e os parâmetros informados para a ferramenta.',
        severity: 'error'
      });
      if (['run_command', 'ast_query', 'lsp_diagnostics'].includes(toolName)) {
        ErrorGuard.invalidateHealthCache(PROJECT_ROOT);
      }
    }
  } else if (['replace_file_content', 'multi_replace_file_content', 'write_to_file', 'write', 'edit_file', 'write_file'].includes(toolName)) {
    const editedPath = args.Path || args.TargetFile || args.AbsolutePath || args.path || args.file_path || args.filePath || '';
    recordModifiedCodeFile(editedPath);

    // Auto-validação de sintaxe pós-edição imediata (LSP Engine / Node Check)
    if (editedPath && typeof editedPath === 'string') {
      try {
        const fullEdited = path.isAbsolute(editedPath) ? editedPath : path.resolve(PROJECT_ROOT, editedPath);
        if (fs.existsSync(fullEdited)) {
          const stat = fs.statSync(fullEdited);
          if (stat.size <= 256 * 1024) {
            const lspMod = findLibModule('lsp-engine.cjs');
          if (lspMod) {
            const LspEngine = require(lspMod);
            const lsp = new LspEngine(PROJECT_ROOT);
            const diag = lsp.diagnostics({ file_path: fullEdited });
            if (diag && (diag.isError || diag.hasDiagnostics)) {
              recordIncident({
                type: 'syntax_error',
                tool: toolName,
                stepIdx: stepIdx,
                error: `Erro de sintaxe em ${path.basename(fullEdited)}: ${diag.text || 'Falha na validação'}`,
                args: args
              });
              if (ErrorGuard) {
                ErrorGuard.emitError(PROJECT_ROOT, {
                  category: 'LSP',
                  component: 'lsp:diagnostics',
                  title: `Erro de sintaxe/compilação detectado em ${path.basename(fullEdited)}`,
                  stderr: diag.text || '',
                  file: fullEdited,
                  hint: 'Corrija o erro de sintaxe antes de executar os testes.',
                  severity: 'error'
                });
              }
            }
          }

          // Auditoria de Segurança e Anti-SQL Injection pós-edição
          const secMod = findLibModule('security-linter.cjs');
          if (secMod) {
            try {
              const SecurityLinter = require(secMod);
              const linter = new SecurityLinter(PROJECT_ROOT);
              const secIssues = linter.scanFile(fullEdited);
              const criticalSec = secIssues.filter(i => i.severity === 'CRITICAL');
              if (criticalSec.length > 0) {
                const s = criticalSec[0];
                recordIncident({
                  type: 'security_risk',
                  tool: toolName,
                  stepIdx: stepIdx,
                  error: `Vulnerabilidade SQL em ${path.basename(fullEdited)}:${s.line}: ${s.message}`,
                  args: args
                });
                if (ErrorGuard) {
                  ErrorGuard.emitError(PROJECT_ROOT, {
                    category: 'SECURITY',
                    component: 'security:linter',
                    title: `Risco de SQL Injection detectado em ${path.basename(fullEdited)}:${s.line}`,
                    stderr: `${s.snippet}\n${s.message}`,
                    file: fullEdited,
                    hint: 'Substitua concatenação de strings por parâmetros parametrizados (?) imediatamente.',
                    severity: 'error'
                  });
                }
              }
            } catch {}
          }

          // Auditoria de Code Smells e Complexidade Ciclomática pós-edição
          const compMod = findLibModule('complexity-guard.cjs');
          if (compMod) {
            try {
              const ComplexityGuard = require(compMod);
              const guard = new ComplexityGuard();
              const smells = guard.scanFile(fullEdited);
              const criticalSmells = smells.filter(s => s.type === 'high_complexity' || s.type === 'long_method');
              if (criticalSmells.length > 0) {
                const s = criticalSmells[0];
                if (ErrorGuard) {
                  ErrorGuard.emitError(PROJECT_ROOT, {
                    category: 'QUALITY',
                    component: 'complexity:guard',
                    title: `Code Smell detectado em ${path.basename(fullEdited)}:${s.line}`,
                    stderr: s.message,
                    file: fullEdited,
                    hint: 'Decomponha rotinas complexas em métodos auxiliares puros.',
                    severity: 'warning'
                  });
                }
              }
            } catch {}
          }

          // Auditoria de Código Duplicado (DRY)
          const dryMod = findLibModule('dry-checker.cjs');
          if (dryMod && fs.existsSync(MODIFIED_FILES_PATH)) {
            try {
              const DryChecker = require(dryMod);
              const checker = new DryChecker(6);
              const modifiedList = JSON.parse(fs.readFileSync(MODIFIED_FILES_PATH, 'utf8')) || [];
              const filesToCheck = modifiedList.map(m => m.file).filter(f => fs.existsSync(f));
              if (filesToCheck.length >= 2) {
                const dups = checker.checkFiles(filesToCheck);
                if (dups.length > 0 && ErrorGuard) {
                  ErrorGuard.emitError(PROJECT_ROOT, {
                    category: 'QUALITY',
                    component: 'dry:checker',
                    title: `Duplicação de código detectada (${dups.length} bloco(s) >= 6 linhas)`,
                    stderr: `Código idêntico detectado entre arquivos tocados:\n` + dups.slice(0, 2).map(d => ` - ${d.locations.map(l => path.basename(l.file) + ':' + l.line).join(' <-> ')}`).join('\n'),
                    file: fullEdited,
                    hint: 'Extraia lógica repetida para um helper/utilitário compartilhado em vez de copiar código.',
                    severity: 'warning'
                  });
                }
              }
            } catch {}
          }
        }
        }
      } catch {}
    }
  }

  // Monitorar comandos de teste para Auto-Isolate, Checkpoints e MemPalace v2
  if (toolName === 'run_command' || toolName === 'bash' || toolName === 'shell') {
    const cmd = args.CommandLine || args.command || '';
    const isTestCmd = /\b(npm\s+test|node\s+--test|pytest|go\s+test|cargo\s+test)\b/i.test(cmd);
    if (isTestCmd) {
      try {
        const tiMod = findLibModule('test-isolate.cjs');
        const TestIsolate = tiMod ? require(tiMod) : require('../lib/test-isolate.cjs');
        const testIsolate = new TestIsolate(PROJECT_ROOT);
        const combinedOutput = `${output}\n${error}`;
        const failures = testIsolate.parseFailures(combinedOutput);

        if (failures.length > 0 || (error && error.trim().length > 0)) {
          testIsolate.recordFailures(failures.length > 0 ? failures : ['Erro na execução de testes'], cmd);
        } else {
          const hadPreviousFailures = testIsolate.getFailedTests().length > 0;
          testIsolate.recordSuccess(cmd);
          try { if (fs.existsSync(STOP_GATE_PATH)) fs.unlinkSync(STOP_GATE_PATH); } catch {}

          if (hadPreviousFailures) {
            // Transição Vermelho -> Verde detectada!
            let mempalace = null;
            try {
              const mpMod = findLibModule('mempalace-engine.cjs');
              const MemPalace = mpMod ? require(mpMod) : require('../lib/mempalace-engine.cjs');
              mempalace = new MemPalace(PROJECT_ROOT);
              mempalace.capture({
                room: 'problems',
                topic: `Teste Verde: ${cmd.slice(0, 50)}`,
                content: `Testes passaram após correção no código.`,
                rationale: 'Auto-captura heurística do GSD AGY Kit na resolução do teste.'
              });
            } catch {} finally {
              if (mempalace && typeof mempalace.close === 'function') {
                try { mempalace.close(); } catch {}
              }
            }

            try {
              const chkMod = findLibModule('checkpoint-engine.cjs');
              const Checkpoint = chkMod ? require(chkMod) : require('../lib/checkpoint-engine.cjs');
              const checkpoint = new Checkpoint(PROJECT_ROOT);
              checkpoint.createCheckpoint('green-test');
            } catch {}
          }
        }
      } catch {}
    }
  }

  // Resposta obrigatória do PostToolUse: JSON vazio
  const flushed = process.stdout.write('{}\n', () => process.exit(0));
  if (!flushed) {
    process.stdout.once('drain', () => process.exit(0));
  }
  setTimeout(() => process.exit(0), 500).unref();
}

function checkAutoVerifyStopGate(terminationReason) {
  // Só intercepta paradas normais por conclusão de turno (NO_TOOL_CALL)
  if (terminationReason !== 'NO_TOOL_CALL') {
    return null;
  }

  const now = Date.now();
  let gateState = { retryCount: 0, timestamp: 0 };
  if (fs.existsSync(STOP_GATE_PATH)) {
    try {
      gateState = JSON.parse(fs.readFileSync(STOP_GATE_PATH, 'utf8')) || gateState;
    } catch {}
  }

  // Se já interceptou 1 vez nos últimos 5 minutos, libera o Stop e limpa a trava anti-loop
  if (gateState.retryCount >= 1 && (now - Number(gateState.timestamp || 0)) < 300000) {
    try { fs.unlinkSync(STOP_GATE_PATH); } catch {}
    try { if (fs.existsSync(MODIFIED_FILES_PATH)) fs.unlinkSync(MODIFIED_FILES_PATH); } catch {}
    return null;
  }

  // 1. Verificar se o último teste executado na sessão está quebrado (< 5 min)
  for (const statusFile of [LAST_TEST_STATUS_PATH, FAILED_TESTS_PATH]) {
    if (fs.existsSync(statusFile)) {
      try {
        const testStatus = JSON.parse(fs.readFileSync(statusFile, 'utf8'));
        const hasFailed = testStatus && (testStatus.passed === false || (Array.isArray(testStatus.failures) && testStatus.failures.length > 0));
        if (hasFailed && (now - Number(testStatus.timestamp || 0)) < 300000) {
          writeJsonAtomic(STOP_GATE_PATH, { retryCount: 1, timestamp: now });
          return (
            '🛑 [AUTO-VERIFY GATE] Parada prematura interceptada: há teste(s) falhando na última execução registrada.\n' +
            'Execute o teste isolado (node .agents/mcp-server.cjs test-isolate) e corrija a regressão antes de concluir.'
          );
        }
      } catch {}
    }
  }

  // 2. Verificar diagnósticos sintáticos/LSP e Segurança nos arquivos de código editados na sessão
  if (fs.existsSync(MODIFIED_FILES_PATH)) {
    try {
      const modifiedList = JSON.parse(fs.readFileSync(MODIFIED_FILES_PATH, 'utf8')) || [];
      const recentFiles = modifiedList
        .filter(item => item && item.file && (now - Number(item.timestamp || 0)) < 300000 && fs.existsSync(item.file))
        .slice(-5);

      if (recentFiles.length > 0) {
        // 2.1 Verificação LSP de Sintaxe
        const lspMod = findLibModule('lsp-engine.cjs');
        if (lspMod) {
          const LspEngine = require(lspMod);
          const lsp = new LspEngine(PROJECT_ROOT);
          for (const item of recentFiles) {
            const diag = lsp.diagnostics({ file_path: item.file });
            if (diag && (diag.isError || diag.hasDiagnostics)) {
              writeJsonAtomic(STOP_GATE_PATH, { retryCount: 1, timestamp: now });
              return (
                `🛑 [AUTO-VERIFY GATE] Parada prematura interceptada: erro de sintaxe/compilação detectado em ${path.basename(item.file)}:\n` +
                `${diag.text}\nCorrija o erro antes de finalizar o turno.`
              );
            }
          }
        }

        // 2.2 Verificação de Segurança (Anti-SQL Injection Gate)
        const secMod = findLibModule('security-linter.cjs');
        if (secMod) {
          try {
            const SecurityLinter = require(secMod);
            const linter = new SecurityLinter(PROJECT_ROOT);
            const secIssues = linter.scanFiles(recentFiles.map(r => r.file));
            const criticalSql = secIssues.filter(i => i.severity === 'CRITICAL');
            if (criticalSql.length > 0) {
              const first = criticalSql[0];
              writeJsonAtomic(STOP_GATE_PATH, { retryCount: 1, timestamp: now });
              return (
                `🛑 [SECURITY GATE] Parada prematura interceptada: VULNERABILIDADE DE SQL INJECTION detectada em ${path.basename(first.file)}:${first.line}!\n` +
                `Trecho: ${first.snippet}\n` +
                `Diagnóstico: ${first.message}\n` +
                `Substitua a concatenação/interpolação de string por parâmetro bind '?' antes de concluir.`
              );
            }
          } catch {}
        }
      }
      try { fs.unlinkSync(MODIFIED_FILES_PATH); } catch {}
    } catch {}
  }

  return null;
}

// -----------------------------------------------------------------------------
// Estágio: Stop (Renderização do Sumário de Diagnóstico e Auto-Verify Gate)
// -----------------------------------------------------------------------------
function handleStop(payload) {
  const terminationReason = payload.terminationReason || '';
  const topError = payload.error || '';
  const incidents = loadIncidents();

  // Verificar Gate Anti-Parada Prematura (TDD / LSP) quando terminationReason === NO_TOOL_CALL
  const autoVerifyReason = checkAutoVerifyStopGate(terminationReason);
  if (autoVerifyReason) {
    const payload = JSON.stringify({ decision: 'continue', reason: autoVerifyReason }) + '\n';
    const flushed = process.stdout.write(payload, () => process.exit(0));
    if (!flushed) {
      process.stdout.once('drain', () => process.exit(0));
    }
    setTimeout(() => process.exit(0), 500).unref();
    return;
  }

  const egMod = findLibModule('error-guard.cjs');
  const ErrorGuard = egMod ? require(egMod) : null;
  const loggedErrors = ErrorGuard ? ErrorGuard.listErrors(PROJECT_ROOT, { onlyUnresolved: true }) : [];

  const hasErrors = incidents.length > 0 || loggedErrors.length > 0 || (topError && topError.trim().length > 0) || terminationReason === 'ERROR';

  if (hasErrors) {
    const reportData = {
      timestamp: new Date().toISOString(),
      terminationReason,
      topError: topError || null,
      totalIncidents: incidents.length + loggedErrors.length,
      incidents: incidents,
      loggedErrors: loggedErrors
    };

    // Salvar relatório para inspeção histórica
    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf8');
    } catch {}

    // Montar Card Visual de Diagnóstico no stderr (visível diretamente no console)
    const errCount = incidents.length + loggedErrors.length + (topError ? 1 : 0);
    const border = '─'.repeat(70);

    let output = `\n${C.bYellow}╭─ ⚠️  RELATÓRIO DE DIAGNÓSTICO E INCIDENTES (GSD-AGY-KIT) ${border.slice(52)}╮${C.reset}\n`;
    output += `${C.bYellow}│${C.reset}  Foram detectados ${C.bRed}${errCount} evento(s) de atenção${C.reset} durante a execução desta sessão:\n`;
    output += `${C.bYellow}│${C.reset}\n`;

    let itemNum = 1;
    if (topError) {
      output += `${C.bYellow}│${C.reset}  ${C.bRed}[${itemNum}] Erro Fatal de Execução (Termination Reason: ${terminationReason})${C.reset}\n`;
      output += `${C.bYellow}│${C.reset}      ${C.red}${topError}${C.reset}\n`;
      output += `${C.bYellow}│${C.reset}\n`;
      itemNum++;
    }

    for (const inc of incidents.slice(-8)) {
      const stepStr = inc.stepIdx ? `Passo ${inc.stepIdx} - ` : '';
      const toolStr = inc.tool ? `[${inc.tool}]` : '[Sistema]';
      const typeStr = inc.type === 'hard_gate_block' ? `${C.yellow}Hard Gate Bloqueado` : `${C.red}Falha de Ferramenta`;

      output += `${C.bYellow}│${C.reset}  ${C.bold}[${itemNum}] ${stepStr}${toolStr} ${typeStr}${C.reset}\n`;

      if (inc.error) {
        const cleanErr = inc.error.split('\n').slice(0, 2).join(' ').slice(0, 120);
        output += `${C.bYellow}│${C.reset}      ${C.dim}Erro: ${cleanErr}${C.reset}\n`;
      }
      if (inc.reason) {
        const cleanReason = inc.reason.split('\n')[0].slice(0, 120);
        output += `${C.bYellow}│${C.reset}      ${C.dim}Motivo: ${cleanReason}${C.reset}\n`;
      }
      if (inc.args) {
        let argSummary = '';
        if (inc.args.CommandLine) argSummary = `cmd: ${inc.args.CommandLine.slice(0, 70)}`;
        else if (inc.args.AbsolutePath) argSummary = `file: ${path.basename(inc.args.AbsolutePath)}`;
        if (argSummary) {
          output += `${C.bYellow}│${C.reset}      ${C.dim}Alvo: ${argSummary}${C.reset}\n`;
        }
      }
      output += `${C.bYellow}│${C.reset}\n`;
      itemNum++;
    }

    if (incidents.length > 8) {
      output += `${C.bYellow}│${C.reset}  ${C.dim}... e mais ${incidents.length - 8} incidente(s). Veja completo em: .agents/.cache/latest-session-report.json${C.reset}\n`;
      output += `${C.bYellow}│${C.reset}\n`;
    }

    output += `${C.bYellow}│${C.reset}  ${C.bCyan}💡 Dica de Auditoria:${C.reset} O histórico completo fica gravado em ${C.bold}.agents/.cache/latest-session-report.json${C.reset}\n`;
    output += `${C.bYellow}╰${border}╯${C.reset}\n`;

    // Imprime o Card no stderr para visualização imediata do desenvolvedor
    process.stderr.write(output);

    // Limpa a fila de incidentes da sessão após renderizar
    try {
      fs.unlinkSync(INCIDENTS_FILE);
    } catch {}
  }

  // Resposta padrão ao Antigravity CLI permitindo o término normal
  const payload = JSON.stringify({ decision: "allow" }) + '\n';
  const flushed = process.stdout.write(payload, () => process.exit(0));
  if (!flushed) {
    process.stdout.once('drain', () => process.exit(0));
  }
  setTimeout(() => process.exit(0), 500).unref();
}

// -----------------------------------------------------------------------------
// Main Dispatcher
// -----------------------------------------------------------------------------
async function main() {
  const isStopSummary = process.argv.includes('--summary') || process.argv.includes('--stop');
  const rawInput = await readStdin();

  let payload = {};
  if (rawInput && rawInput.trim()) {
    try {
      payload = JSON.parse(rawInput);
    } catch {}
  }

  if (isStopSummary) {
    handleStop(payload);
  } else {
    handlePostToolUse(payload);
  }
}

main().catch(() => {
  // Em caso de falha interna, nunca quebrar o fluxo do agente
  if (process.argv.includes('--summary')) {
    process.stdout.write('{"decision":"allow"}\n');
  } else {
    process.stdout.write('{}\n');
  }
  process.exit(0);
});
