#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit — Auto-Updater & Changelog Explainer (/gsd-agy-update)
 *
 * Verifica se o gsd-agy-kit está na última versão comparando SemVer + commits do GitHub,
 * explica detalhadamente as novas melhorias em Português (pt-BR) e atualiza o projeto
 * preservando configurações locais (.planning/config.json, MemPalace, snapshots).
 *
 * Uso:
 *   node .agents/kit/gsd-update.cjs --check          # Apenas verifica e explica melhorias
 *   node .agents/kit/gsd-update.cjs                  # Verifica, explica e pergunta se deseja atualizar
 *   node .agents/kit/gsd-update.cjs --yes            # Verifica, atualiza direto e explica melhorias
 *   node .agents/kit/gsd-update.cjs --check --json   # Saída estruturada em JSON
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const os = require('os');
const readline = require('readline');
const { spawnSync } = require('child_process');

const IS_TTY = Boolean(process.stdout.isTTY);
const C = {
  reset: IS_TTY ? '\x1b[0m' : '',
  bold: IS_TTY ? '\x1b[1m' : '',
  dim: IS_TTY ? '\x1b[2m' : '',
  green: IS_TTY ? '\x1b[32m' : '',
  bGreen: IS_TTY ? '\x1b[1;32m' : '',
  yellow: IS_TTY ? '\x1b[33m' : '',
  bYellow: IS_TTY ? '\x1b[1;33m' : '',
  cyan: IS_TTY ? '\x1b[36m' : '',
  bCyan: IS_TTY ? '\x1b[1;36m' : '',
  magenta: IS_TTY ? '\x1b[35m' : '',
  bMagenta: IS_TTY ? '\x1b[1;35m' : '',
  red: IS_TTY ? '\x1b[31m' : '',
  bRed: IS_TTY ? '\x1b[1;31m' : '',
  bWhite: IS_TTY ? '\x1b[1;37m' : ''
};

const SAFE_TOKEN_RE = /^[A-Za-z0-9_.-]+$/;
const REPO_OWNER = SAFE_TOKEN_RE.test(process.env.GSD_REPO_OWNER || '') ? process.env.GSD_REPO_OWNER : 'ARILSONLIMA';
const REPO_NAME = SAFE_TOKEN_RE.test(process.env.GSD_REPO_NAME || '') ? process.env.GSD_REPO_NAME : 'gsd-agy-kit';
const REPO_BRANCH = SAFE_TOKEN_RE.test(process.env.GSD_REPO_BRANCH || '') ? process.env.GSD_REPO_BRANCH : 'main';

const ALLOWED_HOSTS = new Set([
  'raw.githubusercontent.com',
  'api.github.com',
  'github.com',
  'codeload.github.com'
]);

/**
 * Compara duas versões SemVer (ex: "1.4.0" vs "1.5.0").
 * Retorna > 0 se vA > vB, < 0 se vA < vB, 0 se iguais.
 */
function compareSemver(vA, vB) {
  const cleanA = String(vA || '0.0.0').replace(/^v/i, '').split('-')[0];
  const cleanB = String(vB || '0.0.0').replace(/^v/i, '').split('-')[0];
  const partsA = cleanA.split('.').map(n => parseInt(n, 10) || 0);
  const partsB = cleanB.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const a = partsA[i] || 0;
    const b = partsB[i] || 0;
    if (a !== b) return a - b;
  }
  return 0;
}

/**
 * Requisição HTTPS GET segura restrita aos domínios oficiais do GitHub.
 */
