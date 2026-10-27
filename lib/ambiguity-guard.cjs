'use strict';

/**
 * Antigravity GSD Kit - Ambiguity Guard
 * Valida a presença, densidade atômica e paridade temática 1-para-1 de AMBIGUITIES.md
 * contra especificações de tarefa (TASK.md / CHANGE_REQUEST.md).
 *
 * Zero dependências externas (100% Node.js stdlib).
 */

const fs = require('fs');
const path = require('path');

const STOPWORDS = new Set([
  'tratamento', 'divergencia', 'conflito', 'omissao', 'indefinicao', 'definicao',
  'entre', 'quando', 'sobre', 'onde', 'como', 'para', 'pelo', 'pela', 'pelos', 'pelas',
  'com', 'sem', 'dos', 'das', 'nos', 'nas', 'uma', 'uns', 'umas', 'nao', 'mais', 'menos',
  'deve', 'devem', 'seria', 'regra', 'regras', 'fluxo', 'sistema', 'modulo', 'dados',
  'valor', 'valores', 'total', 'soma', 'eventos', 'evento', 'linhas', 'linha', 'corte',
  'simples', 'estrito', 'estrita', 'padrao', 'antes', 'depois', 'durante', 'contra',
  'todos', 'todas', 'cada', 'qualquer', 'mesmo', 'mesma', 'outro', 'outra', 'outros'
]);

const SHORT_DOMAIN_TOKENS = new Set(['utc', 'iso', 'sql', 'rbac', 'pix', 'adr', 'sla', 'ttl', 'csv', 'xml', 'jwt']);

