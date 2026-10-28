#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit — Central Unificada de Governança (/gsd-agy-config)
 * Unifica e substitui gsd-settings, gsd-config, gsd-surface e gsd-profile-user.
 * 
 * Módulos integrados:
 * 1. Workflow & Motores (presets backend, fullstack, custom, knobs de config)
 * 2. Superfície de Skills (integração direta com skills-manager: zero, core, backend, full)
 * 3. Perfil do Desenvolvedor (Ponytail YAGNI, Caveman ASD-STE100, pt-BR em USER-PROFILE.md)
 * 4. Painel Consolidado de Status
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  bGreen: '\x1b[1;32m',
  cyan: '\x1b[36m',
  bCyan: '\x1b[1;36m',
  yellow: '\x1b[33m',
  bYellow: '\x1b[1;33m',
  red: '\x1b[31m',
  bRed: '\x1b[1;31m',
  bWhite: '\x1b[1;37m',
  magenta: '\x1b[35m'
};

const IS_TTY = Boolean(process.stdout.isTTY && !process.env.NO_COLOR);

function resolveProjectRoot(startDir = process.cwd()) {
  let cur = path.resolve(startDir);
  if (fs.existsSync(path.join(cur, '.planning'))) return cur;
  if (cur.endsWith(path.join('.agents', 'kit')) || cur.endsWith('.agents')) {
    const parent = path.resolve(cur, cur.endsWith(path.join('.agents', 'kit')) ? '../..' : '..');
    if (fs.existsSync(path.join(parent, '.planning'))) return parent;
  }
  let probe = cur;
  while (probe && probe !== path.dirname(probe)) {
    if (fs.existsSync(path.join(probe, '.planning')) || fs.existsSync(path.join(probe, '.git'))) {
      return probe;
    }
    probe = path.dirname(probe);
  }
  return cur;
}

function promptLine(query) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise((resolve) => {
    rl.question(query, (ans) => {
      rl.close();
      resolve((ans || '').trim());
    });
  });
}

function detectFrontendInProject(root) {
  try {
    const pkgPath = path.join(root, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      const fePackages = [
        'react', 'react-dom', 'vue', 'svelte', '@angular/core', 'next',
        'nuxt', 'astro', 'vite', 'solid-js', 'preact', 'electron', 'expo'
      ];
      for (const p of fePackages) {
        if (deps[p]) return true;
      }
    }
  } catch {}

  const feIndicators = ['src/components', 'src/pages', 'src/views', 'src/app', 'app/layout.tsx', 'public/index.html'];
  for (const ind of feIndicators) {
    if (fs.existsSync(path.join(root, ind))) return true;
  }
  return false;
}

/* ==============================================================================
 * MÓDULO 1: Workflow & Knobs (antigos gsd-settings e gsd-config)
 * ============================================================================== */

function loadConfig(projectRoot) {
  const planningDir = path.join(projectRoot, '.planning');
  const configFile = path.join(planningDir, 'config.json');
  if (!fs.existsSync(planningDir)) {
    fs.mkdirSync(planningDir, { recursive: true });
  }

  let raw = {};
  if (fs.existsSync(configFile)) {
    try {
      raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    } catch {
      raw = {};
    }
  }
  return { planningDir, configFile, config: raw };
}

function saveConfig(configFile, config) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2) + '\n', 'utf8');
}