function fetchHttpsText(urlString, timeoutMs = 8000, redirectsLeft = 3) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(urlString);
    } catch (err) {
      return reject(new Error(`URL inválida: ${urlString}`));
    }

    if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) {
      return reject(new Error(`Host não autorizado para atualização: ${parsed.hostname}`));
    }

    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': 'gsd-agy-kit-updater/1.5',
          Accept: 'application/vnd.github.v3+json, text/plain, */*'
        },
        timeout: timeoutMs
      },
      res => {
        if ([301, 302, 307, 308].includes(res.statusCode) && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) return reject(new Error('Limite de redirecionamentos excedido'));
          const nextUrl = new URL(res.headers.location, urlString).toString();
          return resolve(fetchHttpsText(nextUrl, timeoutMs, redirectsLeft - 1));
        }

        if (res.statusCode < 200 || res.statusCode >= 300) {
          res.resume();
          return reject(new Error(`HTTP ${res.statusCode} ao consultar ${parsed.hostname}${parsed.pathname}`));
        }

        const chunks = [];
        let totalBytes = 0;
        const maxBytes = 2 * 1024 * 1024; // Limite de 2MB para metadados/changelog
        res.on('data', chunk => {
          totalBytes += chunk.length;
          if (totalBytes <= maxBytes) chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('Timeout na requisição HTTPS'));
    });
    req.on('error', err => reject(err));
  });
}

/**
 * Extrai seções do CHANGELOG.md estruturadas por versão.
 */
function parseChangelogSections(changelogContent) {
  if (!changelogContent || typeof changelogContent !== 'string') return [];
  const lines = changelogContent.split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const match = line.match(/^##\s+\[?v?([0-9]+\.[0-9]+\.[0-9]+[^\]]*)\]?(?:\s*-\s*(.*))?$/i);
    if (match) {
      if (current) sections.push(current);
      current = {
        version: match[1].trim(),
        date: (match[2] || '').trim(),
        lines: []
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map(s => ({
    version: s.version,
    date: s.date,
    body: s.lines.join('\n').trim()
  }));
}

/**
 * Resolve o diretório raiz do projeto onde o kit está instalado (ou sendo executado).
 */
function resolveTargetProjectRoot(explicitDir) {
  const kitDir = path.resolve(__dirname);
  const isInstalledInAgents =
    kitDir.endsWith(path.join('.agents', 'kit')) ||
    kitDir.endsWith('/.agents/kit') ||
    kitDir.endsWith('\\.agents\\kit');

  if (explicitDir) {
    const resolved = path.resolve(explicitDir);
    if (resolved === kitDir && isInstalledInAgents) {
      return path.dirname(path.dirname(kitDir));
    }
    return resolved;
  }

  if (isInstalledInAgents) {
    return path.dirname(path.dirname(kitDir));
  }

  const cwd = process.cwd();
  if (cwd.endsWith(path.join('.agents', 'kit'))) {
    return path.dirname(path.dirname(cwd));
  }
  return cwd;
}

/**
 * Obtém informações da versão instalada localmente no projeto.
 */
function getLocalVersionInfo(projectRoot) {
  const kitDir = path.resolve(__dirname);
  const installedKitPkg = path.join(projectRoot, '.agents', 'kit', 'package.json');
  const installedMetaFile = path.join(projectRoot, '.agents', 'kit', '.installed-version.json');
  const rootPkg = path.join(projectRoot, 'package.json');
  const selfPkg = path.join(kitDir, 'package.json');

  let version = '0.0.0';
  let installedFrom = 'none';
  let commit = null;
  let updatedAt = null;

  if (fs.existsSync(installedMetaFile)) {
    try {
      const meta = JSON.parse(fs.readFileSync(installedMetaFile, 'utf8'));
      if (meta.version) version = meta.version;
      if (meta.commit) commit = meta.commit;
      if (meta.updatedAt) updatedAt = meta.updatedAt;
      installedFrom = '.agents/kit/.installed-version.json';
    } catch {}
  }

  if (fs.existsSync(installedKitPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(installedKitPkg, 'utf8'));
      if (pkg.name === 'gsd-agy-kit' && pkg.version) {
        if (compareSemver(pkg.version, version) >= 0) {
          version = pkg.version;
        }
        installedFrom = '.agents/kit/package.json';
      }
    } catch {}
  } else if (fs.existsSync(rootPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(rootPkg, 'utf8'));
      if (pkg.name === 'gsd-agy-kit' && pkg.version) {
        version = pkg.version;
        installedFrom = 'package.json (repositório do kit)';
      }
    } catch {}
  } else if (fs.existsSync(selfPkg)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(selfPkg, 'utf8'));
      if (pkg.name === 'gsd-agy-kit' && pkg.version) {
        version = pkg.version;
        installedFrom = 'self/package.json';
      }
    } catch {}
  }

  // Se não houver commit salvo e for o próprio repositório git do kit, lê HEAD
  if (!commit && installedFrom.includes('repositório do kit')) {
    try {
      const res = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: projectRoot, encoding: 'utf8', timeout: 3000 });
      if (res.status === 0 && res.stdout) {
        commit = res.stdout.trim();
      }
    } catch {}
  }

  // Lê changelog local como fallback
  const localChangelogCandidates = [
    path.join(projectRoot, '.agents', 'kit', 'CHANGELOG.md'),
    path.join(projectRoot, 'CHANGELOG.md'),
    path.join(kitDir, 'CHANGELOG.md')
  ];
  let localChangelog = '';
  for (const cand of localChangelogCandidates) {
    if (fs.existsSync(cand)) {
      try {
        localChangelog = fs.readFileSync(cand, 'utf8');
        break;
      } catch {}
    }
  }

  return {
    version,
    commit,
    updatedAt,
    installedFrom,
    localChangelog,
    isKitInstalledInProject: fs.existsSync(path.join(projectRoot, '.agents', 'kit'))
  };
}

