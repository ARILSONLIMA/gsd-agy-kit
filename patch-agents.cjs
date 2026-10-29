'use strict';

/**
 * GSD Agent Patch & Normalizer for Antigravity CLI
 * 
 * Objectives:
 * 1. Normalize YAML frontmatter tools:
 *    - Remove incompatible tools ('glob', 'grep_search', 'call_mcp_tool')
 *    - Rename 'write_file' -> 'write_to_file'
 *    - Ensure core Antigravity subagent tools: 'view_file', 'write_to_file', 'replace_file_content', 'run_command'
 * 2. Inject token efficiency protocol directly into subagent system instructions.
 */

const fs = require('fs');
const path = require('path');

const PROTOCOL_MARKER_START = '<!-- ANTIGRAVITY_TOKEN_PROTOCOL_START -->';
const PROTOCOL_MARKER_END = '<!-- ANTIGRAVITY_TOKEN_PROTOCOL_END -->';

function detectStack(targetDir) {
  const commonSubdirs = ['frontend', 'backend', 'web', 'ui', 'api', 'server', 'client', 'app', 'services'];
  const hasFile = (fileName) => {
    if (fs.existsSync(path.join(targetDir, fileName))) return true;
    for (const sub of commonSubdirs) {
      if (fs.existsSync(path.join(targetDir, sub, fileName))) return true;
    }
    return false;
  };

  const hasGo = hasFile('go.mod');
  const hasTs = hasFile('tsconfig.json') || hasFile('package.json');
  const hasPy = hasFile('pyproject.toml') || hasFile('requirements.txt') || hasFile('setup.py');
  const hasRust = hasFile('Cargo.toml');
  const hasPhp = hasFile('composer.json');
  const hasCpp = hasFile('CMakeLists.txt') || hasFile('compile_commands.json') || hasFile('Makefile');
  const hasJava = hasFile('pom.xml') || hasFile('build.gradle') || hasFile('build.gradle.kts');
  const hasRuby = hasFile('Gemfile');
  const hasDart = hasFile('pubspec.yaml');
  const hasElixir = hasFile('mix.exs');

  const lspCliHint = 'node .agents/mcp-server.cjs lsp <diagnostics|definition|references|hover|rename>';
  const detected = [];
  if (hasGo) detected.push({ name: 'Go', lsp: `gopls / ${lspCliHint}`, lang: 'go', testCmd: 'go test -v' });
  if (hasTs) detected.push({ name: 'TypeScript/JavaScript', lsp: `TS/JS LSP (${lspCliHint})`, lang: 'ts', testCmd: 'npm test -- --verbose' });
  if (hasPy) detected.push({ name: 'Python', lsp: `Pyright/Python LSP (${lspCliHint})`, lang: 'py', testCmd: 'pytest -vv' });
  if (hasRust) detected.push({ name: 'Rust', lsp: `rust-analyzer/cargo (${lspCliHint})`, lang: 'rust', testCmd: 'cargo test -- --nocapture' });
  if (hasPhp) detected.push({ name: 'PHP', lsp: `intelephense/PHP LSP (${lspCliHint})`, lang: 'php', testCmd: 'phpunit --verbose' });
  if (hasCpp) detected.push({ name: 'C/C++', lsp: `clangd/C++ LSP (${lspCliHint})`, lang: 'cpp', testCmd: 'ctest -V' });
  if (hasJava) detected.push({ name: 'Java', lsp: `jdtls/javac (${lspCliHint})`, lang: 'java', testCmd: 'mvn test -X' });
  if (hasRuby) detected.push({ name: 'Ruby', lsp: `solargraph/Ruby LSP (${lspCliHint})`, lang: 'rb', testCmd: 'rspec --format documentation' });
  if (hasDart) detected.push({ name: 'Dart', lsp: `dart analyze/LSP (${lspCliHint})`, lang: 'dart', testCmd: 'dart test -r expanded' });
  if (hasElixir) detected.push({ name: 'Elixir', lsp: `elixir-ls (${lspCliHint})`, lang: 'elixir', testCmd: 'mix test --trace' });

  if (detected.length === 0) {
    return { name: 'Geral', lsp: `Multi-LSP Híbrido (${lspCliHint})`, lang: 'generic', testCmd: 'test verboso' };
  }
  if (detected.length === 1) {
    return detected[0];
  }

  // Multi-Stack / Monorepo
  return {
    name: detected.map(d => d.name).join(' + '),
    lsp: `Multi-LSP Híbrido (${lspCliHint})`,
    lang: detected.map(d => d.lang).join(','),
    testCmd: detected.map(d => d.testCmd).join(' e ')
  };
}