function applyWorkflowPreset(projectRoot, presetName, options = {}) {
  const { configFile, config } = loadConfig(projectRoot);

  const hasFrontend = options.hasFrontend !== undefined ? Boolean(options.hasFrontend) : (presetName === 'fullstack');
  const enableMempalace = options.enableMempalace !== undefined ? Boolean(options.enableMempalace) : true;
  const enableCodeReview = options.enableCodeReview !== undefined ? Boolean(options.enableCodeReview) : true;
  const gitBranching = options.gitBranching || config.git?.branching_strategy || 'none';
  const commitDocs = options.commitDocs !== undefined ? Boolean(options.commitDocs) : (config.commit_docs !== undefined ? config.commit_docs : true);

  // Travas Mandatórias do Antigravity CLI e gsd-agy-kit
  config.response_language = 'pt-BR';
  config.kit_mode = config.kit_mode || 'smart-assist';
  config.strict_errors = true;
  config.error_guard = { enabled: true, version: 1 };
  config.model_profile = 'inherit';

  if (!config.workflow) config.workflow = {};
  config.workflow.compact_content = true;
  config.workflow.auto_prune_state = true;
  config.workflow.inline_plan_threshold = 2;
  config.workflow.pattern_mapper = false;
  config.workflow.ai_integration_phase = false;
  config.workflow.tdd_mode = false;
  config.workflow.use_worktrees = false; // Obrigatório no Antigravity CLI
  config.workflow.code_review = enableCodeReview;
  config.workflow.code_review_depth = 'standard';
  config.workflow.security_enforcement = enableCodeReview;
  config.workflow.security_asvs_level = 1;
  config.workflow.security_block_on = 'high';
  config.workflow.api_coverage_gate = enableCodeReview;

  // Frontend toggles
  config.workflow.ui_phase = hasFrontend;
  config.workflow.ui_safety_gate = hasFrontend;
  config.workflow.ui_review = hasFrontend;

  if (!config.plan_review) config.plan_review = {};
  config.plan_review.source_grounding = true;
  config.plan_review.source_grounding_authority = 'ast-grep';

  if (!config.graphify) config.graphify = {};
  config.graphify.enabled = true;
  config.graphify.auto_update = false;

  if (!config.mempalace) config.mempalace = {};
  config.mempalace.enabled = enableMempalace;
  config.mempalace.memory_mode = enableMempalace ? 'augment' : 'off';
  config.mempalace.recall_on_discuss = enableMempalace;
  config.mempalace.recall_on_plan = enableMempalace;
  config.mempalace.mirror_kg = enableMempalace;
  config.mempalace.diary_journal = enableMempalace;
  if (!config.mempalace.wing) {
    config.mempalace.wing = path.basename(projectRoot);
  }

  if (!config.git) config.git = {};
  config.git.branching_strategy = gitBranching;
  config.commit_docs = commitDocs;

  saveConfig(configFile, config);
  return { configFile, presetName, hasFrontend, enableMempalace, enableCodeReview, gitBranching, commitDocs, config };
}

function setConfigKnob(projectRoot, keyPath, rawValue) {
  const { configFile, config } = loadConfig(projectRoot);
  let value = rawValue;
  if (rawValue === 'true') value = true;
  else if (rawValue === 'false') value = false;
  else if (!isNaN(Number(rawValue))) value = Number(rawValue);

  const parts = keyPath.split('.');
  let target = config;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!target[p] || typeof target[p] !== 'object') {
      target[p] = {};
    }
    target = target[p];
  }
  target[parts[parts.length - 1]] = value;
  saveConfig(configFile, config);
  console.log(`\n${C.bGreen}✔ Configuração atualizada:${C.reset} ${keyPath} = ${JSON.stringify(value)}\n`);
}

/* ==============================================================================
 * MÓDULO 2: Superfície de Skills (antigo gsd-surface)
 * ============================================================================== */

function findSkillsManagerScript(projectRoot) {
  const kitDir = path.resolve(__dirname);
  const candidates = [
    path.join(kitDir, 'skills-manager.cjs'),
    path.join(projectRoot, '.agents', 'kit', 'skills-manager.cjs'),
    path.join(projectRoot, 'skills-manager.cjs')
  ];
  return candidates.find(p => fs.existsSync(p));
}

function runSkillsSurface(projectRoot, action = 'status', arg = null) {
  const scriptPath = findSkillsManagerScript(projectRoot);
  if (!scriptPath) {
    console.error(`\n${C.bRed}❌ Script skills-manager.cjs não encontrado.${C.reset}\n`);
    return;
  }

  const args = [scriptPath];
  if (['zero', 'core', 'backend', 'full', 'fullstack'].includes(action)) {
    const prof = action === 'fullstack' ? 'full' : action;
    args.push('profile', prof, projectRoot);
  } else if (action === 'enable' && arg) {
    args.push('enable', arg, projectRoot);
  } else if (action === 'disable' && arg) {
    args.push('disable', arg, projectRoot);
  } else if (action === 'search' && arg) {
    args.push('search', arg, projectRoot);
  } else {
    args.push('status', projectRoot);
  }

  spawnSync(process.execPath, args, { stdio: 'inherit' });
}

