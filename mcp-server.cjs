#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit - MCP Server (Stdio)
 * Servidor MCP padronizado para ferramentas cirúrgicas de economia de tokens.
 * Zero dependências npm externas. Comunicação via JSON-RPC 2.0 em stdio.
 */

const readline = require('readline');
const path = require('path');
const fs = require('fs');

const MemPalaceEngine = require('./lib/mempalace-engine.cjs');
const RagDocsEngine = require('./lib/rag-docs-engine.cjs');
const LockfileLens = require('./lib/lockfile-lens.cjs');
const SkeletonEngine = require('./lib/skeleton-engine.cjs');
const TestIsolate = require('./lib/test-isolate.cjs');
const CheckpointEngine = require('./lib/checkpoint-engine.cjs');
const LspEngine = require('./lib/lsp-engine.cjs');
const ImpactEngine = require('./lib/impact-engine.cjs');
const EnvSkeletonEngine = require('./lib/env-skeleton.cjs');
const ErrorGuard = require('./lib/error-guard.cjs');
const { buildCodebaseMap } = require('./lib/codebase-map.cjs');
const { compressMemoryFile, compressCommandOutput } = require('./lib/caveman-shrink.cjs');
const { spawnSync, spawn } = require('child_process');

function resolveProjectRoot() {
  if (process.env.PROJECT_ROOT && fs.existsSync(process.env.PROJECT_ROOT)) {
    return process.env.PROJECT_ROOT;
  }
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.agents')) || fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.planning'))) {
      return dir;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();
let isShuttingDown = false;

function closeAllEngines() {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (engines.mempalace && typeof engines.mempalace.close === 'function') {
    try { engines.mempalace.close(); } catch (_) {}
  }
  if (engines.ragDocs && typeof engines.ragDocs.close === 'function') {
    try { engines.ragDocs.close(); } catch (_) {}
  }
}

ErrorGuard.installProcessGuards({ projectRoot: PROJECT_ROOT, source: 'mcp-server', onShutdown: closeAllEngines });

const SCRIPT_NAME = (process.argv[1] && path.relative(process.cwd(), process.argv[1])) || 'mcp-server.cjs';
const CLI_CMD = `node ${SCRIPT_NAME.includes(' ') ? `"${SCRIPT_NAME}"` : SCRIPT_NAME}`;

const engines = {};
const getMemPalace = () => (engines.mempalace ||= new MemPalaceEngine(PROJECT_ROOT));
const getRagDocs = () => (engines.ragDocs ||= new RagDocsEngine(PROJECT_ROOT));
const getLockfileLens = () => (engines.lockfileLens ||= new LockfileLens(PROJECT_ROOT));
const getSkeletonEngine = () => (engines.skeletonEngine ||= new SkeletonEngine(PROJECT_ROOT));
const getTestIsolate = () => (engines.testIsolate ||= new TestIsolate(PROJECT_ROOT));
const getCheckpointEngine = () => (engines.checkpointEngine ||= new CheckpointEngine(PROJECT_ROOT));
const getLspEngine = () => (engines.lspEngine ||= new LspEngine(PROJECT_ROOT));
const getImpactEngine = () => (engines.impactEngine ||= new ImpactEngine(PROJECT_ROOT));
const getEnvSkeleton = () => (engines.envSkeleton ||= new EnvSkeletonEngine(PROJECT_ROOT));

const lazyProxy = (getter) => new Proxy({}, {
  get: (_, prop) => {
    const target = getter();
    const val = target[prop];
    return typeof val === 'function' ? val.bind(target) : val;
  }
});

const mempalace = lazyProxy(getMemPalace);
const ragDocs = lazyProxy(getRagDocs);
const lockfileLens = lazyProxy(getLockfileLens);
const skeletonEngine = lazyProxy(getSkeletonEngine);
const testIsolate = lazyProxy(getTestIsolate);
const checkpointEngine = lazyProxy(getCheckpointEngine);
const lspEngine = lazyProxy(getLspEngine);
const impactEngine = lazyProxy(getImpactEngine);
const envSkeleton = lazyProxy(getEnvSkeleton);

function execProcessAsync(bin, args, options = {}, timeoutMs = 15000) {
  return new Promise((resolve) => {
    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const child = spawn(bin, args, {
      cwd: options.cwd || PROJECT_ROOT,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!child.killed) {
          try { child.kill('SIGKILL'); } catch (_) {}
        }
      }, 1000).unref();
    }, timeoutMs);

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });

    child.on('error', err => {
      clearTimeout(timer);
      resolve({ error: err, status: null, signal: null, stdout, stderr, timedOut });
    });

    child.on('close', (status, signal) => {
      clearTimeout(timer);
      resolve({ error: null, status, signal, stdout, stderr, timedOut });
    });
  });
}

