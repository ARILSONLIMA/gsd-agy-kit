'use strict';

/**
 * Token Optimization Engine for Antigravity + GSD
 * 
 * Reduções Cirúrgicas:
 * 1. Arquivar os 29 subagentes .compact.md duplicados em .agents/agents-backup-compact/
 * 2. Enxugar o despejo duplicado de tabelas de STACK.md de dentro de GEMINI.md
 * 3. Desduplicar .agents/GEMINI.md (deixar referência leve sem repetir regras)
 * 4. Relatório comparativo com medição real de bytes e estimativa de tokens poupados.
 */

const fs = require('fs');
const path = require('path');

const PHASE_PROFILES = {
  zero: [],
  core: [
    'gsd-planner',
    'gsd-executor',
    'gsd-debugger',
    'gsd-verifier',
    'gsd-code-reviewer'
  ],
  planning: [
    'gsd-planner',
    'gsd-phase-researcher',
    'gsd-pattern-mapper',
    'gsd-assumptions-analyzer',
    'gsd-plan-checker',
    'gsd-roadmapper',
    'cavecrew-investigator'
  ],
  execution: [
    'gsd-executor',
    'gsd-debugger',
    'gsd-debug-session-manager',
    'gsd-code-reviewer',
    'gsd-code-fixer',
    'cavecrew-builder',
    'cavecrew-reviewer'
  ],
  verification: [
    'gsd-verifier',
    'gsd-integration-checker',
    'gsd-doc-writer',
    'gsd-mempalace-curator',
    'cavecrew-reviewer'
  ],
  research: [
    'gsd-phase-researcher',
    'gsd-project-researcher',
    'gsd-research-synthesizer',
    'gsd-advisor-researcher',
    'gsd-assumptions-analyzer',
    'cavecrew-investigator'
  ]
};

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

function getActiveJitAgents(targetDir) {
  const jitFile = path.join(targetDir, '.agents', '.cache', 'jit-promotions.json');
  const jitLegacy = path.join(targetDir, '.agents', '.jit-promotions.json');
  const file = fs.existsSync(jitFile) ? jitFile : (fs.existsSync(jitLegacy) ? jitLegacy : null);
  const set = new Set();
  if (!file) return set;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data && data.agents && typeof data.agents === 'object') {
      for (const [agentFile, meta] of Object.entries(data.agents)) {
        if (meta && meta.turnsRemaining > 0) {
          set.add(agentFile.endsWith('.md') ? agentFile : `${agentFile}.md`);
        }
      }
    }
  } catch {}
  return set;
}