const IGNORED_SCAN_DIRS = new Set([
  'node_modules', '.git', 'vendor', 'dist', 'build', 'target', '.venv', 'venv',
  '.agents', '.gemini', '.planning', 'graphify-out', 'coverage', '.cache'
]);

const maturityCache = new Map();

function detectProjectMaturity(targetDir) {
  const normKey = path.resolve(targetDir || process.cwd());
  if (maturityCache.has(normKey)) return maturityCache.get(normKey);

  let codeCount = 0;
  const codeExts = new Set(['.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.java', '.cs', '.php', '.rb', '.dart', '.ex', '.cpp', '.c']);
  const scanDirs = ['src', 'lib', 'app', 'cmd', 'server', 'client', 'api', 'pkg', 'services'];

  for (const sub of scanDirs) {
    const subPath = path.join(normKey, sub);
    if (!fs.existsSync(subPath)) continue;
    try {
      const items = fs.readdirSync(subPath, { withFileTypes: true });
      for (const item of items) {
        if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase();
          if (codeExts.has(ext)) {
            codeCount++;
            if (codeCount > 3) break;
          }
        }
      }
    } catch {}
    if (codeCount > 3) break;
  }

  if (codeCount <= 3) {
    try {
      const topEntries = fs.readdirSync(normKey, { withFileTypes: true });
      for (const e of topEntries) {
        if (e.isFile()) {
          const ext = path.extname(e.name).toLowerCase();
          if (codeExts.has(ext)) {
            codeCount++;
            if (codeCount > 3) break;
          }
        }
      }
    } catch {}
  }

  const result = codeCount <= 2 ? 'greenfield' : 'brownfield';
  maturityCache.set(normKey, result);
  return result;
}

