'use strict';

/**
 * Antigravity GSD Kit - MemPalace Engine
 * Memória episódica estruturada e busca semântica FTS5 persistida em SQLite.
 * Salva e recupera decisões arquiteturais, problemas/soluções e resumos de marcos.
 */

const fs = require('fs');
const path = require('path');

class MemPalaceEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
    this.memoryDir = path.join(this.projectRoot, '.agents', 'memory');
    this.dbPath = path.join(this.memoryDir, 'palace.db');
    this.jsonFallbackPath = path.join(this.memoryDir, 'palace-fallback.json');
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

    // Tentar carregar node:sqlite nativo (Node 22+)
    try {
      const { DatabaseSync } = require('node:sqlite');
      this.db = new DatabaseSync(this.dbPath);
      this.db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA busy_timeout = 5000;');
      this.useSqlite = true;
      this._initTables();
    } catch {
      // Fallback em JSON puro para compatibilidade com versões antigas do Node
      this.useSqlite = false;
      this._initJsonFallback();
    }
  }

  _initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memory_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        room TEXT NOT NULL,
        topic TEXT NOT NULL,
        content TEXT NOT NULL,
        rationale TEXT,
        tags TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
        topic,
        content,
        rationale,
        tags,
        content='memory_entries',
        content_rowid='id'
      );

      CREATE TRIGGER IF NOT EXISTS memory_ai AFTER INSERT ON memory_entries BEGIN
        INSERT INTO memory_fts(rowid, topic, content, rationale, tags)
        VALUES (new.id, new.topic, new.content, new.rationale, new.tags);
      END;

      CREATE TRIGGER IF NOT EXISTS memory_ad AFTER DELETE ON memory_entries BEGIN
        INSERT INTO memory_fts(memory_fts, rowid, topic, content, rationale, tags)
        VALUES('delete', old.id, old.topic, old.content, old.rationale, old.tags);
      END;
    `);
  }

  _initJsonFallback() {
    if (!fs.existsSync(this.jsonFallbackPath)) {
      try {
        fs.writeFileSync(this.jsonFallbackPath, JSON.stringify({ entries: [] }, null, 2), 'utf8');
      } catch {}
    }
  }

  capture({ room = 'decisions', topic, content, rationale = '', tags = '' }) {
    if (!topic || !content) {
      throw new Error('Parâmetros "topic" e "content" são obrigatórios para capture.');
    }

    const validRooms = ['decisions', 'problems', 'milestones'];
    const selectedRoom = validRooms.includes(room) ? room : 'decisions';
    const now = Date.now();

    if (this.useSqlite && this.db) {
      try {
        // Evitar duplicatas exatas recentes no mesmo room e topic
        const checkStmt = this.db.prepare(
          'SELECT id FROM memory_entries WHERE room = ? AND topic = ? AND content = ? LIMIT 1'
        );
        const existing = checkStmt.get(selectedRoom, topic, content);
        if (existing) {
          return { success: true, id: existing.id, duplicate: true };
        }

        const insertStmt = this.db.prepare(
          'INSERT INTO memory_entries (room, topic, content, rationale, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)'
        );
        const result = insertStmt.run(selectedRoom, topic, content, rationale, tags, now);
        return { success: true, id: Number(result.lastInsertRowid), duplicate: false };
      } catch (err) {
        return { success: false, error: `Erro no SQLite MemPalace: ${err.message}` };
      }
    }

    // JSON Fallback
    try {
      const data = JSON.parse(fs.readFileSync(this.jsonFallbackPath, 'utf8'));
      const exists = data.entries.find(e => e.room === selectedRoom && e.topic === topic && e.content === content);
      if (exists) return { success: true, id: exists.id, duplicate: true };

      const newId = (data.entries[data.entries.length - 1]?.id || 0) + 1;
      data.entries.push({ id: newId, room: selectedRoom, topic, content, rationale, tags, created_at: now });
      const tmpFile = `${this.jsonFallbackPath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpFile, this.jsonFallbackPath);
      return { success: true, id: newId, duplicate: false };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  recall({ query, room, limit = 5 }) {
    if (!query || typeof query !== 'string') {
      return { results: [], total: 0 };
    }

    const cleanQuery = query.trim();
    if (!cleanQuery) return { results: [], total: 0 };

    if (this.useSqlite && this.db) {
      try {
        // Sanitizar termos de busca para sintaxe FTS5
        const ftsTerms = cleanQuery
          .replace(/[^a-zA-Z0-9_\u00C0-\u00FF]/g, ' ')
          .split(/\s+/)
          .filter(t => t.length > 1)
          .map(t => `"${t}"*`)
          .join(' OR ');

        if (!ftsTerms) {
          // Busca LIKE simples como fallback
          let sql = 'SELECT * FROM memory_entries WHERE (topic LIKE ? OR content LIKE ?)';
          const params = [`%${cleanQuery}%`, `%${cleanQuery}%`];
          if (room) {
            sql += ' AND room = ?';
            params.push(room);
          }
          sql += ' ORDER BY id DESC LIMIT ?';
          params.push(Number(limit));
          const rows = this.db.prepare(sql).all(...params);
          return { results: rows, total: rows.length };
        }

        let sql = `
          SELECT m.*, rank
          FROM memory_fts f
          JOIN memory_entries m ON f.rowid = m.id
          WHERE memory_fts MATCH ?
        `;
        const params = [ftsTerms];
        if (room) {
          sql += ' AND m.room = ?';
          params.push(room);
        }
        sql += ' ORDER BY rank LIMIT ?';
        params.push(Number(limit));

        const rows = this.db.prepare(sql).all(...params);
        return { results: rows, total: rows.length };
      } catch {
        // Fallback para LIKE se FTS falhar
        let sql = 'SELECT * FROM memory_entries WHERE (topic LIKE ? OR content LIKE ?)';
        const params = [`%${cleanQuery}%`, `%${cleanQuery}%`];
        if (room) {
          sql += ' AND room = ?';
          params.push(room);
        }
        sql += ' ORDER BY id DESC LIMIT ?';
        params.push(Number(limit));
        const rows = this.db.prepare(sql).all(...params);
        return { results: rows, total: rows.length };
      }
    }

    // JSON Fallback
    try {
      const data = JSON.parse(fs.readFileSync(this.jsonFallbackPath, 'utf8'));
      const qLower = cleanQuery.toLowerCase();
      let matches = data.entries.filter(e => {
        if (room && e.room !== room) return false;
        return (
          e.topic.toLowerCase().includes(qLower) ||
          e.content.toLowerCase().includes(qLower) ||
          (e.rationale && e.rationale.toLowerCase().includes(qLower)) ||
          (e.tags && e.tags.toLowerCase().includes(qLower))
        );
      });
      matches.reverse();
      return { results: matches.slice(0, limit), total: matches.length };
    } catch {
      return { results: [], total: 0 };
    }
  }

  formatRecallText({ query, room, limit = 5 }) {
    const { results } = this.recall({ query, room, limit });
    if (!results || results.length === 0) {
      return `Nenhum registro encontrado no MemPalace para a busca: "${query}".`;
    }

    const lines = [
      `🏛️ [MemPalace Recall] Encontrados ${results.length} registro(s) para "${query}":`,
      ''
    ];

    results.forEach((r, idx) => {
      const date = new Date(r.created_at).toISOString().split('T')[0];
      lines.push(`${idx + 1}. [${r.room.toUpperCase()}] **${r.topic}** (${date})`);
      lines.push(`   ${r.content}`);
      if (r.rationale) {
        lines.push(`   *Motivo:* ${r.rationale}`);
      }
      lines.push('');
    });

    return lines.join('\n').trim();
  }

  stats() {
    if (this.useSqlite && this.db) {
      try {
        const total = this.db.prepare('SELECT COUNT(*) as cnt FROM memory_entries').get().cnt;
        const byRoom = this.db.prepare('SELECT room, COUNT(*) as cnt FROM memory_entries GROUP BY room').all();
        return { total, byRoom, engine: 'sqlite' };
      } catch (e) {
        return { total: 0, error: e.message };
      }
    }
    try {
      const data = JSON.parse(fs.readFileSync(this.jsonFallbackPath, 'utf8'));
      const byRoom = {};
      data.entries.forEach(e => {
        byRoom[e.room] = (byRoom[e.room] || 0) + 1;
      });
      return { total: data.entries.length, byRoom, engine: 'json' };
    } catch {
      return { total: 0, engine: 'json' };
    }
  }

  close() {
    if (this.useSqlite && this.db) {
      try {
        this.db.exec('PRAGMA wal_checkpoint(TRUNCATE);');
        this.db.close();
      } catch (_) {
      } finally {
        this.db = null;
        this.useSqlite = false;
      }
    }
  }
}

MemPalaceEngine.MemPalaceEngine = MemPalaceEngine;
module.exports = MemPalaceEngine;