async function runAstQuery({ pattern, lang, path: targetPath = '.', limit = 10 }) {
  if (!pattern) return { text: 'Erro: padrão (pattern) é obrigatório.', isError: true, stderr: 'Parâmetro "pattern" ausente.' };
  const bin = 'ast-grep';
  const cmdArgs = ['run', '-p', pattern];
  if (lang) cmdArgs.push('--lang', lang);
  if (targetPath && targetPath !== '.') cmdArgs.push(targetPath);
  cmdArgs.push('--json=stream');

  try {
    let res = await execProcessAsync(bin, cmdArgs, { cwd: PROJECT_ROOT }, 15000);
    if (res.error && res.error.code === 'ENOENT') {
      res = await execProcessAsync('npx', ['-y', '--package', '@ast-grep/cli', 'ast-grep', ...cmdArgs], { cwd: PROJECT_ROOT }, 20000);
    }

    if (res.error) {
      return {
        text: `Erro ao executar ast-grep: ${res.error.message}`,
        isError: true,
        stderr: res.error.message,
        remediation: 'Instale ast-grep ("npm i -g @ast-grep/cli" ou "cargo install ast-grep").'
      };
    }

    if (res.status !== 0 && res.status !== null) {
      const errOut = (res.stderr || '').trim() || `ast-grep encerrou com código ${res.status}`;
      return {
        text: `Erro ao executar ast-grep (exit code ${res.status}):\n${errOut}`,
        isError: true,
        stderr: errOut,
        remediation: 'Verifique se a sintaxe do padrão AST ou o parâmetro --lang são suportados.'
      };
    }

    const stdout = res.stdout || '';
    if (!stdout.trim()) {
      return { text: `Nenhuma correspondência encontrada para o padrão: "${pattern}".`, isError: false };
    }

    const lines = stdout.trim().split('\n');
    const matches = [];
    const parseErrors = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const item = JSON.parse(line);
        const rel = path.relative(PROJECT_ROOT, item.file || '');
        const start = (item.range && item.range.start && item.range.start.line + 1) || 1;
        const end = (item.range && item.range.end && item.range.end.line + 1) || start;
        const textSnippet = (item.text || '').split('\n').slice(0, 3).join(' ');
        matches.push(`📄 ${rel}:${start}-${end} ➔ ${textSnippet}`);
        if (matches.length >= limit) break;
      } catch (e) {
        parseErrors.push(`Falha de parse JSON: ${e.message}`);
      }
    }

    if (matches.length === 0) {
      if (parseErrors.length > 0) {
        return {
          text: `Erro ao interpretar saída de ast-grep:\n${parseErrors.join('\n')}`,
          isError: true,
          stderr: parseErrors.join('\n')
        };
      }
      return { text: `Nenhuma correspondência encontrada para o padrão: "${pattern}".`, isError: false };
    }

    const header = `🔍 [AST Query] ${matches.length} correspondência(s) encontrada(s) para '${pattern}':\n`;
    return { text: header + matches.join('\n'), isError: false };
  } catch (err) {
    return {
      text: `Erro fatal ao executar ast-grep: ${err.message}`,
      isError: true,
      stderr: err.stack || err.message
    };
  }
}

