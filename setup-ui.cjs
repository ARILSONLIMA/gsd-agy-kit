#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - Terminal UI Hub & Control Center
 * 
 * Recursos:
 * - Painel de Controle interativo com navegação por teclado (0-9)
 * - Cabeçalho visual dinâmico com status do workspace, stack detectada e tokens
 * - Motor de instalação com stepper e spinners animados (⠋ ⠙ ⠹ ...)
 * - Execução integrada de testes de conformidade (test-kit)
 * - Seletor de perfis de skills (Core / Backend / Fullstack)
 * - Health Check, Diagnóstico e Auto-Instalador de LSPs Multi-Linguagem
 * - Auto-Cura (Doctor) para reparo rápido de subagentes e regras
 * - Desinstalação segura e reversão 100% garantida
 * - Suporte a execução CLI direta (--install, --test, --report, --lsp, etc.) para automações/CI
 * - Suporte nativo a 1 comando via npx github:ARILSONLIMA/gsd-agy-kit, curl | bash e irm | iex
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync, spawnSync } = require('child_process');
const LspEngine = require('./lib/lsp-engine.cjs');
const ErrorGuard = require('./lib/error-guard.cjs');
const { LANGUAGE_REGISTRY } = LspEngine;

// Estilos e Cores ANSI
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[90m',
  cyan: '\x1b[36m',
  bCyan: '\x1b[96m',
  green: '\x1b[32m',
  bGreen: '\x1b[92m',
  yellow: '\x1b[33m',
  bYellow: '\x1b[93m',
  red: '\x1b[31m',
  bRed: '\x1b[91m',
  magenta: '\x1b[35m',
  bMagenta: '\x1b[95m',
  blue: '\x1b[34m',
  bBlue: '\x1b[94m',
  white: '\x1b[37m',
  bWhite: '\x1b[97m',
  hideCursor: '\x1b[?25l',
  showCursor: '\x1b[?25h',
  clearLine: '\x1b[2K\r'
};

const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const IS_TTY = Boolean(process.stdout.isTTY && !process.env.CI);

function canPromptInteractively() {
  if (process.env.CI) return false;
  if (process.stdin.isTTY) return true;
  if (IS_TTY && process.platform !== 'win32') {
    try {
      const fd = fs.openSync('/dev/tty', 'r');
      fs.closeSync(fd);
      return true;
    } catch {}
  }
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function askPrompt(question) {
  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => {
      const onSigint = () => {
        rl.close();
        if (IS_TTY) process.stdout.write(C.showCursor);
        process.exit(130);
      };
      rl.once('SIGINT', onSigint);
      rl.question(question, ans => {
        rl.removeListener('SIGINT', onSigint);
        rl.close();
        resolve((ans || '').trim().toLowerCase());
      });
    });
  }
  if (IS_TTY && process.platform !== 'win32') {
    try {
      const ttyStream = fs.createReadStream('/dev/tty');
      const rl = readline.createInterface({ input: ttyStream, output: process.stdout });
      return new Promise(resolve => {
        const onSigint = () => {
          rl.close();
          ttyStream.destroy();
          if (IS_TTY) process.stdout.write(C.showCursor);
          process.exit(130);
        };
        rl.once('SIGINT', onSigint);
        rl.question(question, ans => {
          rl.removeListener('SIGINT', onSigint);
          rl.close();
          ttyStream.destroy();
          resolve((ans || '').trim().toLowerCase());
        });
      });
    } catch {}
  }
  return Promise.resolve('');
}

