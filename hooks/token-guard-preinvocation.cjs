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
          execSync(`node "${patchScript}" "${PROJECT_ROOT}"`, { stdio: 'ignore', timeout: 5000 });
        }
      }
    }
  } catch (err) {
    // Falha silenciosa para não quebrar a invocação
  }
}

const PHASE_TRACK_FILE = path.join(CACHE_DIR, 'last-synced-phase.txt');
const PHASE_TRACK_LEGACY = path.join(PROJECT_ROOT, '.agents', '.last-synced-phase');

function checkPhaseSync() {
  try {
    const projectState = path.join(PROJECT_ROOT, '.project', 'STATE.md');
    const planningState = path.join(PROJECT_ROOT, '.planning', 'STATE.md');
    const stateFile = fs.existsSync(projectState) ? projectState : (fs.existsSync(planningState) ? planningState : null);
    if (!stateFile) return;

    const content = fs.readFileSync(stateFile, 'utf8').toLowerCase();
    let currentPhase = 'core';
    if (/status:\s*(planning|specifying|discussing|plan)/i.test(content) || /phase:\s*.*(plan|define|roadmap)/i.test(content)) {
      currentPhase = 'planning';
    } else if (/status:\s*(executing|in-progress|exec|build)/i.test(content) || /phase:\s*.*(exec|build)/i.test(content)) {
      currentPhase = 'execution';
    } else if (/status:\s*(verifying|testing|uat|review|ship)/i.test(content) || /phase:\s*.*(verif|review|ship)/i.test(content)) {
      currentPhase = 'verification';
    } else if (/status:\s*(researching|spike|explore)/i.test(content) || /phase:\s*.*research/i.test(content)) {
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
      if (optScript) {
        try { execSync(`node "${optScript}" "${PROJECT_ROOT}" --sync`, { stdio: 'ignore', timeout: 5000 }); } catch {}
      }
      if (skillsScript) {
        try { execSync(`node "${skillsScript}" sync "${currentPhase}" "${PROJECT_ROOT}"`, { stdio: 'ignore', timeout: 5000 }); } catch {}
      }
      const compactScript = findKitScript('compact-state.cjs');
      if (compactScript) {
        try { execSync(`node "${compactScript}" "${PROJECT_ROOT}"`, { stdio: 'ignore', timeout: 5000 }); } catch {}
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
      fs.writeFileSync(JIT_PROMOTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
    }
  } catch {}
}

// Executa verificação de auto-cura, sincronização de fase e recolhimento JIT (TTL)
checkAndAutoHeal();
checkPhaseSync();
checkJitTtlAndCleanup();
// Retorna objeto limpo para manter a interface e logs 100% livres de banners repetidos
process.stdout.write(JSON.stringify({}) + '\n');
process.exit(0);