const TOOLS_MANIFEST = [
  {
    name: 'mempalace_recall',
    description: 'Recupera decisões de arquitetura, soluções de bugs passados e marcos salvos no MemPalace (memória episódica em SQLite) para evitar amnésia e re-leitura de arquivos históricos.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de busca ou tópico a recuperar' },
        room: { type: 'string', enum: ['decisions', 'problems', 'milestones'], description: 'Categoria específica da memória (opcional)' },
        limit: { type: 'number', description: 'Número máximo de registros a retornar (padrão: 5)' }
      },
      required: ['query']
    }
  },
  {
    name: 'mempalace_capture',
    description: 'Salva uma decisão arquitetural importante, solução confirmada de um bug ou resumo de marco no MemPalace para reutilização em sessões futuras.',
    inputSchema: {
      type: 'object',
      properties: {
        room: { type: 'string', enum: ['decisions', 'problems', 'milestones'], description: 'Categoria da memória' },
        topic: { type: 'string', description: 'Título curto e descritivo do fato' },
        content: { type: 'string', description: 'Conteúdo e descrição da decisão ou solução' },
        rationale: { type: 'string', description: 'Motivo ou contexto técnico da decisão (opcional)' }
      },
      required: ['room', 'topic', 'content']
    }
  },
  {
    name: 'query_docs',
    description: 'Busca semântica FTS5 em arquivos markdown (.md) do projeto para extrair trechos cirúrgicos de requisitos, PRDs e regras de negócio sem ler arquivos inteiros.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Termo de busca ou conceito a localizar na documentação' },
        max_results: { type: 'number', description: 'Quantidade máxima de trechos a retornar (padrão: 3)' }
      },
      required: ['query']
    }
  },
  {
    name: 'check_dependency',
    description: 'Inspeciona se um pacote está instalado e qual sua versão resolvido nos manifestos e lockfiles do projeto (npm, pnpm, go, cargo, python) sem carregar lockfiles gigantes.',
    inputSchema: {
      type: 'object',
      properties: {
        package_name: { type: 'string', description: 'Nome do pacote/biblioteca a verificar (ex: prisma, express, gin, axios)' }
      },
      required: ['package_name']
    }
  },
  {
    name: 'view_skeleton',
    description: 'Extrai o esqueleto estrutural (assinaturas, structs, classes, tipos e interfaces com números de linha) de um arquivo de código sem carregar os corpos das funções.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Caminho relativo ou absoluto do arquivo de código' }
      },
      required: ['file_path']
    }
  },
  {
    name: 'ast_query',
    description: 'Executa busca sintática AST via ast-grep sem risco de escape de aspas ou expansão de variáveis no shell.',
    inputSchema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Padrão estrutural do ast-grep (ex: "function $NAME($$$)")' },
        lang: { type: 'string', description: 'Linguagem (ex: js, ts, go, py, rust, cs, java, php, rb, dart). Opcional.' },
        path: { type: 'string', description: 'Arquivo ou diretório alvo (padrão: ".")' },
        limit: { type: 'number', description: 'Número máximo de ocorrências (padrão: 10)' }
      },
      required: ['pattern']
    }
  },
  {
    name: 'test_isolate',
    description: 'Detecta testes que falharam recentemente e retorna o comando cirúrgico para rodar apenas os testes falhos sem rodar a suíte completa.',
    inputSchema: {
      type: 'object',
      properties: {
        runner: { type: 'string', enum: ['auto', 'npm', 'node', 'go', 'pytest'], description: 'Runner de testes (padrão: auto)' }
      }
    }
  },
  {
    name: 'checkpoint_manager',
    description: 'Cria, lista ou desfaz para micro-checkpoints git antes/depois de refatorações críticas para evitar espirais de alucinação.',
    inputSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['create', 'list', 'rollback'], description: 'Ação a executar' },
        tag: { type: 'string', description: 'Nome do checkpoint para rollback (opcional)' },
        phase: { type: 'string', description: 'Fase ou contexto do checkpoint (ex: green-test, phase-3)' }
      },
      required: ['action']
    }
  },
  {
    name: 'lsp_diagnostics',
    description: 'Verifica erros de tipagem, compilação e sintaxe de forma cirúrgica e ultra-compacta em 20 ecossistemas (Go, TS/JS/Node, Python, Rust, PHP, C/C++, Java, C#, Ruby, Dart, Elixir, Lua, Bash/Shell, Web/HTML/CSS/JSON, YAML/K8s, SQL, Docker, Kotlin, Swift, Terraform).',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Caminho do arquivo para verificar (opcional; se omitido, verifica o projeto)' },
        lang: { type: 'string', description: 'Linguagem alvo (ex: go, ts, js, py, rust, php, cpp, java, cs, rb, dart, ex, lua, sh, web, yaml, sql, docker, kt, swift, tf). Opcional.' }
      }
    }
  },
  {
    name: 'lsp_definition',
    description: 'Localiza o arquivo e linha exata onde um símbolo (função, classe, struct, interface, tipo) é declarado/definido no projeto.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Nome do símbolo a localizar (ex: "UserService", "handleToolCall")' },
        file_path: { type: 'string', description: 'Arquivo de referência ou escopo (opcional)' },
        line: { type: 'number', description: 'Linha do símbolo (1-indexed, opcional)' },
        column: { type: 'number', description: 'Coluna do símbolo (1-indexed, opcional)' },
        lang: { type: 'string', description: 'Linguagem alvo (opcional)' }
      }
    }
  },
  {
    name: 'lsp_references',
    description: 'Lista todos os arquivos e linhas que referenciam um símbolo no projeto antes de alterar sua assinatura ou comportamento.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Nome do símbolo a buscar referências' },
        file_path: { type: 'string', description: 'Arquivo ou diretório de escopo (opcional)' },
        line: { type: 'number', description: 'Linha (1-indexed, opcional)' },
        column: { type: 'number', description: 'Coluna (1-indexed, opcional)' },
        lang: { type: 'string', description: 'Linguagem alvo (opcional)' },
        limit: { type: 'number', description: 'Limite máximo de ocorrências (padrão: 25)' }
      }
    }
  },
  {
    name: 'lsp_hover',
    description: 'Inspeciona a assinatura completa, tipagem e docstring de um símbolo (ou lista todos os símbolos estruturais de um arquivo se chamado apenas com file_path).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Nome do símbolo para inspecionar assinatura e docstring (opcional se file_path for informado)' },
        file_path: { type: 'string', description: 'Caminho do arquivo para listar símbolos ou desambiguar (opcional)' },
        line: { type: 'number', description: 'Linha (1-indexed, opcional)' },
        column: { type: 'number', description: 'Coluna (1-indexed, opcional)' },
        lang: { type: 'string', description: 'Linguagem alvo (opcional)' }
      }
    }
  },
  {
    name: 'lsp_rename',
    description: 'Renomeia um símbolo com segurança em todo o projeto ou caminho especificado (suporta dry_run para simulação prévia).',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Nome atual do símbolo' },
        new_name: { type: 'string', description: 'Novo nome do símbolo' },
        path: { type: 'string', description: 'Arquivo ou diretório escopo da renomeação (padrão: ".")' },
        lang: { type: 'string', description: 'Linguagem alvo (opcional)' },
        dry_run: { type: 'boolean', description: 'Se true, apenas simula e exibe os arquivos/linhas que seriam afetados' }
      },
      required: ['symbol', 'new_name']
    }
  },
  {
    name: 'impact_analysis',
    description: 'Calcula o raio de explosão (Blast Radius) de um símbolo ou arquivo cruzando o grafo Graphify, referências LSP e testes correlatos antes de refatorações.',
    inputSchema: {
      type: 'object',
      properties: {
        symbol: { type: 'string', description: 'Nome do símbolo (função, classe, struct, interface) a analisar' },
        file_path: { type: 'string', description: 'Caminho do arquivo alvo (opcional)' },
        limit: { type: 'number', description: 'Limite máximo de referências (padrão: 20)' }
      }
    }
  },
  {
    name: 'env_skeleton',
    description: 'Inspeciona arquivos .env e .env.example com segurança (Secret Shield), listando apenas nomes de variáveis, status ([SET], [EMPTY], [PLACEHOLDER]) e chaves faltantes sem expor segredos.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Arquivo .env específico para inspecionar (padrão: auto-detecta .env / .env.example)' }
      }
    }
  },
  {
    name: 'codebase_map',
    description: 'Gera o mapa estrutural dos exports, classes, funções e structs existentes no repositório para promover o reuso de código (Ponytail Ladder).',
    inputSchema: {
      type: 'object',
      properties: {
        budget: { type: 'number', description: 'Orçamento máximo de caracteres (padrão: 2000)' }
      }
    }
  },
  {
    name: 'ponytail_debt',
    description: 'Mapeia todos os comentários de atalhos deliberados (shortcut:, TODO(gsd): e ponytail:) do repositório gerando um ledger estruturado.',
    inputSchema: {
      type: 'object',
      properties: {
        filter: { type: 'string', description: 'Filtro ou palavra-chave opcional para a busca de débitos' }
      }
    }
  },
  {
    name: 'caveman_shrink',
    description: 'Comprime arquivos markdown de memória ou saídas longas de comandos removendo preenchimentos sem alterar blocos de código.',
    inputSchema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: 'Caminho do arquivo markdown para comprimir' },
        text: { type: 'string', description: 'Texto ou saída de comando para comprimir' }
      }
    }
  }
];

