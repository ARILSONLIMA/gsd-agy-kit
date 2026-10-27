#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { execSync, execFileSync } = require('child_process');

function findLibModule(projectRoot, name) {
  const candidates = [
    path.resolve(__dirname, 'lib', name),
    path.resolve(__dirname, 'kit', 'lib', name),
    path.join(projectRoot, '.agents', 'lib', name),
    path.join(projectRoot, '.agents', 'kit', 'lib', name),
    path.join(projectRoot, 'lib', name)
  ];
  return candidates.find(p => fs.existsSync(p)) || null;
}

function findSourceFiles(dir, extensions = ['.js', '.cjs', '.mjs', '.ts']) {
  const results = [];
  if (!fs.existsSync(dir)) return results;

  function walk(current) {
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const ent of entries) {
      const full = path.join(current, ent.name);
      if (ent.isDirectory()) {
        if (!['node_modules', '.git', '.agents', '.spine', 'graphify-out', 'coverage', 'dist'].includes(ent.name)) {
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
        execFileSync(process.execPath, ['--check', f], { stdio: 'pipe' });
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
  let deepNestingViolations = 0;
  let duplicatedBlocks = 0;

  // 1. SecurityLinter unificado (Anti-SQL Injection)
  const secMod = findLibModule(projectRoot, 'security-linter.cjs');
  if (secMod) {
    try {
      const SecurityLinter = require(secMod);
      const linter = new SecurityLinter(projectRoot);
      const secIssues = linter.scanFiles(files).filter(i => i.severity === 'CRITICAL');
      sqlRisks = secIssues.length;
      for (const s of secIssues) {
        issues.push({
          file: path.relative(projectRoot, s.file),
          line: s.line,
          type: 'SQL_INJECTION_RISK',
          desc: s.message
        });
      }
    } catch {}
  }

  // 2. ComplexityGuard unificado (mesmos thresholds do Stop Gate e do benchmark estático: 48 linhas, 3 níveis, CC 14)
  const compMod = findLibModule(projectRoot, 'complexity-guard.cjs');
  if (compMod) {
    try {
      const ComplexityGuard = require(compMod);
      const guard = new ComplexityGuard({ maxLines: 48, maxNesting: 3, maxComplexity: 14 });
      const smells = guard.scanFiles(files);
      for (const s of smells) {
        if (s.type === 'high_complexity') cyclomaticViolations++;
        else if (s.type === 'long_method') longFunctions++;
        else if (s.type === 'deep_nesting') deepNestingViolations++;
        issues.push({
          file: path.relative(projectRoot, s.file),
          line: s.line,
          type: s.type.toUpperCase(),
          desc: s.message
        });
      }
    } catch {}
  }

  // 3. DryChecker unificado (janelas de 6 linhas idênticas)
  const dryMod = findLibModule(projectRoot, 'dry-checker.cjs');
  if (dryMod && files.length >= 2) {
    try {
      const DryChecker = require(dryMod);
      const checker = new DryChecker(6);
      const dups = checker.checkFiles(files);
      duplicatedBlocks = dups.length;
      for (const d of dups.slice(0, 3)) {
        const locs = d.locations.map(l => `${path.basename(l.file)}:${l.line}`).join(' <-> ');
        issues.push({
          file: path.relative(projectRoot, d.locations[0].file),
          line: d.locations[0].line,
          type: 'DUPLICATED_CODE',
          desc: `Bloco duplicado (>= 6 linhas): ${locs}`
        });
      }
    } catch {}
  }

  return {
    sql_risks: sqlRisks,
    cyclomatic_violations: cyclomaticViolations,
    long_functions: longFunctions,
    deep_nesting_violations: deepNestingViolations,
    duplicated_blocks: duplicatedBlocks,
    total_smells: issues.length,
    issues: issues.slice(0, 8)
  };
}

function runTests(projectRoot) {
  let testCmd = 'npm test';

  if (fs.existsSync(path.join(projectRoot, 'go.mod'))) {
    testCmd = 'go test ./...';
  } else if (fs.existsSync(path.join(projectRoot, 'pytest.ini')) || fs.existsSync(path.join(projectRoot, 'pyproject.toml'))) {
    if (!fs.existsSync(path.join(projectRoot, 'package.json'))) {
      testCmd = 'pytest';
    }
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

function checkAmbiguities(projectRoot) {
  const ambMod = findLibModule(projectRoot, 'ambiguity-guard.cjs');
  if (!ambMod) {
    return { required: false, valid: true, ambCount: 0, minRequired: 0, uncoveredSpecItems: [], message: null };
  }
  try {
    const { validateAmbiguities } = require(ambMod);
    return validateAmbiguities(projectRoot);
  } catch {
    return { required: false, valid: true, ambCount: 0, minRequired: 0, uncoveredSpecItems: [], message: null };
  }
}

function runFullVerification(projectRoot = process.cwd()) {
  const root = path.resolve(projectRoot);
  const srcDirs = ['src', 'api/src', 'app', 'lib'].filter(d => fs.existsSync(path.join(root, d)));
  let files = [];
  if (srcDirs.length > 0) {
    const seen = new Set();
    for (const d of srcDirs) {
      for (const f of findSourceFiles(path.join(root, d))) {
        const norm = path.resolve(f);
        if (!seen.has(norm)) {
          seen.add(norm);
          files.push(norm);
        }
      }
    }
  } else {
    files = findSourceFiles(root);
  }

  const syntax = checkSyntax(root, files);
  const quality = checkCodeQuality(root, files);
  const tests = runTests(root);
  const ambiguities = checkAmbiguities(root);

  const allPassed = syntax.syntax_valid && quality.total_smells === 0 && tests.passed && ambiguities.valid;

  const cacheDir = path.join(root, '.agents', '.cache');
  const lastPassFile = path.join(cacheDir, 'last-verify-pass.json');
  const pendingLintFile = path.join(cacheDir, 'pending-edit-lint.json');
  try {
    if (allPassed) {
      if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
      fs.writeFileSync(lastPassFile, JSON.stringify({ timestamp: Date.now() }), 'utf8');
      if (fs.existsSync(pendingLintFile)) fs.unlinkSync(pendingLintFile);
    } else if (fs.existsSync(lastPassFile)) {
      fs.unlinkSync(lastPassFile);
    }
  } catch {}

  let status = 'PASS';
  if (!syntax.syntax_valid || !tests.passed || quality.sql_risks > 0) {
    status = 'FAIL';
  } else if (!ambiguities.valid) {
    status = 'FAIL_AMBIGUITIES';
  } else if (quality.total_smells > 0) {
    status = 'WARN_CODE_QUALITY';
  }

  return {
    status,
    ready_to_complete: allPassed,
    syntax,
    quality,
    tests,
    ambiguities
  };
}

if (require.main === module) {
  const target = process.argv[2] || process.cwd();
  const res = runFullVerification(target);
  console.log(JSON.stringify(res, null, 2));
  process.exit(res.ready_to_complete ? 0 : 1);
}

module.exports = { runFullVerification };
