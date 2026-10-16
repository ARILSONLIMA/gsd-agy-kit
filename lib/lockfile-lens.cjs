'use strict';

/**
 * Antigravity GSD Kit - Lockfile Lens
 * Inspeção cirúrgica de dependências e versões sem despejar lockfiles de 50k linhas no contexto.
 * Suporta Node (npm, pnpm, yarn), Go (go.mod, go.sum), Rust (Cargo) e Python (requirements, poetry).
 */

const fs = require('fs');
const path = require('path');

class LockfileLens {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
  }

  inspect(packageName) {
    if (!packageName || typeof packageName !== 'string') {
      return { found: false, message: 'Nome de pacote inválido.' };
    }

    const pkg = packageName.trim().toLowerCase();
    let results = [];

    // Checar na raiz do projeto
    this._collectResults(this.projectRoot, pkg, results);

    // Se não encontrou na raiz, procurar em subpastas comuns (ex: backend, frontend, server, app)
    if (results.length === 0) {
      const commonSubdirs = ['backend', 'frontend', 'server', 'client', 'api', 'app', 'services'];
      for (const sub of commonSubdirs) {
        const subPath = path.join(this.projectRoot, sub);
        if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
          this._collectResults(subPath, pkg, results, sub);
        }
      }
    }

    if (results.length === 0) {
      return {
        found: false,
        message: `Pacote "${packageName}" não encontrado em nenhum manifesto ou lockfile do projeto.`
      };
    }

    return {
      found: true,
      details: results,
      message: results.map(r => r.summary).join('\n')
    };
  }

  _collectResults(dir, pkg, results, prefix = '') {
    const nodeRes = this._checkNode(dir, pkg, prefix);
    if (nodeRes) results.push(nodeRes);

    const goRes = this._checkGo(dir, pkg, prefix);
    if (goRes) results.push(goRes);

    const rustRes = this._checkRust(dir, pkg, prefix);
    if (rustRes) results.push(rustRes);

    const pyRes = this._checkPython(dir, pkg, prefix);
    if (pyRes) results.push(pyRes);

    const phpRes = this._checkPhp(dir, pkg, prefix);
    if (phpRes) results.push(phpRes);

    const rubyRes = this._checkRuby(dir, pkg, prefix);
    if (rubyRes) results.push(rubyRes);

    const dartRes = this._checkDart(dir, pkg, prefix);
    if (dartRes) results.push(dartRes);

    const elixirRes = this._checkElixir(dir, pkg, prefix);
    if (elixirRes) results.push(elixirRes);
  }

  _checkNode(dir, pkg, prefix = '') {
    const pkgJsonPath = path.join(dir, 'package.json');
    if (!fs.existsSync(pkgJsonPath)) return null;

    let declaredType = null;
    let declaredVersion = null;

    try {
      const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
      if (pkgJson.dependencies && pkgJson.dependencies[pkg]) {
        declaredType = 'dependencies';
        declaredVersion = pkgJson.dependencies[pkg];
      } else if (pkgJson.devDependencies && pkgJson.devDependencies[pkg]) {
        declaredType = 'devDependencies';
        declaredVersion = pkgJson.devDependencies[pkg];
      } else if (pkgJson.peerDependencies && pkgJson.peerDependencies[pkg]) {
        declaredType = 'peerDependencies';
        declaredVersion = pkgJson.peerDependencies[pkg];
      }
    } catch {}

    // Checar resolved no package-lock.json (apenas streaming/regex leve para não explodir memória)
    let resolvedVersion = null;
    const lockPath = path.join(dir, 'package-lock.json');
    if (fs.existsSync(lockPath)) {
      try {
        const content = fs.readFileSync(lockPath, 'utf8');
        // Procurar no bloco "node_modules/pkg": { "version": "x.y.z" }
        const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(`"node_modules\\/${escapedPkg}":\\s*\\{[^}]*?"version":\\s*"([^"]+)"`, 'm');
        const match = content.match(regex);
        if (match) {
          resolvedVersion = match[1];
        } else {
          // Fallback formato v1 / dependencies
          const regV1 = new RegExp(`"${escapedPkg}":\\s*\\{[^}]*?"version":\\s*"([^"]+)"`, 'm');
          const m1 = content.match(regV1);
          if (m1) resolvedVersion = m1[1];
        }
      } catch {}
    }

    if (!declaredType && !resolvedVersion) return null;

    const versionStr = resolvedVersion ? `v${resolvedVersion} (resolvido)` : (declaredVersion || 'versão desconhecida');
    const typeStr = declaredType ? `[${declaredType}]` : '[transitivo/indireto]';
    const tag = prefix ? `[${prefix}/NPM]` : `[NPM]`;

    return {
      ecosystem: 'npm',
      scope: prefix || 'root',
      package: pkg,
      version: resolvedVersion || declaredVersion,
      type: declaredType || 'transitive',
      summary: `📦 ${tag} ${pkg}@${versionStr} ${typeStr}`
    };
  }

  _checkGo(dir, pkg, prefix = '') {
    const goModPath = path.join(dir, 'go.mod');
    if (!fs.existsSync(goModPath)) return null;

    try {
      const content = fs.readFileSync(goModPath, 'utf8');
      const lines = content.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.includes(pkg)) {
          const parts = trimmed.split(/\s+/);
          const idx = parts.findIndex(p => p.toLowerCase().includes(pkg));
          if (idx !== -1 && parts[idx + 1]) {
            const isIndirect = trimmed.includes('// indirect');
            const tag = prefix ? `[${prefix}/Go]` : `[Go]`;
            return {
              ecosystem: 'go',
              scope: prefix || 'root',
              package: parts[idx],
              version: parts[idx + 1],
              type: isIndirect ? 'indirect' : 'direct',
              summary: `🐹 ${tag} ${parts[idx]} ${parts[idx + 1]} ${isIndirect ? '(// indirect)' : '(direct)'}`
            };
          }
        }
      }
    } catch {}
    return null;
  }

  _checkRust(dir, pkg, prefix = '') {
    const cargoTomlPath = path.join(dir, 'Cargo.toml');
    if (!fs.existsSync(cargoTomlPath)) return null;

    try {
      const content = fs.readFileSync(cargoTomlPath, 'utf8');
      const escapedPkg = pkg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const reg = new RegExp(`^${escapedPkg}\\s*=\\s*(.+)$`, 'im');
      const match = content.match(reg);
      if (match) {
        const tag = prefix ? `[${prefix}/Cargo]` : `[Cargo]`;
        return {
          ecosystem: 'cargo',
          scope: prefix || 'root',
          package: pkg,
          version: match[1].trim(),
          type: 'direct',
          summary: `🦀 ${tag} ${pkg} = ${match[1].trim()}`
        };
      }
    } catch {}
    return null;
  }

  _checkPython(dir, pkg, prefix = '') {
    const reqPath = path.join(dir, 'requirements.txt');
    if (fs.existsSync(reqPath)) {
      try {
        const content = fs.readFileSync(reqPath, 'utf8');
        const lines = content.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.toLowerCase().startsWith(pkg)) {
            const tag = prefix ? `[${prefix}/Python]` : `[Python]`;
            return {
              ecosystem: 'python',
              scope: prefix || 'root',
              package: pkg,
              version: trimmed,
              type: 'direct',
              summary: `🐍 ${tag} ${trimmed}`
            };
          }
        }
      } catch {}
    }
    return null;
  }

  _checkPhp(dir, pkg, prefix = '') {
    const composerPath = path.join(dir, 'composer.json');
    if (!fs.existsSync(composerPath)) return null;
    try {
      const data = JSON.parse(fs.readFileSync(composerPath, 'utf8'));
      let version = (data.require && data.require[pkg]) || (data['require-dev'] && data['require-dev'][pkg]);
      if (version) {
        const tag = prefix ? `[${prefix}/PHP]` : `[PHP]`;
        return {
          ecosystem: 'php',
          scope: prefix || 'root',
          package: pkg,
          version: version,
          type: 'direct',
          summary: `🐘 ${tag} ${pkg} @ ${version}`
        };
      }
    } catch {}
    return null;
  }

  _checkRuby(dir, pkg, prefix = '') {
    const gemfilePath = path.join(dir, 'Gemfile');
    if (!fs.existsSync(gemfilePath)) return null;
    try {
      const content = fs.readFileSync(gemfilePath, 'utf8');
      const regex = new RegExp(`gem\\s+['"]${pkg}['"](?:\\s*,\\s*['"]([^'"]+)['"])?`, 'i');
      const match = content.match(regex);
      if (match) {
        const version = match[1] || 'any';
        const tag = prefix ? `[${prefix}/Ruby]` : `[Ruby]`;
        return {
          ecosystem: 'ruby',
          scope: prefix || 'root',
          package: pkg,
          version: version,
          type: 'direct',
          summary: `💎 ${tag} ${pkg} @ ${version}`
        };
      }
    } catch {}
    return null;
  }

  _checkDart(dir, pkg, prefix = '') {
    const pubspecPath = path.join(dir, 'pubspec.yaml');
    if (!fs.existsSync(pubspecPath)) return null;
    try {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const regex = new RegExp(`^\\s*${pkg}:\\s*([^\\r\\n]+)`, 'mi');
      const match = content.match(regex);
      if (match) {
        const version = match[1].trim();
        const tag = prefix ? `[${prefix}/Dart]` : `[Dart]`;
        return {
          ecosystem: 'dart',
          scope: prefix || 'root',
          package: pkg,
          version: version,
          type: 'direct',
          summary: `🎯 ${tag} ${pkg} @ ${version}`
        };
      }
    } catch {}
    return null;
  }

  _checkElixir(dir, pkg, prefix = '') {
    const mixPath = path.join(dir, 'mix.exs');
    if (!fs.existsSync(mixPath)) return null;
    try {
      const content = fs.readFileSync(mixPath, 'utf8');
      const regex = new RegExp(`{:${pkg},\\s*["']([^"']+)["']`, 'i');
      const match = content.match(regex);
      if (match) {
        const version = match[1];
        const tag = prefix ? `[${prefix}/Elixir]` : `[Elixir]`;
        return {
          ecosystem: 'elixir',
          scope: prefix || 'root',
          package: pkg,
          version: version,
          type: 'direct',
          summary: `💧 ${tag} ${pkg} @ ${version}`
        };
      }
    } catch {}
    return null;
  }
}

module.exports = LockfileLens;