/* ==============================================================================
 * MÓDULO 3: Perfil do Desenvolvedor (antigo gsd-profile-user)
 * ============================================================================== */

function getUserProfilePath(projectRoot) {
  return path.join(projectRoot, '.planning', 'USER-PROFILE.md');
}

function loadUserProfile(projectRoot) {
  const profilePath = getUserProfilePath(projectRoot);
  const defaultProfile = {
    ponytail_mode: 'full',
    caveman_mode: 'on',
    language: 'pt-BR',
    test_preference: 'quick_verify',
    yagni_strict: true,
    verbosity: 'minimal'
  };

  if (!fs.existsSync(profilePath)) {
    return { profilePath, exists: false, profile: defaultProfile };
  }

  try {
    const content = fs.readFileSync(profilePath, 'utf8');
    const p = { ...defaultProfile };
    if (content.includes('**Ponytail Mode:** ultra')) p.ponytail_mode = 'ultra';
    else if (content.includes('**Ponytail Mode:** lite')) p.ponytail_mode = 'lite';
    else if (content.includes('**Ponytail Mode:** off')) p.ponytail_mode = 'off';

    if (content.includes('**Caveman Mode:** ultra')) p.caveman_mode = 'ultra';
    else if (content.includes('**Caveman Mode:** off')) p.caveman_mode = 'off';
    return { profilePath, exists: true, profile: p, rawContent: content };
  } catch {
    return { profilePath, exists: false, profile: defaultProfile };
  }
}

function saveUserProfile(projectRoot, profile) {
  const profilePath = getUserProfilePath(projectRoot);
  const pDir = path.dirname(profilePath);
  if (!fs.existsSync(pDir)) fs.mkdirSync(pDir, { recursive: true });

  const content = `# Developer Profile (Antigravity GSD Kit)

> Diretrizes comportamentais e preferências cognitivas ativas para este workspace.

**Generated:** ${new Date().toISOString()}
**Source:** gsd-agy-config

---

## Diretrizes de Atuação

- **Ponytail Mode:** ${profile.ponytail_mode}
  - \`full\`: Escada sênior de decisão obrigatória (Reuso -> Stdlib -> Deps -> Helper 1 linha -> Código cirúrgico) e YAGNI estrito.
  - \`ultra\`: Questionamento ativo de escopo especulativo e simplificação radical.
  - \`lite\`: Sugestões suaves de simplificação.
  - \`off\`: Desativado.

- **Caveman Mode:** ${profile.caveman_mode}
  - \`on\`: Voz concisa padrão ASD-STE100 em Português Técnico (pt-BR). Formato \`[alvo] [ação] [motivo]\`. Zero preâmbulos.
  - \`ultra\`: Fragmentos telegráficos ultra-enxutos.
  - \`off\`: Prosa convencional.

- **Idioma Padrão:** ${profile.language || 'pt-BR'}
- **Validação de Código:** ${profile.test_preference || 'quick_verify (1 turno via verify.cjs)'}
- **YAGNI Estrito:** ${profile.yagni_strict ? 'true (Zero abstrações prematuras ou herança desnecessária)' : 'false'}
`;

  fs.writeFileSync(profilePath, content, 'utf8');
  console.log(`\n${C.bGreen}✔ Perfil do desenvolvedor atualizado em:${C.reset}`);
  console.log(`  ${C.dim}${profilePath}${C.reset}\n`);
}

