#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function findSourceFiles(dir, extensions = ['.js', '.cjs', '.mjs', '.ts']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (!['node_modules', '.git', '.agents', 'graphify-out', 'coverage', 'dist'].includes(ent.name)) {
          walk(full);
        }
      } else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase();
        if (extensions.includes(ext)) {
          results.push(full);
        }
      }
    }
  }

  walk(dir);
  return results;
}

function checkSyntax(projectRoot, files) {
  const errors = [];
  for (const f of files) {
    const ext = path.extname(f).toLowerCase();
    try {
      if (['.js', '.cjs', '.mjs'].includes(ext)) {
        execSync(`node --check "${f}"`, { stdio: 'pipe' });
      }
    } catch (err) {
      errors.push({
        file: path.relative(projectRoot, f),
        error: (err.stderr ? err.stderr.toString() : err.message).trim()
      });
    }
  }
  return {
    checked_files: files.length,
    syntax_valid: errors.length === 0,
    errors
  };
}

function checkCodeQuality(projectRoot, files) {
  const issues = [];
  let sqlRisks = 0;
  let cyclomaticViolations = 0;
  let longFunctions = 0;

  for (const f of files) {
    const rel = path.relative(projectRoot, f);
    const content = fs.readFileSync(f, 'utf8');
    const lines = content.split(/\r?\n/);

    // Heurística de SQL Injection
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/db\.(prepare|query|exec|run|all|get)\s*\(/i.test(line)) {
        if (/\+/.test(line) || /\$\{/.test(line)) {
          if (!/WHERE.*=\s*\?/i.test(line) && !/VALUES\s*\(/i.test(line)) {
            sqlRisks++;
            issues.push({ file: rel, line: i + 1, type: 'SQL_INJECTION_RISK', desc: 'Concatenação/interpolação em query SQL' });
          }
        }
      }
    }

    // Heurística de Complexidade e Tamanho por Função
    let currentFn = null;
    let fnStart = 0;
    let braceDepth = 0;
    let complexity = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const fnMatch = line.match(/(?:function\s+([a-zA-Z0-9_$]+)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|([a-zA-Z0-9_$]+)\s*\([^)]*\)\s*\{)/);

      if (fnMatch && braceDepth === 0) {
        currentFn = fnMatch[1] || fnMatch[2] || fnMatch[3] || 'anonymous';
        fnStart = i + 1;
        complexity = 1;
      }

      if (currentFn) {
        if (/\b(if|else if|for|while|case|catch)\b|\?|\&\&|\|\|/.test(line)) {
          complexity++;
        }
        const opens = (line.match(/\{/g) || []).length;
        const closes = (line.match(/\}/g) || []).length;
        braceDepth += opens - closes;

        if (braceDepth <= 0 && opens > 0) {
          const fnLen = (i + 1) - fnStart;
          if (complexity > 15) {
            cyclomaticViolations++;
            issues.push({ file: rel, line: fnStart, type: 'HIGH_COMPLEXITY', desc: `Função '${currentFn}' tem complexidade estimada ${complexity} (>15)` });
          }
          if (fnLen > 60) {
            longFunctions++;
            issues.push({ file: rel, line: fnStart, type: 'LONG_METHOD', desc: `Função '${currentFn}' tem ${fnLen} linhas (>60)` });
          }
          currentFn = null;
          braceDepth = 0;
        }
      }
    }
  }

  return {
    sql_risks: sqlRisks,
    cyclomatic_violations: cyclomaticViolations,
    long_functions: longFunctions,
    total_smells: issues.length,
    issues: issues.slice(0, 5) // Mostra no máximo os 5 primeiros
  };
}

function runTests(projectRoot) {
  let testCmd = 'npm test';

  // Verifica scenario.json ou package.json
  const scnFile = path.join(projectRoot, 'scenario.json');
  if (fs.existsSync(scnFile)) {
    try {
      const scn = JSON.parse(fs.readFileSync(scnFile, 'utf8'));
      if (scn.test_command) {
        testCmd = Array.isArray(scn.test_command) ? scn.test_command.join(' ') : scn.test_command;
      }
    } catch {}
  } else if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    testCmd = 'go test ./...';
  }

  const t0 = Date.now();
  try {
    const stdout = execSync(testCmd, { cwd: projectRoot, stdio: 'pipe', encoding: 'utf8', timeout: 60000 });
    const dur = ((Date.now() - t0) / 1000).toFixed(2);
    return {
      command: testCmd,
      passed: true,
      duration_seconds: parseFloat(dur),
      summary: 'Todos os testes passaram com sucesso.',
      raw_output: stdout.trim().split(/\r?\n/).slice(-10).join('\n')
    };
  } catch (err) {
    const dur = ((Date.now() - t0) / 1000).toFixed(2);
    const out = (err.stdout || '') + '\n' + (err.stderr || '');
    return {
      command: testCmd,
      passed: false,
      duration_seconds: parseFloat(dur),
      summary: 'Falha na execução dos testes.',
      failing_snippet: out.trim().split(/\r?\n/).slice(-15).join('\n')
    };
  }
}

function runFullVerification(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const srcDirs = ['src', 'api/src', 'app', 'lib'].filter(d => fs.existsSync(path.join(root, d)));
  const targetDir = srcDirs.length > 0 ? path.join(root, srcDirs[0]) : root;

  const files = findSourceFiles(targetDir);
  const syntax = checkSyntax(root, files);
  const quality = checkCodeQuality(root, files);
  const tests = runTests(root);

  const allPassed = syntax.syntax_valid && quality.total_smells === 0 && tests.passed;

  return {
    status: allPassed ? 'PASS' : (tests.passed && syntax.syntax_valid ? 'WARN_CODE_QUALITY' : 'FAIL'),
    ready_to_complete: syntax.syntax_valid && tests.passed,
    syntax,
    quality,
    tests
  };
}

if (require.main === module) {
  const target = process.argv[2] || process.cwd();
  const res = runFullVerification(target);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ready_to_complete ? 0 : 1);
}

module.exports = { runFullVerification };