function syncDynamicAgentPool(targetDir = process.cwd(), requestedProfile = 'zero') {
  const agentsDir = path.join(targetDir, '.agents', 'agents');
  const poolDir = path.join(targetDir, '.agents', 'agents-pool');
  const onDemandDir = path.join(targetDir, '.agents', 'agents-on-demand');

  if (!fs.existsSync(agentsDir)) return { activeCount: 0, poolCount: 0, profile: 'none' };
  if (!fs.existsSync(poolDir)) fs.mkdirSync(poolDir, { recursive: true });

  const isAgentFile = f => f.endsWith('.md') && !f.endsWith('.compact.md') && f.toLowerCase() !== 'readme.md';

  // 1. Garantir que todo agente existente esteja a salvo no pool permanente
  const kitSubagents = path.resolve(__dirname, 'subagents');
  if (fs.existsSync(kitSubagents)) {
    try {
      for (const sa of fs.readdirSync(kitSubagents).filter(isAgentFile)) {
        const dest = path.join(poolDir, sa);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(path.join(kitSubagents, sa), dest);
        }
      }
    } catch {}
  }

  const existingActive = fs.readdirSync(agentsDir).filter(isAgentFile).sort();
  for (const f of existingActive) {
    const src = path.join(agentsDir, f);
    const dest = path.join(poolDir, f);
    if (!fs.existsSync(dest) || fs.statSync(src).mtimeMs > fs.statSync(dest).mtimeMs) {
      fs.copyFileSync(src, dest);
    }
  }

  if (fs.existsSync(onDemandDir)) {
    const onDemandFiles = fs.readdirSync(onDemandDir).filter(isAgentFile).sort();
    for (const f of onDemandFiles) {
      const src = path.join(onDemandDir, f);
      const dest = path.join(poolDir, f);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }
  }

  const allPoolFiles = fs.readdirSync(poolDir).filter(isAgentFile).sort();

  // 2. Determinar o perfil ativo (Padrão: Zero-Baseline com Ativação JIT Proporcional)
  let activeProfile = (requestedProfile || 'zero').toLowerCase();
  if (activeProfile === 'auto') {
    activeProfile = 'zero';
  }

  let targetAgentFiles = [];
  if (activeProfile === 'all') {
    targetAgentFiles = allPoolFiles;
  } else if (activeProfile === 'zero' || activeProfile === 'none') {
    const jitSet = getActiveJitAgents(targetDir);
    targetAgentFiles = Array.from(jitSet).sort();
  } else {
    const agentNames = PHASE_PROFILES[activeProfile] || PHASE_PROFILES.core;
    const jitSet = getActiveJitAgents(targetDir);
    const merged = new Set([
      ...agentNames.map(n => n.endsWith('.md') ? n : `${n}.md`),
      ...jitSet
    ]);
    targetAgentFiles = Array.from(merged).sort();
  }

  // 3. Promover agentes do perfil alvo para .agents/agents/
  for (const agentFile of targetAgentFiles) {
    const src = path.join(poolDir, agentFile);
    const dest = path.join(agentsDir, agentFile);
    if (fs.existsSync(src) && !fs.existsSync(dest)) {
      fs.copyFileSync(src, dest);
    }
  }

  // 4. Remover do diretório ativo qualquer agente que não seja do perfil atual (já salvo no pool)
  const currentActive = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md') && !f.endsWith('.compact.md')).sort();
  let prunedCount = 0;
  for (const activeFile of currentActive) {
    if (!targetAgentFiles.includes(activeFile)) {
      const inPool = path.join(poolDir, activeFile);
      if (fs.existsSync(inPool)) {
        fs.unlinkSync(path.join(agentsDir, activeFile));
        prunedCount++;
      }
    }
  }

  const finalActive = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).sort();
  return {
    profile: activeProfile,
    activeCount: finalActive.length,
    poolCount: allPoolFiles.length,
    prunedCount
  };
}