function buildProtocolBlock(targetDir) {
  const stack = detectStack(targetDir);
  const maturity = detectProjectMaturity(targetDir);
  const astLang = stack.lang !== 'generic' 
    ? (stack.lang.includes(',') ? ' --lang <go|ts|py>' : ` --lang ${stack.lang}`) 
    : '';

  if (maturity === 'greenfield') {
    return [
      PROTOCOL_MARKER_START,
      '<token_efficiency_protocol priority="critical" mode="greenfield">',
      `## PROTOCOLO OBRIGATÓRIO: GREENFIELD FAST-TRACK (PONYTAIL + CAVEMAN - ${stack.name.toUpperCase()})`,
      '1. ESCADA DE DECISÃO (PONYTAIL): Crie apenas o código estritamente necessário (YAGNI). Reutilize stdlib e dependências existentes. Proibido abstrações prematuras ou novas dependências sem necessidade absoluta.',
      '2. VOZ CONCISA (CAVEMAN): Resposta direta primeiro ([alvo] [ação] [motivo]). Zero cerimônia, saudações ou encerramentos ocos. Payload de código, caminhos e comandos 100% literais. Conclua toda resposta técnica informando o que foi omitido e riscos conhecidos.',
      '3. ESCRITA ATÔMICA & CIRÚRGICA: Novos arquivos via write_to_file atômico. Edições em arquivos existentes estritamente via replace_file_content cirúrgico.',
      '4. VALIDAÇÃO PÓS-EDIÇÃO: Imediatamente após editar ou criar código, valide sintaxe com node .agents/mcp-server.cjs lsp diagnostics ou o verificador rápido da linguagem.',
      '5. INSPEÇÃO CIRÚRGICA: read_file/view_file sempre com StartLine e EndLine cirúrgicos (máximo de 100 linhas).',
      '6. TESTES CONCENTRADOS: Execute apenas a suíte do módulo em desenvolvimento (sem flags verbosas -v).',
      '7. MEMPALACE: Registre decisões arquiteturais chave com node .agents/mcp-server.cjs capture decisions "<tópico>" "<decisão>".',
      '8. ATALHOS DELIBERADOS: Registre atalhos de escopo no código exatamente como: // shortcut: <limite>, <quando refatorar>.',
      '',
      'REGRAS RÍGIDAS DE SEGURANÇA E CONTEXTO:',
      '- PROIBIDO: Ler arquivos em .agents/agents-pool/ com read_file/view_file ou usar define_subagent (invoque subagentes diretamente com invoke_subagent(TypeName="<nome>")).',
      '- PROIBIDO: Executar ondas de múltiplos planos monoliticamente na thread principal (use sempre subagentes isolados para executar planos).',
      '- PROIBIDO: Executar consultas de dependências/pacotes unitárias em loop (use lote único ou check_dependency).',
      '- PROIBIDO: Usar read_file/view_file sem StartLine/EndLine em arquivos de código.',
      '- PROIBIDO: Usar comandos de despejo bruto no terminal (cat, Get-Content, type, head).',
      '- PROIBIDO: Sobrescrever arquivos de código inteiros existentes (use SEMPRE edit_file/replace_file_content cirúrgico).',
      '- PROIBIDO: Usar ast-grep com flags de reescrita em lote (-r, --rewrite).',
      `- PROIBIDO: Executar testes em modo verboso (${stack.testCmd}) em lote.`,
      '- TRANSIÇÃO DE FASE: Ao concluir uma fase completa, notifique o usuário para abrir uma nova conversa para o próximo comando gsd, evitando saturação de contexto.',
      '</token_efficiency_protocol>',
      PROTOCOL_MARKER_END
    ].join('\n');
  }

  return [
    PROTOCOL_MARKER_START,
    '<token_efficiency_protocol priority="critical" mode="brownfield">',
    `## PROTOCOLO OBRIGATÓRIO: PONYTAIL MINIMALISMO + CAVEMAN CONCISÃO (BROWNFIELD - ${stack.name.toUpperCase()})`,
    '1. ESCADA DE DECISÃO (PONYTAIL): Pare no primeiro degrau: (1) Precisa existir? (2) Reutilize código existente via Codebase Map; (3) Stdlib/Plataforma; (4) Dependência já instalada; (5) Uma linha; (6) Menor diff funcional. Atalhos: // shortcut: <limite>, <quando refatorar>.',
    '2. VOZ CONCISA (CAVEMAN): Resposta direta ([alvo] [ação] [motivo]). Zero preâmbulo, saudações ou desculpas. Código, comandos e caminhos byte-exact. Conclua respostas técnicas citando o que foi omitido e riscos conhecidos.',
    '3. TEST-DRIVEN FIRST: Se houver suíte de testes, execute-a primeiro pontualmente para capturar o stack trace e asserção exata da falha.',
    '4. NAVEGAÇÃO JIT (SOB DEMANDA): Use view_skeleton (node .agents/mcp-server.cjs skeleton "<arquivo>") para ver números de linhas e assinaturas antes de ler código.',
    '   - Em arquivos > 50 linhas, use view_skeleton antes de ler o código completo.',
    '   - Invocação direta sem barra (ex: gsd-execute-phase 2): abra diretamente .agents/skills/<skill>/SKILL.md com $ARGUMENTS correspondente.',
    '   - Use graphify query --graph .planning/graphs/graph.json "<pergunta>" apenas se o fluxo envolver múltiplos módulos desconhecidos.',
    `   - Use ${stack.lsp} para validar tipos/assinaturas e diagnósticos pós-edição.`,
    `   - Use ast-grep CLI (ast-grep run -p '<padrão>'${astLang}) para buscas sintáticas na AST.`,
    '   - mempalace_recall e query_docs: convoque sob demanda apenas quando relevante.',
    '5. ESCRITA DE CÓDIGO: Crie arquivos 100% NOVOS via write_file/write_to_file atômico. Edite arquivos EXISTENTES estritamente via edit_file/replace_file_content cirúrgico.',
    '6. VALIDAÇÃO PÓS-EDIÇÃO: Imediatamente após editar qualquer arquivo de código, valide a sintaxe com node .agents/mcp-server.cjs lsp diagnostics <arquivo> ou o validador rápido da linguagem (ex: node -c).',
    '7. GUARDRAILS OBRIGATÓRIOS: Respeite .agents/rules/quality-guardrails.md (Zero N+1 SQL, coerção defensiva HTTP, transações atômicas).',
    '8. INSPEÇÃO CIRÚRGICA: read_file/view_file sempre com StartLine e EndLine restritos (máximo 100 linhas).',
    '',
    'REGRAS RÍGIDAS DE SEGURANÇA E CONTEXTO:',
    '- PROIBIDO: Ler arquivos em .agents/agents-pool/ com read_file/view_file ou usar define_subagent (invoque subagentes diretamente com invoke_subagent(TypeName="<nome>")).',
    '- PROIBIDO: Executar ondas de múltiplos planos monoliticamente na thread principal (use sempre subagentes isolados para executar planos).',
    '- PROIBIDO: Executar consultas de dependências/pacotes unitárias em loop (agrupe checagens em lote único ou use check_dependency).',
    '- PROIBIDO: Encadeamento burocrático de ferramentas na fase de forense/diagnóstico.',
    '- PROIBIDO: Usar read_file/view_file sem StartLine/EndLine em arquivos de código.',
    '- PROIBIDO: Usar comandos de despejo bruto no terminal (cat, Get-Content, type, head).',
    '- PROIBIDO: Sobrescrever arquivos de código existentes com write_file/write_to_file (use SEMPRE edit_file/replace_file_content cirúrgico).',
    '- PROIBIDO: Usar ast-grep com flags de reescrita em lote (-r, --rewrite).',
    `- PROIBIDO: Executar testes em modo verboso (${stack.testCmd}) em lote.`,
    '- TRANSIÇÃO DE FASE: Ao concluir uma fase completa, notifique o usuário para abrir uma nova conversa para o próximo comando gsd, evitando saturação de contexto.',
    '</token_efficiency_protocol>',
    PROTOCOL_MARKER_END
  ].join('\n');
}