/**
 * Consulta a versão remota e changelog no GitHub (com fallback gracioso).
 */
async function getRemoteVersionInfo() {
  const rawBase = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${REPO_BRANCH}`;
  const commitsApi = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/commits?sha=${REPO_BRANCH}&per_page=8`;

  let remoteVersion = null;
  let remoteChangelog = '';
  let recentCommits = [];
  let latestCommitSha = null;
  let networkError = null;

  const [pkgRes, changelogRes, commitsRes] = await Promise.allSettled([
    fetchHttpsText(`${rawBase}/package.json`),
    fetchHttpsText(`${rawBase}/CHANGELOG.md`),
    fetchHttpsText(commitsApi)
  ]);

  if (pkgRes.status === 'fulfilled') {
    try {
      const pkg = JSON.parse(pkgRes.value);
      if (pkg && pkg.version) remoteVersion = String(pkg.version).trim();
    } catch (e) {
      networkError = `Erro ao processar package.json remoto: ${e.message}`;
    }
  } else {
    networkError = pkgRes.reason ? pkgRes.reason.message : 'Falha de conexão com GitHub';
  }

  if (changelogRes.status === 'fulfilled') {
    remoteChangelog = changelogRes.value;
  }

  if (commitsRes.status === 'fulfilled') {
    try {
      const data = JSON.parse(commitsRes.value);
      if (Array.isArray(data)) {
        recentCommits = data.map(item => ({
          sha: String(item.sha || '').slice(0, 7),
          fullSha: String(item.sha || ''),
          message: String((item.commit && item.commit.message) || '').split(/\r?\n/)[0].trim(),
          date: String((item.commit && item.commit.author && item.commit.author.date) || '').slice(0, 10)
        })).filter(c => c.sha && c.message);
        if (recentCommits.length > 0) {
          latestCommitSha = recentCommits[0].sha;
        }
      }
    } catch {}
  }

  // Fallback via git ls-remote caso a API de commits tenha sofrido rate-limit
  if (!latestCommitSha) {
    try {
      const repoUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
      const lsRes = spawnSync('git', ['ls-remote', repoUrl, `refs/heads/${REPO_BRANCH}`], { encoding: 'utf8', timeout: 6000 });
      if (lsRes.status === 0 && lsRes.stdout) {
        const firstToken = lsRes.stdout.trim().split(/\s+/)[0];
        if (firstToken) latestCommitSha = firstToken.slice(0, 7);
      }
    } catch {}
  }

  return {
    remoteVersion,
    remoteChangelog,
    recentCommits,
    latestCommitSha,
    networkError
  };
}

