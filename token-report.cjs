#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Utilitário de formatação numérica em pt-BR
 */
function fmtNum(n) {
  if (typeof n !== 'number' || isNaN(n)) return '0';
  return n.toLocaleString('pt-BR');
}

function fmtPercent(n) {
  if (typeof n !== 'number' || isNaN(n)) return '0,00 %';
  return `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} %`;
}

/**
 * Localiza os diretórios base do Antigravity CLI
 */
function getAntigravityPaths() {
  const homeDir = os.homedir();
  const baseDir = path.join(homeDir, '.gemini', 'antigravity-cli');
  const brainDir = path.join(baseDir, 'brain');
  const cacheFile = path.join(baseDir, 'cache', 'last_conversations.json');
  return { baseDir, brainDir, cacheFile };
}

/**
 * Lista todas as sessões com transcripts válidos ordenadas pela mais recente
 */
function listSessions(brainDir) {
  if (!fs.existsSync(brainDir)) return [];

  const sessions = [];
  try {
    const entries = fs.readdirSync(brainDir, { withFileTypes: true });
    for (const ent of entries) {
      if (!ent.isDirectory()) continue;
      const convId = ent.name;
      const transcriptPath = path.join(brainDir, convId, '.system_generated', 'logs', 'transcript.jsonl');
      if (fs.existsSync(transcriptPath)) {
        try {
          const stat = fs.statSync(transcriptPath);
          sessions.push({
            id: convId,
            path: transcriptPath,
            mtime: stat.mtimeMs,
            date: stat.mtime
          });
        } catch (_) {}
      }
    }
  } catch (_) {}

  // Ordena por data decrescente (mais recente primeiro)
  sessions.sort((a, b) => b.mtime - a.mtime);
  return sessions;
}

/**
 * Determina o ID de conversa associado ao workspace atual
 */
function getWorkspaceConvId(cacheFile, cwd) {
  if (!fs.existsSync(cacheFile)) return null;
  try {
    const raw = fs.readFileSync(cacheFile, 'utf-8');
    const map = JSON.parse(raw);
    const normalizedCwd = path.resolve(cwd).toLowerCase();

    // Casamento exato
    for (const [key, convId] of Object.entries(map)) {
      if (path.resolve(key).toLowerCase() === normalizedCwd) {
        return convId;
      }
    }

    // Casamento de subpasta
    for (const [key, convId] of Object.entries(map)) {
      const normKey = path.resolve(key).toLowerCase();
      if (normalizedCwd.startsWith(normKey)) {
        return convId;
      }
    }
  } catch (_) {}
  return null;
}

/**
 * Carrega a telemetria de economia ativa do GSD Kit e status de orçamento
 */
function loadKitSavingsAndBudget(cwd, totalTokens) {
  let kitSavings = {
    totalEvents: 0,
    totalTokensSaved: 0,
    categories: {},
    topCategories: []
  };

  const candidates = [
    path.resolve(__dirname, 'lib', 'token-savings.cjs'),
    path.resolve(__dirname, '..', 'lib', 'token-savings.cjs'),
    path.join(cwd, '.agents', 'lib', 'token-savings.cjs'),
    path.join(cwd, 'lib', 'token-savings.cjs')
  ];
  const trackerPath = candidates.find(p => fs.existsSync(p));
  if (trackerPath) {
    try {
      const { TokenSavingsTracker } = require(trackerPath);
      const tracker = new TokenSavingsTracker(cwd);
      kitSavings = tracker.getSummary();
    } catch (_) {}
  }

  let budgetLimit = Number(process.env.GSD_TOKEN_BUDGET_WARN || 0);
  if (!budgetLimit) {
    const cfgPath = path.join(cwd, '.planning', 'config.json');
    if (fs.existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        budgetLimit = Number(cfg.token_budget || cfg.budget_tokens || 0);
      } catch (_) {}
    }
  }

  const usedPct = budgetLimit > 0 ? (totalTokens / budgetLimit) * 100 : 0;
  const budgetStatus = {
    configured: budgetLimit > 0,
    limit: budgetLimit,
    used: totalTokens,
    usedPercent: Number(usedPct.toFixed(2)),
    status: budgetLimit <= 0 ? 'UNLIMITED' : (usedPct >= 100 ? 'EXCEEDED' : (usedPct >= 80 ? 'WARNING' : 'OK'))
  };

  return { kitSavings, budgetStatus };
}