function sendJson(msg) {
  try {
    const jsonStr = JSON.stringify(msg) + '\n';
    const ok = process.stdout.write(jsonStr);
    if (!ok) {
      process.stdout.once('drain', () => {});
    }
  } catch (err) {
    try { process.stderr.write(`[gsd-economy-mcp] Erro ao enviar JSON-RPC: ${err.message}\n`); } catch (_) {}
  }
}

function scanPonytailDebt(projectRoot, customFilter = '') {
  let output = '';
  try {
    const grepPattern = customFilter ? customFilter : '(#|//|/\\*)\\s*(shortcut|TODO\\(gsd\\)|ponytail):';
    output = spawnSync('git', ['grep', '-nE', grepPattern], {
      cwd: projectRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 5000
    }).stdout || '';
  } catch (err) {
    output = '';
  }

  if (!output.trim()) {
    return 'Nenhum atalho ou débito técnico registrado (livro-razão limpo).';
  }

  const lines = output.trim().split(/\r?\n/).filter(Boolean);
  const items = [];
  let noTriggerCount = 0;

  for (const line of lines) {
    const colonIdx1 = line.indexOf(':');
    if (colonIdx1 === -1) continue;
    const colonIdx2 = line.indexOf(':', colonIdx1 + 1);
    if (colonIdx2 === -1) continue;

    const file = line.slice(0, colonIdx1);
    const lineNum = line.slice(colonIdx1 + 1, colonIdx2);
    const text = line.slice(colonIdx2 + 1).trim();

    const match = text.match(/(?:shortcut|ponytail|TODO\(gsd\)):\s*([^,]+)(?:,\s*(.+))?/i);
    let note = text;
    let hasTrigger = false;
    if (match) {
      const limit = (match[1] || '').trim();
      const trigger = (match[2] || '').trim();
      if (trigger) {
        hasTrigger = true;
        note = `limite: "${limit}" | gatilho: "${trigger}"`;
      } else {
        note = `limite: "${limit}" [sem-gatilho]`;
      }
    }
    if (!hasTrigger) noTriggerCount++;

    items.push(`  • ${file}:${lineNum} ➔ ${note}`);
  }

  const header = `📋 [Ponytail Debt Ledger - ${items.length} Atalhos Identificados]:\n`;
  const footer = `\nTotal: ${items.length} atalhos (${noTriggerCount} sem gatilho de refatoração definido).`;
  return header + items.join('\n') + footer;
}

