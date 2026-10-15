#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

function findPlanningDir() {
  let curr = process.cwd();
  for (let i = 0; i < 4; i++) {
    const candidate = path.join(curr, '.planning');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isDirectory()) {
      return candidate;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return null;
}

function parseFrontmatterAndBody(content) {
  const frontmatter = {};
  let body = content;
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (match) {
    const yamlBlock = match[1];
    body = match[2];
    for (const line of yamlBlock.split(/\r?\n/)) {
      const kv = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
      if (kv) {
        let val = kv[2].trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        frontmatter[kv[1]] = val;
      }
    }
  }
  return { frontmatter, body };
}

function getPhaseDir(phasesDir, phaseNum) {
  if (!fs.existsSync(phasesDir)) return null;
  const entries = fs.readdirSync(phasesDir);
  const pad = String(phaseNum).padStart(2, '0');
  const re = new RegExp(`^(?:${pad}|${phaseNum})-`, 'i');
  for (const entry of entries) {
    if (re.test(entry)) {
      const full = path.join(phasesDir, entry);
      if (fs.statSync(full).isDirectory()) {
        return full;
      }
    }
  }
  return null;
}

function findNextPlan(phaseDir) {
  if (!phaseDir || !fs.existsSync(phaseDir)) return null;
  const files = fs.readdirSync(phaseDir);
  const planFiles = files
    .filter(f => /[-_]PLAN\.md$/i.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));

  for (const plan of planFiles) {
    const base = plan.replace(/[-_]PLAN\.md$/i, '');
    const hasSummary = files.some(f => {
      const fBase = f.replace(/[-_]SUMMARY\.md$/i, '');
      return fBase.toLowerCase() === base.toLowerCase() && /[-_]SUMMARY\.md$/i.test(f);
    });
    if (!hasSummary) {
      return plan;
    }
  }
  return null;
}

function findPendingUat(planningDir, phaseDir, stateBody) {
  const pending = [];

  // 1. Check STATE.md pending todos
  if (stateBody) {
    const todoMatch = stateBody.match(/### Pending Todos\s*\r?\n([\s\S]*?)(?:\r?\n###|\r?\n##|$)/i);
    if (todoMatch) {
      const lines = todoMatch[1].split(/\r?\n/);
      for (const line of lines) {
        const itemMatch = line.match(/^\s*-\s*(?:\[\s*\]\s*)?(.+)/);
        if (itemMatch) {
          const itemText = itemMatch[1].trim();
          if (itemText && !/none yet/i.test(itemText)) {
            pending.push(itemText);
          }
        }
      }
    }
  }

  // 2. Check UAT files in phases
  const phasesDir = path.join(planningDir, 'phases');
  if (fs.existsSync(phasesDir)) {
    const phaseDirs = fs.readdirSync(phasesDir);
    for (const pd of phaseDirs) {
      const fullPd = path.join(phasesDir, pd);
      if (!fs.statSync(fullPd).isDirectory()) continue;
      const uatFiles = fs.readdirSync(fullPd).filter(f => /UAT\.md$/i.test(f));
      for (const uatFile of uatFiles) {
        try {
          const uatContent = fs.readFileSync(path.join(fullPd, uatFile), 'utf8');
          const { frontmatter: uatFm, body: uatBody } = parseFrontmatterAndBody(uatContent);
          
          if (uatFm.status && uatFm.status !== 'complete') {
            const testMatches = uatBody.matchAll(/###\s*(.+)\r?\n[\s\S]*?result:\s*(pending|fail|blocked)/gi);
            let foundSpecific = false;
            for (const tm of testMatches) {
              pending.push(tm[1].trim());
              foundSpecific = true;
            }
            if (!foundSpecific) {
              pending.push(`${uatFile}: status ${uatFm.status}`);
            }
          }
          
          const unchecked = uatBody.matchAll(/^\s*-\s*\[\s*\]\s*(.+)$/gm);
          for (const uc of unchecked) {
            pending.push(uc[1].trim());
          }
        } catch {}
      }
    }
  }

  return [...new Set(pending)];
}

function main() {
  const planningDir = findPlanningDir();
  if (!planningDir) {
    process.stderr.write('Error: .planning directory not found\n');
    process.exit(1);
  }

  const stateFile = path.join(planningDir, 'STATE.md');
  if (!fs.existsSync(stateFile)) {
    process.stderr.write('Error: .planning/STATE.md not found\n');
    process.exit(1);
  }

  const stateRaw = fs.readFileSync(stateFile, 'utf8');
  const { frontmatter, body } = parseFrontmatterAndBody(stateRaw);

  let phaseNumber = frontmatter.current_phase ? Number(frontmatter.current_phase) : null;
  let phaseName = frontmatter.current_phase_name || null;
  let phaseStatus = frontmatter.status || null;

  if (phaseNumber === null || !phaseName) {
    const posMatch = body.match(/Phase:\s*(\d+)\s*[—\-]\s*(.+)/i);
    if (posMatch) {
      if (phaseNumber === null) phaseNumber = Number(posMatch[1]);
      if (!phaseName) phaseName = posMatch[2].trim();
    }
  }

  if (!phaseStatus) {
    const statusMatch = body.match(/Status:\s*(.+)/i);
    if (statusMatch) {
      phaseStatus = statusMatch[1].trim();
    }
  }

  const phasesDir = path.join(planningDir, 'phases');
  const currentPhaseDir = phaseNumber !== null ? getPhaseDir(phasesDir, phaseNumber) : null;
  const nextPlan = findNextPlan(currentPhaseDir);
  const pendingUat = findPendingUat(planningDir, currentPhaseDir, body);

  const summary = {
    phase_number: phaseNumber,
    phase_name: phaseName,
    phase_status: phaseStatus,
    next_plan: nextPlan
  };

  if (pendingUat.length > 0) {
    summary.pending_uat_items = pendingUat;
  }

  const output = JSON.stringify(summary, null, 2);
  process.stdout.write(output + '\n');
}

main();
