'use strict';

/**
 * Antigravity GSD Kit - Token Savings & ROI Tracker
 * Registra e contabiliza a economia real de tokens gerada pelos motores do kit:
 * - auto_slice: corte proativo de leituras grandes no view_file
 * - dedup_block: bloqueio de releituras idênticas consecutivas
 * - command_limiter: limitação automática de comandos prolixos (git log, find, docker, npm)
 * - test_isolate: substituição de suíte completa por teste cirúrgico isolado
 * - output_sanitizer: truncamento de saídas extensas no estilo Headroom
 * - session_briefing: briefing compacto em SessionStart evitando leituras brutas iniciais
 * - secret_shield: bloqueio de exposição de arquivos .env com redirecionamento para env_skeleton
 *
 * TODO(security): Local CLI/Stdio telemetry module; web session/CSRF/CSP controls are not applicable.
 */

const fs = require('fs');
const path = require('path');

function writeJsonAtomic(filePath, data) {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const tmpFile = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf8');
    fs.renameSync(tmpFile, filePath);
  } catch {}
}

function withFileLock(filePath, action, maxRetries = 6) {
  const lockPath = `${filePath}.lock`;
  let acquired = false;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.closeSync(fd);
      acquired = true;
      break;
    } catch (e) {
      if (e.code === 'EEXIST') {
        try {
          const stat = fs.statSync(lockPath);
          if (Date.now() - stat.mtimeMs > 3000) {
            try { fs.unlinkSync(lockPath); } catch {}
            continue;
          }
        } catch {}
        const sleepMs = 15 + Math.floor(Math.random() * 25);
        try {
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, sleepMs);
        } catch {}
      } else {
        break;
      }
    }
  }

  try {
    return action();
  } finally {
    if (acquired) {
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
}

const DEFAULT_CATEGORIES = {
  auto_slice: { events: 0, tokensSaved: 0, label: 'Smart-Assist Auto-Slicing (view_file)' },
  dedup_block: { events: 0, tokensSaved: 0, label: 'Deduplicação de Leituras Recentes' },
  command_limiter: { events: 0, tokensSaved: 0, label: 'Auto-Limitador de Comandos Prolixos' },
  test_isolate: { events: 0, tokensSaved: 0, label: 'Auto-Isolamento Proativo de Testes' },
  output_sanitizer: { events: 0, tokensSaved: 0, label: 'Truncamento Headroom (Output Sanitizer)' },
  session_briefing: { events: 0, tokensSaved: 0, label: 'Briefing Zero-Read (SessionStart)' },
  secret_shield: { events: 0, tokensSaved: 0, label: 'Secret Shield & Env Skeleton' }
};

class TokenSavingsTracker {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot || process.cwd());
    this.cacheDir = path.join(this.projectRoot, '.agents', '.cache');
    this.savingsFile = path.join(this.cacheDir, 'token-savings.json');
    try {
      if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {}
  }

  _load() {
    const base = {
      updatedAt: Date.now(),
      totalEvents: 0,
      totalTokensSaved: 0,
      categories: JSON.parse(JSON.stringify(DEFAULT_CATEGORIES))
    };

    if (!fs.existsSync(this.savingsFile)) return base;
    try {
      const raw = JSON.parse(fs.readFileSync(this.savingsFile, 'utf8'));
      if (!raw || typeof raw !== 'object') return base;
      const mergedCategories = JSON.parse(JSON.stringify(DEFAULT_CATEGORIES));
      if (raw.categories && typeof raw.categories === 'object') {
        for (const [k, v] of Object.entries(raw.categories)) {
          if (mergedCategories[k] && v && typeof v === 'object') {
            mergedCategories[k].events = Number(v.events || 0);
            mergedCategories[k].tokensSaved = Number(v.tokensSaved || 0);
          } else if (v && typeof v === 'object') {
            mergedCategories[k] = {
              events: Number(v.events || 0),
              tokensSaved: Number(v.tokensSaved || 0),
              label: String(v.label || k)
            };
          }
        }
      }
      let totalEvents = 0;
      let totalTokensSaved = 0;
      for (const cat of Object.values(mergedCategories)) {
        totalEvents += cat.events;
        totalTokensSaved += cat.tokensSaved;
      }
      return {
        updatedAt: raw.updatedAt || Date.now(),
        totalEvents,
        totalTokensSaved,
        categories: mergedCategories
      };
    } catch {
      return base;
    }
  }

  recordSaving(category, estimatedTokensSaved = 500) {
    const tokens = Math.max(10, Math.round(Number(estimatedTokensSaved) || 500));
    try {
      return withFileLock(this.savingsFile, () => {
        const data = this._load();
        const catKey = String(category || 'auto_slice').replace(/[^a-zA-Z0-9_-]/g, '_');
        if (!data.categories[catKey]) {
          data.categories[catKey] = {
            events: 0,
            tokensSaved: 0,
            label: catKey
          };
        }
        data.categories[catKey].events += 1;
        data.categories[catKey].tokensSaved += tokens;
        data.totalEvents += 1;
        data.totalTokensSaved += tokens;
        data.updatedAt = Date.now();
        writeJsonAtomic(this.savingsFile, data);
        return data;
      });
    } catch {
      return null;
    }
  }

  record(category, estimatedTokensSaved = 500) {
    return this.recordSaving(category, estimatedTokensSaved);
  }

  getSummary() {
    const data = this._load();
    const topCategories = Object.entries(data.categories || {})
      .filter(([, v]) => v && v.events > 0)
      .map(([category, v]) => ({
        category,
        events: v.events,
        tokensSaved: v.tokensSaved,
        label: v.label || category
      }))
      .sort((a, b) => b.tokensSaved - a.tokensSaved);
    return {
      ...data,
      topCategories
    };
  }
}

TokenSavingsTracker.TokenSavingsTracker = TokenSavingsTracker;
module.exports = TokenSavingsTracker;