async function handleToolCall(name, args) {
  let outcome;
  try {
    switch (name) {
      case 'mempalace_recall': {
        const text = mempalace.formatRecallText({
          query: args.query,
          room: args.room,
          limit: args.limit || 5
        });
        outcome = { text, isError: false };
        break;
      }
      case 'mempalace_capture': {
        const res = mempalace.capture({
          room: args.room,
          topic: args.topic,
          content: args.content,
          rationale: args.rationale || ''
        });
        if (!res.success) {
          outcome = {
            text: `Erro ao salvar no MemPalace: ${res.error || 'Falha ao persistir entrada'}`,
            isError: true,
            stderr: res.error || 'Falha ao persistir entrada no MemPalace',
            remediation: 'Verifique se o diretório .agents/memory possui permissão de escrita ou se o banco SQLite não está bloqueado.'
          };
          break;
        }
        const msg = res.duplicate
          ? `ℹ️ Fato já existia no MemPalace [${args.room}]: "${args.topic}".`
          : `✅ Fato registrado com sucesso no MemPalace [${args.room}] (ID: ${res.id}): "${args.topic}".`;
        outcome = { text: msg, isError: false };
        break;
      }
      case 'query_docs': {
        const text = ragDocs.formatQueryText({
          query: args.query,
          maxResults: args.max_results || 3
        });
        outcome = { text, isError: false };
        break;
      }
      case 'check_dependency': {
        const pkgName = args.package_name || args.name;
        const res = lockfileLens.inspect(pkgName);
        outcome = { text: res.message, isError: false };
        break;
      }
      case 'view_skeleton': {
        const filePath = args.file_path || args.path;
        const text = skeletonEngine.getOutline(filePath);
        outcome = { text, isError: false };
        break;
      }
      case 'ast_query': {
        outcome = await runAstQuery({
          pattern: args.pattern,
          lang: args.lang,
          path: args.path,
          limit: args.limit || 10
        });
        break;
      }
      case 'test_isolate': {
        const res = testIsolate.getIsolatedCommand(args.runner);
        outcome = { text: res.message, isError: false, data: res };
        break;
      }
      case 'checkpoint_manager': {
        const action = args.action || 'list';
        if (action === 'create') {
          const res = checkpointEngine.createCheckpoint(args.phase || 'manual');
          const msg = res.message || res.error || (res.ok ? 'Checkpoint criado com sucesso.' : 'Falha ao criar checkpoint.');
          outcome = { text: msg, isError: !res.ok, stderr: res.stderr };
        } else if (action === 'rollback') {
          const res = checkpointEngine.rollback(args.tag);
          const msg = res.message || res.error || (res.ok ? 'Rollback executado com sucesso.' : 'Falha ao executar rollback.');
          outcome = { text: msg, isError: !res.ok, stderr: res.stderr };
        } else {
          const list = checkpointEngine.listCheckpoints();
          if (list.length === 0) {
            outcome = { text: 'Nenhum micro-checkpoint registrado ainda.', isError: false };
          } else {
            const formatted = list.map(c => `🏷️ ${c.tag} (commit ${c.commit}) - Fase: ${c.phase} [${c.date}]`).join('\n');
            outcome = { text: `📋 Checkpoints Registrados:\n${formatted}`, isError: false };
          }
        }
        break;
      }
      case 'lsp_diagnostics': {
        outcome = lspEngine.diagnostics({
          file_path: args.file_path || args.path,
          lang: args.lang
        });
        break;
      }
      case 'lsp_definition': {
        outcome = lspEngine.definition({
          symbol: args.symbol,
          file_path: args.file_path || args.path,
          line: args.line,
          column: args.column,
          lang: args.lang
        });
        break;
      }
      case 'lsp_references': {
        outcome = lspEngine.references({
          symbol: args.symbol,
          file_path: args.file_path || args.path,
          line: args.line,
          column: args.column,
          lang: args.lang,
          limit: args.limit || 25
        });
        break;
      }
      case 'lsp_hover':
      case 'lsp_symbols': {
        outcome = lspEngine.hover({
          symbol: args.symbol,
          file_path: args.file_path || args.path,
          line: args.line,
          column: args.column,
          lang: args.lang
        });
        break;
      }
      case 'lsp_rename': {
        outcome = lspEngine.rename({
          symbol: args.symbol,
          new_name: args.new_name,
          path: args.path || args.file_path || '.',
          lang: args.lang,
          dry_run: Boolean(args.dry_run)
        });
        break;
      }
      case 'impact_analysis': {
        outcome = impactEngine.analyze({
          symbol: args.symbol,
          file_path: args.file_path || args.path,
          limit: args.limit || 20
        });
        break;
      }
      case 'env_skeleton': {
        const res = envSkeleton.inspect(args.file_path || args.path);
        outcome = { text: res.message, isError: Boolean(res.isError) };
        break;
      }
      case 'codebase_map': {
        const text = buildCodebaseMap(PROJECT_ROOT, args.budget || 2000) || 'Nenhum código-fonte relevante mapeado.';
        outcome = { text, isError: false };
        break;
      }
      case 'ponytail_debt': {
        const text = scanPonytailDebt(PROJECT_ROOT, args.filter || '');
        outcome = { text, isError: false };
        break;
      }
      case 'caveman_shrink': {
        if (args.file_path) {
          try {
            const res = compressMemoryFile(args.file_path, PROJECT_ROOT);
            const text = `✅ [Caveman Shrink] ${res.filePath} comprimido (-${res.savedBytes} bytes / ${res.percent}%).\nBackup salvo em: ${res.backupPath}`;
            outcome = { text, isError: false };
          } catch (e) {
            outcome = { text: `Erro ao comprimir arquivo: ${e.message}`, isError: true, stderr: e.message };
          }
        } else if (args.text) {
          const text = compressCommandOutput(args.text);
          outcome = { text, isError: false };
        } else {
          outcome = { text: 'Erro: informe file_path ou text para compressão.', isError: true };
        }
        break;
      }
      default:
        outcome = {
          text: `Ferramenta desconhecida: "${name}"`,
          isError: true,
          stderr: `Ferramenta "${name}" não consta nas ferramentas manifestadas do MCP.`,
          remediation: `Consulte "${CLI_CMD} tools" para ver a lista de ferramentas disponíveis.`
        };
        break;
    }
  } catch (err) {
    outcome = {
      text: `Erro na execução de ${name}: ${err.message}`,
      isError: true,
      stderr: err.stack || err.message,
      remediation: `Verifique os parâmetros informados para a ferramenta ${name}.`
    };
  }

  if (outcome && outcome.isError) {
    const stderrText = outcome.stderr || outcome.text || '';
    ErrorGuard.emitError(PROJECT_ROOT, {
      component: `mcp-tool:${name}`,
      title: outcome.text || 'Erro de execução de ferramenta MCP',
      stderr: stderrText,
      hint: outcome.remediation || '',
      severity: 'error'
    });
  }

  return outcome;
}

