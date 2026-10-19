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

function detectProjectMaturity(targetDir) {
  let codeCount = 0;
  const codeExts = new Set(['.go', '.ts', '.tsx', '.js', '.jsx', '.py', '.rs', '.java', '.cs', '.php', '.rb', '.dart', '.ex', '.cpp', '.c']);
  const scanDirs = ['src', 'lib', 'app', 'cmd', 'server', 'client', 'api', 'pkg', 'services'];

  for (const sub of scanDirs) {
    const subPath = path.join(targetDir, sub);
    if (fs.existsSync(subPath)) {
      try {
        const files = fs.readdirSync(subPath, { recursive: true });
        for (const f of files) {
          const ext = path.extname(f).toLowerCase();
          if (codeExts.has(ext)) codeCount++;
        }
      } catch {}
    }
  }

  try {
    const topEntries = fs.readdirSync(targetDir, { withFileTypes: true });
    for (const e of topEntries) {
      if (e.isFile()) {
        const ext = path.extname(e.name).toLowerCase();
        if (codeExts.has(ext)) codeCount++;
      }
    }
  } catch {}

  return codeCount <= 2 ? 'greenfield' : 'brownfield';
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
      `## PROTOCOLO OBRIGATÓRIO DE ECONOMIA DE TOKENS (GREENFIELD FAST-TRACK - ${stack.name.toUpperCase()})`,
      'Projeto em fase inicial de construção (Greenfield). Siga o fluxo direto e enxuto:',
      '1. SCAFFOLDING & CONTRATOS: Crie os arquivos estruturais e especificações diretamente sem varreduras forenses pesadas.',
      '2. ESCRITA DE CÓDIGO: Use write_to_file para novos arquivos e replace_file_content cirúrgico para modificações.',
      '3. INSPEÇÃO CIRÚRGICA: view_file sempre com StartLine e EndLine cirúrgicos (máximo de 100 linhas).',
      '4. TESTES CONCENTRADOS: Execute apenas a suíte do módulo em desenvolvimento (sem flags verbosas -v).',
      '5. MEMPALACE: Registre decisões arquiteturais chave com node .agents/mcp-server.cjs capture decisions "<tópico>" "<decisão>".',
      '',
      'REGRAS RÍGIDAS DE SEGURANÇA E CONTEXTO:',
      '- PROIBIDO: Usar view_file sem StartLine/EndLine em arquivos de código.',
      '- PROIBIDO: Usar comandos de despejo bruto no terminal (cat, Get-Content, type, head).',
      '- PROIBIDO: Sobrescrever arquivos de código inteiros existentes (use SEMPRE replace_file_content cirúrgico).',
      '- PROIBIDO: Usar ast-grep com flags de reescrita em lote (-r, --rewrite).',
      `- PROIBIDO: Executar testes em modo verboso (${stack.testCmd}) em lote.`,
      '</token_efficiency_protocol>',
      PROTOCOL_MARKER_END
    ].join('\n');
  }

  return [
    PROTOCOL_MARKER_START,
    '<token_efficiency_protocol priority="critical" mode="brownfield">',
    `## PROTOCOLO OBRIGATÓRIO DE ECONOMIA DE TOKENS E ANÁLISE DE CÓDIGO (${stack.name.toUpperCase()})`,
    'Ao analisar ou modificar código em base existente (Brownfield), você DEVE seguir rigorosamente esta esteira:',
    '1. mempalace_recall via CLI: node .agents/mcp-server.cjs recall "<query>" (verificar decisões e bugs já resolvidos no MemPalace).',
    '2. graphify query "<pergunta>" (via run_command) para entender arquitetura macro e relações (execute graphify update . se graphify-out/ ainda não existir).',
    '3. query_docs via CLI: node .agents/mcp-server.cjs docs "<query>" para regras em PRDs e documentação .md.',
    '4. view_skeleton via CLI: node .agents/mcp-server.cjs skeleton "<arquivo>" para ver assinaturas e números de linha com custo mínimo.',
    '5. check_dependency via CLI: node .agents/mcp-server.cjs dep "<pacote>" para verificar pacotes sem abrir lockfiles gigantes.',
    `6. ${stack.lsp} para resolver assinaturas, tipos, pacotes e diagnósticos.`,
    `7. ast-grep CLI (via run_command: ast-grep run -p '<padrão>'${astLang}) para buscas sintáticas na AST.`,
    '8. view_file CIRÚRGICO APENAS: Sempre especifique StartLine e EndLine (máximo de 100 linhas).',
    '',
    'REGRAS RÍGIDAS DE SEGURANÇA E CONTEXTO:',
    '- PROIBIDO: Usar view_file sem StartLine/EndLine em arquivos de código.',
    '- PROIBIDO: Usar comandos de despejo bruto no terminal (cat, Get-Content, type, head).',
    '- PROIBIDO: Sobrescrever arquivos de código inteiros (use SEMPRE replace_file_content cirúrgico).',
    '- PROIBIDO: Usar ast-grep com flags de reescrita em lote (-r, --rewrite).',
    `- PROIBIDO: Executar testes em modo verboso (${stack.testCmd}) em lote.`,
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

function patchAgentFile(filePath, targetDir) {
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
  const protocolBlock = buildProtocolBlock(targetDir || process.cwd());
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
        if (patchAgentFile(fullPath, targetDir)) {
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