/**
 * Executa a verificação completa comparando a instalação local com a versão mais recente.
 */
async function checkKitUpdate(projectRoot) {
  const local = getLocalVersionInfo(projectRoot);
  const remote = await getRemoteVersionInfo();

  // Verifica também se o kit em __dirname é mais novo que o instalado no projeto (útil para desenvolvimento local/offline)
  const selfPkgPath = path.join(__dirname, 'package.json');
  const selfChangelogPath = path.join(__dirname, 'CHANGELOG.md');
  let selfVersion = null;
  let selfChangelog = '';
  if (fs.existsSync(selfPkgPath)) {
    try {
      const sp = JSON.parse(fs.readFileSync(selfPkgPath, 'utf8'));
      if (sp.name === 'gsd-agy-kit' && sp.version) selfVersion = sp.version;
    } catch {}
  }
  if (fs.existsSync(selfChangelogPath)) {
    try { selfChangelog = fs.readFileSync(selfChangelogPath, 'utf8'); } catch {}
  }

  let effectiveRemoteVersion = remote.remoteVersion;
  let effectiveChangelog = remote.remoteChangelog || selfChangelog || local.localChangelog;
  let updateSource = 'github';

  if (selfVersion && (!effectiveRemoteVersion || compareSemver(selfVersion, effectiveRemoteVersion) > 0)) {
    effectiveRemoteVersion = selfVersion;
    if (selfChangelog) effectiveChangelog = selfChangelog;
    updateSource = 'local-kit';
  }

  if (!effectiveRemoteVersion) {
    return {
      ok: false,
      error: remote.networkError || 'Não foi possível consultar a versão remota no GitHub.',
      localVersion: local.version,
      remoteVersion: null,
      hasUpdate: false
    };
  }

  const semverDiff = compareSemver(effectiveRemoteVersion, local.version);
  const commitDiff = Boolean(
    semverDiff === 0 &&
    local.commit &&
    remote.latestCommitSha &&
    local.commit !== remote.latestCommitSha &&
    updateSource === 'github'
  );
  const hasUpdate = semverDiff > 0 || commitDiff || local.version === '0.0.0';

  const allSections = parseChangelogSections(effectiveChangelog);
  let relevantSections = allSections.filter(sec => compareSemver(sec.version, local.version) > 0);
  if (relevantSections.length === 0 && allSections.length > 0) {
    relevantSections = [allSections[0]];
  }

  return {
    ok: true,
    projectRoot,
    updateSource,
    localVersion: local.version,
    remoteVersion: effectiveRemoteVersion,
    localCommit: local.commit,
    remoteCommit: remote.latestCommitSha,
    updatedAt: local.updatedAt,
    hasUpdate,
    updateReason: semverDiff > 0
      ? `Nova versão disponível (${local.version} ➔ ${effectiveRemoteVersion})`
      : (commitDiff
          ? `Novos commits disponíveis na branch ${REPO_BRANCH} (${local.commit} ➔ ${remote.latestCommitSha})`
          : 'O Antigravity GSD Kit já está na versão mais recente'),
    changelogSections: relevantSections,
    recentCommits: remote.recentCommits.slice(0, 6),
    networkWarning: remote.networkError || null
  };
}

/**
 * Renderiza o relatório visual no terminal explicando a versão e as melhorias.
 */