function normalizeTools(toolsList, isReadOnly = false) {
  const current = new Set(toolsList.map(t => String(t).trim()));
  
  // Remove non-existent or incompatible Antigravity subagent tools
  current.delete('glob');
  current.delete('grep_search');
  current.delete('call_mcp_tool');
  
  // Rename write_file to write_to_file
  if (current.has('write_file')) {
    current.delete('write_file');
    if (!isReadOnly) current.add('write_to_file');
  }

  // Ensure essentials
  current.add('view_file');
  current.add('run_command');

  if (!isReadOnly) {
    current.add('write_to_file');
    current.add('replace_file_content');
  }

  return Array.from(current);
}

function patchAgentFile(filePath, targetDir, precomputedProtocol = null) {
  const content = fs.readFileSync(filePath, 'utf8');
  
  // Parse frontmatter
  const fmMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fmMatch) return false;

  const rawFm = fmMatch[1];
  let body = content.slice(fmMatch[0].length);

  // Check if agent is read-only (e.g. pure analyzer, checker, pattern mapper)
  const isReadOnly = (/analyzer|checker|mapper/i.test(path.basename(filePath))) ||
                     (/read-only/i.test(filePath) && 
                      !rawFm.includes('write_to_file') && 
                      !rawFm.includes('write_file') &&
                      !rawFm.includes('replace_file_content'));

  // Extract tools
  const toolsMatch = rawFm.match(/tools:\s*([\s\S]*?)(?=\n[a-zA-Z0-9_-]+:|$)/);
  if (!toolsMatch) return false;

  const rawToolsBlock = toolsMatch[1];
  const toolLines = rawToolsBlock
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.startsWith('-'))
    .map(l => l.replace(/^-\s*/, '').trim());

  const updatedTools = normalizeTools(toolLines, isReadOnly);
  const newToolsBlock = 'tools:\n' + updatedTools.map(t => `- ${t}`).join('\n');

  let newFm = rawFm.replace(toolsMatch[0].trim(), newToolsBlock);

  // Inject or update Protocol Block in body
  const protocolBlock = precomputedProtocol || buildProtocolBlock(targetDir || process.cwd());
  if (body.includes(PROTOCOL_MARKER_START)) {
    const startIdx = body.indexOf(PROTOCOL_MARKER_START);
    const endIdx = body.indexOf(PROTOCOL_MARKER_END) + PROTOCOL_MARKER_END.length;
    body = body.slice(0, startIdx) + protocolBlock + body.slice(endIdx);
  } else {
    // Inject right after frontmatter
    body = '\n\n' + protocolBlock + '\n' + body;
  }

  const finalContent = `---\n${newFm.trim()}\n---${body}`;

  if (finalContent !== content) {
    fs.writeFileSync(filePath, finalContent, 'utf8');
    return true;
  }

  return false;
}