function runOptimization(targetDir = process.cwd(), requestedProfile = 'zero') {
  console.log('\n⚡ [Antigravity GSD Kit] Iniciando otimização agressiva de tokens...');
  let totalBytesSaved = 0;

  // 1. Arquivar subagentes .compact.md
  const agentsDir = path.join(targetDir, '.agents', 'agents');
  const compactArchiveDir = path.join(targetDir, '.agents', 'agents-backup-compact');

  let compactsMoved = 0;
  if (fs.existsSync(agentsDir)) {
    if (!fs.existsSync(compactArchiveDir)) {
      fs.mkdirSync(compactArchiveDir, { recursive: true });
    }

    const files = fs.readdirSync(agentsDir).filter(f => f.endsWith('.compact.md'));
    for (const file of files) {
      const src = path.join(agentsDir, file);
      const dest = path.join(compactArchiveDir, file);
      const size = fs.statSync(src).size;
      fs.renameSync(src, dest);
      totalBytesSaved += size;
      compactsMoved++;
    }
    console.log(`   ✅ Arquivadas ${compactsMoved} duplicatas .compact.md.`);
  }

  // 2. Dynamic Agent Pool & Sincronização Inteligente por Fase
  const poolResult = syncDynamicAgentPool(targetDir, requestedProfile);
  console.log(`   ✅ Dynamic Pool ativo: ${poolResult.activeCount} agentes no prompt (perfil: ${poolResult.profile}), ${poolResult.poolCount} no pool.`);

  // 2.1 Sincronizar Dynamic Skill Pool em conjunto
  try {
    const skillsMgr = require('./skills-manager.cjs');
    const skillRes = skillsMgr.syncSkills(targetDir, (requestedProfile === 'auto' || requestedProfile === 'zero') ? 'zero' : requestedProfile);
    console.log(`   ✅ Dynamic Skill Pool ativo: ${skillRes.activeCount} skills no prompt (perfil: ${skillRes.phase.toUpperCase()}).`);
  } catch {}

  const normalizedTarget = path.resolve(targetDir).replace(/\\/g, '/');

  // 3. Enxugar GEMINI.md (remover dump duplicado de STACK.md)
  const rootGemini = path.join(targetDir, 'GEMINI.md');
  if (fs.existsSync(rootGemini)) {
    const original = fs.readFileSync(rootGemini, 'utf8');
    const origSize = Buffer.byteLength(original, 'utf8');

    // Substitui o bloco <!-- GSD:stack-start source:research/STACK.md --> ... <!-- GSD:stack-end -->
    // por uma referência concisa apontando para o arquivo no disco
    const stackPattern = /<!-- GSD:stack-start source:research\/STACK\.md -->[\s\S]*?<!-- GSD:stack-end -->/;
    if (stackPattern.test(original)) {
      const matchBlock = original.match(stackPattern)[0];
      if (Buffer.byteLength(matchBlock, 'utf8') > 600) {
        let stackSummaryLines = [];
        const stackFilePath = path.join(targetDir, 'research', 'STACK.md');
        if (fs.existsSync(stackFilePath)) {
          try {
            const stackMdContent = fs.readFileSync(stackFilePath, 'utf8');
            const bullets = stackMdContent.split(/\r?\n/).filter(l => l.trim().startsWith('- '));
            if (bullets.length > 0) {
              stackSummaryLines = bullets.slice(0, 3);
            }
          } catch {}
        }

        if (stackSummaryLines.length === 0) {
          const origBullets = matchBlock.split(/\r?\n/).filter(l => l.trim().startsWith('- '));
          if (origBullets.length > 0) {
            stackSummaryLines = origBullets.slice(0, 3);
          } else {
            stackSummaryLines = ['- Stack e dependências mapeadas no documento de arquitetura.'];
          }
        }

        const conciseStack = [
          '<!-- GSD:stack-start source:research/STACK.md -->',
          '## Technology Stack',
          `> Stack documentada em detalhes em [STACK.md](file:///${normalizedTarget}/research/STACK.md).`,
          ...stackSummaryLines,
          '<!-- GSD:stack-end -->'
        ].join('\n');

        const trimmed = original.replace(stackPattern, conciseStack);
        fs.writeFileSync(rootGemini, trimmed, 'utf8');
        const newSize = Buffer.byteLength(trimmed, 'utf8');
        const saved = origSize - newSize;
        if (saved > 0) {
          totalBytesSaved += saved;
          console.log(`   ✅ GEMINI.md enxugado: tabelas de STACK.md substituídas por referência direta (-${saved} bytes).`);
        }
      }
    }
  }

  // 4. Desduplicar .agents/GEMINI.md
  const agentsGemini = path.join(targetDir, '.agents', 'GEMINI.md');
  if (fs.existsSync(agentsGemini)) {
    const origAgentsSize = fs.statSync(agentsGemini).size;
    const bridgeContent = [
      '# Regras do Projeto (Referência Canônica)',
      `> Diretivas canônicas centralizadas em [GEMINI.md](file:///${normalizedTarget}/GEMINI.md) e [token-protocol.md](file:///${normalizedTarget}/.agents/rules/token-protocol.md).`,
      'Consulte a raiz para evitar duplicação de contexto.'
    ].join('\n') + '\n';

    fs.writeFileSync(agentsGemini, bridgeContent, 'utf8');
    const newAgentsSize = Buffer.byteLength(bridgeContent, 'utf8');
    const savedAgents = origAgentsSize - newAgentsSize;
    totalBytesSaved += savedAgents;
    console.log(`   ✅ .agents/GEMINI.md desduplicado (-${savedAgents} bytes poupados de repetição).`);
  }

  // 5. Desduplicar regras em .agents/rules/ se já presentes em GEMINI.md
  const rulesDir = path.join(targetDir, '.agents', 'rules');
  if (fs.existsSync(rootGemini) && fs.existsSync(rulesDir)) {
    const rootContent = fs.readFileSync(rootGemini, 'utf8');
    const hasRulesInRoot = rootContent.includes('Idioma Obrigatório') && rootContent.includes('Protocolo Obrigatório');

    if (hasRulesInRoot) {
      const idiomaRule = path.join(rulesDir, 'idioma.md');
      if (fs.existsSync(idiomaRule)) {
        const sz = fs.statSync(idiomaRule).size;
        const bridgeIdioma = [
          '---',
          'trigger: model_decision',
          'description: Regras de idioma e comunicacao (veja GEMINI.md)',
          '---',
          `> Regras de idioma ativas canonicamente em [GEMINI.md](file:///${normalizedTarget}/GEMINI.md).`
        ].join('\n') + '\n';
        fs.writeFileSync(idiomaRule, bridgeIdioma, 'utf8');
        totalBytesSaved += Math.max(0, sz - Buffer.byteLength(bridgeIdioma, 'utf8'));
      }

      const tokenRule = path.join(rulesDir, 'token-protocol.md');
      if (fs.existsSync(tokenRule)) {
        const sz = fs.statSync(tokenRule).size;
        const bridgeToken = [
          '---',
          'trigger: model_decision',
          'description: Protocolo de economia de tokens (veja GEMINI.md)',
          '---',
          `> Protocolo de economia de tokens ativo canonicamente em [GEMINI.md](file:///${normalizedTarget}/GEMINI.md).`
        ].join('\n') + '\n';
        fs.writeFileSync(tokenRule, bridgeToken, 'utf8');
        totalBytesSaved += Math.max(0, sz - Buffer.byteLength(bridgeToken, 'utf8'));
      }
      console.log(`   ✅ Regras redundantes em .agents/rules/ otimizadas com Progressive Disclosure.`);
    }
  }

  // Estimativa de tokens (média de 3.8 bytes por token em código/markdown misto)
  const estimatedTokensSaved = Math.round(totalBytesSaved / 3.8);

  console.log('\n📊 [Relatório de Otimização]');
  console.log(`   - Total de bytes brutos eliminados do contexto inicial: ${totalBytesSaved.toLocaleString()} bytes`);
  console.log(`   - Economia estimada por prompt: ~${estimatedTokensSaved.toLocaleString()} tokens`);
  console.log(`   - Subagentes ativos no prompt: ${poolResult.activeCount} (perfil: ${poolResult.profile}) de ${poolResult.poolCount} preservados no pool`);
  console.log('   - Redução drástica de consumo de tokens em TODOS os turnos da sessão!\n');

  return { totalBytesSaved, estimatedTokensSaved, compactsMoved, poolResult };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  let target = process.cwd();
  let profile = 'zero';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--profile' && args[i + 1]) {
      profile = args[i + 1];
      i++;
    } else if (args[i] === '--sync') {
      profile = 'zero';
    } else if (!args[i].startsWith('-')) {
      target = args[i];
    }
  }

  runOptimization(target, profile);
}

module.exports = { runOptimization, syncDynamicAgentPool, detectPhaseFromState, PHASE_PROFILES };