function renderUpdateCheckReport(info) {
  console.log(`\n${C.bCyan}╭─ 🔄 Antigravity GSD Kit • Verificador de Atualização (/gsd-agy-update) ─╮${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  📂 Projeto Alvo:   ${C.bWhite}${info.projectRoot}${C.reset}`);
  console.log(`${C.bCyan}│${C.reset}  🏷️  Versão Local:   ${C.yellow}v${info.localVersion}${C.reset}${info.localCommit ? ` ${C.dim}(commit ${info.localCommit})${C.reset}` : ''}`);
  console.log(`${C.bCyan}│${C.reset}  🌐 Última Versão:  ${C.bGreen}v${info.remoteVersion}${C.reset}${info.remoteCommit ? ` ${C.dim}(commit ${info.remoteCommit})${C.reset}` : ''}`);
  console.log(`${C.bCyan}│${C.reset}  📡 Status:         ${info.hasUpdate ? `${C.bYellow}⚡ ATUALIZAÇÃO DISPONÍVEL!${C.reset}` : `${C.bGreen}✅ VOCÊ JÁ ESTÁ NA ÚLTIMA VERSÃO!${C.reset}`}`);
  console.log(`${C.bCyan}╰─────────────────────────────────────────────────────────────────────────╯${C.reset}`);

  if (info.changelogSections && info.changelogSections.length > 0) {
    const headerTitle = info.hasUpdate
      ? `✨ Novas Melhorias Disponíveis (${info.localVersion} ➔ ${info.remoteVersion}):`
      : `📋 Recursos e Melhorias da Versão Atual (v${info.localVersion}):`;
    console.log(`\n${C.bMagenta}${headerTitle}${C.reset}`);
    for (const sec of info.changelogSections) {
      const dateSuffix = sec.date ? ` ${C.dim}(${sec.date})${C.reset}` : '';
      console.log(`\n  ${C.bCyan}▸ Versão v${sec.version}${dateSuffix}${C.reset}`);
      const bodyLines = sec.body.split(/\r?\n/);
      for (const bl of bodyLines) {
        if (bl.startsWith('### ')) {
          console.log(`    ${C.bold}${bl.replace('### ', '')}${C.reset}`);
        } else if (bl.trim()) {
          console.log(`    ${bl}`);
        }
      }
    }
  }

  if (info.recentCommits && info.recentCommits.length > 0) {
    console.log(`\n${C.bCyan}📜 Últimos Commits no Repositório (${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}):${C.reset}`);
    for (const c of info.recentCommits.slice(0, 5)) {
      console.log(`   ${C.yellow}• [${c.sha}]${C.reset} ${c.message} ${C.dim}(${c.date})${C.reset}`);
    }
  }
  console.log('');
}

/**
 * Executa a atualização segura preservando configurações locais do usuário.
 */
