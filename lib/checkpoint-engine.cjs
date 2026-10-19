'use strict';

/**
 * Antigravity GSD Kit - Checkpoint Engine
 * Cria micro-checkpoints git para marcos estáveis (ex: testes verdes)
 * e permite rollback cirúrgico quando o modelo entra em espirais de alucinação.
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function sanitizeGitToken(val, fallback = 'green') {
  const cleaned = String(val || fallback).replace(/[^a-zA-Z0-9._-]/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || fallback;
}

function writeJsonAtomic(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmpFile, filePath);
}

class CheckpointEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
    this.cacheDir = path.join(this.projectRoot, '.agents', '.cache');
    this.checkpointsFile = path.join(this.cacheDir, 'checkpoints.json');
    try {
      if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {}
  }

  _isGitRepo() {
    return fs.existsSync(path.join(this.projectRoot, '.git'));
  }

  listCheckpoints() {
    if (!fs.existsSync(this.checkpointsFile)) return [];
    try {
      return JSON.parse(fs.readFileSync(this.checkpointsFile, 'utf8'));
    } catch {
      return [];
    }
  }

  createCheckpoint(phase = 'green') {
    if (!this._isGitRepo()) {
      return { ok: false, error: 'O projeto não é um repositório git.' };
    }

    try {
      const timestamp = Date.now();
      const safePhase = sanitizeGitToken(phase, 'green');
      const tagName = `gsd-chk-${safePhase}-${timestamp}`;
      
      // Obter commit HEAD atual (sem shell)
      const headCommit = execFileSync('git', ['rev-parse', '--short', 'HEAD'], {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8'
      }).trim();

      // Obter status resumido (sem shell)
      const status = execFileSync('git', ['status', '--porcelain'], {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8'
      }).trim();

      // Criar tag leve no commit atual sem interpolação de shell
      execFileSync('git', ['tag', tagName, 'HEAD'], {
        cwd: this.projectRoot,
        stdio: 'ignore'
      });

      const entry = {
        tag: tagName,
        phase: safePhase,
        headCommit,
        hasUncommittedChanges: status.length > 0,
        createdAt: timestamp,
        date: new Date(timestamp).toISOString()
      };

      const checkpoints = this.listCheckpoints();
      checkpoints.push(entry);
      // Manter os últimos 20 checkpoints
      const trimmed = checkpoints.slice(-20);
      writeJsonAtomic(this.checkpointsFile, trimmed);

      return {
        ok: true,
        tag: tagName,
        commit: headCommit,
        message: `🛡️ Micro-checkpoint criado: ${tagName} (commit ${headCommit})`
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  getLatestCheckpoint() {
    const list = this.listCheckpoints();
    return list.length > 0 ? list[list.length - 1] : null;
  }

  rollback(targetTag) {
    if (!this._isGitRepo()) {
      return { ok: false, error: 'O projeto não é um repositório git.' };
    }

    const checkpoints = this.listCheckpoints();
    if (checkpoints.length === 0) {
      return { ok: false, error: 'Nenhum micro-checkpoint encontrado para restauração.' };
    }

    const tagToRestore = sanitizeGitToken(targetTag || checkpoints[checkpoints.length - 1].tag, '');
    const targetEntry = checkpoints.find(c => c.tag === tagToRestore);

    try {
      // Guardar trabalho quebrado no stash para segurança antes de reverter
      try {
        execFileSync('git', ['stash', 'push', '-m', `gsd-stash-before-rollback-${Date.now()}`], {
          cwd: this.projectRoot,
          stdio: 'ignore'
        });
      } catch {}

      // Restaurar árvore para o checkpoint
      const refToCheckout = sanitizeGitToken((targetEntry && (targetEntry.commit || targetEntry.headCommit)) || tagToRestore, 'HEAD');
      execFileSync('git', ['checkout', refToCheckout, '--', '.'], {
        cwd: this.projectRoot,
        stdio: 'ignore'
      });

      return {
        ok: true,
        tag: tagToRestore,
        message: `🔄 Rollback executado com sucesso para o checkpoint: ${tagToRestore} (código redefinido para o commit seguro).`
      };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }
}

module.exports = CheckpointEngine;
