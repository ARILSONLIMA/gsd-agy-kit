'use strict';

/**
 * Skill Surface Manager for Antigravity GSD Kit
 * 
 * Permite ativar, desativar ou selecionar perfis de skills do GSD
 * movendo pastas entre .agents/skills/ e .agents/skills-archive/.
 */

const fs = require('fs');
const path = require('path');

const PROFILES = {
  zero: [],
  core: [
    'gsd-plan-phase',
    'gsd-execute-phase',
    'gsd-verify-work',
    'gsd-progress',
    'gsd-debug',
    'gsd-fast',
    'gsd-help',
    'gsd-add-tests',
    'gsd-code-review',
    'gsd-dev-preferences',
    'gsd-graphify',
    'gsd-tokens',
    'gsd-test',
    'gsd-agy-update',
    'ponytail',
    'ponytail-review',
    'ponytail-audit',
    'ponytail-debt',
    'ponytail-help',
    'caveman',
    'ultracave',
    'caveman-review',
    'caveman-commit',
    'caveman-compress',
    'caveman-help'
  ],
  backend: [
    // Core loop
    'gsd-new-project',
    'gsd-new-milestone',
    'gsd-discuss-phase',
    'gsd-spec-phase',
    'gsd-mvp-phase',
    'gsd-plan-phase',
    'gsd-execute-phase',
    'gsd-verify-work',
    'gsd-progress',
    'gsd-debug',
    'gsd-code-review',
    'gsd-add-tests',
    'gsd-fast',
    'gsd-help',
    'gsd-spike',
    'gsd-explore',
    'gsd-pause-work',
    'gsd-resume-work',
    'gsd-undo',
    'gsd-ship',
    'gsd-stats',
    'gsd-settings',
    'gsd-health',
    'gsd-cleanup',
    'gsd-audit-fix',
    'gsd-audit-milestone',
    'gsd-audit-uat',
    'gsd-workstreams',
    'gsd-dev-preferences',
    'gsd-graphify',
    'gsd-tokens',
    'gsd-test',
    'gsd-agy-update',
    'ponytail',
    'ponytail-review',
    'ponytail-audit',
    'ponytail-debt',
    'ponytail-help',
    'caveman',
    'ultracave',
    'caveman-review',
    'caveman-commit',
    'caveman-compress',
    'caveman-help',
    'investigate-first',
    'lean-build',
    'surgical-patch',
    'safe-refactor',
    'verify-and-stop'
  ]
};

const GLOBAL_SKILLS = [
  'gsd-progress',
  'gsd-help',
  'gsd-tokens',
  'gsd-test',
  'gsd-agy-update',
  'gsd-dev-preferences',
  'gsd-settings',
  'gsd-health',
  'gsd-fast',
  'graphify',
  'ponytail',
  'ponytail-review',
  'ponytail-audit',
  'ponytail-debt',
  'ponytail-help',
  'caveman',
  'ultracave',
  'caveman-review',
  'caveman-commit',
  'caveman-compress',
  'caveman-help'
];

const PHASE_SKILLS = {
  core: [
    'gsd-plan-phase',
    'gsd-execute-phase',
    'gsd-verify-work',
    'gsd-debug',
    'gsd-code-review'
  ],
  planning: [
    'gsd-plan-phase',
    'gsd-discuss-phase',
    'gsd-spec-phase',
    'gsd-mvp-phase',
    'gsd-explore',
    'gsd-roadmapper',
    'investigate-first',
    'lean-build'
  ],
  execution: [
    'gsd-execute-phase',
    'gsd-debug',
    'gsd-code-review',
    'gsd-add-tests',
    'gsd-workstreams',
    'gsd-pause-work',
    'gsd-resume-work',
    'surgical-patch',
    'safe-refactor'
  ],
  verification: [
    'gsd-verify-work',
    'gsd-audit-uat',
    'gsd-audit-milestone',
    'gsd-audit-fix',
    'gsd-ship',
    'gsd-cleanup',
    'verify-and-stop'
  ],
  research: [
    'gsd-explore',
    'gsd-spike',
    'gsd-stats',
    'gsd-phase-researcher',
    'investigate-first'
  ]
};