function runPatch(targetDir) {
  const agentsDir = path.resolve(targetDir, '.agents', 'agents');
  const poolDir = path.resolve(targetDir, '.agents', 'agents-pool');
  const onDemandDir = path.resolve(targetDir, '.agents', 'agents-on-demand');
  
  if (!fs.existsSync(agentsDir)) {
    console.error(`Diretório de agentes não encontrado: ${agentsDir}`);
    process.exit(1);
  }

  const protocolBlock = buildProtocolBlock(targetDir || process.cwd());

  // Garante que os subagentes cavecrew estejam no pool permanente
  const kitSubagents = path.resolve(__dirname, 'subagents');
  if (fs.existsSync(kitSubagents) && fs.existsSync(poolDir)) {
    try {
      for (const ca of fs.readdirSync(kitSubagents).filter(f => f.endsWith('.md'))) {
        const src = path.join(kitSubagents, ca);
        const dest = path.join(poolDir, ca);
        if (!fs.existsSync(dest)) {
          fs.copyFileSync(src, dest);
        }
      }
    } catch {}
  }

  const dirsToPatch = [agentsDir];
  if (fs.existsSync(poolDir)) dirsToPatch.push(poolDir);
  if (fs.existsSync(onDemandDir)) dirsToPatch.push(onDemandDir);

  let totalFiles = 0;
  let patchedCount = 0;

  for (const dir of dirsToPatch) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.md') && !f.endsWith('.compact.md') && f.toLowerCase() !== 'readme.md');
    totalFiles += files.length;
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        if (patchAgentFile(fullPath, targetDir, protocolBlock)) {
          patchedCount++;
        }
      } catch (err) {
        console.error(`Erro ao processar ${file}: ${err.message}`);
      }
    }
  }

  console.log(`[Antigravity Adapter] Verificados ${totalFiles} agentes (ativos e pool). ${patchedCount} atualizados com sucesso.`);
  return patchedCount;
}

// Allow CLI execution or require
if (require.main === module) {
  const target = process.argv[2] || process.cwd();
  runPatch(target);
}

module.exports = { runPatch, patchAgentFile };
