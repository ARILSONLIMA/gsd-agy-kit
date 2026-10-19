'use strict';

/**
 * Antigravity GSD Kit - Env Skeleton & Secret Shield Engine
 * Inspeciona arquivos .env* de forma 100% segura, expondo apenas os nomes das
 * chaves e seu estado ([SET], [EMPTY], [PLACEHOLDER]) sem jamais ler ou vazar
 * valores sensíveis no contexto do LLM ou nos logs.
 * Também compara .env com .env.example para detectar variáveis obrigatórias ausentes.
 *
 * TODO(security): Local CLI/Stdio secret-masking utility; web auth/CSRF/CSP controls not applicable.
 */

const fs = require('fs');
const path = require('path');

const PLACEHOLDER_PATTERNS = /^(your[_-]|change[_-]?me|changeme|example|placeholder|xxx+|todo|replace[_-]?me|<.*>|\$\{.*\})$/i;

class EnvSkeletonEngine {
  constructor(projectRoot) {
    this.projectRoot = path.resolve(projectRoot || process.cwd());
  }

  _resolveSafePath(inputPath) {
    const candidate = path.resolve(this.projectRoot, String(inputPath || '.env'));
    const rootWithSep = this.projectRoot.endsWith(path.sep)
      ? this.projectRoot
      : this.projectRoot + path.sep;
    if (candidate !== this.projectRoot && !candidate.startsWith(rootWithSep)) {
      throw new Error('Acesso negado: caminho fora dos limites do projeto.');
    }
    return candidate;
  }

  _parseEnvKeysOnly(filePath) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split(/\r?\n/);
    const keys = [];
    const seen = new Set();

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!match) continue;

      const key = match[1];
      let rawVal = match[2].trim();

      // Remover comentários inline se não estiver entre aspas
      if (!rawVal.startsWith('"') && !rawVal.startsWith("'")) {
        const hashIdx = rawVal.indexOf(' #');
        if (hashIdx !== -1) {
          rawVal = rawVal.slice(0, hashIdx).trim();
        }
      } else if (
        (rawVal.startsWith('"') && rawVal.endsWith('"')) ||
        (rawVal.startsWith("'") && rawVal.endsWith("'"))
      ) {
        rawVal = rawVal.slice(1, -1).trim();
      }

      let status = 'SET';
      if (rawVal.length === 0) {
        status = 'EMPTY';
      } else if (PLACEHOLDER_PATTERNS.test(rawVal)) {
        status = 'PLACEHOLDER';
      }

      // Descartar rawVal imediatamente — nunca armazenar o valor real em memória/objeto de saída
      rawVal = null;

      if (!seen.has(key)) {
        seen.add(key);
        keys.push({
          key,
          line: i + 1,
          status
        });
      }
    }

    return keys;
  }

  inspect(targetFile) {
    const defaultEnvFiles = ['.env', '.env.local', '.env.development', '.env.production'];
    const exampleFiles = ['.env.example', '.env.sample', '.env.template'];

    let resolvedTarget = null;
    if (targetFile && String(targetFile).trim()) {
      try {
        resolvedTarget = this._resolveSafePath(targetFile);
      } catch (err) {
        return {
          ok: false,
          isError: true,
          message: `🛑 [Env Skeleton] ${err.message}`
        };
      }
    } else {
      for (const f of defaultEnvFiles) {
        const candidate = path.join(this.projectRoot, f);
        if (fs.existsSync(candidate)) {
          resolvedTarget = candidate;
          break;
        }
      }
    }

    // Localizar arquivo de exemplo para comparação de chaves ausentes
    let examplePath = null;
    for (const ex of exampleFiles) {
      const candidate = path.join(this.projectRoot, ex);
      if (fs.existsSync(candidate)) {
        examplePath = candidate;
        break;
      }
    }

    const envKeys = resolvedTarget ? this._parseEnvKeysOnly(resolvedTarget) : null;
    const exampleKeys = examplePath ? this._parseEnvKeysOnly(examplePath) : null;

    if (!envKeys && !exampleKeys) {
      return {
        ok: true,
        isError: false,
        keys: [],
        missingFromEnv: [],
        message: 'ℹ️ [Env Skeleton] Nenhum arquivo .env ou .env.example encontrado na raiz do projeto.'
      };
    }

    const activeList = envKeys || [];
    const activeSet = new Set(activeList.map(k => k.key));
    const missingFromEnv = [];

    if (exampleKeys) {
      for (const ek of exampleKeys) {
        if (!activeSet.has(ek.key)) {
          missingFromEnv.push(ek.key);
        }
      }
    }

    const relTarget = resolvedTarget ? path.relative(this.projectRoot, resolvedTarget) : '(ausente)';
    const lines = [
      `🔐 [Env Skeleton — Secret Shield] Arquivo: ${relTarget} (Valores 100% mascarados)`
    ];

    if (activeList.length > 0) {
      const setCount = activeList.filter(k => k.status === 'SET').length;
      const emptyCount = activeList.filter(k => k.status === 'EMPTY').length;
      const placeholderCount = activeList.filter(k => k.status === 'PLACEHOLDER').length;
      lines.push(`📊 Resumo: ${activeList.length} variável(is) | ${setCount} preenchida(s) | ${emptyCount} vazia(s) | ${placeholderCount} placeholder(s)`);
      lines.push('');
      for (const item of activeList) {
        lines.push(`  • L${item.line}: ${item.key}=[${item.status}]`);
      }
    } else if (exampleKeys && exampleKeys.length > 0) {
      const relEx = path.relative(this.projectRoot, examplePath);
      lines.push(`⚠️ Arquivo .env principal não encontrado. Estrutura baseada em ${relEx}:`);
      for (const item of exampleKeys) {
        lines.push(`  • L${item.line}: ${item.key}=[TEMPLATE]`);
      }
    }

    if (missingFromEnv.length > 0 && envKeys) {
      lines.push('');
      lines.push(`⚠️ Chaves presentes no .env.example mas AUSENTES em ${relTarget}:`);
      lines.push(`   ${missingFromEnv.join(', ')}`);
    }

    const msg = lines.join('\n');
    return {
      ok: true,
      isError: false,
      file: relTarget,
      keys: activeList,
      missingFromEnv,
      text: msg,
      message: msg
    };
  }
}

EnvSkeletonEngine.EnvSkeletonEngine = EnvSkeletonEngine;
module.exports = EnvSkeletonEngine;