function getPaths(targetDir) {
  const activeDir = path.join(targetDir, '.agents', 'skills');
  const poolDir = path.join(targetDir, '.agents', 'skills-pool');
  const legacyArchiveDir = path.join(targetDir, '.agents', 'skills-archive');
  return { activeDir, poolDir, archiveDir: poolDir, legacyArchiveDir };
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFolderSync(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function ensurePool(targetDir) {
  const { activeDir, poolDir, legacyArchiveDir } = getPaths(targetDir);
  ensureDir(activeDir);
  ensureDir(poolDir);

  // Migra skills-archive legado para skills-pool se existir
  if (fs.existsSync(legacyArchiveDir)) {
    try {
      const legacyFolders = fs.readdirSync(legacyArchiveDir).filter(f => fs.statSync(path.join(legacyArchiveDir, f)).isDirectory());
      for (const f of legacyFolders) {
        const src = path.join(legacyArchiveDir, f);
        const dest = path.join(poolDir, f);
        if (!fs.existsSync(dest)) {
          copyFolderSync(src, dest);
        }
        fs.rmSync(src, { recursive: true, force: true });
      }
      if (fs.readdirSync(legacyArchiveDir).length === 0) {
        fs.rmdirSync(legacyArchiveDir);
      }
    } catch {}
  }

  // Garante que todas as skills ativas também existam salvas no pool
  const activeFolders = fs.readdirSync(activeDir).filter(f => fs.statSync(path.join(activeDir, f)).isDirectory());
  for (const f of activeFolders) {
    const dest = path.join(poolDir, f);
    if (!fs.existsSync(dest)) {
      copyFolderSync(path.join(activeDir, f), dest);
    }
  }
}

function listSkills(targetDir) {
  ensurePool(targetDir);
  const { activeDir, poolDir } = getPaths(targetDir);

  const active = fs.readdirSync(activeDir).filter(f => fs.statSync(path.join(activeDir, f)).isDirectory()).sort();
  const pool = fs.readdirSync(poolDir).filter(f => fs.statSync(path.join(poolDir, f)).isDirectory()).sort();

  return { active, archived: pool };
}

function calculateTokens(targetDir, skillsList, isArchived = false) {
  const { activeDir, archiveDir } = getPaths(targetDir);
  const baseDir = isArchived ? archiveDir : activeDir;
  let totalBytes = 0;

  for (const s of skillsList) {
    const skillFile = path.join(baseDir, s, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      totalBytes += fs.statSync(skillFile).size;
    }
  }

  // O Antigravity injeta o frontmatter (nome + descrição): ~250 bytes/skill em média
  const catalogBytes = skillsList.length * 250;
  return Math.round(catalogBytes / 3.8);
}

function applyProfile(targetDir, profileName) {
  ensurePool(targetDir);
  const { activeDir, poolDir } = getPaths(targetDir);
  ensureDir(activeDir);
  ensureDir(poolDir);

  const profileLower = profileName.toLowerCase();
  const ALWAYS_ACTIVE = new Set(['gsd-tokens']);

  if (profileLower === 'zero' || profileLower === 'none') {
    // Zero-Baseline: remove all active skills and keep in pool
    const active = fs.readdirSync(activeDir).filter(f => fs.statSync(path.join(activeDir, f)).isDirectory());
    for (const s of active) {
      const src = path.join(activeDir, s);
      const dest = path.join(poolDir, s);
      if (!fs.existsSync(dest)) {
        copyFolderSync(src, dest);
      }
      fs.rmSync(src, { recursive: true, force: true });
    }
    console.log(`\n🎉 [Skills Manager] Perfil 'ZERO' (Zero-Baseline) aplicado. 0 skills ativas no prompt (todas preservadas no pool).`);
    showStatus(targetDir);
    return;
  }

  if (profileLower === 'full' || profileLower === 'all') {
    // Restaura tudo do pool para active
    const poolSkills = fs.readdirSync(poolDir).filter(f => fs.statSync(path.join(poolDir, f)).isDirectory());
    for (const s of poolSkills) {
      const src = path.join(poolDir, s);
      const dest = path.join(activeDir, s);
      if (!fs.existsSync(dest)) {
        copyFolderSync(src, dest);
      }
    }
    console.log(`\n🎉 [Skills Manager] Perfil 'FULL' aplicado. Todas as ${poolSkills.length} skills do pool estão ativas.`);
    showStatus(targetDir);
    return;
  }

  const allowed = PROFILES[profileLower];
  if (!allowed) {
    console.error(`❌ Perfil desconhecido: '${profileName}'. Perfis disponíveis: core, backend, full`);
    process.exit(1);
  }

  const allowedSet = new Set(allowed);

  // 1. Remover da pasta ativa as que não estão no perfil (garantindo que estejam a salvo no pool)
  const active = fs.readdirSync(activeDir).filter(f => fs.statSync(path.join(activeDir, f)).isDirectory());
  let disabledCount = 0;
  for (const s of active) {
    const isProjectCustom = s.startsWith('spike-findings-');
    if (!allowedSet.has(s) && !ALWAYS_ACTIVE.has(s) && !isProjectCustom) {
      const src = path.join(activeDir, s);
      const dest = path.join(poolDir, s);
      if (!fs.existsSync(dest)) {
        copyFolderSync(src, dest);
      }
      fs.rmSync(src, { recursive: true, force: true });
      disabledCount++;
    }
  }

  // 2. Copiar do pool para active as que pertencem ao perfil
  const poolSkills = fs.readdirSync(poolDir).filter(f => fs.statSync(path.join(poolDir, f)).isDirectory());
  let enabledCount = 0;
  for (const s of poolSkills) {
    if (allowedSet.has(s) || ALWAYS_ACTIVE.has(s)) {
      const src = path.join(poolDir, s);
      const dest = path.join(activeDir, s);
      if (!fs.existsSync(dest)) {
        copyFolderSync(src, dest);
        enabledCount++;
      }
    }
  }

  console.log(`\n⚡ [Skills Manager] Perfil '${profileName.toUpperCase()}' aplicado com sucesso!`);
  showStatus(targetDir);
}

function enableSkill(targetDir, skillName) {
  ensurePool(targetDir);
  const { activeDir, poolDir } = getPaths(targetDir);
  const src = path.join(poolDir, skillName);
  const dest = path.join(activeDir, skillName);

  if (fs.existsSync(dest)) {
    console.log(`ℹ️ Skill '${skillName}' já está ativa.`);
    return;
  }
  if (!fs.existsSync(src)) {
    console.error(`❌ Skill '${skillName}' não encontrada em ${poolDir}.`);
    return;
  }

  copyFolderSync(src, dest);
  console.log(`✅ Skill '${skillName}' ativada com sucesso.`);
}

function disableSkill(targetDir, skillName) {
  ensurePool(targetDir);
  const { activeDir, poolDir } = getPaths(targetDir);

  const src = path.join(activeDir, skillName);
  const dest = path.join(poolDir, skillName);

  if (!fs.existsSync(src)) {
    console.log(`ℹ️ Skill '${skillName}' já está desativada.`);
    return;
  }

  if (!fs.existsSync(dest)) {
    copyFolderSync(src, dest);
  }
  fs.rmSync(src, { recursive: true, force: true });
  console.log(`✅ Skill '${skillName}' desativada e mantida no pool.`);
}

function showStatus(targetDir) {
  const { active, archived } = listSkills(targetDir);
  const activeTokens = calculateTokens(targetDir, active, false);
  const savedTokens = calculateTokens(targetDir, archived, true);

  console.log('\n📊 [Status do Catálogo de Skills]');
  console.log(`   🟢 Skills Ativas:      ${active.length} (~${activeTokens} tokens no prompt)`);
  console.log(`   ⚪ Skills Arquivadas:  ${archived.length} (~${savedTokens} tokens economizados por turno)`);
  console.log(`   📦 Total Disponível:   ${active.length + archived.length} skills`);
  console.log('\nComandos rápidos:');
  console.log('   - Alternar perfil:  pwsh skills-profile.ps1 -Profile [backend | core | full]');
  console.log('   - Ativar skill:     pwsh skills-profile.ps1 -Enable <nome>');
  console.log('   - Desativar skill:  pwsh skills-profile.ps1 -Disable <nome>\n');
}

function detectPhaseFromState(targetDir) {
  const stateFile = path.join(targetDir, '.planning', 'STATE.md');
  if (!fs.existsSync(stateFile)) return 'core';
  try {
    const content = fs.readFileSync(stateFile, 'utf8').toLowerCase();
    if (/status:\s*(planning|specifying|discussing|plan)/i.test(content) || /phase:\s*.*(plan|define|roadmap)/i.test(content)) {
      return 'planning';
    }
    if (/status:\s*(executing|in[-_]progress|running|exec|build)/i.test(content) || /(phase|current plan):\s*.*(exec|build|plan)/i.test(content)) {
      return 'execution';
    }
    if (/status:\s*(verifying|verification|testing|uat|review|ship)/i.test(content) || /phase:\s*.*(verif|review|ship)/i.test(content)) {
      return 'verification';
    }
    if (/status:\s*(research|researching|spike|explore)/i.test(content) || /phase:\s*.*research/i.test(content)) {
      return 'research';
    }
  } catch {}
  return 'core';
}

function getActiveJitSkills(targetDir) {
  const jitFile = path.join(targetDir, '.agents', '.cache', 'jit-promotions.json');
  const jitLegacy = path.join(targetDir, '.agents', '.jit-promotions.json');
  const file = fs.existsSync(jitFile) ? jitFile : (fs.existsSync(jitLegacy) ? jitLegacy : null);
  const set = new Set();
  if (!file) return set;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && data.skills && typeof data.skills === 'object') {
      for (const [skillName, meta] of Object.entries(data.skills)) {
        if (meta && meta.turnsRemaining > 0) {
          set.add(skillName);
        }
      }
    }
  } catch {}
  return set;
}

