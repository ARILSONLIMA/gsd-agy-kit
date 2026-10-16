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
const { spawnSync } = require('child_process');

function resolveProjectRoot() {
  if (process.env.PROJECT_ROOT && fs.existsSync(process.env.PROJECT_ROOT)) {
    return process.env.PROJECT_ROOT;
  }
  let dir = process.cwd();
  for (;;) {
    if (fs.existsSync(path.join(dir, '.agents')) || fs.existsSync(path.join(dir, '.git')) || fs.existsSync(path.join(dir, '.project'))) {
      return dir;
    }
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  return process.cwd();
}

const PROJECT_ROOT = resolveProjectRoot();
const mempalace = new MemPalaceEngine(PROJECT_ROOT);
const ragDocs = new RagDocsEngine(PROJECT_ROOT);
const lockfileLens = new LockfileLens(PROJECT_ROOT);
const skeletonEngine = new SkeletonEngine(PROJECT_ROOT);
const testIsolate = new TestIsolate(PROJECT_ROOT);
const checkpointEngine = new CheckpointEngine(PROJECT_ROOT);

function runAstQuery({ pattern, lang, path: targetPath = '.', limit = 10 }) {
  if (!pattern) return { text: 'Erro: padrão (pattern) é obrigatório.', isError: true };
  const bin = 'ast-grep';
  const cmdArgs = ['run', '-p', pattern];
  if (lang) cmdArgs.push('--lang', lang);
  if (targetPath && targetPath !== '.') cmdArgs.push(targetPath);
  cmdArgs.push('--json=stream');

  try {
    let res = spawnSync(bin, cmdArgs, { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 15000 });
    if (res.error) {
      res = spawnSync('npx', ['-y', '--package', '@ast-grep/cli', 'ast-grep', ...cmdArgs], { cwd: PROJECT_ROOT, encoding: 'utf8', timeout: 20000 });
    }
    const stdout = res.stdout || '';
    if (!stdout.trim()) {
      return { text: `Nenhuma correspondência encontrada para o padrão: "${pattern}".`, isError: false };
    }

    const lines = stdout.trim().split('\n');
    const matches = [];
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        const rel = path.relative(PROJECT_ROOT, item.file || '');
        const start = (item.range && item.range.start && item.range.start.line + 1) || 1;
        const end = (item.range && item.range.end && item.range.end.line + 1) || start;
        const textSnippet = (item.text || '').split('\n').slice(0, 3).join(' ');
        matches.push(`📄 ${rel}:${start}-${end} ➔ ${textSnippet}`);
        if (matches.length >= limit) break;
      } catch {}
    }

    if (matches.length === 0) {
      return { text: `Nenhuma correspondência encontrada para o padrão: "${pattern}".`, isError: false };
    }

    const header = `🔍 [AST Query] ${matches.length} correspondência(s) encontrada(s) para '${pattern}':\n`;
    return { text: header + matches.join('\n'), isError: false };
  } catch (err) {
    return { text: `Erro ao executar ast-grep: ${err.message}`, isError: true };
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
  }
];