/**
 * Analisa o arquivo transcript.jsonl e extrai as métricas de tokens e ferramentas
 */
function analyzeTranscript(transcriptPath, cwd = process.cwd()) {
  if (!fs.existsSync(transcriptPath)) {
    return null;
  }

  const content = fs.readFileSync(transcriptPath, 'utf-8');
  const lines = content.split('\n').filter(Boolean);

  let steps = 0;
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  let firstTimestamp = null;
  let lastTimestamp = null;
  const toolCounts = {};

  let detectedWorkspace = null;

  for (const line of lines) {
    try {
      const entry = JSON.parse(line);

      if (entry.created_at) {
        if (!firstTimestamp) firstTimestamp = entry.created_at;
        lastTimestamp = entry.created_at;
      }

      if (Array.isArray(entry.tool_calls)) {
        for (const tc of entry.tool_calls) {
          const tName = (tc && (tc.name || tc.tool_name || (tc.function && tc.function.name))) || null;
          if (tName) {
            toolCounts[tName] = (toolCounts[tName] || 0) + 1;
          }
          if (!detectedWorkspace) {
            const rawArgs = JSON.stringify(tc.function?.arguments || tc.args || tc.arguments || '');
            const m = rawArgs.match(/"(\/[^"]+?)\/(?:\.planning|\.agents|src|package\.json|comandos-gsd)/);
            if (m && fs.existsSync(m[1])) {
              detectedWorkspace = m[1];
            }
          }
        }
      }

      // Considera chamadas com retorno do modelo (PLANNER_RESPONSE ou métricas de tokens)
      if (
        entry.type === 'PLANNER_RESPONSE' ||
        entry.input_tokens !== undefined ||
        entry.output_tokens !== undefined
      ) {
        steps++;
        inputTokens += Number(entry.input_tokens || 0);
        cacheReadTokens += Number(entry.cache_read_tokens || 0);
        outputTokens += Number(entry.output_tokens || 0);
      }
    } catch (_) {
      // Ignora linhas malformadas
    }
  }

  const promptTotal = inputTokens + cacheReadTokens;
  const totalTokens = promptTotal + outputTokens;
  const cacheHitRate = promptTotal > 0 ? (cacheReadTokens / promptTotal) * 100 : 0;

  const topTools = Object.entries(toolCounts)
    .map(([name, calls]) => ({ name, calls }))
    .sort((a, b) => b.calls - a.calls)
    .slice(0, 5);

  const effectiveCwd = (cwd && cwd !== process.cwd()) ? cwd : (detectedWorkspace || cwd || process.cwd());
  const { kitSavings, budgetStatus } = loadKitSavingsAndBudget(effectiveCwd, totalTokens);

  return {
    path: transcriptPath,
    workspace: effectiveCwd,
    steps,
    inputTokens,
    cacheReadTokens,
    outputTokens,
    promptTotal,
    totalTokens,
    cacheHitRate,
    savedTokens: cacheReadTokens,
    kitSavings,
    topTools,
    budgetStatus,
    firstTimestamp,
    lastTimestamp
  };
}

/**
 * Imprime a tabela formatada no terminal
 */
