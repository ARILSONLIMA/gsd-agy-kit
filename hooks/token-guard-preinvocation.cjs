'use strict';

/**
 * Token Guard - PreInvocation Hook com Self-Healing
 * 
 * 1. Self-Healing: Detecta se um update recente do GSD sobrescreveu os arquivos (.agents/agents)
 *    reintroduzindo ferramentas incompatíveis ('glob'). Se detectado, reaplica os patches em silêncio.
 * 2. Injeta banner de prioridade de ferramentas no início de cada turno.
 */

const fs = require('fs');
const path = require('path');
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

function findKitScript(name) {
  const candidates = [
    path.resolve(__dirname, '..', name),
    path.join(PROJECT_ROOT, '.agents', 'kit', name),
    path.join(PROJECT_ROOT, 'gsd-agy-kit', name),
    path.join(PROJECT_ROOT, 'scripts', name),
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

const CACHE_DIR = path.join(PROJECT_ROOT, '.agents', '.cache');
try { if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true }); } catch {}

const DEBOUNCE_FILE = path.join(CACHE_DIR, 'last-heal-check.txt');
const DEBOUNCE_LEGACY = path.join(PROJECT_ROOT, '.agents', '.last-heal-check');
const DEBOUNCE_MS = 10000;

function checkAndAutoHeal() {
  try {
    const now = Date.now();
    const debFile = fs.existsSync(DEBOUNCE_FILE) ? DEBOUNCE_FILE : (fs.existsSync(DEBOUNCE_LEGACY) ? DEBOUNCE_LEGACY : null);
    if (debFile) {
      try {
        const lastCheck = parseInt(fs.readFileSync(debFile, 'utf8'), 10);
        if (now - lastCheck < DEBOUNCE_MS) return;
      } catch {}
    }
    fs.writeFileSync(DEBOUNCE_FILE, String(now), 'utf8');

    const agentsDir = path.resolve(PROJECT_ROOT, '.agents', 'agents');
    if (!fs.existsSync(agentsDir)) return;

    // Amostragem rápida em gsd-executor.md para não onerar o I/O
    const sampleAgent = path.join(agentsDir, 'gsd-executor.md');
    if (fs.existsSync(sampleAgent)) {
      const content = fs.readFileSync(sampleAgent, 'utf8');
      if (content.includes('- glob')) {
        // GSD foi atualizado e reintroduziu 'glob' — disparar auto-heal!
        const patchScript = findKitScript('patch-agents.cjs');
        if (patchScript) {
          try {
            execSync(`node "${patchScript}" "${PROJECT_ROOT}"`, { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000, encoding: 'utf8' });
          } catch (patchErr) {
            const ErrorGuard = findLibModule('error-guard.cjs');
            if (ErrorGuard) {
              const errDetail = (patchErr.stderr ? patchErr.stderr.toString().trim() : '') || patchErr.message;
              ErrorGuard.emitError(PROJECT_ROOT, {
                category: 'HOOK',
                component: 'hook:auto-heal',
                title: 'Falha ao aplicar patch de agentes (patch-agents.cjs)',
                stderr: errDetail,
                hint: 'Execute "node .agents/kit/patch-agents.cjs" manualmente para diagnosticar a falha.',
                severity: 'warning'
              });
            }
          }
        }
      }
    }
  } catch (err) {
    const ErrorGuard = findLibModule('error-guard.cjs');
    if (ErrorGuard) {
      ErrorGuard.recordError(PROJECT_ROOT, {
        category: 'HOOK',
        component: 'hook:auto-heal',
        title: 'Exceção inesperada durante rotina de auto-healing',
        stderr: err.stack || err.message,
        severity: 'warning'
      });
    }
  }
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

const PHASE_TRACK_FILE = path.join(CACHE_DIR, 'last-synced-phase.txt');
const PHASE_TRACK_LEGACY = path.join(PROJECT_ROOT, '.agents', '.last-synced-phase');

function checkPhaseSync() {
  try {
    const stateFile = path.join(PROJECT_ROOT, '.planning', 'STATE.md');
    if (!fs.existsSync(stateFile)) return;

    const content = fs.readFileSync(stateFile, 'utf8').toLowerCase();
    let currentPhase = 'core';
    if (/status:\s*(planning|specifying|discussing|plan)/i.test(content) || /phase:\s*.*(plan|define|roadmap)/i.test(content)) {
      currentPhase = 'planning';
    } else if (/status:\s*(executing|in[-_]progress|running|exec|build)/i.test(content) || /(phase|current plan):\s*.*(exec|build|plan)/i.test(content)) {
      currentPhase = 'execution';
    } else if (/status:\s*(verifying|verification|testing|uat|review|ship)/i.test(content) || /phase:\s*.*(verif|review|ship)/i.test(content)) {
      currentPhase = 'verification';
    } else if (/status:\s*(research|researching|spike|explore)/i.test(content) || /phase:\s*.*research/i.test(content)) {
      currentPhase = 'research';
    }

    let lastPhase = '';
    const trackFile = fs.existsSync(PHASE_TRACK_FILE) ? PHASE_TRACK_FILE : (fs.existsSync(PHASE_TRACK_LEGACY) ? PHASE_TRACK_LEGACY : null);
    if (trackFile) {
      try { lastPhase = fs.readFileSync(trackFile, 'utf8').trim(); } catch {}
    }

    if (currentPhase !== lastPhase) {
      fs.writeFileSync(PHASE_TRACK_FILE, currentPhase, 'utf8');
      const optScript = findKitScript('optimize-tokens.cjs');
      const skillsScript = findKitScript('skills-manager.cjs');
      const compactScript = findKitScript('compact-state.cjs');

      if (optScript) {
        try {
          const { syncDynamicAgentPool } = require(optScript);
          syncDynamicAgentPool(PROJECT_ROOT, currentPhase);
        } catch {
          try { execSync(`node "${optScript}" "${PROJECT_ROOT}" --sync`, { stdio: 'ignore', timeout: 5000 }); } catch {}
        }
      }
      if (skillsScript) {
        try {
          const { syncSkills } = require(skillsScript);
          syncSkills(PROJECT_ROOT, currentPhase);
        } catch {
          try { execSync(`node "${skillsScript}" sync "${currentPhase}" "${PROJECT_ROOT}"`, { stdio: 'ignore', timeout: 5000 }); } catch {}
        }
      }
      if (compactScript) {
        try {
          const { compactState } = require(compactScript);
          compactState(PROJECT_ROOT);
        } catch {
          try { execSync(`node "${compactScript}" "${PROJECT_ROOT}"`, { stdio: 'ignore', timeout: 5000 }); } catch {}
        }
      }
    }
  } catch {}
}

const JIT_PROMOTIONS_FILE = path.join(CACHE_DIR, 'jit-promotions.json');
const JIT_PROMOTIONS_LEGACY = path.join(PROJECT_ROOT, '.agents', '.jit-promotions.json');

function checkJitTtlAndCleanup() {
  try {
    const promoFile = fs.existsSync(JIT_PROMOTIONS_FILE) ? JIT_PROMOTIONS_FILE : (fs.existsSync(JIT_PROMOTIONS_LEGACY) ? JIT_PROMOTIONS_LEGACY : null);
    if (!promoFile) return;
    const raw = fs.readFileSync(promoFile, 'utf8');
    const data = JSON.parse(raw);
    let changed = false;

    const projectRoot = PROJECT_ROOT;
    const skillsActiveDir = path.join(projectRoot, '.agents', 'skills');
    const agentsActiveDir = path.join(projectRoot, '.agents', 'agents');

    // 1. Processar skills promovidas via JIT
    if (data.skills && typeof data.skills === 'object') {
      for (const skillName of Object.keys(data.skills)) {
        const item = data.skills[skillName];
        item.turnsRemaining = (item.turnsRemaining || 1) - 1;
        if (item.turnsRemaining <= 0) {
          const targetSkill = path.join(skillsActiveDir, skillName);
          const poolSkill = path.join(projectRoot, '.agents', 'skills-pool', skillName);
          if (fs.existsSync(targetSkill) && fs.existsSync(poolSkill)) {
            try { fs.rmSync(targetSkill, { recursive: true, force: true }); } catch {}
          }
          delete data.skills[skillName];
          changed = true;
        } else {
          changed = true;
        }
      }
    }

    // 2. Processar subagentes promovidos via JIT
    if (data.agents && typeof data.agents === 'object') {
      for (const agentFile of Object.keys(data.agents)) {
        const item = data.agents[agentFile];
        item.turnsRemaining = (item.turnsRemaining || 1) - 1;
        if (item.turnsRemaining <= 0) {
          const targetAgent = path.join(agentsActiveDir, agentFile);
          const poolAgent = path.join(projectRoot, '.agents', 'agents-pool', agentFile);
          if (fs.existsSync(targetAgent) && fs.existsSync(poolAgent)) {
            try { fs.rmSync(targetAgent, { force: true }); } catch {}
          }
          delete data.agents[agentFile];
          changed = true;
        } else {
          changed = true;
        }
      }
    }

    if (changed) {
      writeJsonAtomic(JIT_PROMOTIONS_FILE, data);
    }
  } catch {}
}

function findLibModule(name) {
  const candidates = [
    path.resolve(__dirname, '..', 'lib', name),
    path.resolve(__dirname, '..', 'kit', 'lib', name),
    path.join(PROJECT_ROOT, '.agents', 'lib', name),
    path.join(PROJECT_ROOT, '.agents', 'kit', 'lib', name),
    path.join(PROJECT_ROOT, 'lib', name),
  ];
  const found = candidates.find(p => fs.existsSync(p));
  return found ? require(found) : null;
}

const INCIDENTS_FILE = path.join(CACHE_DIR, 'session-incidents.json');
const FAILED_TESTS_FILE = path.join(CACHE_DIR, 'failed-tests.json');
const LOOP_ALERT_STATE_FILE = path.join(CACHE_DIR, 'loop-alert-state.json');

function checkLoopAndBudgetAlert() {
  try {
    const now = Date.now();
    const alerts = [];
    let signatureParts = [];
    let queryTerm = '';

    // 1. Verificar falhas consecutivas de ferramentas em session-incidents.json (>= 3 nos últimos 5 min)
    if (fs.existsSync(INCIDENTS_FILE)) {
      try {
        const incidents = JSON.parse(fs.readFileSync(INCIDENTS_FILE, 'utf8'));
        if (Array.isArray(incidents) && incidents.length >= 3) {
          const recent = incidents.filter(inc => {
            const ts = typeof inc.timestamp === 'number' ? inc.timestamp : (Date.parse(inc.timestamp || '') || 0);
            return ts > 0 && (now - ts) < 300000;
          });
          const countsByKey = {};
          for (const inc of recent) {
            const incArgs = inc.args || {};
            const inferredTarget = inc.target || incArgs.AbsolutePath || incArgs.TargetFile || incArgs.CommandLine || inc.type || 'err';
            const shortTarget = path.basename(String(inferredTarget).split(/\s+/)[0]) || 'err';
            const key = `${inc.tool || 'unknown'}:${shortTarget}`;
            countsByKey[key] = (countsByKey[key] || 0) + 1;
          }
          for (const [key, count] of Object.entries(countsByKey)) {
            if (count >= 3) {
              alerts.push(`Detectadas ${count} falhas consecutivas em [${key}]`);
              signatureParts.push(`inc:${key}:${count}`);
              queryTerm = key.split(':')[1] || key.split(':')[0];
              break;
            }
          }
        }
      } catch {}
    }

    // 2. Verificar streak de falhas em testes em failed-tests.json (failureStreak >= 3)
    if (fs.existsSync(FAILED_TESTS_FILE)) {
      try {
        const failed = JSON.parse(fs.readFileSync(FAILED_TESTS_FILE, 'utf8'));
        const isRecent = failed && failed.timestamp && (now - failed.timestamp) < 300000;
        const streak = Number(failed && failed.failureStreak) || 0;
        if (isRecent && streak >= 3) {
          const targetLabel = failed.file || failed.testName || failed.command || 'test suite';
          alerts.push(`Detectadas ${streak} falhas consecutivas de teste em [${targetLabel}]`);
          signatureParts.push(`test:${targetLabel}:${streak}`);
          if (!queryTerm) queryTerm = String(targetLabel);
        }
      } catch {}
    }

    // 3. Verificar orçamento de tokens opcional (token_budget em .planning/config.json ou env GSD_TOKEN_BUDGET_WARN)
    let budgetLimit = Number(process.env.GSD_TOKEN_BUDGET_WARN || 0);
    if (!budgetLimit) {
      const cfgPath = path.join(PROJECT_ROOT, '.planning', 'config.json');
      if (fs.existsSync(cfgPath)) {
        try {
          const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
          budgetLimit = Number(cfg.token_budget || cfg.budget_tokens || 0);
        } catch {}
      }
    }
    if (budgetLimit > 0 && process.env.GSD_CURRENT_SESSION_TOKENS) {
      const currentTokens = Number(process.env.GSD_CURRENT_SESSION_TOKENS || 0);
      if (currentTokens >= budgetLimit * 0.85) {
        alerts.push(`Orçamento de tokens em ${Math.round((currentTokens / budgetLimit) * 100)}% (${currentTokens}/${budgetLimit})`);
        signatureParts.push(`budget:${ Math.floor(currentTokens / 10000) }`);
      }
    }

    if (alerts.length === 0) return null;

    const signature = signatureParts.join('|');
    if (fs.existsSync(LOOP_ALERT_STATE_FILE)) {
      try {
        const prev = JSON.parse(fs.readFileSync(LOOP_ALERT_STATE_FILE, 'utf8'));
        if (prev && prev.signature === signature && (now - (prev.timestamp || 0)) < 180000) {
          return null;
        }
      } catch {}
    }
    writeJsonAtomic(LOOP_ALERT_STATE_FILE, { signature, timestamp: now });

    // Enriquecer com MemPalace (room: problems) e CheckpointEngine
    const hints = [];
    const memMod = findLibModule('mempalace-engine.cjs') || findLibModule('mempalace.cjs');
    const MemClass = memMod && (memMod.MemPalaceEngine || (typeof memMod === 'function' ? memMod : null));
    if (MemClass) {
      try {
        const mem = new MemClass(PROJECT_ROOT);
        const res = mem.recall({ query: queryTerm || 'error', room: 'problems', limit: 1 });
        if (res && Array.isArray(res.results) && res.results.length > 0) {
          const top = res.results[0];
          hints.push(`MemPalace [problems]: "${String(top.content || '').slice(0, 120)}"`);
        }
      } catch {}
    }

    const cpMod = findLibModule('checkpoint-engine.cjs');
    const CpClass = cpMod && (cpMod.CheckpointEngine || (typeof cpMod === 'function' ? cpMod : null));
    if (CpClass) {
      try {
        const cp = new CpClass(PROJECT_ROOT);
        const latest = typeof cp.getLatestCheckpoint === 'function' ? cp.getLatestCheckpoint() : null;
        const cpId = latest && (latest.tag || latest.id);
        if (cpId) {
          hints.push(`Checkpoint seguro disponível: [${cpId}] (use \`checkpoint_manager\` action="rollback" se necessário)`);
        }
      } catch {}
    }

    // Registrar economia por prevenção de loop
    const trackerMod = findLibModule('token-savings.cjs');
    const TrackerClass = trackerMod && (trackerMod.TokenSavingsTracker || (typeof trackerMod === 'function' ? trackerMod : null));
    if (TrackerClass) {
      try {
        const tracker = new TrackerClass(PROJECT_ROOT);
        tracker.record('loop_prevention', 1200, alerts[0]);
      } catch {}
    }

    const hintSuffix = hints.length > 0 ? ` | ${hints.join(' | ')}` : '';
    return `⚠️ [Token Guard Anti-Loop] ${alerts.join('; ')}. Pare de repetir a mesma chamada: use outline/extract/lsp_diagnostics ou mude a estratégia.${hintSuffix}`;
  } catch {
    return null;
  }
}

// Executa verificação de auto-cura, sincronização de fase e recolhimento JIT (TTL)
checkAndAutoHeal();
checkPhaseSync();
checkJitTtlAndCleanup();

const loopAlertMsg = checkLoopAndBudgetAlert();
if (loopAlertMsg) {
  process.stdout.write(JSON.stringify({
    injectSteps: [{ ephemeralMessage: loopAlertMsg }]
  }) + '\n');
} else {
  // Retorna objeto limpo para manter a interface e logs 100% livres de banners repetidos
  process.stdout.write(JSON.stringify({}) + '\n');
}
process.exit(0);