async function runProfileWizard(projectRoot) {
  console.log(`\n${C.bWhite}👤 Configurar Perfil do Desenvolvedor (Ponytail & Caveman):${C.reset}\n`);

  console.log(`   1. Modo Sênior Ponytail (Escada de Decisão & YAGNI):`);
  console.log(`      [1] Full (Recomendado - Escada de reuso obrigatória + YAGNI)`);
  console.log(`      [2] Ultra (Questionamento rigoroso de escopo)`);
  console.log(`      [3] Lite (Modo suave)`);
  console.log(`      [4] Off (Desativar)`);
  const ptAns = await promptLine(`      Escolha [1-4, Padrão: 1]: `);
  let ponytail = 'full';
  if (ptAns === '2') ponytail = 'ultra';
  else if (ptAns === '3') ponytail = 'lite';
  else if (ptAns === '4') ponytail = 'off';

  console.log(`\n   2. Modo de Voz Caveman (Concisão e Economia de Tokens):`);
  console.log(`      [1] On (Recomendado - Direto, objetivo em pt-BR ASD-STE100)`);
  console.log(`      [2] Ultra (Telegráfico - Máxima economia de tokens)`);
  console.log(`      [3] Off (Prosa convencional)`);
  const cvAns = await promptLine(`      Escolha [1-3, Padrão: 1]: `);
  let caveman = 'on';
  if (cvAns === '2') caveman = 'ultra';
  else if (cvAns === '3') caveman = 'off';

  saveUserProfile(projectRoot, {
    ponytail_mode: ponytail,
    caveman_mode: caveman,
    language: 'pt-BR',
    test_preference: 'quick_verify',
    yagni_strict: true
  });
}

/* ==============================================================================
 * MÓDULO 4: Painel Consolidado de Status
 * ============================================================================== */

function renderHubBanner() {
  console.log(`\n${C.bCyan}╭─ 🚀 Antigravity GSD Kit • Central de Governança (/gsd-agy-config) ─╮${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  Workflow, Superfície de Skills e Perfil do Desenvolvedor Unificados ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}╰────────────────────────────────────────────────────────────────────╯${C.reset}\n`);
}