function sendJson(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function handleToolCall(name, args) {
  try {
    switch (name) {
      case 'mempalace_recall': {
        const text = mempalace.formatRecallText({
          query: args.query,
          room: args.room,
          limit: args.limit || 5
        });
        return { text, isError: false };
      }
      case 'mempalace_capture': {
        const res = mempalace.capture({
          room: args.room,
          topic: args.topic,
          content: args.content,
          rationale: args.rationale || ''
        });
        const msg = res.duplicate
          ? `ℹ️ Fato já existia no MemPalace [${args.room}]: "${args.topic}".`
          : `✅ Fato registrado com sucesso no MemPalace [${args.room}] (ID: ${res.id}): "${args.topic}".`;
        return { text: msg, isError: false };
      }
      case 'query_docs': {
        const text = ragDocs.formatQueryText({
          query: args.query,
          maxResults: args.max_results || 3
        });
        return { text, isError: false };
      }
      case 'check_dependency': {
        const pkgName = args.package_name || args.name;
        const res = lockfileLens.inspect(pkgName);
        return { text: res.message, isError: false };
      }
      case 'view_skeleton': {
        const filePath = args.file_path || args.path;
        const text = skeletonEngine.getOutline(filePath);
        return { text, isError: false };
      }
      case 'ast_query': {
        return runAstQuery({
          pattern: args.pattern,
          lang: args.lang,
          path: args.path,
          limit: args.limit || 10
        });
      }
      case 'test_isolate': {
        const res = testIsolate.getIsolatedCommand(args.runner);
        return { text: res.message, isError: false, data: res };
      }
      case 'checkpoint_manager': {
        const action = args.action || 'list';
        if (action === 'create') {
          const res = checkpointEngine.createCheckpoint(args.phase || 'manual');
          return { text: res.message || res.error, isError: !res.ok };
        } else if (action === 'rollback') {
          const res = checkpointEngine.rollback(args.tag);
          return { text: res.message || res.error, isError: !res.ok };
        } else {
          const list = checkpointEngine.listCheckpoints();
          if (list.length === 0) {
            return { text: 'Nenhum micro-checkpoint registrado ainda.', isError: false };
          }
          const formatted = list.map(c => `🏷️ ${c.tag} (commit ${c.commit}) - Fase: ${c.phase} [${c.date}]`).join('\n');
          return { text: `📋 Checkpoints Registrados:\n${formatted}`, isError: false };
        }
      }
      default:
        return { text: `Ferramenta desconhecida: "${name}"`, isError: true };
    }
  } catch (err) {
    return { text: `Erro na execução de ${name}: ${err.message}`, isError: true };
  }
}

function handleMessage(msg) {
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
      const { text, isError } = handleToolCall(toolName, toolArgs);
      sendJson({
        jsonrpc: '2.0',
        id,
        result: {
          content: [
            {
              type: 'text',
              text
            }
          ],
          isError
        }
      });
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

function handleCli(args) {
  const cmd = args[0];
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    printHelp();
    process.exit(0);
  }

  if (cmd === 'tools' || cmd === 'list') {
    if (args.includes('--json')) {
      console.log(JSON.stringify(TOOLS_MANIFEST, null, 2));
    } else {
      console.log('🛠️  [gsd-economy-mcp] Ferramentas Disponíveis:');
      for (const t of TOOLS_MANIFEST) {
        console.log(`\n• \x1b[36m${t.name}\x1b[0m: ${t.description}`);
      }
      console.log('\nUso CLI: node .agents/mcp-server.cjs <comando> [argumentos]');
    }
    process.exit(0);
  }

  if (cmd === 'call') {
    const toolName = args[1];
    if (!toolName) {
      console.error('Erro: informe o nome da ferramenta. Ex: node mcp-server.cjs call mempalace_recall \'{"query":"..."}\'');
      process.exit(1);
    }
    let toolArgs = {};
    if (args[2]) {
      try {
        toolArgs = JSON.parse(args[2]);
      } catch (e) {
        console.error(`Erro: argumentos JSON inválidos: ${e.message}`);
        process.exit(1);
      }
    }
    const { text, isError } = handleToolCall(toolName, toolArgs);
    if (isError) {
      console.error(text);
      process.exit(1);
    } else {
      console.log(text);
      process.exit(0);
    }
  }

  // Ergonomic Shortcuts
  if (cmd === 'recall') {
    const query = args[1];
    if (!query) {
      console.error('Erro: informe o termo de busca. Ex: node mcp-server.cjs recall "rate limiting"');
      process.exit(1);
    }
    const room = args[2] && ['decisions', 'problems', 'milestones'].includes(args[2]) ? args[2] : undefined;
    const limit = args[3] ? Number(args[3]) : 5;
    const { text, isError } = handleToolCall('mempalace_recall', { query, room, limit });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'capture') {
    const room = args[1];
    const topic = args[2];
    const content = args[3];
    const rationale = args[4] || '';
    if (!room || !topic || !content) {
      console.error('Erro: uso: node mcp-server.cjs capture <decisions|problems|milestones> "<tópico>" "<conteúdo>" [motivo]');
      process.exit(1);
    }
    const { text, isError } = handleToolCall('mempalace_capture', { room, topic, content, rationale });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'skeleton') {
    const filePath = args[1];
    if (!filePath) {
      console.error('Erro: informe o caminho do arquivo. Ex: node mcp-server.cjs skeleton "src/models/user.js"');
      process.exit(1);
    }
    const { text, isError } = handleToolCall('view_skeleton', { file_path: filePath });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'dep' || cmd === 'dependency') {
    const pkgName = args[1];
    if (!pkgName) {
      console.error('Erro: informe o nome do pacote. Ex: node mcp-server.cjs dep "express"');
      process.exit(1);
    }
    const { text, isError } = handleToolCall('check_dependency', { package_name: pkgName });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'docs') {
    const query = args[1];
    if (!query) {
      console.error('Erro: informe o termo de busca na documentação. Ex: node mcp-server.cjs docs "webhook"');
      process.exit(1);
    }
    const maxResults = args[2] ? Number(args[2]) : 3;
    const { text, isError } = handleToolCall('query_docs', { query, max_results: maxResults });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'ast') {
    const pattern = args[1];
    if (!pattern) {
      console.error('Erro: informe o padrão AST. Ex: node mcp-server.cjs ast "function $NAME($$$)" [lang] [path]');
      process.exit(1);
    }
    const lang = args[2] || undefined;
    const targetPath = args[3] || '.';
    const limit = args[4] ? Number(args[4]) : 10;
    const { text, isError } = handleToolCall('ast_query', { pattern, lang, path: targetPath, limit });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'test-isolate') {
    const runner = args[1] || 'auto';
    const { text, isError } = handleToolCall('test_isolate', { runner });
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  if (cmd === 'checkpoint') {
    const action = args[1] || 'list';
    const param = args[2];
    const payload = { action };
    if (action === 'create') payload.phase = param || 'manual';
    if (action === 'rollback') payload.tag = param;
    const { text, isError } = handleToolCall('checkpoint_manager', payload);
    if (isError) { console.error(text); process.exit(1); }
    console.log(text);
    process.exit(0);
  }

  console.error(`Comando desconhecido: "${cmd}". Execute "node mcp-server.cjs help" para ver as opções.`);
  process.exit(1);
}

function printHelp() {
  console.log(`
Antigravity GSD Kit - MCP Server & CLI Dispatcher (Dual-Mode)

Uso CLI direto (via run_command):
  node .agents/mcp-server.cjs recall "<query>" [room] [limit]
  node .agents/mcp-server.cjs capture <room> "<tópico>" "<conteúdo>" [motivo]
  node .agents/mcp-server.cjs skeleton "<caminho_arquivo>"
  node .agents/mcp-server.cjs dep "<nome_pacote>"
  node .agents/mcp-server.cjs docs "<query>" [max_results]
  node .agents/mcp-server.cjs ast "<pattern>" [lang] [path] [limit]
  node .agents/mcp-server.cjs test-isolate [runner]
  node .agents/mcp-server.cjs checkpoint <create|list|rollback> [arg]
  node .agents/mcp-server.cjs call <ferramenta> '<json_args>'
  node .agents/mcp-server.cjs tools [--json]
  node .agents/mcp-server.cjs help

Uso MCP Stdio (Daemon):
  node .agents/mcp-server.cjs
  (Quando executado sem argumentos, opera em loop JSON-RPC 2.0 padrão para Antigravity)
`);
}

function runStdioServer() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: false
  });

  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) return;
    try {
      const msg = JSON.parse(trimmed);
      handleMessage(msg);
    } catch (err) {
      process.stderr.write(`[gsd-economy-mcp] Erro de parse JSON: ${err.message}\n`);
    }
  });

  process.stderr.write(`[gsd-economy-mcp] Servidor MCP iniciado para: ${PROJECT_ROOT}\n`);
}

// Inicialização Dual-Mode
if (process.argv.length > 2) {
  handleCli(process.argv.slice(2));
} else {
  runStdioServer();
}