function printReport(sessionInfo, metrics) {
  const line = '─'.repeat(74);
  const doubleLine = '═'.repeat(74);

  console.log(`\n╔${doubleLine}╗`);
  console.log(`║             📊 RELATÓRIO DE TELEMETRIA E CONSUMO DE TOKENS               ║`);
  console.log(`╠${line}╣`);
  console.log(`║ Sessão:      ${sessionInfo.id.padEnd(58)} ║`);
  if (sessionInfo.workspace) {
    console.log(`║ Workspace:   ${sessionInfo.workspace.slice(0, 58).padEnd(58)} ║`);
  }
  const dateStr = metrics.lastTimestamp
    ? new Date(metrics.lastTimestamp).toLocaleString('pt-BR')
    : new Date().toLocaleString('pt-BR');
  console.log(`║ Último Passo: ${dateStr.padEnd(57)} ║`);
  console.log(`╠${line}╣`);
  console.log(`║ Métrica                                     │ Valor                      ║`);
  console.log(`╠${'─'.repeat(45)}┼${'─'.repeat(28)}╣`);

  const printRow = (label, valStr) => {
    const l = label.slice(0, 43).padEnd(43);
    const v = String(valStr).slice(0, 26).padStart(26);
    console.log(`║ ${l} │ ${v} ║`);
  };

  printRow('Chamadas ao Modelo (Steps)', fmtNum(metrics.steps));
  printRow('Tokens de Entrada Novos (Prompt)', fmtNum(metrics.inputTokens));
  printRow('Tokens Reaproveitados em Cache (Read)', fmtNum(metrics.cacheReadTokens));
  printRow('Tokens de Saída Gerados (Completion)', fmtNum(metrics.outputTokens));

  console.log(`╠${'─'.repeat(45)}┼${'─'.repeat(28)}╣`);
  printRow('Contexto Total Avaliado (Input + Cache)', fmtNum(metrics.promptTotal));
  printRow('Total Geral de Tokens Processados', fmtNum(metrics.totalTokens));

  console.log(`╠${'─'.repeat(45)}┼${'─'.repeat(28)}╣`);
  printRow('Taxa de Acerto de Cache (Cache Hit Rate)', fmtPercent(metrics.cacheHitRate));
  printRow('Tokens Poupados via Prompt Cache', fmtNum(metrics.savedTokens));

  if (metrics.kitSavings) {
    console.log(`╠${'─'.repeat(45)}┼${'─'.repeat(28)}╣`);
    printRow('Economia Ativa do GSD Kit (Tokens Poupados)', fmtNum(metrics.kitSavings.totalTokensSaved));
    printRow('Intervenções de Economia do Kit (Eventos)', fmtNum(metrics.kitSavings.totalEvents));
    if (Array.isArray(metrics.kitSavings.topCategories) && metrics.kitSavings.topCategories.length > 0) {
      for (const cat of metrics.kitSavings.topCategories.slice(0, 3)) {
        printRow(`  └─ ${cat.category} (${cat.events}x)`, `${fmtNum(cat.tokensSaved)} tok`);
      }
    }
  }

  if (Array.isArray(metrics.topTools) && metrics.topTools.length > 0) {
    console.log(`╠${'─'.repeat(45)}┼${'─'.repeat(28)}╣`);
    const topStr = metrics.topTools.slice(0, 3).map(t => `${t.name}(${t.calls})`).join(', ');
    printRow('Top Ferramentas Invocadas', topStr);
  }

  if (metrics.budgetStatus && metrics.budgetStatus.configured) {
    console.log(`╠${'─'.repeat(45)}┼${'─'.repeat(28)}╣`);
    printRow(
      `Orçamento de Tokens (${metrics.budgetStatus.status})`,
      `${fmtPercent(metrics.budgetStatus.usedPercent)} de ${fmtNum(metrics.budgetStatus.limit)}`
    );
  }

  console.log(`╚${doubleLine}╝`);

  if (metrics.cacheHitRate > 0) {
    console.log(`\n💡 Destaque: ${fmtPercent(metrics.cacheHitRate)} do contexto foi servido via Cache!`);
    console.log(`   Foram economizados ${fmtNum(metrics.savedTokens)} tokens de processamento novo na API.`);
  } else {
    console.log(`\nℹ️  Nenhum token em cache reutilizado até o momento nesta sessão.`);
  }
  if (metrics.kitSavings && metrics.kitSavings.totalTokensSaved > 0) {
    console.log(`🛡️  GSD Kit ROI: ${fmtNum(metrics.kitSavings.totalTokensSaved)} tokens poupados ativamente em ${fmtNum(metrics.kitSavings.totalEvents)} intervenções.\n`);
  } else {
    console.log('');
  }
}

/**
 * Ponto de entrada principal
 */