function showConsolidatedStatus(projectRoot, asJson = false) {
  const { configFile, config } = loadConfig(projectRoot);
  const { profile } = loadUserProfile(projectRoot);

  const agentsDir = path.join(projectRoot, '.agents');
  const skillsDir = path.join(agentsDir, 'skills');
  const poolDir = path.join(agentsDir, 'skills-pool');

  let activeSkillsCount = 0;
  let poolSkillsCount = 0;
  if (fs.existsSync(skillsDir)) {
    activeSkillsCount = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(d => d.isDirectory()).length;
  }
  if (fs.existsSync(poolDir)) {
    poolSkillsCount = fs.readdirSync(poolDir, { withFileTypes: true }).filter(d => d.isDirectory()).length;
  }

  let activeProfile = 'custom';
  if (activeSkillsCount === 0) activeProfile = 'zero-baseline';
  else if (activeSkillsCount <= 15) activeProfile = 'core';
  else if (activeSkillsCount <= 35) activeProfile = 'backend';
  else if (activeSkillsCount > 35) activeProfile = 'fullstack';

  const data = {
    projectRoot,
    workflow: {
      configFile,
      response_language: config.response_language || 'pt-BR',
      model_profile: config.model_profile || 'inherit',
      compact_content: config.workflow?.compact_content || true,
      use_worktrees: config.workflow?.use_worktrees || false,
      source_grounding_authority: config.plan_review?.source_grounding_authority || 'ast-grep',
      ui_phase: config.workflow?.ui_phase || false,
      code_review: config.workflow?.code_review || true,
      mempalace: config.mempalace?.enabled || true,
      graphify: config.graphify?.enabled || true,
      branching_strategy: config.git?.branching_strategy || 'none'
    },
    surface: {
      profile: activeProfile,
      activeSkills: activeSkillsCount,
      poolSkills: poolSkillsCount
    },
    user_profile: profile
  };

  if (asJson) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }

  renderHubBanner();
  console.log(`${C.bCyan}Diretório:${C.reset} ${projectRoot}\n`);

  console.log(`${C.bCyan}┌─ 1. Workflow & Motores (.planning/config.json) ────────────────────────┐${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Modelo Subagentes:${C.reset}      ${C.bGreen}${data.workflow.model_profile}${C.reset} (sessão ativa Antigravity)`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Economia de Tokens:${C.reset}     compact_content: ${data.workflow.compact_content ? C.bGreen + 'true' : C.yellow + 'false'}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Git Worktrees:${C.reset}          ${data.workflow.use_worktrees ? C.bRed + 'true (Risco)' : C.bGreen + 'false (Blindado)'}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Grounding de Símbolos:${C.reset}  ${C.bGreen}${data.workflow.source_grounding_authority}${C.reset} (AST estrutural)`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Interface (UI Phase):${C.reset}   ${data.workflow.ui_phase ? C.bGreen + 'Ativado' : C.dim + 'Desativado (Backend puro)'}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}MemPalace / CodeReview:${C.reset} ${data.workflow.mempalace ? C.bGreen + 'MemPalace: ON' : C.dim + 'OFF'}${C.reset} | ${data.workflow.code_review ? C.bGreen + 'Review: ON' : C.dim + 'OFF'}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Grafo de Código:${C.reset}        graphify: ${data.workflow.graphify ? C.bGreen + 'true' : C.dim + 'false'}${C.reset} (auto_update: false)`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Estratégia Git:${C.reset}         ${C.cyan}${data.workflow.branching_strategy}${C.reset}`);

  console.log(`${C.bCyan}├─ 2. Superfície de Skills (skills-manager.cjs) ────────────────────────┤${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Perfil Ativo:${C.reset}           ${C.bGreen}${data.surface.profile.toUpperCase()}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Catálogo:${C.reset}               ${C.cyan}${data.surface.activeSkills} skills ativas${C.reset} (${data.surface.poolSkills} no pool em repouso)`);

  console.log(`${C.bCyan}├─ 3. Perfil do Desenvolvedor (USER-PROFILE.md) ─────────────────────────┤${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Ponytail Mode:${C.reset}          ${C.bGreen}${profile.ponytail_mode.toUpperCase()}${C.reset} (YAGNI & Escada de Reuso)`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Caveman Mode:${C.reset}           ${C.bGreen}${profile.caveman_mode.toUpperCase()}${C.reset} (ASD-STE100 conciso em pt-BR)`);
  console.log(`${C.bCyan}│${C.reset}  • ${C.bold}Idioma das Respostas:${C.reset}   ${C.bGreen}${data.workflow.response_language}${C.reset}`);
  console.log(`${C.bCyan}└────────────────────────────────────────────────────────────────────────┘${C.reset}\n`);
}

async function runInteractiveMenu(projectRoot) {
  renderHubBanner();
  console.log(`   ${C.dim}Diretório do Projeto: ${projectRoot}${C.reset}\n`);

  console.log(`   ${C.bCyan}[1]${C.reset} ⚡ ${C.bold}Workflow & Motores${C.reset} ${C.dim}(antigos gsd-settings / gsd-config)${C.reset}`);
  console.log(`       • Presets Backend / Fullstack / Custom e travas Antigravity\n`);

  console.log(`   ${C.bCyan}[2]${C.reset} 🎛️  ${C.bold}Superfície de Skills${C.reset} ${C.dim}(antigo gsd-surface)${C.reset}`);
  console.log(`       • Zero-Baseline • Core • Backend • Fullstack • Enable/Disable\n`);

  console.log(`   ${C.bCyan}[3]${C.reset} 👤 ${C.bold}Perfil do Desenvolvedor${C.reset} ${C.dim}(antigo gsd-profile-user)${C.reset}`);
  console.log(`       • Configurar Ponytail Sênior, Voz Caveman e USER-PROFILE.md\n`);

  console.log(`   ${C.bCyan}[4]${C.reset} 📋 ${C.bold}Painel Consolidado de Status${C.reset} ${C.dim}(Visão geral de tudo)${C.reset}\n`);
  console.log(`   ${C.bCyan}[0]${C.reset} 🚪 ${C.dim}Sair${C.reset}\n`);

  const choice = await promptLine(`   ${C.bold}Escolha um módulo [1-4, Padrão: 4]: ${C.reset}`);

  if (choice === '1') {
    console.log(`\n   ${C.bWhite}Escolha o preset de Workflow:${C.reset}`);
    console.log(`   [1] Backend Otimizado (sem UI)`);
    console.log(`   [2] Fullstack Otimizado (com UI phase e review)`);
    console.log(`   [3] Personalizado Rápido (4 perguntas)`);
    const pAns = await promptLine(`   Opção [1-3, Padrão: 1]: `);
    if (pAns === '2') {
      applyWorkflowPreset(projectRoot, 'fullstack', { hasFrontend: true });
    } else if (pAns === '3') {
      const fe = detectFrontendInProject(projectRoot);
      const ansFe = await promptLine(`   Possui Frontend visual? [s/N]: `);
      const hasFrontend = ansFe ? ['s', 'sim', 'y'].includes(ansFe.toLowerCase()) : fe;
      applyWorkflowPreset(projectRoot, 'custom', { hasFrontend });
    } else {
      applyWorkflowPreset(projectRoot, 'backend', { hasFrontend: false });
    }
    showConsolidatedStatus(projectRoot);
    return;
  }

  if (choice === '2') {
    console.log(`\n   ${C.bWhite}Escolha o perfil de skills:${C.reset}`);
    console.log(`   [0] Zero-Baseline (0 skills ativas, carregamento JIT sob demanda)`);
    console.log(`   [1] Backend (31 skills ativas)`);
    console.log(`   [2] Core (12 skills essenciais)`);
    console.log(`   [3] Fullstack (75 skills ativas)`);
    const sAns = await promptLine(`   Opção [0-3, Padrão: 1]: `);
    const profs = { '0': 'zero', '1': 'backend', '2': 'core', '3': 'full' };
    runSkillsSurface(projectRoot, profs[sAns] || 'backend');
    return;
  }

  if (choice === '3') {
    await runProfileWizard(projectRoot);
    return;
  }

  if (choice === '0' || choice.toLowerCase() === 'q') {
    console.log(`\n${C.dim}Operação finalizada.${C.reset}\n`);
    return;
  }

  // Padrão: 4 (Status)
  showConsolidatedStatus(projectRoot);
}

/* ==============================================================================
 * CLI Router Principal
 * ============================================================================== */

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
Uso: gsd-agy-config [COMANDO] [ARGUMENTOS] [OPÇÕES]

Central Unificada de Governança para Antigravity GSD Kit.
Unifica gsd-settings, gsd-config, gsd-surface e gsd-profile-user.

Módulos & Comandos:

  1. Workflow & Motores (antigos gsd-settings e gsd-config):
     backend, -b           Aplica preset otimizado para Backend (sem UI)
     fullstack, -f         Aplica preset otimizado para Fullstack (com UI)
     custom, -c            Wizard rápido de workflow
     get <chave>           Lê valor de .planning/config.json
     set <chave> <valor>   Grava valor pontual em .planning/config.json

  2. Superfície de Skills (antigo gsd-surface):
     surface [list|status] Exibe catálogo e perfil ativo de skills
     surface <zero|core|backend|full> Alterna perfil do catálogo
     surface enable <skill>  Promove skill para o catálogo ativo
     surface disable <skill> Move skill para o pool em repouso

  3. Perfil do Desenvolvedor (antigo gsd-profile-user):
     profile               Abre questionário de preferências (Ponytail & Caveman)
     profile show          Exibe o USER-PROFILE.md ativo
     profile ponytail <full|ultra|lite|off>
     profile caveman <on|ultra|off>

  4. Painel Consolidado de Status:
     show, status, -s      Exibe visão geral (Workflow + Skills + Perfil)
     --json                Saída estruturada em JSON

Exemplos:
  node gsd-agy-config.cjs backend
  node gsd-agy-config.cjs surface core
  node gsd-agy-config.cjs profile ponytail ultra
  node gsd-agy-config.cjs show
`);
    process.exit(0);
  }

  const asJson = args.includes('--json');
  const cleanArgs = args.filter(a => !a.startsWith('--'));

  // Detectar diretório alvo se informado
  let targetDir = process.cwd();
  let remainingArgs = [];
  for (const a of cleanArgs) {
    if (fs.existsSync(a) && fs.statSync(a).isDirectory()) {
      targetDir = path.resolve(a);
    } else {
      remainingArgs.push(a);
    }
  }

  const projectRoot = resolveProjectRoot(targetDir);
  const verb = (remainingArgs[0] || '').toLowerCase();
  const subArg = remainingArgs[1];
  const subArg2 = remainingArgs[2];

  // Roteamento Módulo 1: Workflow Presets
  if (verb === 'backend' || verb === '-b' || args.includes('--backend') || (verb === 'workflow' && subArg === 'backend')) {
    applyWorkflowPreset(projectRoot, 'backend', { hasFrontend: false });
    showConsolidatedStatus(projectRoot, asJson);
    return;
  }

  if (verb === 'fullstack' || verb === '-f' || args.includes('--fullstack') || (verb === 'workflow' && subArg === 'fullstack')) {
    applyWorkflowPreset(projectRoot, 'fullstack', { hasFrontend: true });
    showConsolidatedStatus(projectRoot, asJson);
    return;
  }

  if (verb === 'custom' || verb === '-c' || (verb === 'workflow' && subArg === 'custom')) {
    const fe = detectFrontendInProject(projectRoot);
    applyWorkflowPreset(projectRoot, 'custom', { hasFrontend: fe });
    showConsolidatedStatus(projectRoot, asJson);
    return;
  }

  if (verb === 'set' && subArg && subArg2 !== undefined) {
    setConfigKnob(projectRoot, subArg, subArg2);
    return;
  }

  if (verb === 'get' && subArg) {
    const { config } = loadConfig(projectRoot);
    const parts = subArg.split('.');
    let cur = config;
    for (const p of parts) cur = cur ? cur[p] : undefined;
    console.log(JSON.stringify(cur, null, 2));
    return;
  }

  // Roteamento Módulo 2: Superfície de Skills (gsd-surface)
  if (verb === 'surface' || verb === 'skills') {
    const action = subArg || 'status';
    runSkillsSurface(projectRoot, action, subArg2);
    return;
  }

  // Roteamento Módulo 3: Perfil do Desenvolvedor (gsd-profile-user)
  if (verb === 'profile' || verb === 'user') {
    if (subArg === 'ponytail' && subArg2) {
      const { profile } = loadUserProfile(projectRoot);
      profile.ponytail_mode = subArg2;
      saveUserProfile(projectRoot, profile);
      return;
    }
    if (subArg === 'caveman' && subArg2) {
      const { profile } = loadUserProfile(projectRoot);
      profile.caveman_mode = subArg2;
      saveUserProfile(projectRoot, profile);
      return;
    }
    if (subArg === 'show') {
      const { profile, rawContent } = loadUserProfile(projectRoot);
      console.log(rawContent || JSON.stringify(profile, null, 2));
      return;
    }
    if (IS_TTY) {
      await runProfileWizard(projectRoot);
    } else {
      showConsolidatedStatus(projectRoot, asJson);
    }
    return;
  }

  // Roteamento Módulo 4: Status / Show
  if (verb === 'show' || verb === 'status' || verb === '-s' || args.includes('--show')) {
    showConsolidatedStatus(projectRoot, asJson);
    return;
  }

  // Sem verbo: Menu Interativo se TTY, senão Status Consolidado
  if (IS_TTY) {
    await runInteractiveMenu(projectRoot);
  } else {
    showConsolidatedStatus(projectRoot, asJson);
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`${C.bRed}🛑 Erro ao executar gsd-agy-config:${C.reset}`, err.message);
    process.exit(1);
  });
}

module.exports = {
  main,
  applyWorkflowPreset,
  loadConfig,
  saveConfig,
  loadUserProfile,
  saveUserProfile,
  resolveProjectRoot
};