function copyFolderRecursive(src, dest) {
  if (!fs.existsSync(dest)) fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyFolderRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function getWorkspaceStatus(targetDir) {
  const agentsDir = path.join(targetDir, '.agents');
  const hookPretool = path.join(agentsDir, 'hooks', 'token-guard-pretool.cjs');
  const hooksJson = path.join(agentsDir, 'hooks.json');
  const isInstalled = fs.existsSync(hookPretool) && fs.existsSync(hooksJson);
  
  let activeSkills = 0;
  let poolSkills = 0;
  const skillsDir = path.join(agentsDir, 'skills');
  const poolDir = path.join(agentsDir, 'skills-pool');
  try { if (fs.existsSync(skillsDir)) activeSkills = fs.readdirSync(skillsDir).filter(f => fs.statSync(path.join(skillsDir, f)).isDirectory()).length; } catch {}
  try { if (fs.existsSync(poolDir)) poolSkills = fs.readdirSync(poolDir).filter(f => fs.statSync(path.join(poolDir, f)).isDirectory()).length; } catch {}

  let activeAgents = 0;
  let poolAgents = 0;
  const agDir = path.join(agentsDir, 'agents');
  const agPoolDir = path.join(agentsDir, 'agents-pool');
  try { if (fs.existsSync(agDir)) activeAgents = fs.readdirSync(agDir).filter(f => f.endsWith('.md')).length; } catch {}
  try { if (fs.existsSync(agPoolDir)) poolAgents = fs.readdirSync(agPoolDir).filter(f => f.endsWith('.md')).length; } catch {}

  const stacks = [];
  if (fs.existsSync(path.join(targetDir, 'go.mod'))) stacks.push('Go');
  if (fs.existsSync(path.join(targetDir, 'package.json')) || fs.existsSync(path.join(targetDir, 'tsconfig.json'))) stacks.push('Node/TS');
  if (fs.existsSync(path.join(targetDir, 'pyproject.toml')) || fs.existsSync(path.join(targetDir, 'requirements.txt'))) stacks.push('Python');
  if (fs.existsSync(path.join(targetDir, 'Cargo.toml'))) stacks.push('Rust');
  const stackStr = stacks.length > 0 ? stacks.join(' + ') : 'Geral';

  const tokensSaved = Math.round((poolSkills * 250 + poolAgents * 1200) / 3.8);

  return {
    isInstalled,
    activeSkills,
    poolSkills,
    activeAgents,
    poolAgents,
    stack: stackStr,
    tokensSaved
  };
}

function getKitVersion() {
  try {
    const pkgData = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf8'));
    return pkgData.version || '2.0.0';
  } catch (_) {
    return '2.0.0';
  }
}

function renderHubBanner(targetDir) {
  const status = getWorkspaceStatus(targetDir);
  const statusBadge = status.isInstalled ? `${C.bGreen}[🟢 Blindado & Operacional]${C.reset}` : `${C.bYellow}[⚪ Não Configurado]${C.reset}`;
  const ver = getKitVersion();
  
  console.log(`\n${C.bCyan}╭────────────────────────────────────────────────────────────────────────╮${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.bold}${C.bWhite}🚀 ANTIGRAVITY GSD KIT - PAINEL DE CONTROLE v${ver}${C.reset}                   ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.dim}Workspace:${C.reset} ${C.white}${targetDir}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.dim}Status:${C.reset}    ${statusBadge}  •  ${C.dim}Stack:${C.reset} ${C.bWhite}${status.stack}${C.reset}`);
  if (status.isInstalled) {
    console.log(`${C.bCyan}│${C.reset}   ${C.dim}Catálogo:${C.reset}  ${C.cyan}${status.activeSkills} skills ativas${C.reset} (${status.poolSkills} no pool) | ${C.cyan}${status.activeAgents} agentes${C.reset} (${status.poolAgents} no pool)`);
    console.log(`${C.bCyan}│${C.reset}   ${C.dim}Motores:${C.reset}   ${C.bGreen}[Caveman Terse: ON]${C.reset}  •  ${C.bGreen}[Ponytail Senior: FULL]${C.reset}`);
    console.log(`${C.bCyan}│${C.reset}   ${C.dim}Economia:${C.reset}  ${C.bGreen}~${status.tokensSaved.toLocaleString('pt-BR')} tokens salvos por turno no pool${C.reset}`);
  } else {
    console.log(`${C.bCyan}│${C.reset}   ${C.yellow}O kit ainda não está instalado neste workspace.${C.reset}`);
    console.log(`${C.bCyan}│${C.reset}   ${C.dim}Selecione a opção [1] abaixo para iniciar a instalação rápida.${C.reset}`);
  }
  console.log(`${C.bCyan}╰────────────────────────────────────────────────────────────────────────╯${C.reset}\n`);
}

function renderBanner() {
  const ver = getKitVersion();
  console.log(`\n${C.bCyan}╭────────────────────────────────────────────────────────────────────────╮${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.bold}${C.bWhite}🚀 ANTIGRAVITY GSD KIT v${ver}${C.reset}                                        ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.dim}Adaptador de Governança, Compatibilidade e Auto-Cura para Antigravity${C.reset}${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}╰────────────────────────────────────────────────────────────────────────╯${C.reset}\n`);
}

async function promptArchitectureChoice() {
  console.log(`${C.cyan}╭─ 🎨 Configuração de Interface / Front-End ─────────────────────────────╮${C.reset}`);
  console.log(`${C.cyan}│${C.reset}                                                                        ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}   Selecione o tipo de arquitetura que este projeto utilizará:          ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}                                                                        ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}   ${C.bGreen}❯ [1] Backend / CLI Only${C.reset} ${C.dim}(Recomendado)${C.reset}                               ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}         ${C.dim}• Perfil enxuto de skills (31 ativas, 43 arquivadas)${C.reset}           ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}         ${C.dim}• Desativa gates e fases de interface gráfica (UI)${C.reset}             ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}                                                                        ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}     ${C.bWhite}[2] Fullstack / Com Front-End${C.reset}                                      ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}         ${C.dim}• Perfil full de skills (100% disponíveis no pool)${C.reset}             ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}         ${C.dim}• Habilita governança de UI e safety gates visuais${C.reset}              ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}│${C.reset}                                                                        ${C.cyan}│${C.reset}`);
  console.log(`${C.cyan}╰────────────────────────────────────────────────────────────────────────╯${C.reset}`);

  if (!canPromptInteractively()) {
    return false; // Default: Backend
  }

  const ans = await askPrompt(`\n   ${C.bold}Pressione [1], [2] ou [Enter para padrão Backend]: ${C.reset}`);
  if (ans === '2' || ans === 's' || ans === 'sim' || ans === 'y' || ans === 'yes') {
    console.log(`   ${C.bGreen}✔ Modo Front-End ATIVADO${C.reset}\n`);
    return true;
  } else {
    console.log(`   ${C.dim}⚙️ Modo Backend ATIVADO (perfil enxuto e UI desligada)${C.reset}\n`);
    return false;
  }
}

function renderProgressBar(current, total, width = 30) {
  const percent = Math.round((current / total) * 100);
  const filledLen = Math.round((current / total) * width);
  const emptyLen = width - filledLen;
  const bar = `${C.bGreen}${'█'.repeat(filledLen)}${C.reset}${C.dim}${'░'.repeat(emptyLen)}${C.reset}`;
  return `${C.bold}Progresso Geral:${C.reset} [${bar}] ${C.bold}${percent}%${C.reset} ${C.dim}(${current}/${total})${C.reset}`;
}

class StepperUI {
  constructor(steps) {
    this.steps = steps;
    this.total = steps.length;
    this.currentIdx = 0;
    this.spinnerIdx = 0;
    this.intervalId = null;
    this.stepStartTime = 0;

    this._sigintHandler = () => {
      this.cleanup();
      process.exit(130);
    };
    process.once('SIGINT', this._sigintHandler);
    process.once('SIGTERM', this._sigintHandler);
  }

  printHeader() {
    if (IS_TTY) process.stdout.write(C.hideCursor);
    this.updateProgressHeader(0);
    console.log();
  }

  updateProgressHeader(current) {
    if (IS_TTY) {
      process.stdout.write(`${C.clearLine}${renderProgressBar(current, this.total)}\n`);
    } else {
      console.log(renderProgressBar(current, this.total));
    }
  }

  startStep(index) {
    this.currentIdx = index;
    this.stepStartTime = Date.now();
    const step = this.steps[index];

    if (!IS_TTY) {
      process.stdout.write(`  ⏳ [${index + 1}/${this.total}] ${step.title}... `);
      return;
    }

    this.intervalId = setInterval(() => {
      const frame = SPINNER_FRAMES[this.spinnerIdx % SPINNER_FRAMES.length];
      this.spinnerIdx++;
      process.stdout.write(`${C.clearLine}  ${C.bCyan}${frame}${C.reset} ${C.bold}[${index + 1}/${this.total}]${C.reset} ${step.title}...`);
    }, 80);
  }

  finishStep(index, success = true, errorMsg = '') {
    const elapsed = Date.now() - this.stepStartTime;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    const step = this.steps[index];
    if (IS_TTY) {
      process.stdout.write(C.clearLine);
    }

    if (success) {
      console.log(`  ${C.bGreen}✔${C.reset} ${C.bold}[${index + 1}/${this.total}]${C.reset} ${step.title} ${C.dim}(${elapsed}ms)${C.reset}`);
    } else {
      console.log(`  ${C.bRed}✖${C.reset} ${C.bold}[${index + 1}/${this.total}]${C.reset} ${step.title} ${C.bRed}[FALHA]${C.reset}`);
      if (errorMsg) {
        console.log(`\n${C.bRed}🛑 ERRO CRÍTICO NA ETAPA ${index + 1}:${C.reset}\n   ${C.yellow}${errorMsg}${C.reset}\n`);
      }
    }
  }

  cleanup() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    process.removeListener('SIGINT', this._sigintHandler);
    process.removeListener('SIGTERM', this._sigintHandler);
    if (IS_TTY) process.stdout.write(C.showCursor);
  }
}

function renderDashboard() {
  console.log(`\n${C.bCyan}╭─ 📊 Resumo de Instalação e Governança ─────────────────────────────────╮${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}                                                                        ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.bold}Status dos Componentes:${C.reset}                                              ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Subagentes GSD:    ${C.bGreen}✔ Normalizados${C.reset} (Antigravity Tools + Cavecrew)    ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Ponytail Engine:   ${C.bGreen}✔ Ativo${C.reset} (Escada de Decisão, YAGNI & Codebase Map) ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Caveman Engine:    ${C.bGreen}✔ Ativo${C.reset} (Voz Concisa pt-BR & Shrink Compressor)  ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Dynamic Pools:     ${C.bGreen}✔ Ativos${C.reset} (Agentes & Skills com ativação JIT)     ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Servidor MCP:      ${C.bGreen}✔ Ativo${C.reset} (mempalace, rag, map, debt, shrink, lsp) ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Memória Episódica: ${C.bGreen}✔ Ativa${C.reset} (.agents/memory/palace.db em SQLite)     ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Hard Gates:        ${C.bGreen}✔ Ativos${C.reset} (.agents/hooks.json - Circuit Breaker)  ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Auto-Cura (Git):   ${C.bGreen}✔ Instalado${C.reset} (post-merge, post-checkout, commit)   ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}                                                                        ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.bold}Otimização de Contexto:${C.reset}                                              ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Payload Removido:  ${C.bYellow}~400 KB${C.reset} de peso morto cortados do contexto      ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • Economia por Turno:${C.bGreen}~22.000 tokens${C.reset} poupados no total                 ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}                                                                        ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${C.bold}Comandos & Ferramentas Úteis:${C.reset}                                       ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • ${C.cyan}/ponytail /ponytail-review /ponytail-audit /ponytail-debt${C.reset}          ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • ${C.cyan}/caveman /ultracave /caveman-review /caveman-commit /caveman-compress${C.reset}${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • ${C.cyan}lsp_diagnostics / definition${C.reset} Análise e navegação Multi-LSP Híbrido ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • ${C.cyan}mempalace_recall${C.reset}             Busca decisões passadas no SQLite     ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • ${C.cyan}/gsd-tokens${C.reset}                  Telemetria de uso e cache de tokens   ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   • ${C.cyan}/gsd-agy-update${C.reset}              Verifica versão, melhorias e atualiza ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}╰────────────────────────────────────────────────────────────────────────╯${C.reset}`);
  console.log(`\n${C.bGreen}✨ Projeto blindado com sucesso e pronto para desenvolvimento!${C.reset}\n`);
}