function normalizeText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function splitIntoBlocks(markdownText) {
  const blocks = [];
  if (!markdownText) return blocks;

  const headingSections = String(markdownText).split(/(?=^#{1,6}\s+)/m);
  for (const sec of headingSections) {
    const s = sec.trim();
    if (s) blocks.push(s);
  }

  const paragraphs = String(markdownText).split(/\n\s*\n/);
  for (const p of paragraphs) {
    const clean = p.trim();
    if (!clean) continue;
    blocks.push(clean);
    for (const line of clean.split(/\r?\n/)) {
      const l = line.trim();
      if (/^(?:[-*+]|\d+\.)\s+/.test(l)) blocks.push(l);
    }
  }
  return blocks;
}

function extractDomainKeywords(description) {
  const norm = normalizeText(description);
  const rawTokens = norm.match(/[a-z0-9]+(?:-[a-z0-9]+)*/g) || [];
  const unique = [];
  const seen = new Set();

  for (const tok of rawTokens) {
    if (/^amb-\d+$/.test(tok)) continue;
    if (STOPWORDS.has(tok)) continue;
    if (tok.length < 5 && !SHORT_DOMAIN_TOKENS.has(tok)) continue;
    if (!seen.has(tok)) {
      seen.add(tok);
      unique.push(tok);
    }
  }
  return unique;
}

function extractExpectedSpecAmbiguities(projectRoot) {
  const specFiles = ['TASK.md', 'CHANGE_REQUEST.md'];
  const items = new Map();

  for (const fileName of specFiles) {
    const fp = path.join(projectRoot, fileName);
    if (!fs.existsSync(fp)) continue;
    try {
      const content = fs.readFileSync(fp, 'utf8');
      const regex = /(?:^|\n)\s*(?:[-*+]\s+|\d+\.\s+|#{2,4}\s+)?(?:\*\*\[?(AMB-\d+)\]?\*\*|\[(AMB-\d+)\]|\b(AMB-\d+)\b)\s*[:—\-]+\s*([^\r\n]+)/gi;
      let match;
      while ((match = regex.exec(content)) !== null) {
        const id = (match[1] || match[2] || match[3] || '').toUpperCase();
        const desc = (match[4] || '').trim();
        if (id && desc.length >= 15) {
          items.set(`${fileName}:${id}`, {
            id,
            sourceFile: fileName,
            description: desc,
            keywords: extractDomainKeywords(desc)
          });
        }
      }
      // Também suporta formato "- **[AMB-01]** Texto sem dois-pontos"
      const bulletRegex = /(?:^|\n)\s*(?:[-*+]\s+|\d+\.\s+)(?:\*\*\[?(AMB-\d+)\]?\*\*|\[(AMB-\d+)\])\s+([^\r\n]+)/gi;
      while ((match = bulletRegex.exec(content)) !== null) {
        const id = (match[1] || match[2] || '').toUpperCase();
        const desc = (match[3] || '').replace(/^[:—\-]+\s*/, '').trim();
        if (id && desc.length >= 15 && !items.has(`${fileName}:${id}`)) {
          items.set(`${fileName}:${id}`, {
            id,
            sourceFile: fileName,
            description: desc,
            keywords: extractDomainKeywords(desc)
          });
        }
      }
    } catch {}
  }

  return Array.from(items.values());
}

function validateAmbiguities(projectRoot) {
  const root = projectRoot || process.cwd();
  const hasTaskSpec = fs.existsSync(path.join(root, 'TASK.md')) || fs.existsSync(path.join(root, 'CHANGE_REQUEST.md'));

  if (!hasTaskSpec) {
    return {
      required: false,
      valid: true,
      ambCount: 0,
      minRequired: 0,
      uncoveredSpecItems: [],
      message: null
    };
  }

  const ambPath = path.join(root, 'AMBIGUITIES.md');
  const expectedItems = extractExpectedSpecAmbiguities(root);
  const uniqueIds = new Set(expectedItems.map(i => i.id));
  const minRequired = Math.max(3, uniqueIds.size);

  if (!fs.existsSync(ambPath)) {
    return {
      required: true,
      valid: false,
      ambCount: 0,
      minRequired,
      uncoveredSpecItems: expectedItems.map(i => i.id),
      message: `AMBIGUITIES.md ausente! Crie AMBIGUITIES.md com pelo menos ${minRequired} ambiguidades de domínio (### AMB-01...) cobrindo todos os itens de TASK.md / CHANGE_REQUEST.md.`
    };
  }

  let content = '';
  try {
    content = fs.readFileSync(ambPath, 'utf8');
  } catch {}

  const headingMatches = content.match(/^#{2,4}\s*AMB[-_\s]?\d+/gim) || [];
  const fallbackMatches = content.match(/^#{2,3}\s+AMB|\bAMB-\d+\b|^\d+\.\s+\*\*AMB/gim) || [];
  const uniqueDocAmbIds = new Set((content.match(/\bAMB-\d+\b/gi) || []).map(x => x.toUpperCase()));
  const ambCount = Math.max(headingMatches.length, uniqueDocAmbIds.size, Math.min(fallbackMatches.length, 3));

  if (content.trim().length < 250 || ambCount < minRequired) {
    return {
      required: true,
      valid: false,
      ambCount,
      minRequired,
      uncoveredSpecItems: [],
      message: `AMBIGUITIES.md incompleto (${ambCount}/${minRequired} itens detectados, ${content.trim().length} bytes). Documente >= ${minRequired} blocos ### AMB-XX em parágrafos atômicos autossuficientes (>= 250 bytes).`
    };
  }

  const blocks = splitIntoBlocks(content);
  const normalizedBlocks = blocks.map(normalizeText);
  const uncovered = [];

  for (const specItem of expectedItems) {
    const kws = specItem.keywords;
    if (kws.length < 2) continue;
    const minKeywordHits = kws.length >= 4 ? 2 : 1;

    let covered = false;
    for (const nb of normalizedBlocks) {
      let hits = 0;
      for (const kw of kws) {
        if (nb.includes(kw)) hits++;
        // Aceitar também radical de 5 letras para plurais/conjugações (ex: homologado vs homologados, veiculo vs veiculos)
        else if (kw.length >= 6 && nb.includes(kw.slice(0, kw.length - 1))) hits++;
      }
      if (hits >= minKeywordHits) {
        covered = true;
        break;
      }
    }

    if (!covered) {
      uncovered.push({
        id: specItem.id,
        sourceFile: specItem.sourceFile,
        description: specItem.description,
        expectedKeywords: kws.slice(0, 5)
      });
    }
  }

  if (uncovered.length > 0) {
    const detail = uncovered
      .map(u => `${u.id} (${u.sourceFile}: "${u.description}" — inclua termos do domínio como: ${u.expectedKeywords.join(', ')})`)
      .join('; ');
    return {
      required: true,
      valid: false,
      ambCount,
      minRequired,
      uncoveredSpecItems: uncovered,
      message: `AMBIGUITIES.md divergiu da especificação e omitiu o tema de: ${detail}. Atualize o bloco correspondente em AMBIGUITIES.md preservando os termos do domínio.`
    };
  }

  return {
    required: true,
    valid: true,
    ambCount,
    minRequired,
    uncoveredSpecItems: [],
    message: null
  };
}

module.exports = {
  validateAmbiguities,
  extractExpectedSpecAmbiguities,
  normalizeText
};