function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const allMode = args.includes('--all');
  const helpMode = args.includes('--help') || args.includes('-h');

  if (helpMode) {
    console.log(`
Uso: node scripts/token-report.cjs [opções] [conv_id_ou_caminho]

Opções:
  --help, -h    Exibe esta mensagem de ajuda
  --json        Retorna os dados em formato JSON estruturado
  --all         Lista métricas resumidas das últimas 5 sessões

Exemplos:
  node scripts/token-report.cjs
  node scripts/token-report.cjs 2ee1d7eb-fe47-4c86-9060-33bce120a7f3
  node scripts/token-report.cjs --all
  node scripts/token-report.cjs --json
`);
    process.exit(0);
  }

  const { brainDir, cacheFile } = getAntigravityPaths();
  const sessions = listSessions(brainDir);

  if (sessions.length === 0) {
    console.error('❌ Nenhuma sessão ou transcript encontrado em:', brainDir);
    process.exit(1);
  }

  if (allMode) {
    const topSessions = sessions.slice(0, 5);
    const results = [];
    for (const s of topSessions) {
      const m = analyzeTranscript(s.path);
      if (m) {
        results.push({
          id: s.id,
          date: s.date,
          metrics: m
        });
      }
    }

    if (jsonMode) {
      console.log(JSON.stringify(results, null, 2));
      return;
    }

    console.log('\n📊 HISTÓRICO DAS ÚLTIMAS SESSÕES NO BRAIN:');
    console.log('═'.repeat(74));
    for (const r of results) {
      const dt = new Date(r.date).toLocaleString('pt-BR');
      console.log(`• Sessão: ${r.id} (${dt})`);
      console.log(`  Steps: ${fmtNum(r.metrics.steps)} | Novos: ${fmtNum(r.metrics.inputTokens)} | Cache: ${fmtNum(r.metrics.cacheReadTokens)} | Hit: ${fmtPercent(r.metrics.cacheHitRate)}`);
      console.log('─'.repeat(74));
    }
    return;
  }

  // Identificação do alvo
  let targetConvId = null;
  let targetPath = null;
  let targetWorkspace = null;
  const nonFlagArgs = args.filter(a => !a.startsWith('-'));

  if (nonFlagArgs.length > 0) {
    const candidate = nonFlagArgs[0];
    if (fs.existsSync(candidate)) {
      const stat = fs.statSync(candidate);
      if (stat.isDirectory()) {
        targetWorkspace = path.resolve(candidate);
        // Tentar mapear via cacheFile
        targetConvId = getWorkspaceConvId(cacheFile, targetWorkspace);
        if (!targetConvId) {
          // Buscar entre sessões recentes
          for (const s of sessions) {
            try {
              const headChunk = fs.readFileSync(s.path, 'utf8').slice(0, 50000);
              if (headChunk.includes(targetWorkspace)) {
                targetPath = s.path;
                targetConvId = s.id;
                break;
              }
            } catch (_) {}
          }
        }
      } else {
        targetPath = path.resolve(candidate);
        targetConvId = path.basename(path.dirname(path.dirname(path.dirname(targetPath)))) || 'especificado';
      }
    } else {
      targetConvId = candidate;
    }
  }

  if (!targetConvId && !targetPath) {
    targetConvId = process.env.ANTIGRAVITY_CONVERSATION_ID ||
                   process.env.CONVERSATION_ID ||
                   process.env.CONV_ID ||
                   getWorkspaceConvId(cacheFile, targetWorkspace || process.cwd()) ||
                   (sessions[0] && sessions[0].id);
  }

  if (!targetPath && targetConvId) {
    targetPath = path.join(brainDir, targetConvId, '.system_generated', 'logs', 'transcript.jsonl');
  }

  if (!targetPath || !fs.existsSync(targetPath)) {
    // Fallback: sessão mais recente
    if (sessions.length > 0) {
      targetPath = sessions[0].path;
      targetConvId = sessions[0].id;
    } else {
      console.error('❌ Não foi possível encontrar o arquivo transcript.jsonl para análise.');
      process.exit(1);
    }
  }

  const metrics = analyzeTranscript(targetPath, targetWorkspace || process.cwd());
  if (!metrics) {
    console.error(`❌ Falha ao analisar transcript em: ${targetPath}`);
    process.exit(1);
  }

  const sessionInfo = {
    id: targetConvId,
    workspace: metrics.workspace || targetWorkspace || process.cwd(),
    path: targetPath
  };

  if (jsonMode) {
    console.log(JSON.stringify({ session: sessionInfo, metrics }, null, 2));
  } else {
    printReport(sessionInfo, metrics);
  }
}

main();