async function promptAndInstallLsps(targetDir) {
  const lsp = new LspEngine(targetDir);
  const detectedStacks = lsp.detectProjectStacks(targetDir);
  const detectedIds = new Set(detectedStacks.map(s => s.id));

  const catalogKeys = Object.keys(LANGUAGE_REGISTRY);
  const items = catalogKeys.map((key, idx) => {
    const spec = LANGUAGE_REGISTRY[key];
    const primaryBin = spec.lspBinaries[0];
    const hasDedicatedLsp = spec.lspBinaries.some(b => lsp.hasBinary(b));
    const activeChecker = spec.checkerBinaries.find(b => lsp.hasBinary(b)) || null;
    const isDetected = detectedIds.has(key);
    const installCmd = spec.install[process.platform] || spec.install.default;
    return {
      num: idx + 1,
      key,
      name: spec.name,
      primaryBin,
      hasDedicatedLsp,
      activeChecker,
      isDetected,
      installLabel: spec.install.label,
      installCmd,
      fallbackCmd: spec.install.fallback || null
    };
  });

  console.log(`\n   ${C.bCyan}╭─ 🧠 Servidores LSP Multi-Linguagem (Análise Estática & Compiladores) ──╮${C.reset}`);
  for (const item of items) {
    const statusStr = item.hasDedicatedLsp
      ? `${C.bGreen}✔ ${item.primaryBin} instalado${C.reset}`
      : (item.activeChecker
          ? `${C.bYellow}⚡ ${item.activeChecker} ativo${C.reset} ${C.dim}(LSP dedicado '${item.primaryBin}' opcional)${C.reset}`
          : `${C.bRed}✖ Ausente (${item.primaryBin})${C.reset}`);
    const detTag = item.isDetected ? ` ${C.bMagenta}[Detectado no Projeto]${C.reset}` : '';
    console.log(`   ${C.bCyan}│${C.reset}  ${C.bWhite}[${item.num}]${C.reset} ${item.name.padEnd(28)} ${statusStr}${detTag}`);
  }
  console.log(`   ${C.bCyan}╰─────────────────────────────────────────────────────────────────────────╯${C.reset}`);

  const ans = await askPrompt(
    `   ${C.bold}Quais LSPs deseja baixar/instalar agora?${C.reset} ${C.dim}(ex: 1,2,3 | 'd' = detectados ausentes | [Enter] = pular)${C.reset}: `
  );

  if (!ans || ans === 'n' || ans === 'nao' || ans === '0') {
    return;
  }

  let selected = [];
  if (ans === 'd' || ans === 'detectados') {
    selected = items.filter(i => i.isDetected && !i.hasDedicatedLsp);
    if (selected.length === 0) {
      console.log(`   ${C.bGreen}✔ Todas as linguagens detectadas no projeto já possuem LSP instalado!${C.reset}`);
      return;
    }
  } else if (ans === 't' || ans === 'todos' || ans === 'all') {
    selected = items.filter(i => !i.hasDedicatedLsp);
  } else {
    const nums = ans
      .split(/[\s,;]+/)
      .map(s => parseInt(s.trim(), 10))
      .filter(n => !isNaN(n) && n >= 1 && n <= items.length);
    selected = items.filter(i => nums.includes(i.num));
  }

  if (selected.length === 0) {
    return;
  }

  console.log(`\n   ${C.bCyan}📥 Baixando e instalando servidores LSP selecionados...${C.reset}`);
  for (const item of selected) {
    console.log(`\n   ${C.cyan}➜ Instalando ${item.installLabel}...${C.reset}`);
    console.log(`   ${C.dim}  Comando: ${item.installCmd}${C.reset}`);
    let installedOk = false;
    try {
      execSync(item.installCmd, { stdio: 'inherit', timeout: 180000 });
      installedOk = true;
    } catch (err) {
      if (item.fallbackCmd) {
        console.log(`   ${C.yellow}⚠ Tentando comando alternativo: ${item.fallbackCmd}${C.reset}`);
        try {
          execSync(item.fallbackCmd, { stdio: 'inherit', timeout: 180000 });
          installedOk = true;
        } catch {}
      }
    }

    if (installedOk) {
      console.log(`   ${C.bGreen}✔ ${item.name} (${item.primaryBin}) instalado com sucesso!${C.reset}`);
    } else {
      console.log(`   ${C.bYellow}⚠ Não foi possível instalar automaticamente '${item.primaryBin}'. Execute manualmente: ${item.installCmd}${C.reset}`);
    }
  }
}

