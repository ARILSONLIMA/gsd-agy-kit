#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - SessionStart Hook (Briefing Zero-Read)
 * Injeta um resumo executivo ultracompacto (~150 tokens) no início de uma nova
 * sessão do Antigravity CLI, contendo:
 * 1. Fase atual, status e próximo plano de .planning/STATE.md
 * 2. Últimas decisões/problemas do MemPalace
 * 3. Status de testes falhos pendentes e último micro-checkpoint git
 *
 * Isso poupa milhares de tokens evitando que o agente leia STATE.md, ROADMAP.md
 * e PROJECT.md inteiros no primeiro turno.
 *
 * TODO(security): Local CLI/Stdio lifecycle hook; web session/CSRF/CSP controls not applicable.
 */

const fs = require('fs');
const path = require('path');

function resolveProjectRoot() {
  const hooksParent = path.resolve(__dirname, '..');
  if (path.basename(hooksParent) === '.agents') return path.dirname(hooksParent);
  let dir = process.cwd();
  for (;;) {
    if (path.basename(dir) === '.agents') return path.dirname(dir);
    if (fs.existsSync(path.join(dir, '.agents')) || fs.existsSync(path.join(dir, '.planning'))) return dir;
    const up = path.dirname(dir);
    if (up === dir) return process.cwd();
    dir = up;
  }
}

const PROJECT_ROOT = resolveProjectRoot();