function syncSkills(targetDir, explicitPhase) {
  ensurePool(targetDir);
  const phase = (explicitPhase || 'zero').toLowerCase();
  const { activeDir, poolDir } = getPaths(targetDir);

  let targetSet;
  if (phase === 'zero' || phase === 'none') {
    const jitSkills = getActiveJitSkills(targetDir);
    targetSet = new Set([...jitSkills]);
  } else {
    const phaseList = PHASE_SKILLS[phase] || PHASE_SKILLS.core;
    const jitSkills = getActiveJitSkills(targetDir);
    targetSet = new Set([...GLOBAL_SKILLS, ...phaseList, ...jitSkills]);
  }

  // Preserva skills de projeto existentes
  const currentActive = fs.readdirSync(activeDir).filter(f => fs.statSync(path.join(activeDir, f)).isDirectory());
  for (const s of currentActive) {
    if (s.startsWith('spike-findings-') || s === 'spike-findings-backend') {
      targetSet.add(s);
    }
  }

  // 1. Remove da pasta ativa as que não pertencem à fase atual
  for (const s of currentActive) {
    if (!targetSet.has(s)) {
      const poolPath = path.join(poolDir, s);
      const activePath = path.join(activeDir, s);
      if (!fs.existsSync(poolPath)) {
        copyFolderSync(activePath, poolPath);
      }
      fs.rmSync(activePath, { recursive: true, force: true });
    }
  }

  // 2. Traz do pool as que pertencem à fase atual
  let activated = 0;
  for (const s of targetSet) {
    const activePath = path.join(activeDir, s);
    const poolPath = path.join(poolDir, s);
    if (!fs.existsSync(activePath) && fs.existsSync(poolPath)) {
      copyFolderSync(poolPath, activePath);
      activated++;
    }
  }

  const finalActive = fs.readdirSync(activeDir).filter(f => fs.statSync(path.join(activeDir, f)).isDirectory());
  return { phase, activeCount: finalActive.length, activated };
}