async function handleMessage(msg) {
  if (!msg || typeof msg !== 'object') return;

  const id = msg.id;

  // Notificações (sem ID)
  if (id === undefined || id === null) {
    return;
  }

  switch (msg.method) {
    case 'initialize': {
      sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'gsd-economy-mcp',
            version: '1.0.0'
          }
        }
      });
      break;
    }
    case 'tools/list': {
      sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          tools: TOOLS_MANIFEST
        }
      });
      break;
    }
    case 'tools/call': {
      const toolName = msg.params?.name;
      const toolArgs = msg.params?.arguments || {};
      try {
        const outcome = (await handleToolCall(toolName, toolArgs)) || {};
        const safeText = typeof outcome.text === 'string'
          ? outcome.text
          : (outcome.text != null ? String(outcome.text) : (outcome.stderr || 'Operação concluída sem saída de texto.'));
        sendJson({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: safeText
              }
            ],
            isError: Boolean(outcome.isError)
          }
        });
      } catch (callErr) {
        sendJson({
          jsonrpc: '2.0',
          id,
          result: {
            content: [
              {
                type: 'text',
                text: `Erro fatal ao executar ${toolName}: ${callErr.message}`
              }
            ],
            isError: true
          }
        });
      }
      break;
    }
    case 'ping': {
      sendJson({
        jsonrpc: '2.0',
        id,
        result: {}
      });
      break;
    }
    default: {
      sendJson({
        jsonrpc: '2.0',
        id,
        error: {
          code: -32601,
          message: `Método não suportado: ${msg.method}`
        }
      });
      break;
    }
  }
}

function exitCli(code = 0) {
  closeAllEngines();
  process.exit(code);
}

