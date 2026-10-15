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
    'gsd-tokens'
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
    'gsd-tokens'
  ]
};

const GLOBAL_SKILLS = [
  'gsd-progress',
  'gsd-help',
  'gsd-tokens',
  'gsd-dev-preferences',
  'gsd-settings',
  'gsd-health',
  'gsd-fast',
  'graphify'
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
    'gsd-roadmapper'
  ],
  execution: [
    'gsd-execute-phase',
    'gsd-debug',
    'gsd-code-review',
    'gsd-add-tests',
    'gsd-workstreams',
    'gsd-pause-work',
    'gsd-resume-work'
  ],
  verification: [
    'gsd-verify-work',
    'gsd-audit-uat',
    'gsd-audit-milestone',
    'gsd-audit-fix',
    'gsd-ship',
    'gsd-cleanup'
  ],
  research: [
    'gsd-explore',
    'gsd-spike',
    'gsd-stats',
    'gsd-phase-researcher'
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
    if (/status:\s*(planning|specifying|discussing|plan)/i.test(content) || /phase:\s*.*plan/i.test(content)) {
      return 'planning';
    }
    if (/status:\s*(executing|in-progress|exec)/i.test(content) || /phase:\s*.*exec/i.test(content)) {
      return 'execution';
    }
    if (/status:\s*(verifying|testing|uat|review)/i.test(content) || /phase:\s*.*verif/i.test(content)) {
      return 'verification';
    }
    if (/status:\s*(researching|spike|explore)/i.test(content)) {
      return 'research';
    }
  } catch {}
  return 'core';
}

function syncSkills(targetDir, explicitPhase) {
  ensurePool(targetDir);
  const phase = (explicitPhase || detectPhaseFromState(targetDir)).toLowerCase();
  const { activeDir, poolDir } = getPaths(targetDir);

  const phaseList = PHASE_SKILLS[phase] || PHASE_SKILLS.core;
  const targetSet = new Set([...GLOBAL_SKILLS, ...phaseList]);

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

function promoteSkill(targetDir, skillName) {
  const { activeDir, poolDir } = getPaths(targetDir);
  const activePath = path.join(activeDir, skillName);
  const poolPath = path.join(poolDir, skillName);

  if (fs.existsSync(activePath)) return true;
  if (fs.existsSync(poolPath)) {
    copyFolderSync(poolPath, activePath);
    return true;
  }
  return false;
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
  } else if (cmd === 'status' || cmd === 'list' || !cmd) {
    targetDir = args[1] || process.cwd();
  } else {
    targetDir = args[2] || process.cwd();
  }

  if (cmd === 'profile') {
    applyProfile(targetDir, param || 'backend');
  } else if (cmd === 'sync') {
    const res = syncSkills(targetDir, param || null);
    console.log(`\n⚡ [Skills Manager] Dynamic Skill Pool sincronizado com a fase '${res.phase.toUpperCase()}'!`);
    console.log(`   🟢 Skills Ativas: ${res.activeCount} | Promovidas: ${res.activated}\n`);
  } else if (cmd === 'enable' || cmd === 'promote') {
    enableSkill(targetDir, param);
    showStatus(targetDir);
  } else if (cmd === 'disable') {
    disableSkill(targetDir, param);
    showStatus(targetDir);
  } else if (cmd === 'status' || cmd === 'list' || !cmd) {
    showStatus(targetDir);
  } else {
    console.log('Uso: node skills-manager.cjs [sync [phase] [targetDir] | profile <core|backend|full> [targetDir] | enable <nome> [targetDir] | disable <nome> [targetDir] | status [targetDir]]');
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
  GLOBAL_SKILLS,
  PHASE_SKILLS
};