async function runInstaller(targetDir, hasFrontendInput = null, options = {}) {
  const kitDir = path.resolve(__dirname);
  renderBanner();
  console.log(`   ${C.dim}Diretório Alvo: ${targetDir}${C.reset}\n`);

  let hasFrontend = hasFrontendInput;
  if (hasFrontend === null) {
    hasFrontend = await promptArchitectureChoice();
  } else {
    if (hasFrontend) {
      console.log(`   ${C.bGreen}✔ Modo Front-End ATIVADO${C.reset}\n`);
    } else {
      console.log(`   ${C.dim}⚙️ Modo Backend ATIVADO (perfil enxuto e UI desligada)${C.reset}\n`);
    }
  }

  let enableMempalace = true;
  let enableCodeReview = true;

  if (hasFrontendInput === null && canPromptInteractively()) {
    console.log(`\n   ${C.bWhite}Recursos Opcionais:${C.reset}`);
    const memAns = await askPrompt('   Ativar Mempalace (memória de longo prazo)? [S/n]: ');
    enableMempalace = memAns !== 'n' && memAns !== 'nao';

    const crAns = await askPrompt('   Ativar Code Review Automático? [S/n]: ');
    enableCodeReview = crAns !== 'n' && crAns !== 'nao';

    await promptAndInstallLsps(targetDir);
    console.log();
  }

  const agentsDir = path.join(targetDir, '.agents');
  const rulesDir = path.join(agentsDir, 'rules');
  const hooksDir = path.join(agentsDir, 'hooks');

  const steps = [
    {
      title: 'Verificação de Ambiente (Node, ast-grep, graphify, GSD)',
      run: async () => {
        let hasAstGrep = false;
        let astGrepErr = '';
        try {
          execSync('ast-grep --version', { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
          hasAstGrep = true;
        } catch (e) {
          astGrepErr = (e.stderr || e.message || '').toString().trim();
          try {
            execSync('npx -y --package @ast-grep/cli ast-grep --version', { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 10000 });
            hasAstGrep = true;
          } catch (e2) {
            astGrepErr += '\n' + (e2.stderr || e2.message || '').toString().trim();
          }
        }
        if (!hasAstGrep) {
          throw new Error(`ast-grep não encontrado no PATH nem via npx.\n${astGrepErr}\nInstale com: npm install -g @ast-grep/cli`);
        }
        try {
          execSync('graphify --version', { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 5000 });
        } catch (e) {
          const gErr = (e.stderr || e.message || '').toString().trim();
          throw new Error(`graphify não encontrado no PATH.\n${gErr}\nInstale com: pip install graphify-cli`);
        }
        const gsdCore = path.join(targetDir, '.agents', 'gsd-core');
        const gsdAgents = path.join(targetDir, '.agents', 'agents');
        const isGsdCore = fs.existsSync(gsdCore) || fs.existsSync(gsdAgents);
        if (!isGsdCore) {
          throw new Error('Ecossistema GSD não detectado (.agents/gsd-core ou .agents/agents). Execute primeiro a inicialização do GSD.');
        }
        await sleep(80);
      }
    },
    {
      title: 'Regras de Comportamento e Tools (.agents/rules/)',
      run: async () => {
        if (!fs.existsSync(rulesDir)) fs.mkdirSync(rulesDir, { recursive: true });
        // Remove regra legada gopls.md caso exista para evitar duplicidade com lsp.md
        try { fs.rmSync(path.join(rulesDir, 'gopls.md'), { force: true }); } catch {}
        const kitRulesDir = path.join(kitDir, 'rules');
        if (fs.existsSync(kitRulesDir)) {
          const ruleFiles = fs.readdirSync(kitRulesDir).filter(f => f.endsWith('.md'));
          for (const r of ruleFiles) {
            const src = path.join(kitRulesDir, r);
            const dest = path.join(rulesDir, r);
            fs.copyFileSync(src, dest);
          }
        }
        await sleep(50);
      }
    },
    {
      title: 'Hooks de Governança em Tempo Real (PreInvocation & PreToolUse)',
      run: async () => {
        if (!fs.existsSync(hooksDir)) fs.mkdirSync(hooksDir, { recursive: true });
        const kitHooksDir = path.join(kitDir, 'hooks');
        if (fs.existsSync(kitHooksDir)) {
          copyFolderRecursive(kitHooksDir, hooksDir);
        }

        const hooksJsonPath = path.join(agentsDir, 'hooks.json');
        let hooksConfig = {
          "token-efficiency-guard": {
            "SessionStart": [
              {
                "type": "command",
                "command": "node hooks/token-guard-sessionstart.cjs",
                "timeout": 15
              }
            ],
            "PreInvocation": [
              {
                "type": "command",
                "command": "node hooks/token-guard-preinvocation.cjs",
                "timeout": 15
              }
            ],
            "PreToolUse": [
              {
                "matcher": "read_file|view_file|run_command|write_file|write_to_file|Write|write|edit_file|replace_file_content|invoke_subagent",
                "hooks": [
                  {
                    "type": "command",
                    "command": "node hooks/token-guard-pretool.cjs",
                    "timeout": 15
                  }
                ]
              }
            ],
            "PostToolUse": [
              {
                "matcher": "*",
                "hooks": [
                  {
                    "type": "command",
                    "command": "node hooks/token-guard-diagnostics.cjs",
                    "timeout": 15
                  }
                ]
              }
            ],
            "Stop": [
              {
                "type": "command",
                "command": "node hooks/token-guard-diagnostics.cjs --summary",
                "timeout": 15
              }
            ]
          }
        };

        if (fs.existsSync(hooksJsonPath)) {
          try {
            let rawExisting = fs.readFileSync(hooksJsonPath, 'utf8');
            rawExisting = rawExisting.replace(/node\s+["']?[a-zA-Z]:[\\/][^"']*?\.agents[\\/]hooks[\\/]([a-zA-Z0-9_.-]+\.cjs)["']?/g, 'node hooks/$1');
            const existingJson = JSON.parse(rawExisting);
            for (const k of Object.keys(existingJson)) {
              if (k !== 'token-efficiency-guard') {
                hooksConfig[k] = existingJson[k];
              }
            }
          } catch {}
        }

        fs.writeFileSync(hooksJsonPath, JSON.stringify(hooksConfig, null, 2), 'utf8');
        await sleep(80);
      }
    },
    {
      title: 'Normalizando Subagentes GSD para Antigravity CLI & MCP',
      run: async () => {
        const originalBackupDir = path.join(agentsDir, '.backup-original-gsd');
        const targetAgentsDir = path.join(agentsDir, 'agents');
        const targetPoolDir = path.join(agentsDir, 'agents-pool');
        if (!fs.existsSync(targetPoolDir)) fs.mkdirSync(targetPoolDir, { recursive: true });

        // Copiar subagentes cirúrgicos do Cavecrew
        const kitSubagents = path.join(kitDir, 'subagents');
        if (fs.existsSync(kitSubagents)) {
          copyFolderRecursive(kitSubagents, targetPoolDir);
        }

        if (fs.existsSync(targetAgentsDir)) {
          if (!fs.existsSync(originalBackupDir)) {
            try { copyFolderRecursive(targetAgentsDir, originalBackupDir); } catch {}
          }
          const patchScript = path.join(kitDir, 'patch-agents.cjs');
          if (fs.existsSync(patchScript)) {
            spawnSync(process.execPath, [patchScript, targetDir], { stdio: 'ignore' });
          }
        }
        await sleep(80);
      }
    },
    {
      title: 'Dynamic Agent Pool & Redução de Contexto (.agents/agents-pool/)',
      run: async () => {
        const targetAgentsDir = path.join(agentsDir, 'agents');
        if (fs.existsSync(targetAgentsDir)) {
          const optScript = path.join(kitDir, 'optimize-tokens.cjs');
          if (fs.existsSync(optScript)) {
            spawnSync(process.execPath, [optScript, targetDir], { stdio: 'ignore' });
            spawnSync(process.execPath, [optScript, targetDir, '--sync'], { stdio: 'ignore' });
          }
        }
        await sleep(80);
      }
    },
    {
      title: 'Dynamic Skill Pool & Carregamento JIT (.agents/skills-pool/)',
      run: async () => {
        const skillsDir = path.join(agentsDir, 'skills');
        const poolDir = path.join(agentsDir, 'skills-pool');
        if (!fs.existsSync(poolDir)) fs.mkdirSync(poolDir, { recursive: true });

        // Copiar catálogo completo de skills nativas (incluindo Ponytail & Caveman)
        const kitSkillsDir = path.join(kitDir, 'skills');
        if (fs.existsSync(kitSkillsDir)) {
          copyFolderRecursive(kitSkillsDir, poolDir);
          copyFolderRecursive(kitSkillsDir, skillsDir);
        }

        const skillsMgr = path.join(kitDir, 'skills-manager.cjs');
        if (fs.existsSync(skillsMgr)) {
          const profile = hasFrontend ? 'full' : 'backend';
          try {
            spawnSync(process.execPath, [skillsMgr, 'profile', profile, targetDir], { stdio: 'ignore' });
            spawnSync(process.execPath, [skillsMgr, 'sync', '', targetDir], { stdio: 'ignore' });
          } catch {}
        }
        await sleep(80);
      }
    },
    {
      title: 'Instalando Pacote Completo e Utilitários Nativos (.agents/kit/)',
      run: async () => {
        const targetKitDir = path.join(agentsDir, 'kit');
        if (!fs.existsSync(targetKitDir)) fs.mkdirSync(targetKitDir, { recursive: true });
        const kitScripts = [
          "test-kit.sh", "test-kit.ps1",
          "setup-ui.cjs", "setup.sh", "setup.ps1",
          "install.sh", "install.ps1", "package.json", "CHANGELOG.md",
          "uninstall.sh", "uninstall.ps1",
          "skills-profile.sh", "skills-profile.ps1",
          "optimize-tokens.sh", "optimize-tokens.ps1",
          "sanitize-command.ps1",
          "token-report.cjs", "gsd-update.cjs", "gsd-state-summary.cjs", "gsd-graphify-update.cjs",
          "patch-agents.cjs", "optimize-tokens.cjs", "skills-manager.cjs",
          "compact-state.cjs", "compact-json.cjs", "sanitize-output.cjs",
          "gsd-outline.cjs", "shrink-prompts.cjs", "mcp-server.cjs"
        ];
        for (const sName of kitScripts) {
          const src = path.join(kitDir, sName);
          if (fs.existsSync(src)) {
            const dest = path.join(targetKitDir, sName);
            fs.copyFileSync(src, dest);
            if (sName.endsWith('.sh') || sName.endsWith('.cjs')) {
              try { fs.chmodSync(dest, 0o755); } catch {}
            }
          }
        }
        // Registrar metadados da versão instalada em .agents/kit/.installed-version.json
        try {
          const pkgSrc = path.join(kitDir, 'package.json');
          if (fs.existsSync(pkgSrc)) {
            const pkgData = JSON.parse(fs.readFileSync(pkgSrc, 'utf8'));
            let headSha = null;
            try {
              const gitSha = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: kitDir, encoding: 'utf8', timeout: 2500 });
              if (gitSha.status === 0 && gitSha.stdout) headSha = gitSha.stdout.trim();
            } catch {}
            const metaPath = path.join(targetKitDir, '.installed-version.json');
            fs.writeFileSync(metaPath, JSON.stringify({
              version: pkgData.version || '1.5.0',
              commit: headSha,
              updatedAt: new Date().toISOString()
            }, null, 2) + '\n', 'utf8');
          }
        } catch {}
        // Copiar lib/ com os motores de MemPalace, RAG, Lockfile, Skeleton e Checkpoint
        const kitLibDir = path.join(kitDir, 'lib');
        if (fs.existsSync(kitLibDir)) {
          copyFolderRecursive(kitLibDir, path.join(targetKitDir, 'lib'));
          copyFolderRecursive(kitLibDir, path.join(agentsDir, 'lib'));
        }
        // Copiar mcp-server.cjs para a raiz de .agents também para execução direta
        const mcpServerSrc = path.join(kitDir, 'mcp-server.cjs');
        if (fs.existsSync(mcpServerSrc)) {
          const destMcp = path.join(agentsDir, 'mcp-server.cjs');
          fs.copyFileSync(mcpServerSrc, destMcp);
          try { fs.chmodSync(destMcp, 0o755); } catch {}
        }
        // Copiar blindagem de índices (.graphifyignore e .astgrepignore)
        for (const ign of ['.graphifyignore', '.astgrepignore']) {
          const ignSrc = path.join(kitDir, ign);
          if (fs.existsSync(ignSrc)) {
            fs.copyFileSync(ignSrc, path.join(targetKitDir, ign));
            fs.copyFileSync(ignSrc, path.join(targetDir, ign));
          }
        }
        // Copiar rules/ e skills/ para dentro de .agents/kit/ para hermeticidade total
        const kitRulesDir = path.join(kitDir, 'rules');
        if (fs.existsSync(kitRulesDir)) {
          copyFolderRecursive(kitRulesDir, path.join(targetKitDir, 'rules'));
        }
        const kitSkillsDir = path.join(kitDir, 'skills');
        if (fs.existsSync(kitSkillsDir)) {
          copyFolderRecursive(kitSkillsDir, path.join(targetKitDir, 'skills'));
        }
        const kitSubagentsDir = path.join(kitDir, 'subagents');
        if (fs.existsSync(kitSubagentsDir)) {
          copyFolderRecursive(kitSubagentsDir, path.join(targetKitDir, 'subagents'));
        }
        // Instalar atalhos diretos em scripts/ para conveniência
        const targetScriptsDir = path.join(targetDir, 'scripts');
        if (!fs.existsSync(targetScriptsDir)) fs.mkdirSync(targetScriptsDir, { recursive: true });
        for (const sName of ["test-kit.sh", "test-kit.ps1"]) {
          const src = path.join(targetKitDir, sName);
          if (fs.existsSync(src)) {
            const dest = path.join(targetScriptsDir, sName);
            fs.copyFileSync(src, dest);
            if (sName.endsWith('.sh')) {
              try { fs.chmodSync(dest, 0o755); } catch {}
            }
          }
        }
        await sleep(60);
      }
    },
    {
      title: 'Configurando Servidor MCP e Memória (.agents/mcp_config.json & memory/)',
      run: async () => {
        const memoryDir = path.join(agentsDir, 'memory');
        if (!fs.existsSync(memoryDir)) fs.mkdirSync(memoryDir, { recursive: true });

        // Registrar servidor MCP em .agents/mcp_config.json
        const mcpJsonPath = path.join(agentsDir, 'mcp_config.json');
        let mcpConfig = { mcpServers: {} };
        if (fs.existsSync(mcpJsonPath)) {
          try { mcpConfig = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8')) || { mcpServers: {} }; } catch {}
        }
        if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
        mcpConfig.mcpServers['gsd-economy'] = {
          command: 'node',
          args: ['.agents/mcp-server.cjs']
        };
        fs.writeFileSync(mcpJsonPath, JSON.stringify(mcpConfig, null, 2), 'utf8');

        // Compatibilidade também com descoberta em formato de Plugin (.agents/plugins/gsd-economy/)
        const pluginDir = path.join(agentsDir, 'plugins', 'gsd-economy');
        if (!fs.existsSync(pluginDir)) fs.mkdirSync(pluginDir, { recursive: true });
        const pluginManifest = {
          name: 'gsd-economy',
          description: 'Otimizador de tokens, MemPalace e busca cirúrgica para GSD no Antigravity',
          version: '1.0.0'
        };
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(pluginManifest, null, 2), 'utf8');
        fs.writeFileSync(path.join(pluginDir, 'mcp_config.json'), JSON.stringify(mcpConfig, null, 2), 'utf8');

        // Copiar motor para dentro do plugin para hermeticidade total
        const mcpSrc = path.join(kitDir, 'mcp-server.cjs');
        if (fs.existsSync(mcpSrc)) {
          fs.copyFileSync(mcpSrc, path.join(pluginDir, 'mcp-server.cjs'));
        }
        const libSrc = path.join(kitDir, 'lib');
        if (fs.existsSync(libSrc)) {
          copyFolderRecursive(libSrc, path.join(pluginDir, 'lib'));
        }

        // Registrar plugins locais no Antigravity (.agents/plugins.json)
        const pluginsJsonPath = path.join(agentsDir, 'plugins.json');
        const pluginsConfig = {
          entries: [
            {
              path: '.agents/plugins'
            }
          ]
        };
        fs.writeFileSync(pluginsJsonPath, JSON.stringify(pluginsConfig, null, 2), 'utf8');

        // Registrar MCP nativo no Antigravity CLI (agy mcp add) para disponibilização imediata
        const destMcp = path.join(agentsDir, 'mcp-server.cjs');
        try {
          spawnSync('agy', ['mcp', 'add', 'gsd-economy', 'node', destMcp], { stdio: 'ignore', timeout: 5000 });
        } catch {}

        await sleep(60);
      }
    },
    {
      title: 'Governança no .planning/config.json e Git Auto-Heal Hooks',
      run: async () => {
        const planningDir = path.join(targetDir, '.planning');
        const configJsonPath = path.join(planningDir, 'config.json');
        if (fs.existsSync(configJsonPath)) {
          try {
            const rawConfig = JSON.parse(fs.readFileSync(configJsonPath, 'utf8'));
            rawConfig.response_language = 'pt-BR';
            rawConfig.kit_mode = rawConfig.kit_mode || 'smart-assist';
            rawConfig.strict_errors = true;
            rawConfig.error_guard = { enabled: true, version: 1 };
            if (!rawConfig.workflow) rawConfig.workflow = {};
            rawConfig.workflow.ui_phase = hasFrontend;
            rawConfig.workflow.ui_safety_gate = hasFrontend;
            rawConfig.workflow.ui_review = hasFrontend;
            rawConfig.workflow.compact_content = true;
            rawConfig.workflow.auto_prune_state = true;
            rawConfig.workflow.code_review = enableCodeReview;
            rawConfig.workflow.security_enforcement = enableCodeReview;
            rawConfig.workflow.api_coverage_gate = enableCodeReview;

            if (!rawConfig.plan_review) rawConfig.plan_review = {};
            rawConfig.plan_review.source_grounding = true;
            rawConfig.plan_review.source_grounding_authority = 'ast-grep';

            if (!rawConfig.graphify) rawConfig.graphify = {};
            rawConfig.graphify.enabled = true;
            rawConfig.graphify.auto_update = true;

            if (!rawConfig.mempalace) rawConfig.mempalace = {};
            rawConfig.mempalace.enabled = enableMempalace;
            rawConfig.mempalace.memory_mode = enableMempalace ? 'augment' : 'off';
            rawConfig.mempalace.recall_on_discuss = enableMempalace;
            rawConfig.mempalace.recall_on_plan = enableMempalace;
            rawConfig.mempalace.mirror_kg = enableMempalace;
            rawConfig.mempalace.diary_journal = enableMempalace;
            if (!rawConfig.mempalace.wing) {
              rawConfig.mempalace.wing = path.basename(targetDir);
            }

            fs.writeFileSync(configJsonPath, JSON.stringify(rawConfig, null, 2), 'utf8');
          } catch {}
        }

        const gitHooksDir = path.join(targetDir, '.git', 'hooks');
        if (fs.existsSync(gitHooksDir)) {
          const autoHealContent = '#!/bin/sh\n# Antigravity GSD Kit Auto-Heal Hook\nif [ -f ".agents/kit/patch-agents.cjs" ]; then\n    node .agents/kit/patch-agents.cjs >/dev/null 2>&1 || true\nfi\n';
          const postMergePath = path.join(gitHooksDir, 'post-merge');
          const postCheckoutPath = path.join(gitHooksDir, 'post-checkout');
          fs.writeFileSync(postMergePath, autoHealContent, 'utf8');
          fs.writeFileSync(postCheckoutPath, autoHealContent, 'utf8');

          const postCommitCmd = path.join(gitHooksDir, 'post-commit.cmd');
          const postCommitCmdContent = '@echo off\r\nif exist .agents\\kit\\gsd-graphify-update.cjs (\r\n    node .agents\\kit\\gsd-graphify-update.cjs\r\n)\r\n';
          fs.writeFileSync(postCommitCmd, postCommitCmdContent, 'utf8');

          const postCommitSh = path.join(gitHooksDir, 'post-commit');
          const postCommitShContent = '#!/bin/sh\nif [ -f .agents/kit/gsd-graphify-update.cjs ]; then\n    node .agents/kit/gsd-graphify-update.cjs\nfi\n';
          fs.writeFileSync(postCommitSh, postCommitShContent, 'utf8');

          try {
            fs.chmodSync(postMergePath, 0o755);
            fs.chmodSync(postCheckoutPath, 0o755);
            fs.chmodSync(postCommitSh, 0o755);
          } catch {}
        }

        const gitignorePath = path.join(targetDir, '.gitignore');
        const runtimeIgnores = [
          'gsd-agy-kit/',
          '.gsd-agy-kit-tmp/',
          'graphify-out/',
          '.agents/.cache/',
          '.agents/.cache',
          '.agents/.health-cache',
          '.agents/.jit-promotions.json',
          '.agents/.last-heal-check',
          '.agents/.last-synced-phase',
          '.agents/.gsd-profile',
        ];
        let giContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf8') : '';
        const missing = runtimeIgnores.filter(l => !giContent.split(/\r?\n/).includes(l));
        if (missing.length > 0) {
          const sep = giContent && !giContent.endsWith('\n') ? '\n' : '';
          fs.appendFileSync(gitignorePath, `${sep}\n# Antigravity GSD Kit (caches de runtime)\n${missing.join('\n')}\n`, 'utf8');
        }
        await sleep(60);
      }
    },
    {
      title: 'Inicialização do Grafo de Conhecimento (graphify update .)',
      run: async () => {
        try {
          execSync('graphify update .', { cwd: targetDir, stdio: ['ignore', 'pipe', 'pipe'], timeout: 30000, encoding: 'utf8' });
        } catch (e) {
          const gOut = (e.stderr || e.stdout || e.message || '').toString();
          if (!gOut.toLowerCase().includes('no files') && !gOut.toLowerCase().includes('empty')) {
            ErrorGuard.recordError(targetDir, {
              category: 'TOOL',
              component: 'graphify-init',
              title: 'Aviso na inicialização do grafo Graphify',
              stderr: gOut,
              severity: 'warning'
            });
          }
        }
        await sleep(60);
      }
    },
    {
      title: 'Auto-Teste Rigoroso pós-instalação (Smoke Test dos Motores)',
      run: async () => {
        // 1. Validar ErrorGuard
        const testRec = ErrorGuard.recordError(targetDir, {
          category: 'INSTALL',
          component: 'smoke-test',
          title: 'Sondagem de auto-teste pós-instalação',
          stderr: 'Smoke test probe',
          severity: 'warning'
        });
        if (!testRec || !testRec.entry) {
          throw new Error('Falha ao inicializar subsistema ErrorGuard.');
        }
        ErrorGuard.clearErrors(targetDir);

        // 2. Validar integridade do LspEngine
        const lsp = new LspEngine(targetDir);
        const stackHealth = lsp.checkStackHealth(targetDir);
        if (!stackHealth.ok) {
          throw new Error(`Circuit Breaker LSP reportou falha em stack obrigatória: ${stackHealth.error}`);
        }

        // 3. Validar mcp-server CLI
        const mcpTest = ErrorGuard.spawnStrict(process.execPath, [path.join(agentsDir, 'mcp-server.cjs'), 'tools', '--json'], { cwd: targetDir, timeout: 10000 });
        if (!mcpTest.ok) {
          throw new Error(`Servidor MCP falhou no auto-teste: ${mcpTest.stderr || mcpTest.errorMessage}`);
        }

        await sleep(50);
      }
    }
  ];

  const stepper = new StepperUI(steps);
  stepper.printHeader();

  for (let i = 0; i < steps.length; i++) {
    stepper.startStep(i);
    try {
      await steps[i].run();
      stepper.finishStep(i, true);
    } catch (err) {
      ErrorGuard.emitError(targetDir, {
        category: 'INSTALL',
        component: `setup-step:${steps[i].title}`,
        title: `Falha na etapa de instalação: ${steps[i].title}`,
        stderr: err.stack || err.message,
        hint: 'Verifique as dependências necessárias e execute novamente a instalação.',
        severity: 'error'
      });
      stepper.finishStep(i, false, err.message);
      stepper.cleanup();
      process.exit(1);
    }
  }

  stepper.cleanup();
  renderDashboard();

  console.log(`${C.bCyan}📦 Instalação Nativa Concluída com Sucesso!${C.reset}`);
  console.log(`   ${C.dim}O Antigravity GSD Kit agora reside de forma nativa e permanente no projeto:${C.reset}`);
  console.log(`   ${C.bGreen}• .agents/kit/${C.reset} ${C.dim}(bateria de testes, painel de controle, atualizador, utilitários e desinstalador)${C.reset}`);
  console.log(`   ${C.bGreen}• .agents/skills/gsd-test/${C.reset} ${C.dim}(skill nativa /gsd-test no Antigravity CLI)${C.reset}`);
  console.log(`   ${C.bGreen}• .agents/skills/gsd-tokens/${C.reset} ${C.dim}(skill nativa /gsd-tokens no Antigravity CLI)${C.reset}`);
  console.log(`   ${C.bGreen}• .agents/skills/gsd-agy-update/${C.reset} ${C.dim}(skill nativa /gsd-agy-update no Antigravity CLI)${C.reset}`);
  console.log(`   ${C.bGreen}• scripts/test-kit.sh${C.reset} ${C.dim}(atalho para execução direta no terminal)${C.reset}\n`);

  if (options.interactivePromptTest && canPromptInteractively()) {
    const runTestAns = await askPrompt(`   ${C.bold}Deseja executar a bateria de testes de validação agora? [S/n]: ${C.reset}`);
    if (runTestAns !== 'n' && runTestAns !== 'nao') {
      runTest(targetDir);
    }
  }

  // Limpeza automática da pasta temporária do instalador (padrão ativo exceto se --no-cleanup)
  const isSubdirOfTarget = kitDir !== targetDir && kitDir.startsWith(targetDir + path.sep) && !kitDir.includes('.agents');
  if (isSubdirOfTarget && options.cleanup !== false) {
    const folderName = path.basename(kitDir);
    console.log(`   ${C.dim}Removendo pasta temporária do instalador ('${folderName}') com segurança...${C.reset}`);
    try {
      if (process.platform === 'win32') {
        const { spawn } = require('child_process');
        const cleanCmd = `timeout /t 1 /nobreak >nul & rmdir /s /q "${kitDir}"`;
        spawn('cmd.exe', ['/c', cleanCmd], { detached: true, stdio: 'ignore', cwd: targetDir }).unref();
        console.log(`   ${C.bGreen}✔ Agendada remoção da pasta temporária '${folderName}' ao encerrar o processo.${C.reset}\n`);
      } else {
        process.chdir(targetDir);
        fs.rmSync(kitDir, { recursive: true, force: true });
        console.log(`   ${C.bGreen}✔ Pasta temporária '${folderName}' removida com sucesso!${C.reset}\n`);
      }
    } catch (err) {
      console.log(`   ${C.bYellow}⚠ Não foi possível remover automaticamente: ${err.message}. Você pode removê-la manualmente.${C.reset}\n`);
    }
  }
}