async function handleCli(args) {
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    exitCli(0);
  }

  if (cmd === 'errors' || cmd === 'error-log') {
    if (args.includes('--clear')) {
      ErrorGuard.clearErrors(PROJECT_ROOT);
      console.log('🧹 [ErrorGuard] Histórico de erros em cache (.agents/.cache/error-log.json) foi limpo.');
      exitCli(0);
    }
    const errs = ErrorGuard.listErrors(PROJECT_ROOT);
    console.log(ErrorGuard.formatErrorList(errs));
    exitCli(errs.length > 0 ? 1 : 0);
  }

  if (cmd === 'tools' || cmd === 'list') {
    if (args.includes('--json')) {
      console.log(JSON.stringify(TOOLS_MANIFEST, null, 2));
    } else {
      console.log('🛠️  [gsd-economy-mcp] Ferramentas Disponíveis:');
      for (const t of TOOLS_MANIFEST) {
        console.log(`\n• \x1b[36m${t.name}\x1b[0m: ${t.description}`);
      }
      console.log(`\nUso CLI: ${CLI_CMD} <comando> [argumentos]`);
    }
    exitCli(0);
  }

  if (cmd === 'call') {
    const toolName = args[1];
    if (!toolName) {
      console.error(`Erro: informe o nome da ferramenta. Ex: ${CLI_CMD} call mempalace_recall '{"query":"..."}'`);
      exitCli(1);
    }
    let toolArgs = {};
    if (args[2]) {
      try {
        toolArgs = JSON.parse(args[2]);
      } catch (e) {
        console.error(`Erro: argumentos JSON inválidos: ${e.message}`);
        exitCli(1);
      }
    }
    const { text, isError } = await handleToolCall(toolName, toolArgs);
    if (isError) {
      console.error(text);
      exitCli(1);
    } else {
      console.log(text);
      exitCli(0);
    }
  }

  // Ergonomic Shortcuts
  if (cmd === 'recall') {
    const query = args[1];
    if (!query) {
      console.error(`Erro: informe o termo de busca. Ex: ${CLI_CMD} recall "rate limiting"`);
      exitCli(1);
    }
    const room = args[2] && ['decisions', 'problems', 'milestones'].includes(args[2]) ? args[2] : undefined;
    const limit = args[3] ? Number(args[3]) : 5;
    const { text, isError } = await handleToolCall('mempalace_recall', { query, room, limit });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'capture') {
    const room = args[1];
    const topic = args[2];
    const content = args[3];
    const rationale = args[4] || '';
    if (!room || !topic || !content) {
      console.error(`Erro: uso: ${CLI_CMD} capture <decisions|problems|milestones> "<tópico>" "<conteúdo>" [motivo]`);
      exitCli(1);
    }
    const { text, isError } = await handleToolCall('mempalace_capture', { room, topic, content, rationale });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'skeleton') {
    const filePath = args[1];
    if (!filePath) {
      console.error(`Erro: informe o caminho do arquivo. Ex: ${CLI_CMD} skeleton "src/models/user.js"`);
      exitCli(1);
    }
    const { text, isError } = await handleToolCall('view_skeleton', { file_path: filePath });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'dep' || cmd === 'dependency') {
    const pkgName = args[1];
    if (!pkgName) {
      console.error(`Erro: informe o nome do pacote. Ex: ${CLI_CMD} dep "express"`);
      exitCli(1);
    }
    const { text, isError } = await handleToolCall('check_dependency', { package_name: pkgName });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'docs') {
    const query = args[1];
    if (!query) {
      console.error(`Erro: informe o termo de busca na documentação. Ex: ${CLI_CMD} docs "webhook"`);
      exitCli(1);
    }
    const maxResults = args[2] ? Number(args[2]) : 3;
    const { text, isError } = await handleToolCall('query_docs', { query, max_results: maxResults });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'ast') {
    const pattern = args[1];
    if (!pattern) {
      console.error(`Erro: informe o padrão AST. Ex: ${CLI_CMD} ast "function $NAME($$$)" [lang] [path]`);
      exitCli(1);
    }
    const lang = args[2] || undefined;
    const targetPath = args[3] || '.';
    const limit = args[4] ? Number(args[4]) : 10;
    const { text, isError } = await handleToolCall('ast_query', { pattern, lang, path: targetPath, limit });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'test-isolate') {
    const runner = args[1] || 'auto';
    const { text, isError } = await handleToolCall('test_isolate', { runner });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'checkpoint') {
    const action = args[1] || 'list';
    const param = args[2];
    const payload = { action };
    if (action === 'create') payload.phase = param || 'manual';
    if (action === 'rollback') payload.tag = param;
    const { text, isError } = await handleToolCall('checkpoint_manager', payload);
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'lsp') {
    const sub = (args[1] || 'diagnostics').toLowerCase();
    if (sub === 'diagnostics' || sub === 'diag' || sub === 'check') {
      const filePath = args[2];
      const lang = args[3];
      const { text, isError } = await handleToolCall('lsp_diagnostics', { file_path: filePath, lang });
      if (isError) { console.error(text); exitCli(1); }
      console.log(text);
      exitCli(0);
    }
    if (sub === 'definition' || sub === 'def') {
      const symbol = args[2];
      const filePath = args[3];
      const lang = args[4];
      const { text, isError } = await handleToolCall('lsp_definition', { symbol, file_path: filePath, lang });
      if (isError) { console.error(text); exitCli(1); }
      console.log(text);
      exitCli(0);
    }
    if (sub === 'references' || sub === 'refs' || sub === 'ref') {
      const symbol = args[2];
      const filePath = args[3];
      const limit = args[4] ? Number(args[4]) : 25;
      const { text, isError } = await handleToolCall('lsp_references', { symbol, file_path: filePath, limit });
      if (isError) { console.error(text); exitCli(1); }
      console.log(text);
      exitCli(0);
    }
    if (sub === 'hover') {
      const symbol = args[2];
      const filePath = args[3];
      const lang = args[4];
      const { text, isError } = await handleToolCall('lsp_hover', { symbol, file_path: filePath, lang });
      if (isError) { console.error(text); exitCli(1); }
      console.log(text);
      exitCli(0);
    }
    if (sub === 'symbols' || sub === 'sym') {
      const filePath = args[2];
      if (!filePath) {
        console.error(`Erro: informe o arquivo para listar símbolos. Ex: ${CLI_CMD} lsp symbols "src/index.ts"`);
        exitCli(1);
      }
      const { text, isError } = await handleToolCall('lsp_hover', { file_path: filePath });
      if (isError) { console.error(text); exitCli(1); }
      console.log(text);
      exitCli(0);
    }
    if (sub === 'rename') {
      const symbol = args[2];
      const newName = args[3];
      const targetPath = args[4] && !args[4].startsWith('--') ? args[4] : '.';
      const dryRun = args.includes('--dry-run');
      const { text, isError } = await handleToolCall('lsp_rename', { symbol, new_name: newName, path: targetPath, dry_run: dryRun });
      if (isError) { console.error(text); exitCli(1); }
      console.log(text);
      exitCli(0);
    }
    if (sub === 'health') {
      const status = lspEngine.checkStackHealth(PROJECT_ROOT);
      if (status.stacks.length === 0) {
        console.log('🩺 [LSP Health] Nenhuma stack específica detectada por manifesto neste diretório.');
      } else {
        console.log('🩺 [LSP Health] Status das linguagens detectadas no projeto:');
        for (const s of status.stacks) {
          const icon = s.isHealthy ? '✅' : '❌';
          const binInfo = s.activeBinary ? `Ativo (${s.activeBinary})` : `Ausente (instale com: ${s.installCmd})`;
          console.log(`  ${icon} ${s.name}: ${binInfo}`);
        }
      }
      exitCli(status.ok ? 0 : 1);
    }
    console.error(`Subcomando LSP desconhecido: "${sub}". Use: diagnostics, definition, references, hover, symbols, rename ou health.`);
    exitCli(1);
  }

  if (cmd === 'impact') {
    const target = args[1];
    if (!target) {
      console.error(`Erro: informe o símbolo ou arquivo. Ex: ${CLI_CMD} impact "LspEngine"`);
      exitCli(1);
    }
    const filePath = args[2];
    const limit = args[3] ? Number(args[3]) : 20;
    const { text, isError } = await handleToolCall('impact_analysis', { symbol: target, file_path: filePath, limit });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'env' || cmd === 'env-skeleton') {
    const filePath = args[1];
    const { text, isError } = await handleToolCall('env_skeleton', { file_path: filePath });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'map' || cmd === 'codebase-map') {
    const budget = args[1] ? Number(args[1]) : 2000;
    const { text, isError } = await handleToolCall('codebase_map', { budget });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'debt' || cmd === 'ponytail-debt') {
    const filter = args[1];
    const { text, isError } = await handleToolCall('ponytail_debt', { filter });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  if (cmd === 'shrink' || cmd === 'caveman-shrink') {
    const filePath = args[1];
    if (!filePath) {
      console.error(`Erro: informe o arquivo para comprimir. Ex: ${CLI_CMD} shrink "CLAUDE.md"`);
      exitCli(1);
    }
    const { text, isError } = await handleToolCall('caveman_shrink', { file_path: filePath });
    if (isError) { console.error(text); exitCli(1); }
    console.log(text);
    exitCli(0);
  }

  console.error(`Comando desconhecido: "${cmd}". Execute "${CLI_CMD} help" para ver as opções.`);
  exitCli(1);
}