function promoteSkill(targetDir, skillName, customTtl = 5) {
  const { activeDir, poolDir, legacyArchiveDir } = getPaths(targetDir);
  const activePath = path.join(activeDir, skillName);
  const poolPath = path.join(poolDir, skillName);
  const legacyPath = path.join(legacyArchiveDir, skillName);

  let success = false;
  if (fs.existsSync(activePath)) {
    success = true;
  } else if (fs.existsSync(poolPath)) {
    copyFolderSync(poolPath, activePath);
    success = true;
  } else if (fs.existsSync(legacyPath)) {
    copyFolderSync(legacyPath, activePath);
    success = true;
  }

  if (success) {
    try {
      const cacheDir = path.join(targetDir, '.agents', '.cache');
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      const jitFile = path.join(cacheDir, 'jit-promotions.json');
      let data = { skills: {}, agents: {} };
      if (fs.existsSync(jitFile)) {
        try { data = JSON.parse(fs.readFileSync(jitFile, 'utf8')); } catch {}
      }
      if (!data.skills) data.skills = {};
      data.skills[skillName] = { promotedAt: Date.now(), turnsRemaining: customTtl };
      fs.writeFileSync(jitFile, JSON.stringify(data, null, 2), 'utf8');
    } catch {}
  }

  return success;
}