function findLibModule(name) {
  const candidates = [
    path.resolve(__dirname, '..', 'lib', name),
    path.resolve(__dirname, '..', 'kit', 'lib', name),
    path.join(PROJECT_ROOT, '.agents', 'lib', name),
    path.join(PROJECT_ROOT, '.agents', 'kit', 'lib', name),
    path.join(PROJECT_ROOT, 'lib', name)
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function getCompactStateBrief(projectRoot) {
  const stateFile = path.join(projectRoot, '.planning', 'STATE.md');
  if (!fs.existsSync(stateFile)) return null;
  try {
    const raw = fs.readFileSync(stateFile, 'utf8');
    let phase = null;
    let phaseName = null;
    let status = null;

    const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
    if (fmMatch) {
      const yaml = fmMatch[1];
      const pMatch = yaml.match(/^current_phase:\s*(.+)$/m);
      const pnMatch = yaml.match(/^current_phase_name:\s*["']?([^"'\r\n]+)["']?$/m);
      const sMatch = yaml.match(/^status:\s*["']?([^"'\r\n]+)["']?$/m);
      if (pMatch) phase = pMatch[1].trim();
      if (pnMatch) phaseName = pnMatch[1].trim();
      if (sMatch) status = sMatch[1].trim();
    }

    if (!phase) {
      const posMatch = raw.match(/Phase:\s*(\d+)\s*[—\-]\s*([^\r\n]+)/i);
      if (posMatch) {
        phase = posMatch[1].trim();
        phaseName = posMatch[2].trim();
      }
    }
    if (!status) {
      const stMatch = raw.match(/Status:\s*([^\r\n]+)/i);
      if (stMatch) status = stMatch[1].trim();
    }

    if (!phase && !status) return null;
    return `Fase ${phase || '?'}${phaseName ? ` (${phaseName})` : ''} [Status: ${status || 'ativo'}]`;
  } catch {
    return null;
  }
}

function getRecentMemPalaceBrief(projectRoot) {
  const mpPath = findLibModule('mempalace-engine.cjs');
  if (!mpPath) return null;
  let mp = null;
  try {
    const MemPalaceEngine = require(mpPath);
    mp = new MemPalaceEngine(projectRoot);
    const stats = mp.stats();
    if (!stats || !stats.total) return null;

    // Buscar últimas entradas relevantes
    const recent = mp.recall({ query: 'arquitetura OR decisão OR bug OR fase OR teste', limit: 3 });
    if (recent && Array.isArray(recent.results) && recent.results.length > 0) {
      const topics = recent.results.map(r => `[${r.room}] ${r.topic}`).join('; ');
      return `${stats.total} fato(s) no MemPalace (Recentes: ${topics})`;
    }
    return `${stats.total} fato(s) disponíveis no MemPalace (use mempalace_recall)`;
  } catch {
    return null;
  } finally {
    if (mp && typeof mp.close === 'function') {
      try { mp.close(); } catch {}
    }
  }
}

function getTestAndCheckpointBrief(projectRoot) {
  const parts = [];
  const failedTestsFile = path.join(projectRoot, '.agents', '.cache', 'failed-tests.json');
  if (fs.existsSync(failedTestsFile)) {
    try {
      const data = JSON.parse(fs.readFileSync(failedTestsFile, 'utf8'));
      if (Array.isArray(data.failures) && data.failures.length > 0) {
        parts.push(`⚠️ ${data.failures.length} teste(s) falho(s) pendente(s) (${data.failures[0]})`);
      }
    } catch {}
  }

  const chkPath = findLibModule('checkpoint-engine.cjs');
  if (chkPath) {
    try {
      const CheckpointEngine = require(chkPath);
      const chk = new CheckpointEngine(projectRoot);
      const latest = chk.getLatestCheckpoint();
      if (latest && latest.tag) {
        parts.push(`🛡️ Último Checkpoint: ${latest.tag} (${latest.headCommit})`);
      }
    } catch {}
  }

  return parts.length > 0 ? parts.join(' | ') : null;
}

function getBlueprintArtifactBrief(projectRoot) {
  const planPath = path.join(projectRoot, 'PLAN.md');
  const diagPath = path.join(projectRoot, 'DIAGNOSIS.md');
  const ambMod = findLibModule('ambiguity-guard.cjs');
  let ambWarn = '';

  if (ambMod) {
    try {
      const { validateAmbiguities } = require(ambMod);
      const ambRes = validateAmbiguities(projectRoot);
      if (ambRes.required && !ambRes.valid && fs.existsSync(path.join(projectRoot, 'AMBIGUITIES.md'))) {
        ambWarn = `\n⚠️ [Alerta AMBIGUITIES.md]: ${ambRes.message}`;
      }
    } catch {}
  }

  if (fs.existsSync(planPath)) {
    try {
      const rawPlan = fs.readFileSync(planPath, 'utf8').trim();
      if (rawPlan.length > 0) {
        const clipped = rawPlan.length > 1500 ? rawPlan.slice(0, 1500) + '\n...(truncado)' : rawPlan;
        return {
          hasPlan: true,
          statusLabel: 'Plano Ativo (PLAN.md carregado)',
          text:
            `📋 [Blueprint de Execução Zero-Releitura — PLAN.md]\n${clipped}\n` +
            `⚡ Diretiva: Execute diretamente nos ranges arquivo:linha mapeados acima em batching paralelo (múltiplos read_file/edit_file no mesmo turno). NÃO releia docs/ ou tests/ já consolidados no plano.${ambWarn}`
        };
      }
    } catch {}
  }

  if (fs.existsSync(diagPath)) {
    try {
      const rawDiag = fs.readFileSync(diagPath, 'utf8').trim();
      if (rawDiag.length > 0) {
        const clipped = rawDiag.length > 1100 ? rawDiag.slice(0, 1100) + '\n...(truncado)' : rawDiag;
        return {
          hasPlan: false,
          statusLabel: 'Diagnóstico Concluído (DIAGNOSIS.md carregado)',
          text:
            `🩺 [Diagnóstico Ativo — DIAGNOSIS.md]\n${clipped}${ambWarn}`
        };
      }
    } catch {}
  }

  return { hasPlan: false, statusLabel: null, text: ambWarn ? ambWarn.trim() : '' };
}

function main() {
  const stateBrief = getCompactStateBrief(PROJECT_ROOT);
  const memBrief = getRecentMemPalaceBrief(PROJECT_ROOT);
  const testChkBrief = getTestAndCheckpointBrief(PROJECT_ROOT);
  const blueprint = getBlueprintArtifactBrief(PROJECT_ROOT);

  const sections = [];
  if (stateBrief) sections.push(`📍 Estado GSD: ${stateBrief}`);
  else if (blueprint.statusLabel) sections.push(`📍 Estado GSD: ${blueprint.statusLabel}`);
  if (memBrief) sections.push(`🏛️ Memória: ${memBrief}`);
  if (testChkBrief) sections.push(testChkBrief);

  if (sections.length === 0) {
    sections.push('📍 Estado GSD: Pronto para inicialização / ciclo ativo');
  }

  // Registrar economia do briefing inicial Zero-Read
  const savingsPath = findLibModule('token-savings.cjs');
  if (savingsPath) {
    try {
      const TokenSavingsTracker = require(savingsPath);
      const tracker = new TokenSavingsTracker(PROJECT_ROOT);
      tracker.recordSaving('session_briefing', blueprint.hasPlan ? 2600 : 1800);
    } catch {}
  }

  const mapPath = findLibModule('codebase-map.cjs');
  let codebaseMapText = '';
  if (mapPath && !blueprint.hasPlan) {
    try {
      const { buildCodebaseMap } = require(mapPath);
      codebaseMapText = buildCodebaseMap(PROJECT_ROOT, 1500);
    } catch {}
  }

  let briefingText =
    `🚀 [GSD Zero-Read Session Briefing] ${sections.join(' | ')}.\n` +
    `💡 Protocolo Ativo: Ponytail Senior Dev (reuso de src/utils/ + YAGNI) & Caveman Terse (resposta direta + batching paralelo).`;

  if (blueprint.text) {
    briefingText += `\n\n${blueprint.text}`;
  } else if (codebaseMapText) {
    briefingText += `\n\n${codebaseMapText}`;
  }

  process.stdout.write(
    JSON.stringify({
      injectSteps: [
        {
          ephemeralMessage: briefingText
        }
      ]
    }) + '\n'
  );
  process.exit(0);
}

try {
  main();
} catch {
  process.stdout.write('{}\n');
  process.exit(0);
}