function applyKitUpdate(projectRoot, checkInfo) {
  console.log(`\n${C.bCyan}🚀 Iniciando atualização segura do Antigravity GSD Kit para v${checkInfo.remoteVersion}...${C.reset}`);

  // 1. Ler e fazer snapshot de .planning/config.json para preservar preferências do usuário
  const configPath = path.join(projectRoot, '.planning', 'config.json');
  let savedConfig = null;
  let hasFrontend = false;
  if (fs.existsSync(configPath)) {
    try {
      savedConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      hasFrontend = Boolean(savedConfig.ui_phase === true || savedConfig.token_profile === 'full');
      console.log(`  ${C.green}✔${C.reset} Configurações locais de ${C.bold}.planning/config.json${C.reset} salvas em snapshot.`);
    } catch {}
  }

  const tmpBase = path.join(os.tmpdir(), `gsd-agy-kit-update-${process.pid}-${Date.now()}`);
  let sourceDirForInstall = null;

  try {
    // 2. Obter código-fonte atualizado (GitHub clone / tarball ou kit local se mais recente)
    if (checkInfo.updateSource === 'local-kit' && fs.existsSync(path.join(__dirname, 'setup-ui.cjs'))) {
      sourceDirForInstall = path.resolve(__dirname);
      console.log(`  ${C.green}✔${C.reset} Utilizando pacote atualizado local (${sourceDirForInstall}).`);
    } else {
      fs.mkdirSync(tmpBase, { recursive: true });
      const repoUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}.git`;
      const tarballUrl = `https://github.com/${REPO_OWNER}/${REPO_NAME}/archive/refs/heads/${REPO_BRANCH}.tar.gz`;

      console.log(`  ${C.cyan}⬇️  Baixando última versão de ${REPO_OWNER}/${REPO_NAME}@${REPO_BRANCH}...${C.reset}`);
      const gitRes = spawnSync('git', ['clone', '--depth', '1', '--branch', REPO_BRANCH, '--quiet', repoUrl, tmpBase], {
        encoding: 'utf8',
        timeout: 30000
      });

      if (gitRes.status !== 0) {
        const tarPath = path.join(tmpBase, 'kit.tar.gz');
        const curlRes = spawnSync('curl', ['-fsSL', tarballUrl, '-o', tarPath], { encoding: 'utf8', timeout: 30000 });
        if (curlRes.status !== 0) {
          throw new Error('Falha ao baixar atualização via git clone e curl.');
        }
        const tarRes = spawnSync('tar', ['-xzf', tarPath, '-C', tmpBase, '--strip-components=1'], { encoding: 'utf8', timeout: 15000 });
        if (tarRes.status !== 0) {
          throw new Error('Falha ao extrair arquivo de atualização.');
        }
        try { fs.unlinkSync(tarPath); } catch {}
      }

      sourceDirForInstall = tmpBase;
    }

    const installerScript = path.join(sourceDirForInstall, 'setup-ui.cjs');
    if (!fs.existsSync(installerScript)) {
      throw new Error(`Script setup-ui.cjs não encontrado no pacote de atualização (${installerScript}).`);
    }

    // 3. Executar instalador preservando modo Frontend/Backend
    const installArgs = [
      installerScript,
      projectRoot,
      '--install',
      hasFrontend ? '--frontend' : '--no-frontend',
      '--no-cleanup'
    ];

    console.log(`  ${C.cyan}⚙️  Aplicando atualização dos componentes, hooks, MCP, skills e subagentes...${C.reset}`);
    const instRes = spawnSync(process.execPath, installArgs, {
      cwd: projectRoot,
      stdio: 'inherit'
    });

    if (instRes.status !== 0) {
      throw new Error(`O instalador retornou código de saída ${instRes.status}.`);
    }

    // 4. Restaurar preferências customizadas do usuário em .planning/config.json
    if (savedConfig && fs.existsSync(configPath)) {
      try {
        const currentConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        const merged = {
          ...currentConfig,
          ...savedConfig,
          strict_errors: true,
          error_guard: { enabled: true, version: 1 },
          workflow: {
            ...(currentConfig.workflow || {}),
            ...(savedConfig.workflow || {})
          }
        };
        fs.writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf8');
        console.log(`  ${C.green}✔${C.reset} Preferências do usuário restauradas em ${C.bold}.planning/config.json${C.reset} (Modo Rigoroso de Erro ATIVO).`);
      } catch {}
    }

    // 5. Registrar metadados da versão instalada em .agents/kit/.installed-version.json
    const targetKitDir = path.join(projectRoot, '.agents', 'kit');
    if (fs.existsSync(targetKitDir)) {
      const versionMeta = {
        version: checkInfo.remoteVersion,
        commit: checkInfo.remoteCommit || checkInfo.localCommit || null,
        previousVersion: checkInfo.localVersion,
        updatedAt: new Date().toISOString(),
        repo: `${REPO_OWNER}/${REPO_NAME}`,
        branch: REPO_BRANCH
      };
      fs.writeFileSync(
        path.join(targetKitDir, '.installed-version.json'),
        JSON.stringify(versionMeta, null, 2) + '\n',
        'utf8'
      );
    }

    console.log(`\n${C.bGreen}╭─ 🎉 Atualização Concluída com Sucesso! ─────────────────────────────────╮${C.reset}`);
    console.log(`${C.bGreen}│${C.reset}  ✅ Versão anterior: ${C.dim}v${checkInfo.localVersion}${C.reset}  ➔  Nova versão ativa: ${C.bGreen}v${checkInfo.remoteVersion}${C.reset}`);
    console.log(`${C.bGreen}│${C.reset}  🛡️  MemPalace (.agents/memory), snapshots e config.json preservados.`);
    console.log(`${C.bGreen}│${C.reset}  🔄 Subagentes GSD, Hooks e Servidor MCP sincronizados.`);
    console.log(`${C.bGreen}│${C.reset}  🛑 Modo Rigoroso de Erros (ErrorGuard) ATIVO.`);
    console.log(`${C.bGreen}╰─────────────────────────────────────────────────────────────────────────╯${C.reset}\n`);

    return { ok: true, updatedFrom: checkInfo.localVersion, updatedTo: checkInfo.remoteVersion };
  } catch (err) {
    let ErrorGuard = null;
    try {
      ErrorGuard = require(path.join(projectRoot, '.agents', 'lib', 'error-guard.cjs'));
    } catch {
      try {
        ErrorGuard = require('./lib/error-guard.cjs');
      } catch {}
    }
    if (ErrorGuard) {
      ErrorGuard.emitError(projectRoot, {
        category: 'INSTALL',
        component: 'gsd-update',
        title: `Falha crítica durante a atualização do GSD Kit para v${checkInfo.remoteVersion}`,
        stderr: err.stack || err.message,
        hint: 'Verifique a conexão de rede ou permissões de escrita e execute "node setup-ui.cjs --install" para recuperar o workspace.',
        severity: 'error'
      });
    }
    throw err;
  } finally {
    if (fs.existsSync(tmpBase)) {
      try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch {}
    }
  }
}

