'use strict';

/**
 * Antigravity GSD Kit - Test Isolate Engine
 * Detecta falhas em testes e gera comandos cirúrgicos para reexecutar apenas
 * os testes que falharam, evitando rodar a suíte inteira durante iterações de TDD.
 */

const fs = require('fs');
const path = require('path');

class TestIsolate {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
    this.cacheDir = path.join(this.projectRoot, '.agents', '.cache');
    this.failedTestsFile = path.join(this.cacheDir, 'failed-tests.json');
    this.lastStatusFile = path.join(this.cacheDir, 'last-test-status.json');
    try {
      if (!fs.existsSync(this.cacheDir)) fs.mkdirSync(this.cacheDir, { recursive: true });
    } catch {}
  }

  detectRunner() {
    const pkgPath = path.join(this.projectRoot, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
        const testScript = (pkg.scripts && pkg.scripts.test) || '';
        if (testScript.includes('node --test')) return 'node';
        if (testScript.includes('vitest')) return 'vitest';
        if (testScript.includes('jest')) return 'jest';
        return 'npm';
      } catch {}
    }
    if (fs.existsSync(path.join(this.projectRoot, 'go.mod'))) return 'go';
    if (
      fs.existsSync(path.join(this.projectRoot, 'pytest.ini')) ||
      fs.existsSync(path.join(this.projectRoot, 'setup.cfg')) ||
      fs.existsSync(path.join(this.projectRoot, 'pyproject.toml'))
    ) return 'pytest';
    if (fs.existsSync(path.join(this.projectRoot, 'Cargo.toml'))) return 'cargo';
    return 'node';
  }

  parseFailures(output) {
    if (!output || typeof output !== 'string') return [];
    const failures = new Set();
    const lines = output.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();

      // Node --test (TAP ou spec)
      // ex: ✖ Scenario 10 - Circuit Breaker (102ms)
      // ex: not ok 2 - Scenario 10 - Circuit Breaker
      const nodeMatch = trimmed.match(/^(?:✖|not ok \d+\s*-?)\s+(.*?)(?:\s+\(\d+.*?\))?$/i);
      if (nodeMatch && nodeMatch[1]) {
        failures.add(nodeMatch[1].trim());
        continue;
      }

      // Jest / Vitest
      // ex: ✕ should reject invalid email
      // ex: ● TestSuite › should pass
      const jestMatch = trimmed.match(/^(?:✕|●)\s+(?:.*?›\s*)?(.*?)$/i);
      if (jestMatch && jestMatch[1]) {
        failures.add(jestMatch[1].trim());
        continue;
      }

      // Go test
      // ex: --- FAIL: TestConcurrentQueue (0.01s)
      const goMatch = trimmed.match(/^---\s+FAIL:\s+([A-Za-z0-9_]+)/);
      if (goMatch && goMatch[1]) {
        failures.add(goMatch[1].trim());
        continue;
      }

      // Pytest
      // ex: FAILED tests/test_queue.py::test_fifo_ordering - AssertionError
      const pyMatch = trimmed.match(/^FAILED\s+[^:]+::([A-Za-z0-9_]+)/);
      if (pyMatch && pyMatch[1]) {
        failures.add(pyMatch[1].trim());
        continue;
      }
    }

    return Array.from(failures);
  }

  recordFailures(failures, command = '') {
    if (!Array.isArray(failures) || failures.length === 0) return;
    const data = {
      timestamp: Date.now(),
      command,
      failures
    };
    try {
      fs.writeFileSync(this.failedTestsFile, JSON.stringify(data, null, 2), 'utf8');
      fs.writeFileSync(this.lastStatusFile, JSON.stringify({ passed: false, timestamp: Date.now(), failuresCount: failures.length }), 'utf8');
    } catch {}
  }

  recordSuccess(command = '') {
    try {
      if (fs.existsSync(this.failedTestsFile)) fs.unlinkSync(this.failedTestsFile);
      fs.writeFileSync(this.lastStatusFile, JSON.stringify({ passed: true, timestamp: Date.now(), failuresCount: 0 }), 'utf8');
    } catch {}
  }

  getFailedTests() {
    if (!fs.existsSync(this.failedTestsFile)) return [];
    try {
      const data = JSON.parse(fs.readFileSync(this.failedTestsFile, 'utf8'));
      return data.failures || [];
    } catch {
      return [];
    }
  }

  getIsolatedCommand(customRunner) {
    const runner = customRunner && customRunner !== 'auto' ? customRunner : this.detectRunner();
    const failures = this.getFailedTests();

    if (failures.length === 0) {
      return {
        hasFailed: false,
        message: 'Nenhum teste falho registrado recentemente. Pode executar a suíte normal.',
        suggestedCommand: runner === 'go' ? 'go test ./...' : (runner === 'pytest' ? 'pytest' : 'npm test')
      };
    }

    const firstFailure = failures[0];
    let cmd = '';

    if (runner === 'node') {
      cmd = `node --test --test-name-pattern="${firstFailure}"`;
    } else if (runner === 'jest' || runner === 'npm') {
      cmd = `npm test -- -t "${firstFailure}"`;
    } else if (runner === 'vitest') {
      cmd = `npx vitest run -t "${firstFailure}"`;
    } else if (runner === 'go') {
      cmd = `go test -run "^${firstFailure}$" ./...`;
    } else if (runner === 'pytest') {
      cmd = `pytest -k "${firstFailure}"`;
    } else {
      cmd = `npm test -- -t "${firstFailure}"`;
    }

    return {
      hasFailed: true,
      failuresCount: failures.length,
      failures,
      runner,
      targetTest: firstFailure,
      suggestedCommand: cmd,
      message: `🎯 ${failures.length} teste(s) falharam no run anterior. Execute o comando cirúrgico:\n   ${cmd}`
    };
  }
}

module.exports = TestIsolate;
