'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, execFileSync, spawnSync } = require('child_process');

function readStdin(timeoutMs = 50) {
  if (process.stdin.isTTY) return Promise.resolve('');
  return new Promise((resolve) => {
    let data = '';
    const timer = setTimeout(() => {
      try { process.stdin.pause(); } catch {}
      resolve(data);
    }, timeoutMs);

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      clearTimeout(timer);
      resolve(data);
    });
    process.stdin.on('error', () => {
      clearTimeout(timer);
      resolve('');
    });
    try { process.stdin.resume(); } catch {
      clearTimeout(timer);
      resolve('');
    }
  });
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function main() {
  // Resolve project root (whether cwd is D:\apps\backend or D:\apps\backend\.agents)
  let projectRoot = process.cwd();
  if (!fs.existsSync(path.join(projectRoot, '.planning'))) {
    const parent = path.resolve(projectRoot, '..');
    if (fs.existsSync(path.join(parent, '.planning'))) {
      projectRoot = parent;
    }
  }

  const planningDir = path.join(projectRoot, '.planning');
  const configFile = path.join(planningDir, 'config.json');

  // Gate 0: GSD project config exists
  if (!fs.existsSync(configFile)) {
    process.exit(0);
  }

  // Gate 1: Check stdin if called as an agent hook
  const stdinData = (await readStdin(50)).trim();
  if (stdinData) {
    try {
      const payload = JSON.parse(stdinData);
      const toolName = payload.tool_name || payload.toolCall?.name || '';
      const command = payload.tool_input?.command || payload.toolCall?.args?.CommandLine || '';

      if (toolName) {
        const normalized = toolName.toLowerCase();
        if (!['run_command', 'bash', 'shell'].includes(normalized)) {
          process.exit(0);
        }
      }

      if (command) {
        const isCommit = /(git\s+(commit|merge|pull|rebase\s+--continue|cherry-pick)|gsd-tools\s+query\s+commit)/i.test(command);
        if (!isCommit) {
          process.exit(0);
        }
      }
    } catch {
      // If not valid JSON, ignore and proceed
    }
  }

  // Gate 2: Check inside a git repo
  try {
    execSync('git rev-parse --git-dir', { cwd: projectRoot, stdio: 'ignore' });
  } catch {
    process.exit(0);
  }

  // Gate 3: Check graphify config
  const config = safeReadJson(configFile);
  if (!config?.graphify?.enabled || !config?.graphify?.auto_update) {
    process.exit(0);
  }

  // Gate 4: Branch check (main/master/trunk or git.base_branch)
  let defaultBranch = config.git?.base_branch || '';
  if (!defaultBranch) {
    for (const cand of ['main', 'master', 'trunk']) {
      try {
        execFileSync('git', ['rev-parse', '--verify', cand], { cwd: projectRoot, stdio: 'ignore' });
        defaultBranch = cand;
        break;
      } catch {}
    }
  }

  let currentBranch = '';
  try {
    currentBranch = execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {}

  const allowAllBranches = config?.graphify?.all_branches !== false;
  if (!allowAllBranches && defaultBranch && currentBranch && currentBranch !== defaultBranch) {
    process.exit(0);
  }

  // Gate 5: Check graphify binary
  let graphifyBin = 'graphify';
  try {
    execSync('graphify --version', { stdio: 'ignore' });
  } catch {
    const homedir = os.homedir();
    const binName = process.platform === 'win32' ? 'graphify.exe' : 'graphify';
    const localBin = path.join(homedir, '.local', 'bin', binName);
    if (fs.existsSync(localBin)) {
      graphifyBin = localBin;
    } else {
      process.exit(0);
    }
  }

  // Gate 6: Lock check (Atomic acquisition via wx)
  const graphsDir = path.join(planningDir, 'graphs');
  fs.mkdirSync(graphsDir, { recursive: true });
  const lockFile = path.join(graphsDir, '.rebuild.lock');

  const tryAcquireLock = () => {
    try {
      fs.writeFileSync(lockFile, String(process.pid), { flag: 'wx' });
      return true;
    } catch {
      return false;
    }
  };

  if (!tryAcquireLock()) {
    try {
      const pidStr = fs.readFileSync(lockFile, 'utf8').trim();
      const pid = parseInt(pidStr, 10);
      if (pid && !isNaN(pid)) {
        try {
          process.kill(pid, 0);
          process.exit(0);
        } catch {
          try { fs.unlinkSync(lockFile); } catch {}
        }
      }
    } catch {}
    if (!tryAcquireLock()) {
      process.exit(0);
    }
  }

  let headSha = '';
  try {
    headSha = execSync('git rev-parse HEAD', { cwd: projectRoot, encoding: 'utf8' }).trim();
  } catch {}

  const statusFile = path.join(graphsDir, '.last-build-status.json');
  const msStart = Date.now();
  const tsStart = new Date().toISOString();

  // Write running status
  fs.writeFileSync(
    statusFile,
    JSON.stringify(
      {
        ts: tsStart,
        status: 'running',
        exit_code: null,
        duration_ms: null,
        head_at_build: headSha,
        graphify_version: null,
      },
      null,
      2
    ) + '\n'
  );

  let exitCode = 1;
  let version = null;
  try {
    const vRes = spawnSync(graphifyBin, ['--version'], { encoding: 'utf8' });
    if (vRes.status === 0) {
      version = vRes.stdout.trim();
    }
  } catch {}

  let lastStderr = '';
  try {
    const res = spawnSync(graphifyBin, ['update', '.'], {
      cwd: projectRoot,
      stdio: 'pipe',
      encoding: 'utf8',
    });
    exitCode = res.status ?? 1;
    lastStderr = (res.stderr || res.stdout || '').trim();

    if (exitCode === 0) {
      const outDir = path.join(projectRoot, 'graphify-out');
      if (fs.existsSync(outDir)) {
        try {
          const entries = fs.readdirSync(outDir);
          for (const entry of entries) {
            const srcPath = path.join(outDir, entry);
            const destPath = path.join(graphsDir, entry);
            try {
              fs.copyFileSync(srcPath, destPath);
              fs.unlinkSync(srcPath);
            } catch {}
          }
          fs.rmSync(outDir, { recursive: true, force: true });
        } catch {}
      }

      const targetGraph = path.join(graphsDir, 'graph.json');
      const snapshotTarget = path.join(graphsDir, '.last-build-snapshot.json');
      if (fs.existsSync(targetGraph)) {
        fs.copyFileSync(targetGraph, snapshotTarget);
      }

      try {
        const gsdTools = path.join(projectRoot, '.agents', 'gsd-core', 'bin', 'gsd-tools.cjs');
        if (fs.existsSync(gsdTools)) {
          spawnSync(process.execPath, [gsdTools, 'graphify', 'build', 'snapshot'], {
            cwd: projectRoot,
            stdio: 'ignore',
          });
        }
      } catch {}
    } else {
      let ErrorGuard = null;
      try {
        ErrorGuard = require('./lib/error-guard.cjs');
      } catch {
        try {
          ErrorGuard = require(path.join(projectRoot, '.agents', 'lib', 'error-guard.cjs'));
        } catch {}
      }
      if (ErrorGuard) {
        ErrorGuard.recordError(projectRoot, {
          source: 'graphify-update',
          message: 'Falha ao atualizar grafo Graphify',
          stderr: lastStderr || `Graphify encerrou com código ${exitCode}`,
          remediation: 'Execute "graphify update . && node .agents/kit/gsd-graphify-update.cjs" para atualizar e sincronizar o grafo.',
          fatal: false
        });
      }
      process.stderr.write(`[gsd-graphify-update] ❌ Falha na atualização do grafo (exit ${exitCode}):\n${lastStderr}\n`);
    }
  } catch (err) {
    exitCode = 1;
    lastStderr = err.stack || err.message;
    process.stderr.write(`[gsd-graphify-update] ❌ Exceção ao executar graphify: ${lastStderr}\n`);
  }

  const msEnd = Date.now();
  const duration = msEnd - msStart;
  const tsEnd = new Date().toISOString();

  // Final status
  fs.writeFileSync(
    statusFile,
    JSON.stringify(
      {
        ts: tsEnd,
        status: exitCode === 0 ? 'ok' : 'failed',
        exit_code: exitCode,
        duration_ms: duration,
        head_at_build: headSha,
        graphify_version: version,
        error_detail: exitCode === 0 ? null : lastStderr
      },
      null,
      2
    ) + '\n'
  );

  // Release lock
  try {
    if (fs.existsSync(lockFile)) {
      fs.unlinkSync(lockFile);
    }
  } catch {}

  const isHookInvocation = Boolean(stdinData);
  if (isHookInvocation) {
    process.exit(0);
  } else {
    process.exit(exitCode);
  }
}

main().catch(err => {
  process.stderr.write(`[gsd-graphify-update] ❌ Erro fatal: ${err.message}\n`);
  process.exit(1);
});
