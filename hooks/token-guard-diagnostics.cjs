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

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => resolve(''), 2000);
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

function loadIncidents() {
  if (!fs.existsSync(INCIDENTS_FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
  } catch {
    return [];
  }
}

function saveIncidents(incidents) {
  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
  try {
    fs.writeFileSync(INCIDENTS_FILE, JSON.stringify(incidents, null, 2), 'utf8');
  } catch {}
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

  if (error && typeof error === 'string' && error.trim().length > 0) {
    recordIncident({
      type: 'tool_error',
      tool: toolName,
      stepIdx: stepIdx,
      error: error.trim(),
      args: args
    });
  }

  // Monitorar comandos de teste para Auto-Isolate, Checkpoints e MemPalace v2
  if (toolName === 'run_command' || toolName === 'bash' || toolName === 'shell') {
    const cmd = args.CommandLine || args.command || '';
    const isTestCmd = /\b(npm\s+test|node\s+--test|pytest|go\s+test|cargo\s+test)\b/i.test(cmd);
    if (isTestCmd) {
      try {
        const TestIsolate = require('../lib/test-isolate.cjs');
        const testIsolate = new TestIsolate(PROJECT_ROOT);
        const combinedOutput = `${output}\n${error}`;
        const failures = testIsolate.parseFailures(combinedOutput);

        if (failures.length > 0 || (error && error.trim().length > 0)) {
          testIsolate.recordFailures(failures.length > 0 ? failures : ['Erro na execução de testes'], cmd);
        } else {
          const hadPreviousFailures = testIsolate.getFailedTests().length > 0;
          testIsolate.recordSuccess(cmd);

          if (hadPreviousFailures) {
            // Transição Vermelho -> Verde detectada!
            try {
              const MemPalace = require('../lib/mempalace-engine.cjs');
              const mempalace = new MemPalace(PROJECT_ROOT);
              mempalace.capture({
                room: 'problems',
                topic: `Teste Verde: ${cmd.slice(0, 50)}`,
                content: `Testes passaram após correção no código.`,
                rationale: 'Auto-captura heurística do GSD AGY Kit na resolução do teste.'
              });
            } catch {}

            try {
              const Checkpoint = require('../lib/checkpoint-engine.cjs');
              const checkpoint = new Checkpoint(PROJECT_ROOT);
              checkpoint.createCheckpoint('green-test');
            } catch {}
          }
        }
      } catch {}
    }
  }

  // Resposta obrigatória do PostToolUse: JSON vazio
  process.stdout.write('{}\n');
  process.exit(0);
}

// -----------------------------------------------------------------------------
// Estágio: Stop (Renderização do Sumário de Diagnóstico no Fim da Sessão)
// -----------------------------------------------------------------------------
function handleStop(payload) {
  const terminationReason = payload.terminationReason || '';
  const topError = payload.error || '';
  const incidents = loadIncidents();

  const hasErrors = incidents.length > 0 || (topError && topError.trim().length > 0) || terminationReason === 'ERROR';

  if (hasErrors) {
    const reportData = {
      timestamp: new Date().toISOString(),
      terminationReason,
      topError: topError || null,
      totalIncidents: incidents.length,
      incidents: incidents
    };

    // Salvar relatório para inspeção histórica
    try {
      if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(REPORT_FILE, JSON.stringify(reportData, null, 2), 'utf8');
    } catch {}

    // Montar Card Visual de Diagnóstico no stderr (visível diretamente no console)
    const errCount = incidents.length + (topError ? 1 : 0);
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
  process.stdout.write(JSON.stringify({ decision: "allow" }) + '\n');
  process.exit(0);
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