function askYesNo(promptText) {
  return new Promise(resolve => {
    if (!process.stdin.isTTY || !process.stdout.isTTY) {
      return resolve(false);
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(promptText, answer => {
      rl.close();
      const clean = String(answer || '').trim().toLowerCase();
      resolve(clean === '' || clean === 's' || clean === 'sim' || clean === 'y' || clean === 'yes');
    });
  });
}

async function runCli() {
  const args = process.argv.slice(2);
  const isCheckOnly = args.includes('--check') || args.includes('-c');
  const isAutoYes = args.includes('--yes') || args.includes('-y') || args.includes('--apply');
  const isForce = args.includes('--force') || args.includes('-f');
  const isJson = args.includes('--json');

  const dirArg = args.find(a => !a.startsWith('-'));
  const projectRoot = resolveTargetProjectRoot(dirArg);

  const checkInfo = await checkKitUpdate(projectRoot);

  if (isJson) {
    process.stdout.write(JSON.stringify(checkInfo, null, 2) + '\n');
    return;
  }

  if (!checkInfo.ok) {
    console.error(`\n${C.bRed}❌ Erro ao verificar atualização:${C.reset} ${checkInfo.error}\n`);
    process.exit(1);
  }

  renderUpdateCheckReport(checkInfo);

  if (!checkInfo.hasUpdate && !isForce) {
    console.log(`${C.bGreen}✨ Nenhuma atualização necessária. Seu Antigravity GSD Kit (v${checkInfo.localVersion}) já está na última versão!${C.reset}\n`);
    return;
  }

  if (isCheckOnly && !isAutoYes) {
    if (checkInfo.hasUpdate) {
      console.log(`${C.bYellow}💡 Para aplicar esta atualização agora, execute:${C.reset}`);
      console.log(`   ${C.bWhite}node .agents/kit/gsd-update.cjs --yes${C.reset}\n`);
    }
    return;
  }

  if (!isAutoYes) {
    const confirmed = await askYesNo(`   ${C.bold}Deseja atualizar o Antigravity GSD Kit para v${checkInfo.remoteVersion} agora? [S/n]: ${C.reset}`);
    if (!confirmed) {
      console.log(`\n   ${C.dim}Atualização cancelada pelo usuário. Nenhuma alteração foi feita.${C.reset}\n`);
      return;
    }
  }

  applyKitUpdate(projectRoot, checkInfo);
}

if (require.main === module) {
  runCli().catch(err => {
    console.error(`\n${C.bRed}🛑 Falha inesperada no atualizador:${C.reset} ${err.message}\n`);
    process.exit(1);
  });
}

module.exports = {
  compareSemver,
  parseChangelogSections,
  getLocalVersionInfo,
  getRemoteVersionInfo,
  checkKitUpdate,
  applyKitUpdate
};