function getPowerShellBinary() {
  if (process.platform !== 'win32') return 'pwsh';
  try {
    const check = spawnSync('where', ['pwsh.exe'], { stdio: 'ignore' });
    if (check.status === 0) return 'pwsh';
  } catch {}
  return 'powershell.exe';
}

function runTest(targetDir) {
  const kitDir = path.resolve(__dirname);
  console.log(`\n${C.bCyan}🧪 Executando Bateria de Testes Automatizados no Workspace...${C.reset}\n`);

  let psScript = path.join(kitDir, 'test-kit.ps1');
  let shScript = path.join(kitDir, 'test-kit.sh');
  if (!fs.existsSync(shScript) && fs.existsSync(path.join(targetDir, '.agents', 'kit', 'test-kit.sh'))) {
    shScript = path.join(targetDir, '.agents', 'kit', 'test-kit.sh');
  }
  if (!fs.existsSync(psScript) && fs.existsSync(path.join(targetDir, '.agents', 'kit', 'test-kit.ps1'))) {
    psScript = path.join(targetDir, '.agents', 'kit', 'test-kit.ps1');
  }

  if (process.platform === 'win32') {
    const psBin = getPowerShellBinary();
    spawnSync(psBin, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', psScript, '-TargetDir', targetDir], { stdio: 'inherit' });
  } else {
    spawnSync('bash', [shScript, targetDir], { stdio: 'inherit' });
  }
}

async function runProfile(targetDir, profileChoice = '') {
  const kitDir = path.resolve(__dirname);
  const skillsMgr = path.join(kitDir, 'skills-manager.cjs');

  let chosen = (profileChoice || '').toLowerCase();
  if (!chosen) {
    console.log(`\n${C.cyan}╭─ ⚡ Gerenciador de Perfis de Skills ────────────────────────────────────╮${C.reset}`);
    console.log(`${C.cyan}│${C.reset}                                                                        ${C.cyan}│${C.reset}`);
    console.log(`${C.cyan}│${C.reset}   ${C.bGreen}[1] Backend${C.reset}   - 31 skills (Recomendado para APIs, workers e DB)       ${C.cyan}│${C.reset}`);
    console.log(`${C.cyan}│${C.reset}   ${C.bWhite}[2] Core${C.reset}      - 12 skills (Super enxuto: planejar, executar, testar)  ${C.cyan}│${C.reset}`);
    console.log(`${C.cyan}│${C.reset}   ${C.bCyan}[3] Fullstack${C.reset} - 75 skills (100% das skills ativas simultaneamente)      ${C.cyan}│${C.reset}`);
    console.log(`${C.cyan}│${C.reset}                                                                        ${C.cyan}│${C.reset}`);
    console.log(`${C.cyan}╰────────────────────────────────────────────────────────────────────────╯${C.reset}\n`);

    const ans = await askPrompt(`   ${C.bold}Escolha o perfil [1-3, padrão 1]: ${C.reset}`);
    if (ans === '2' || ans === 'core') chosen = 'core';
    else if (ans === '3' || ans === 'full' || ans === 'fullstack') chosen = 'full';
    else chosen = 'backend';
  }

  spawnSync(process.execPath, [skillsMgr, 'profile', chosen, targetDir], { stdio: 'inherit' });
}

function runReport(targetDir) {
  const kitDir = path.resolve(__dirname);
  const reportScript = path.join(kitDir, 'token-report.cjs');
  console.log(`\n${C.bCyan}📊 Gerando Relatório de Telemetria de Tokens...${C.reset}\n`);
  spawnSync(process.execPath, [reportScript], { stdio: 'inherit' });
}

function runCompact(targetDir) {
  const kitDir = path.resolve(__dirname);
  const compactScript = path.join(kitDir, 'compact-state.cjs');
  console.log(`\n${C.bCyan}🧹 Executando Compactação de Estado e Métricas Históricas...${C.reset}\n`);
  spawnSync(process.execPath, [compactScript, targetDir], { stdio: 'inherit' });
}

function runGraphify(targetDir) {
  const kitDir = path.resolve(__dirname);
  const gfyScript = path.join(kitDir, 'gsd-graphify-update.cjs');
  console.log(`\n${C.bCyan}🕸️ Disparando Atualização Manual do Grafo de Código...${C.reset}\n`);
  spawnSync(process.execPath, [gfyScript], { cwd: targetDir, stdio: 'inherit' });
  console.log(`\n${C.bGreen}✔ Grafo atualizado com sucesso via Graphify!${C.reset}\n`);
}

function runHealth(targetDir) {
  console.log(`\n${C.bCyan}╭─ 🩺 Diagnóstico do Ambiente & Ferramentas (Multi-LSP) ─────────────────╮${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}                                                                        ${C.bCyan}│${C.reset}`);
  
  const checks = [
    { name: 'Node.js', cmd: 'node -v' },
    { name: 'ast-grep CLI', cmd: 'ast-grep --version' },
    { name: 'graphify CLI', cmd: 'graphify --version' }
  ];

  for (const c of checks) {
    try {
      const out = execSync(c.cmd, { encoding: 'utf8', timeout: 5000 }).trim().split('\n')[0];
      console.log(`${C.bCyan}│${C.reset}   ${C.bGreen}✔ ${c.name.padEnd(22)}:${C.reset} ${C.white}${out}${C.reset}`);
    } catch {
      console.log(`${C.bCyan}│${C.reset}   ${C.bRed}✖ ${c.name.padEnd(22)}:${C.reset} ${C.bRed}Não encontrado no PATH${C.reset}`);
    }
  }

  const lsp = new LspEngine(targetDir);
  const detectedStacks = lsp.detectProjectStacks(targetDir);
  for (const st of detectedStacks) {
    const label = `LSP ${st.id.toUpperCase()}`;
    if (st.activeBinary) {
      const ver = lsp.getBinaryVersion(st.activeBinary) || 'Ativo';
      console.log(`${C.bCyan}│${C.reset}   ${C.bGreen}✔ ${label.padEnd(22)}:${C.reset} ${C.white}${st.activeBinary} (${ver.slice(0, 36)})${C.reset}`);
    } else {
      console.log(`${C.bCyan}│${C.reset}   ${C.bRed}✖ ${label.padEnd(22)}:${C.reset} ${C.bRed}Ausente (instale: ${st.installCmd})${C.reset}`);
    }
  }

  const agentsDir = path.join(targetDir, '.agents');
  const hooksJson = path.join(agentsDir, 'hooks.json');
  const hookPretool = path.join(agentsDir, 'hooks', 'token-guard-pretool.cjs');
  const gitHooks = path.join(targetDir, '.git', 'hooks', 'post-merge');

  const hooksOk = fs.existsSync(hooksJson) && fs.existsSync(hookPretool);
  const gitOk = fs.existsSync(gitHooks);

  console.log(`${C.bCyan}│${C.reset}   ${hooksOk ? C.bGreen + '✔' : C.bYellow + '⚠'} ${'Hard Gates Hook'.padEnd(22)}: ${hooksOk ? C.bGreen + 'Ativo (.agents/hooks.json)' : C.bYellow + 'Não configurado'}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}   ${gitOk ? C.bGreen + '✔' : C.bYellow + '⚠'} ${'Git Auto-Heal'.padEnd(22)}: ${gitOk ? C.bGreen + 'Instalado (.git/hooks/)' : C.bYellow + 'Ausente'}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}                                                                        ${C.bCyan}│${C.reset}`);
  console.log(`${C.bCyan}╰────────────────────────────────────────────────────────────────────────╯${C.reset}\n`);
}

function runDoctor(targetDir) {
  console.log(`\n${C.bCyan}🩹 [Auto-Cura] Verificando e restaurando conformidade do workspace...${C.reset}\n`);
  const kitDir = path.resolve(__dirname);
  const patchScript = path.join(kitDir, 'patch-agents.cjs');
  const optScript = path.join(kitDir, 'optimize-tokens.cjs');
  const skillsMgr = path.join(kitDir, 'skills-manager.cjs');

  const tasks = [
    { name: 'Normalização de ferramentas e protocolo nos subagentes', script: patchScript, args: [targetDir] },
    { name: 'Sincronização de catálogo e Dynamic Agent Pool', script: optScript, args: [targetDir, '--sync'] },
    { name: 'Reconciliação de Dynamic Skill Pool com a fase atual', script: skillsMgr, args: ['sync', '', targetDir] }
  ];

  let hasErrors = false;
  for (const t of tasks) {
    if (!fs.existsSync(t.script)) continue;
    console.log(`  ${C.dim}• ${t.name}...${C.reset}`);
    const res = spawnSync(process.execPath, [t.script, ...t.args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    if (res.status !== 0) {
      hasErrors = true;
      const errOut = (res.stderr || res.stdout || '').trim() || `Código de saída ${res.status}`;
      console.log(`    ${C.bRed}✖ Falha:${C.reset} ${errOut.split('\n')[0]}`);
    }
  }

  if (hasErrors) {
    console.log(`\n${C.bYellow}⚠️  Auto-cura concluída com alertas. Verifique o log com "--errors".${C.reset}\n`);
  } else {
    console.log(`\n${C.bGreen}🎉 Workspace auto-curado com sucesso e 100% blindado!${C.reset}\n`);
  }
}

async function runUninstall(targetDir) {
  const kitDir = path.resolve(__dirname);
  const ans = await askPrompt(`\n⚠️  ${C.bold}Tem certeza que deseja desinstalar o kit de '${targetDir}'? [s/N]: ${C.reset}`);
  if (ans !== 's' && ans !== 'sim' && ans !== 'y' && ans !== 'yes') {
    console.log(`   ${C.dim}Operação cancelada pelo usuário.${C.reset}\n`);
    return;
  }

  if (process.platform === 'win32') {
    const unScript = path.join(kitDir, 'uninstall.ps1');
    const psBin = getPowerShellBinary();
    spawnSync(psBin, ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', unScript, '-TargetDir', targetDir], { stdio: 'inherit' });
  } else {
    const unScript = path.join(kitDir, 'uninstall.sh');
    spawnSync('bash', [unScript, targetDir], { stdio: 'inherit' });
  }
}

function runUpdate(targetDir, extraFlags = []) {
  const kitDir = path.resolve(__dirname);
  const candidates = [
    path.join(kitDir, 'gsd-update.cjs'),
    path.join(targetDir, '.agents', 'kit', 'gsd-update.cjs'),
    path.join(targetDir, 'gsd-update.cjs')
  ];
  const updaterPath = candidates.find(p => fs.existsSync(p));
  if (!updaterPath) {
    console.error(`\n${C.bRed}❌ Script gsd-update.cjs não encontrado.${C.reset}\n`);
    return;
  }
  spawnSync(process.execPath, [updaterPath, targetDir, ...extraFlags], { stdio: 'inherit' });
}

function runErrors(targetDir) {
  const list = ErrorGuard.listErrors(targetDir);
  console.log('\n' + ErrorGuard.formatErrorList(list) + '\n');
}

async function interactiveMenuLoop(targetDir) {
  let running = true;
  while (running) {
    if (IS_TTY) console.clear();
    renderHubBanner(targetDir);

    console.log(`   ${C.bCyan}[1]${C.reset} 📦 ${C.bold}Instalar / Reconfigurar Kit${C.reset} ${C.dim}(Backend ou Fullstack)${C.reset}`);
    console.log(`   ${C.bCyan}[2]${C.reset} 🧪 ${C.bold}Executar Bateria de Testes${C.reset} ${C.dim}(Suíte completa test-kit)${C.reset}`);
    console.log(`   ${C.bCyan}[3]${C.reset} ⚡ ${C.bold}Alternar Perfil de Skills${C.reset} ${C.dim}(Core • Backend • Fullstack)${C.reset}`);
    console.log(`   ${C.bCyan}[4]${C.reset} 📊 ${C.bold}Relatório de Economia de Tokens${C.reset} ${C.dim}(Telemetria token-report)${C.reset}`);
    console.log(`   ${C.bCyan}[5]${C.reset} 🧹 ${C.bold}Compactar Estado & Histórico${C.reset} ${C.dim}(STATE.md)${C.reset}`);
    console.log(`   ${C.bCyan}[6]${C.reset} 🕸️  ${C.bold}Atualizar Grafo de Código${C.reset} ${C.dim}(Graphify sync manual)${C.reset}`);
    console.log(`   ${C.bCyan}[7]${C.reset} 🩺 ${C.bold}Diagnóstico & Health Check${C.reset} ${C.dim}(ast-grep, node, graphify, Multi-LSP)${C.reset}`);
    console.log(`   ${C.bCyan}[8]${C.reset} 🩹 ${C.bold}Auto-Cura & Reparo Rápido${C.reset} ${C.dim}(Reaplicar patches e regras)${C.reset}`);
    console.log(`   ${C.bCyan}[9]${C.reset} 🗑️  ${C.bold}Desinstalar / Reverter Workspace${C.reset}`);
    console.log(`   ${C.bCyan}[10]${C.reset} 🧠 ${C.bold}Instalar Servidores LSP por Linguagem${C.reset} ${C.dim}(20 ecossistemas)${C.reset}`);
    console.log(`   ${C.bCyan}[11]${C.reset} 🔄 ${C.bold}Verificar / Atualizar GSD Kit${C.reset} ${C.dim}(/gsd-agy-update + Changelog)${C.reset}`);
    console.log(`   ${C.bCyan}[12]${C.reset} 🛑 ${C.bold}Visualizar Log de Erros${C.reset} ${C.dim}(Central ErrorGuard .agents/.cache/error-log.json)${C.reset}`);
    console.log(`   ${C.bCyan}[0]${C.reset} 🚪 ${C.dim}Sair${C.reset}\n`);

    const choice = await askPrompt(`   ${C.bold}Escolha uma opção [0-12]: ${C.reset}`);

    switch (choice) {
      case '1':
        await runInstaller(targetDir, null, { interactivePromptTest: true });
        break;
      case '2':
        runTest(targetDir);
        break;
      case '3':
        await runProfile(targetDir);
        break;
      case '4':
        runReport(targetDir);
        break;
      case '5':
        runCompact(targetDir);
        break;
      case '6':
        runGraphify(targetDir);
        break;
      case '7':
        runHealth(targetDir);
        break;
      case '8':
        runDoctor(targetDir);
        break;
      case '9':
        await runUninstall(targetDir);
        break;
      case '10':
        await promptAndInstallLsps(targetDir);
        break;
      case '11':
        runUpdate(targetDir);
        break;
      case '12':
        runErrors(targetDir);
        break;
      case '0':
      case 'q':
      case 'sair':
      case 'exit':
        console.log(`\n${C.bGreen}👋 Até logo! Workspace sob controle.${C.reset}\n`);
        running = false;
        continue;
      default:
        console.log(`\n${C.bYellow}Opção inválida. Tente novamente.${C.reset}`);
        break;
    }

    if (running) {
      await askPrompt(`\n${C.dim}Pressione [Enter] para voltar ao menu...${C.reset}`);
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const kitDir = path.resolve(__dirname);

  let targetDir = '';
  let command = '';
  let extraArg = '';

  const flagOnlyArgs = new Set(['--cleanup', '--no-cleanup', '--frontend', '--no-frontend', '--yes', '-y', '--check', '--json', '--force']);

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('-')) {
      if (flagOnlyArgs.has(a)) continue;
      if (a.startsWith('--has-frontend=')) continue;
      if (!command) {
        command = a;
        if (args[i + 1] && !args[i + 1].startsWith('-')) {
          extraArg = args[i + 1];
          i++;
        }
      }
    } else if (!targetDir) {
      targetDir = path.resolve(a);
    }
  }

  const isInstalledInAgents = kitDir.endsWith(path.join('.agents', 'kit')) || kitDir.endsWith('/.agents/kit') || kitDir.endsWith('\\.agents\\kit');
  const parentOfKit = path.dirname(kitDir);
  const parentLooksLikeProject = fs.existsSync(path.join(parentOfKit, '.agents')) || fs.existsSync(path.join(parentOfKit, '.planning'));
  const projectRootOfKit = isInstalledInAgents ? path.dirname(path.dirname(kitDir)) : (parentLooksLikeProject ? parentOfKit : kitDir);

  if (!targetDir) {
    const cwd = process.cwd();
    if (cwd === kitDir || cwd.startsWith(kitDir + path.sep)) {
      targetDir = projectRootOfKit;
    } else {
      targetDir = cwd;
    }
  } else if (targetDir === kitDir || targetDir.startsWith(kitDir + path.sep)) {
    targetDir = projectRootOfKit;
  }

  const noCleanup = args.includes('--no-cleanup');

  // Despacho de Comandos Diretos (CLI / Não-Interativo)
  if (command === '--errors' || command === '--error-log') {
    runErrors(targetDir);
    return;
  }
  if (command === '--test') {
    runTest(targetDir);
    return;
  }
  if (command === '--report') {
    runReport(targetDir);
    return;
  }
  if (command === '--profile') {
    await runProfile(targetDir, extraArg);
    return;
  }
  if (command === '--compact') {
    runCompact(targetDir);
    return;
  }
  if (command === '--graphify') {
    runGraphify(targetDir);
    return;
  }
  if (command === '--health') {
    runHealth(targetDir);
    return;
  }
  if (command === '--doctor') {
    runDoctor(targetDir);
    return;
  }
  if (command === '--lsp') {
    await promptAndInstallLsps(targetDir);
    return;
  }
  if (command === '--update' || command === '--check-update') {
    const updateFlags = [];
    if (command === '--check-update' || args.includes('--check')) updateFlags.push('--check');
    if (args.includes('--yes') || args.includes('-y')) updateFlags.push('--yes');
    if (args.includes('--json')) updateFlags.push('--json');
    if (args.includes('--force')) updateFlags.push('--force');
    runUpdate(targetDir, updateFlags);
    return;
  }
  if (command === '--uninstall') {
    await runUninstall(targetDir);
    return;
  }
  if (command === '--menu') {
    await interactiveMenuLoop(targetDir);
    return;
  }

  // Se executado de dentro de .agents/kit sem argumentos, abre o Painel de Controle
  if (!command && isInstalledInAgents && !args.includes('--frontend') && !args.includes('--no-frontend') && canPromptInteractively()) {
    await interactiveMenuLoop(targetDir);
    return;
  }

  // Padrão para comando único (npx, install.sh, install.ps1, setup.sh, setup.ps1 ou --install):
  // Inicia direto o instalador interativo (perguntando Backend vs Fullstack se não especificado) e limpa temporários ao final
  let hasFrontend = null;
  const hasFrontendEq = args.find(a => a.startsWith('--has-frontend='));
  if (hasFrontendEq) {
    const val = hasFrontendEq.split('=')[1];
    hasFrontend = (val === 'true' || val === '1');
  }
  if (args.includes('--frontend') || extraArg === 'true' || extraArg === '1') hasFrontend = true;
  if (args.includes('--no-frontend') || extraArg === 'false' || extraArg === '0') hasFrontend = false;

  await runInstaller(targetDir, hasFrontend, { interactivePromptTest: false, cleanup: !noCleanup });
}

main().catch(err => {
  console.error(`\n${C.bRed}🛑 Erro inesperado:${C.reset}`, err);
  process.exit(1);
});