function normalizeStr(str = '') {
  return (str || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

const STEM_SYNONYMS = {
  refatorar: ['refactor', 'refator', 'clean'],
  refatoracao: ['refactor', 'refator', 'clean'],
  refatoracoes: ['refactor', 'refator'],
  refactoring: ['refactor', 'refator'],
  revisao: ['review', 'revis'],
  revisar: ['review', 'revis'],
  testes: ['test'],
  testar: ['test'],
  planejar: ['plan'],
  planejamento: ['plan'],
  executar: ['execute'],
  execucao: ['execute'],
  verificar: ['verify', 'uat'],
  verificacao: ['verify', 'uat'],
  seguranca: ['security', 'shield', 'auth'],
  auditar: ['audit'],
  auditoria: ['audit'],
  concorrencia: ['concurrency', 'race', 'async', 'thread'],
  deadlock: ['concurrency', 'race', 'debug', 'lock'],
  otimizacao: ['optimize', 'fast', 'perf', 'shrink', 'tokens'],
  otimizar: ['optimize', 'fast', 'perf', 'shrink', 'tokens'],
  desempenho: ['performance', 'fast', 'optimize'],
  limpar: ['clean', 'cleanup'],
  limpeza: ['clean', 'cleanup'],
  debito: ['debt', 'yagni', 'shortcut'],
  divida: ['debt', 'yagni', 'shortcut'],
  preguicoso: ['ponytail', 'lazy'],
  simples: ['ponytail', 'yagni', 'caveman'],
  simplicidade: ['ponytail', 'yagni', 'caveman']
};

function searchSkills(targetDir = process.cwd(), query = '', options = {}) {
  ensurePool(targetDir);
  const { activeDir, poolDir, legacyArchiveDir } = getPaths(targetDir);
  const limit = typeof options.limit === 'number' ? options.limit : 3;
  const autoActivate = Boolean(options.activate || options.autoActivate);

  const rawClean = (query || '').trim();
  if (!rawClean) return [];

  const cleanQuery = normalizeStr(rawClean);
  const stopwords = new Set(['e', 'de', 'do', 'da', 'em', 'para', 'com', 'o', 'a', 'os', 'as', 'um', 'uma', 'no', 'na', 'nos', 'nas', 'por', 'the', 'and', 'or', 'for', 'to', 'in', 'on', 'with', 'a', 'an', 'is', 'it']);
  const rawTokens = cleanQuery.split(/[\s,;:._\-\/]+/).filter(t => t.length > 1 && !stopwords.has(t));
  if (rawTokens.length === 0) rawTokens.push(cleanQuery);

  // Expande com sinônimos
  const expandedTokens = new Set(rawTokens);
  for (const t of rawTokens) {
    if (STEM_SYNONYMS[t]) {
      for (const syn of STEM_SYNONYMS[t]) {
        expandedTokens.add(syn);
      }
    }
  }

  const candidateDirs = new Set();
  const searchBases = [poolDir, activeDir, legacyArchiveDir];
  for (const b of searchBases) {
    if (fs.existsSync(b)) {
      try {
        const entries = fs.readdirSync(b);
        for (const e of entries) {
          const fullPath = path.join(b, e);
          if (fs.statSync(fullPath).isDirectory()) {
            candidateDirs.add(e);
          }
        }
      } catch {}
    }
  }

  const results = [];
  for (const skillName of candidateDirs) {
    let skillMdPath = path.join(poolDir, skillName, 'SKILL.md');
    if (!fs.existsSync(skillMdPath)) {
      skillMdPath = path.join(activeDir, skillName, 'SKILL.md');
    }
    if (!fs.existsSync(skillMdPath) && fs.existsSync(path.join(legacyArchiveDir, skillName, 'SKILL.md'))) {
      skillMdPath = path.join(legacyArchiveDir, skillName, 'SKILL.md');
    }
    if (!fs.existsSync(skillMdPath)) continue;

    let content = '';
    try {
      content = fs.readFileSync(skillMdPath, 'utf8');
    } catch {
      continue;
    }

    let description = '';
    const fmMatch = content.match(/^---\s*([\s\S]*?)\s*---/);
    if (fmMatch) {
      const descBlockMatch = fmMatch[1].match(/description:\s*(?:[>|]\s*\n([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)|([^\n\r]+))/i);
      if (descBlockMatch) {
        if (descBlockMatch[1]) {
          description = descBlockMatch[1].split('\n').map(l => l.trim()).filter(Boolean).join(' ');
        } else if (descBlockMatch[2]) {
          description = descBlockMatch[2].trim();
        }
      }
    }
    if (!description) {
      const lines = content.replace(/^#+\s*/gm, '').split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('---'));
      description = (lines[0] || skillName).slice(0, 160);
    }

    const normName = normalizeStr(skillName);
    const normDesc = normalizeStr(description);
    const normContent = normalizeStr(content.slice(0, 2000));

    let score = 0;
    if (normName === cleanQuery) score += 100;
    if (normName.includes(cleanQuery)) score += 60;
    if (normDesc.includes(cleanQuery)) score += 40;

    for (const token of expandedTokens) {
      if (normName.includes(token)) score += 30;
      if (normDesc.includes(token)) score += 20;
      if (normContent.includes(token)) score += 5;
    }

    if (score > 0) {
      const isActive = fs.existsSync(path.join(activeDir, skillName));
      results.push({
        name: skillName,
        description,
        score,
        isActive,
        canonicalPath: path.join('.agents', 'skills-pool', skillName, 'SKILL.md').replace(/\\/g, '/')
      });
    }
  }

  results.sort((a, b) => b.score - a.score);
  const top = results.slice(0, limit);

  if (autoActivate && top.length > 0) {
    for (const item of top) {
      promoteSkill(targetDir, item.name);
      item.isActive = true;
    }
  }

  return top;
}

// CLI Routing
if (require.main === module) {
  const args = process.argv.slice(2);
  const cmd = (args[0] || '').toLowerCase();
  let param = args[1] || '';
  let targetDir = process.cwd();

  if (cmd === 'sync') {
    if (args[2]) {
      param = args[1];
      targetDir = args[2];
    } else if (args[1] && (fs.existsSync(args[1]) || path.isAbsolute(args[1]))) {
      param = '';
      targetDir = args[1];
    } else {
      param = args[1] || '';
      targetDir = process.cwd();
    }
  } else if (cmd === 'search' || cmd === 'find') {
    param = args[1] || '';
    targetDir = args[2] || process.cwd();
  } else if (cmd === 'status' || cmd === 'list' || !cmd) {
    targetDir = args[1] || process.cwd();
  } else {
    targetDir = args[2] || process.cwd();
  }

  if (cmd === 'profile') {
    applyProfile(targetDir, param || 'zero');
  } else if (cmd === 'sync') {
    const res = syncSkills(targetDir, param || 'zero');
    console.log(`\n⚡ [Skills Manager] Dynamic Skill Pool sincronizado com o perfil '${res.phase.toUpperCase()}'!`);
    console.log(`   🟢 Skills Ativas: ${res.activeCount} | Promovidas: ${res.activated}\n`);
  } else if (cmd === 'search' || cmd === 'find') {
    const matches = searchSkills(targetDir, param, { limit: 5 });
    if (matches.length === 0) {
      console.log(`\nℹ️ [Skills Manager] Nenhuma skill encontrada para "${param}".\n`);
    } else {
      console.log(`\n🔍 [Skills Manager] Encontradas ${matches.length} skill(s) no pool para "${param}":`);
      for (const m of matches) {
        const tag = m.isActive ? '\x1b[32m[ATIVA]\x1b[0m' : '\x1b[33m[NO POOL]\x1b[0m';
        console.log(`  • \x1b[36m${m.name}\x1b[0m ${tag} (Score: ${m.score})`);
        console.log(`    ${m.description}`);
        console.log(`    ${m.canonicalPath}\n`);
      }
    }
  } else if (cmd === 'enable' || cmd === 'promote') {
    enableSkill(targetDir, param);
    showStatus(targetDir);
  } else if (cmd === 'disable') {
    disableSkill(targetDir, param);
    showStatus(targetDir);
  } else if (cmd === 'status' || cmd === 'list' || !cmd) {
    showStatus(targetDir);
  } else {
    console.log('Uso: node skills-manager.cjs [search <termo> [targetDir] | sync [phase] [targetDir] | profile <zero|core|backend|full> [targetDir] | enable <nome> [targetDir] | disable <nome> [targetDir] | status [targetDir]]');
  }
}

module.exports = {
  applyProfile,
  enableSkill,
  disableSkill,
  showStatus,
  listSkills,
  syncSkills,
  promoteSkill,
  searchSkills,
  GLOBAL_SKILLS,
  PHASE_SKILLS
};
