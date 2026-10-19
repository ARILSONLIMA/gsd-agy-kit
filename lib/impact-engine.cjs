'use strict';

/**
 * Antigravity GSD Kit - Impact Analysis Engine (Blast Radius)
 * Combina o grafo de conhecimento do Graphify (.planning/graphs/graph.json ou graphify-out/graph.json)
 * com o Motor Multi-LSP Híbrido (referências cruzadas) e detecção de testes correlatos para
 * calcular o raio de explosão antes de refatorações ou alterações de assinatura.
 *
 * TODO(security): Local CLI/Stdio static analysis module; web session/CSRF/CSP controls not applicable.
 */

const fs = require('fs');
const path = require('path');
const LspEngine = require('./lsp-engine.cjs');

class ImpactEngine {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot || process.cwd());
    this.lsp = new LspEngine(this.projectRoot);
  }

  _loadGraph() {
    const candidates = [
      path.join(this.projectRoot, '.planning', 'graphs', 'graph.json'),
      path.join(this.projectRoot, 'graphify-out', 'graph.json')
    ];
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        try {
          return JSON.parse(fs.readFileSync(p, 'utf8'));
        } catch {}
      }
    }
    return null;
  }

  _findGraphConnections(target, graph) {
    if (!graph || !Array.isArray(graph.nodes)) {
      return { matchedNodes: [], neighbors: [], communities: [] };
    }

    const q = String(target || '').toLowerCase();
    const baseName = path.basename(q, path.extname(q));
    const matchedIds = new Set();
    const matchedNodes = [];
    const communities = new Set();

    for (const n of graph.nodes) {
      const id = String(n.id || '').toLowerCase();
      const label = String(n.label || n.name || '').toLowerCase();
      const src = String(n.source_file || n.file || '').toLowerCase();
      if (
        id === q ||
        label === q ||
        (baseName.length > 2 && (label.includes(baseName) || src.endsWith(q) || id.includes(baseName)))
      ) {
        matchedIds.add(n.id);
        matchedNodes.push(n);
        if (n.community_name || n.community !== undefined) {
          communities.add(n.community_name || `Community ${n.community}`);
        }
      }
    }

    const edges = Array.isArray(graph.links)
      ? graph.links
      : (Array.isArray(graph.edges) ? graph.edges : []);

    const neighborIds = new Set();
    for (const e of edges) {
      const src = typeof e.source === 'object' ? e.source.id : e.source;
      const tgt = typeof e.target === 'object' ? e.target.id : e.target;
      if (matchedIds.has(src) && !matchedIds.has(tgt)) {
        neighborIds.add(tgt);
      } else if (matchedIds.has(tgt) && !matchedIds.has(src)) {
        neighborIds.add(src);
      }
    }

    const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
    const neighbors = [];
    for (const nid of neighborIds) {
      const n = nodeById.get(nid);
      if (n) {
        neighbors.push({
          id: n.id,
          label: n.label || n.id,
          file: n.source_file || n.file || null,
          community: n.community_name || n.community
        });
      } else {
        neighbors.push({ id: nid, label: String(nid), file: null });
      }
    }

    return {
      matchedNodes: matchedNodes.slice(0, 10),
      neighbors: neighbors.slice(0, 15),
      communities: Array.from(communities)
    };
  }

  _findRelatedTests(affectedFiles, symbol) {
    const relatedTests = new Set();
    const stems = new Set();
    if (symbol) stems.add(String(symbol).toLowerCase());
    for (const f of affectedFiles) {
      const ext = path.extname(f);
      const base = path.basename(f, ext).toLowerCase();
      if (base && base !== 'index' && base !== 'main') {
        stems.add(base);
      }
    }

    // Verificar se existem scripts de teste padrão no projeto
    for (const f of ['test-kit.sh', 'test-kit.ps1']) {
      if (fs.existsSync(path.join(this.projectRoot, f))) {
        relatedTests.add(f);
      }
    }

    const scanDirs = ['tests', 'test', 'src', 'lib', 'cmd', 'pkg', 'internal'];
    const walk = (dir, depth = 0) => {
      if (depth > 3 || !fs.existsSync(dir)) return;
      let entries = [];
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
      for (const ent of entries) {
        if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'vendor') continue;
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          walk(full, depth + 1);
        } else if (/(?:\.test\.|\.spec\.|_test\.go$|^test_.*\.py$)/i.test(ent.name)) {
          const lowerName = ent.name.toLowerCase();
          for (const stem of stems) {
            if (stem.length >= 3 && lowerName.includes(stem)) {
              relatedTests.add(path.relative(this.projectRoot, full).replace(/\\/g, '/'));
              break;
            }
          }
        }
      }
    };

    for (const d of scanDirs) {
      walk(path.join(this.projectRoot, d), 0);
    }

    return Array.from(relatedTests).slice(0, 10);
  }

  analyze({ symbol, file_path: filePath, limit = 20 }) {
    const queryTarget = symbol || filePath;
    if (!queryTarget) {
      return {
        isError: true,
        text: 'Erro: informe "symbol" ou "file_path" para executar impact_analysis.'
      };
    }

    const affectedFilesSet = new Set();
    if (filePath) {
      affectedFilesSet.add(filePath.replace(/\\/g, '/'));
    }

    // 1. Referências via Motor Multi-LSP
    let lspRefsText = '';
    const refLines = [];
    if (symbol) {
      const refsRes = this.lsp.references({
        symbol,
        file_path: filePath,
        limit: Number(limit) || 20
      });
      lspRefsText = refsRes.text || '';
      for (const line of lspRefsText.split('\n')) {
        const m = line.match(/📄\s+([^:]+):(\d+)/);
        if (m && m[1]) {
          affectedFilesSet.add(m[1].trim());
          refLines.push(line.trim());
        }
      }
    }

    // 2. Conexões no Grafo Graphify
    const graph = this._loadGraph();
    const graphInfo = this._findGraphConnections(queryTarget, graph);
    for (const nb of graphInfo.neighbors) {
      if (nb.file) affectedFilesSet.add(String(nb.file).replace(/\\/g, '/'));
    }

    const affectedFiles = Array.from(affectedFilesSet);
    const relatedTests = this._findRelatedTests(affectedFiles, symbol);

    // 3. Classificação de Risco (Blast Radius)
    const totalTouchpoints = Math.max(refLines.length, affectedFiles.length) + graphInfo.neighbors.length;
    let riskLevel = 'LOW';
    if (totalTouchpoints >= 10 || affectedFiles.length >= 5) {
      riskLevel = 'HIGH';
    } else if (totalTouchpoints >= 4 || affectedFiles.length >= 2) {
      riskLevel = 'MEDIUM';
    }

    const out = [
      `💥 [Impact Analysis / Blast Radius] Alvo: "${queryTarget}"`,
      `⚡ Nível de Risco: ${riskLevel} (${affectedFiles.length} arquivo(s) impactado(s), ${refLines.length} referência(s) LSP, ${graphInfo.neighbors.length} vizinho(s) no grafo)`
    ];

    if (graphInfo.communities.length > 0) {
      out.push(`🧩 Comunidades Arquiteturais: ${graphInfo.communities.join(', ')}`);
    }

    if (affectedFiles.length > 0) {
      out.push(`\n📂 Arquivos Afetados (${affectedFiles.length}):`);
      for (const f of affectedFiles.slice(0, 12)) {
        out.push(`  • ${f}`);
      }
    }

    if (refLines.length > 0) {
      out.push(`\n🔗 Referências Cruzadas (${refLines.length}):`);
      for (const r of refLines.slice(0, 10)) {
        out.push(`  ${r}`);
      }
    }

    if (graphInfo.neighbors.length > 0) {
      out.push(`\n🕸️ Dependentes/Vizinhos no Grafo Graphify (${graphInfo.neighbors.length}):`);
      for (const nb of graphInfo.neighbors.slice(0, 8)) {
        const fInfo = nb.file ? ` (${nb.file})` : '';
        out.push(`  • ${nb.label}${fInfo}`);
      }
    }

    if (relatedTests.length > 0) {
      out.push(`\n🧪 Testes Correlatos Recomendados (${relatedTests.length}):`);
      for (const t of relatedTests) {
        out.push(`  • ${t}`);
      }
    }

    return {
      isError: false,
      riskLevel,
      affectedFiles,
      relatedTests,
      text: out.join('\n')
    };
  }
}

module.exports = ImpactEngine;
