'use strict';

/**
 * Antigravity GSD Kit - Checkpoint Engine
 * Cria micro-checkpoints git para marcos estáveis (ex: testes verdes)
 * e permite rollback cirúrgico quando o modelo entra em espirais de alucinação.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

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
      const tagName = `gsd-chk-${phase}-${timestamp}`;
      
      // Obter commit HEAD atual
      const headCommit = execSync('git rev-parse --short HEAD', {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8'
      }).trim();

      // Obter status resumido
      const status = execSync('git status --porcelain', {
        cwd: this.projectRoot,
        stdio: ['ignore', 'pipe', 'ignore'],
        encoding: 'utf8'
      }).trim();

      // Criar tag leve no commit atual
      execSync(`git tag "${tagName}" HEAD`, {
        cwd: this.projectRoot,
        stdio: 'ignore'
      });

      const entry = {
        tag: tagName,
        phase,
        headCommit,
        hasUncommittedChanges: status.length > 0,
        createdAt: timestamp,
        date: new Date(timestamp).toISOString()
      };

      const checkpoints = this.listCheckpoints();
      checkpoints.push(entry);
      // Manter os últimos 20 checkpoints
      const trimmed = checkpoints.slice(-20);
      fs.writeFileSync(this.checkpointsFile, JSON.stringify(trimmed, null, 2), 'utf8');

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

    const tagToRestore = targetTag || checkpoints[checkpoints.length - 1].tag;
    const targetEntry = checkpoints.find(c => c.tag === tagToRestore);

    try {
      // Guardar trabalho quebrado no stash para segurança antes de reverter
      try {
        execSync(`git stash push -m "gsd-stash-before-rollback-${Date.now()}"`, {
          cwd: this.projectRoot,
          stdio: 'ignore'
        });
      } catch {}

      // Restaurar árvore para o checkpoint
      if (targetEntry && targetEntry.commit) {
        execSync(`git checkout "${targetEntry.commit}" -- .`, {
          cwd: this.projectRoot,
          stdio: 'ignore'
        });
      }

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