function printHelp() {
  console.log(`
Antigravity GSD Kit - MCP Server & CLI Dispatcher (Dual-Mode)

Uso CLI direto (via run_command):
  ${CLI_CMD} recall "<query>" [room] [limit]
  ${CLI_CMD} capture <room> "<tópico>" "<conteúdo>" [motivo]
  ${CLI_CMD} skeleton "<caminho_arquivo>"
  ${CLI_CMD} dep "<nome_pacote>"
  ${CLI_CMD} docs "<query>" [max_results]
  ${CLI_CMD} ast "<pattern>" [lang] [path] [limit]
  ${CLI_CMD} lsp diagnostics [arquivo] [lang]
  ${CLI_CMD} lsp definition "<símbolo>" [arquivo] [lang]
  ${CLI_CMD} lsp references "<símbolo>" [caminho] [limit]
  ${CLI_CMD} lsp hover "<símbolo>" [arquivo] [lang]
  ${CLI_CMD} lsp symbols "<arquivo>"
  ${CLI_CMD} lsp rename "<antigo>" "<novo>" [caminho] [--dry-run]
  ${CLI_CMD} lsp health
  ${CLI_CMD} impact "<símbolo_ou_arquivo>" [arquivo] [limit]
  ${CLI_CMD} env [caminho_env]
  ${CLI_CMD} test-isolate [runner]
  ${CLI_CMD} checkpoint <create|list|rollback> [arg]
  ${CLI_CMD} errors [--clear]
  ${CLI_CMD} call <ferramenta> '<json_args>'
  ${CLI_CMD} tools [--json]
  ${CLI_CMD} help

Uso MCP Stdio (Daemon):
  ${CLI_CMD}
  (Quando executado sem argumentos, opera em loop JSON-RPC 2.0 padrão para Antigravity)
`);
}

function runStdioServer() {
  let rl = null;
  const cleanupAndExit = (code = 0) => {
    try {
      if (rl && typeof rl.close === 'function') rl.close();
    } catch (_) {}
    closeAllEngines();
    process.exit(code);
  };

  process.stdout.on('error', err => {
    if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') {
      cleanupAndExit(0);
    }
  });

  process.stdin.on('error', err => {
    if (err.code === 'EPIPE' || err.code === 'ECONNRESET') {
      cleanupAndExit(0);
    }
  });

  rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', async line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      await handleMessage(msg);
    } catch (err) {
      process.stderr.write(`[gsd-economy-mcp] Erro de parse JSON: ${err.message}\n`);
      sendJson({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: `Parse error: ${err.message}`
        }
      });
    }
  });

  rl.on('close', () => cleanupAndExit(0));
  process.on('SIGINT', () => cleanupAndExit(0));
  process.on('SIGTERM', () => cleanupAndExit(0));
  process.on('SIGHUP', () => cleanupAndExit(0));
  process.on('exit', () => closeAllEngines());

  process.stderr.write(`[gsd-economy-mcp] Servidor MCP iniciado para: ${PROJECT_ROOT}\n`);
}

// Inicialização Dual-Mode
if (process.argv.length > 2) {
  handleCli(process.argv.slice(2)).catch(err => {
    process.stderr.write(`[gsd-economy-mcp] Falha na CLI: ${err.message}\n`);
    exitCli(1);
  });
} else {
  runStdioServer();
}
