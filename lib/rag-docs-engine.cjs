'use strict';

/**
 * Antigravity GSD Kit - Mini-RAG Docs Engine
 * Indexador semântico e busca em FTS5 para documentações Markdown (.md).
 * Extrai seções cirúrgicas de especificações, PRDs e regras sem abrir arquivos inteiros.
 */

const fs = require('fs');
const path = require('path');

class RagDocsEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
    this.memoryDir = path.join(this.projectRoot, '.agents', 'memory');
    this.dbPath = path.join(this.memoryDir, 'docs_index.db');
    this.db = null;
    this.useSqlite = false;

    this._initStorage();
  }

  _initStorage() {
    if (!fs.existsSync(this.memoryDir)) {
      try {
        fs.mkdirSync(this.memoryDir, { recursive: true });
      } catch {}
    }

    try {
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
      this.useSqlite = true;
      this._initTables();
    } catch {
      this.useSqlite = false;
    }
  }

  _initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS doc_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        file_path TEXT NOT NULL,
        heading TEXT,
        line_start INTEGER NOT NULL,
        line_end INTEGER NOT NULL,
        content TEXT NOT NULL,
        mtime INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS doc_fts USING fts5(
        file_path,
        heading,
        content,
        content='doc_chunks',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS doc_ai AFTER INSERT ON doc_chunks BEGIN
        INSERT INTO doc_fts(rowid, file_path, heading, content)
        VALUES (new.id, new.file_path, new.heading, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS doc_ad AFTER DELETE ON doc_chunks BEGIN
        INSERT INTO doc_fts(doc_fts, rowid, file_path, heading, content)
        VALUES('delete', old.id, old.file_path, old.heading, old.content);
      END;
    `);
  }

  _findMarkdownFiles(dir, fileList = [], depth = 0) {
    if (depth > 6) return fileList;
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return fileList;
    }

    const ignoredDirs = new Set([
      'node_modules', '.git', '.agents', '.gemini', '.cache',
      'dist', 'build', 'vendor', '.planning/archive'
    ]);

    for (const item of items) {
      if (item.isDirectory()) {
        if (!ignoredDirs.has(item.name) && !item.name.startsWith('.')) {
          this._findMarkdownFiles(path.join(dir, item.name), fileList, depth + 1);
        }
      } else if (item.isFile() && item.name.endsWith('.md')) {
        fileList.push(path.join(dir, item.name));
      }
    }
    return fileList;
  }

  indexFiles(force = false) {
    if (!this.useSqlite || !this.db) return { indexed: 0, skipped: 0 };

    const mdFiles = this._findMarkdownFiles(this.projectRoot);
    let indexedCount = 0;
    let skippedCount = 0;

    const checkStmt = this.db.prepare('SELECT mtime FROM doc_chunks WHERE file_path = ? LIMIT 1');
    const deleteStmt = this.db.prepare('DELETE FROM doc_chunks WHERE file_path = ?');
    const insertStmt = this.db.prepare(
      'INSERT INTO doc_chunks (file_path, heading, line_start, line_end, content, mtime) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const filePath of mdFiles) {
      const relPath = path.relative(this.projectRoot, filePath);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch {
        continue;
      }

      if (!force) {
        const existing = checkStmt.get(relPath);
        if (existing && existing.mtime >= stat.mtimeMs) {
          skippedCount++;
          continue;
        }
      }

      // Deletar chunks antigos do mesmo arquivo
      deleteStmt.run(relPath);

      // Ler e fatiar arquivo em chunks semânticos por seções
      let content;
      try {
        content = fs.readFileSync(filePath, 'utf8');
      } catch {
        continue;
      }

      const chunks = this._chunkMarkdown(content);
      for (const ch of chunks) {
        insertStmt.run(relPath, ch.heading, ch.lineStart, ch.lineEnd, ch.text, Math.floor(stat.mtimeMs));
      }
      indexedCount++;
    }

    return { indexed: indexedCount, skipped: skippedCount, total: mdFiles.length };
  }

  _chunkMarkdown(content) {
    const lines = content.split(/\r?\n/);
    const chunks = [];
    let currentHeading = 'Introdução';
    let currentLines = [];
    let startLine = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const headingMatch = line.match(/^(#{1,4})\s+(.+)$/);

      if (headingMatch) {
        if (currentLines.length > 0) {
          const text = currentLines.join('\n').trim();
          if (text.length > 10) {
            chunks.push({
              heading: currentHeading,
              text,
              lineStart: startLine,
              lineEnd: i
            });
          }
          currentLines = [];
        }
        currentHeading = headingMatch[2].trim();
        startLine = i + 1;
      } else {
        currentLines.push(line);
      }
    }

    if (currentLines.length > 0) {
      const text = currentLines.join('\n').trim();
      if (text.length > 10) {
        chunks.push({
          heading: currentHeading,
          text,
          lineStart: startLine,
          lineEnd: lines.length
        });
      }
    }

    return chunks;
  }

  query({ query, maxResults = 3 }) {
    if (!query || typeof query !== 'string') {
      return { results: [], total: 0 };
    }

    const cleanQuery = query.trim();
    if (!cleanQuery) return { results: [], total: 0 };

    // Auto-indexar se a base estiver vazia
    if (this.useSqlite && this.db) {
      const count = this.db.prepare('SELECT COUNT(*) as cnt FROM doc_chunks').get().cnt;
      if (count === 0) {
        this.indexFiles();
      }

      try {
        const ftsTerms = cleanQuery
          .replace(/[^a-zA-Z0-9_\u00C0-\u00FF]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 1)
          .map(t => `"${t}"*`)
          .join(' OR ');

        if (!ftsTerms) {
          const rows = this.db.prepare(
            'SELECT * FROM doc_chunks WHERE content LIKE ? OR heading LIKE ? LIMIT ?'
          ).all(`%${cleanQuery}%`, `%${cleanQuery}%`, Number(maxResults));
          return { results: rows, total: rows.length };
        }

        const sql = `
          SELECT c.*, rank
          FROM doc_fts f
          JOIN doc_chunks c ON f.rowid = c.id
          WHERE doc_fts MATCH ?
          ORDER BY rank
          LIMIT ?
        `;
        const rows = this.db.prepare(sql).all(ftsTerms, Number(maxResults));
        return { results: rows, total: rows.length };
      } catch {
        const rows = this.db.prepare(
          'SELECT * FROM doc_chunks WHERE content LIKE ? OR heading LIKE ? LIMIT ?'
        ).all(`%${cleanQuery}%`, `%${cleanQuery}%`, Number(maxResults));
        return { results: rows, total: rows.length };
      }
    }

    // Fallback básico caso SQLite não esteja disponível: busca em disco
    const mdFiles = this._findMarkdownFiles(this.projectRoot);
    const results = [];
    const qLower = cleanQuery.toLowerCase();

    for (const f of mdFiles) {
      if (results.length >= maxResults) break;
      try {
        const text = fs.readFileSync(f, 'utf8');
        if (text.toLowerCase().includes(qLower)) {
          const chunks = this._chunkMarkdown(text);
          for (const ch of chunks) {
            if (ch.text.toLowerCase().includes(qLower)) {
              results.push({
                file_path: path.relative(this.projectRoot, f),
                heading: ch.heading,
                line_start: ch.lineStart,
                line_end: ch.lineEnd,
                content: ch.text
              });
              if (results.length >= maxResults) break;
            }
          }
        }
      } catch {}
    }

    return { results, total: results.length };
  }

  formatQueryText({ query, maxResults = 3 }) {
    const { results } = this.query({ query, maxResults });
    if (!results || results.length === 0) {
      return `Nenhuma referência encontrada nos documentos para: "${query}".`;
    }

    const lines = [
      `📚 [Mini-RAG Docs] Trechos relevantes encontrados para "${query}":`,
      ''
    ];

    results.forEach((r, idx) => {
      lines.push(`--- Trecho ${idx + 1}: ${r.file_path} (L${r.line_start}-L${r.line_end}) ---`);
      lines.push(`📍 Seção: **${r.heading || 'Geral'}**`);
      
      // Limitar o corpo do trecho se for muito longo
      const snippetLines = r.content.split('\n');
      const preview = snippetLines.length > 25 ? snippetLines.slice(0, 25).join('\n') + '\n[...]' : r.content;
      lines.push(preview);
      lines.push('');
    });

    return lines.join('\n').trim();
  }
}

module.exports = RagDocsEngine;
