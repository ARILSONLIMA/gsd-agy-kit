'use strict';

/**
 * Antigravity GSD Kit - Caveman Shrink & Context Compressor
 * 
 * Motor 100% nativo em Node.js (Zero-npm) para compressão semântica de arquivos
 * de texto/markdown e sanitização avançada de logs e saídas de terminal.
 * 
 * Regras Estritas de Integridade (Caveman ASD-STE100):
 * 1. PAYLOAD VERBATIM: Blocos de código (fenced ``` e inline ` `), caminhos, URLs,
 *    comandos e strings de erro NUNCA são alterados.
 * 2. CORTAR CERIMÔNIA: Remove introduções vazias, saudações, conclusões e floreios.
 * 3. BACKUP SEGURO: Salva o arquivo original em .agents/.cache/backups/ antes de qualquer alteração.
 */

const fs = require('fs');
const path = require('path');

const CEREMONY_PATTERNS = [
  /\b(?:sure(?:ly)?|certainly|of course|happy to help|i'd recommend|you might want to|please note that|it should be noted that|in order to|as mentioned (?:earlier|previously)|as you can see|basically|actually|essentially|simply|just)[!,.:;]?\s*/gi,
  /\b(?:espero que isso ajude|com certeza|claro que sim|estou feliz em ajudar|eu recomendo que|note que|vale ressaltar que|a fim de|como mencionado anteriormente|basicamente|na verdade|simplesmente)[!,.:;]?\s*/gi
];

const FLUFF_SENTENCES = [
  /^(?:I will now|Let's|Now we can|Here is|Below is|Next step is|O próximo passo é|Aqui está|Abaixo segue).{0,50}:?\s*$/gim,
  /^(?:Hope this helps|Let me know if you need anything else|Qualquer dúvida estou à disposição|Espero ter ajudado).{0,50}\.?\s*$/gim
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function resolveBackupDir(projectRoot) {
  const backupDir = path.join(projectRoot, '.agents', '.cache', 'backups');
  ensureDir(backupDir);
  return backupDir;
}

function compressProse(text) {
  let res = text;

  // 1. Substituições pontuais de verbosidade
  res = res
    .replace(/\bin order to\b/gi, 'to')
    .replace(/\ba fim de\b/gi, 'para')
    .replace(/\bcom o intuito de\b/gi, 'para')
    .replace(/\bmake sure to\b/gi, 'ensure')
    .replace(/\bcertifique-se de que\b/gi, 'garanta que')
    .replace(/\bthe reason is because\b/gi, 'because')
    .replace(/\bo motivo é porque\b/gi, 'porque');

  // 2. Remoção de expressões de cerimônia
  for (const pattern of CEREMONY_PATTERNS) {
    res = res.replace(pattern, '');
  }

  // 3. Compactação de linhas vazias repetidas
  res = res.replace(/\n{3,}/g, '\n\n');
  res = res.replace(/^[ \t]+$/gm, '');

  return res.trim();
}

function compressMarkdownContent(content) {
  // Isolar blocos de código com fenced backticks para preservar 100% literal
  const codeBlocks = [];
  let placeholderIndex = 0;

  const textWithoutCode = content.replace(/(```[\s\S]*?```|`[^`\r\n]+`)/g, (match) => {
    const key = `__CAVEMAN_VERBATIM_${placeholderIndex}__`;
    codeBlocks.push({ key, content: match });
    placeholderIndex++;
    return key;
  });

  // Dividir por seções/linhas
  const lines = textWithoutCode.split(/\r?\n/);
  const processedLines = [];

  for (let line of lines) {
    // Preservar cabeçalhos markdown sem alteração
    if (/^#{1,6}\s+/.test(line)) {
      processedLines.push(line);
      continue;
    }

    // Preservar tabelas markdown
    if (/^\s*\|.*\|\s*$/.test(line)) {
      processedLines.push(line);
      continue;
    }

    // Filtrar frases inteiras de puro preenchimento
    let isFluff = false;
    for (const fluffRe of FLUFF_SENTENCES) {
      fluffRe.lastIndex = 0;
      if (fluffRe.test(line.trim())) {
        isFluff = true;
        break;
      }
    }
    if (isFluff) continue;

    processedLines.push(compressProse(line));
  }

  let finalContent = processedLines.join('\n');
  finalContent = finalContent.replace(/\n{3,}/g, '\n\n').trim();

  // Restaurar blocos de código intocados
  for (const item of codeBlocks) {
    finalContent = finalContent.replace(item.key, () => item.content);
  }

  return finalContent;
}

function compressMemoryFile(filePath, projectRoot = process.cwd()) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }

  // Barreira de segurança: nunca comprimir segredos
  const baseName = path.basename(filePath).toLowerCase();
  if (baseName.startsWith('.env') || baseName.includes('secret') || baseName.includes('credential')) {
    throw new Error(`Arquivo sensível recusado por segurança: ${filePath}`);
  }

  const raw = fs.readFileSync(filePath, 'utf8');
  const backupDir = resolveBackupDir(projectRoot);
  const timestamp = Date.now();
  const backupPath = path.join(backupDir, `${baseName}.${timestamp}.original.md`);

  // Salvar backup
  fs.writeFileSync(backupPath, raw, 'utf8');

  const compressed = compressMarkdownContent(raw);
  fs.writeFileSync(filePath, compressed, 'utf8');

  const originalBytes = Buffer.byteLength(raw, 'utf8');
  const compressedBytes = Buffer.byteLength(compressed, 'utf8');
  const savedBytes = Math.max(0, originalBytes - compressedBytes);

  return {
    filePath,
    backupPath,
    originalBytes,
    compressedBytes,
    savedBytes,
    percent: originalBytes > 0 ? Math.round((savedBytes / originalBytes) * 100) : 0
  };
}

function compressCommandOutput(output, maxLines = 60) {
  const lines = output.split(/\r?\n/);
  if (lines.length <= maxLines) return output;

  const failureLines = [];
  const normalLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/\b(FAIL|ERROR|FATAL|Exception|Error:|panic:|SyntaxError|TypeError)\b/i.test(line)) {
      failureLines.push({ index: i + 1, text: line });
    } else {
      normalLines.push(line);
    }
  }

  // Se houver falhas críticas, destaca as falhas e mostra cabeçalho + cauda
  if (failureLines.length > 0) {
    const head = normalLines.slice(0, 15);
    const tail = normalLines.slice(-15);
    const failSummary = failureLines.slice(0, 10).map(f => `  🔴 L${f.index}: ${f.text}`).join('\n');
    return [
      ...head,
      `\n━━━ [CAVEMAN SHRINK: ${failureLines.length} FALHA(S) LOCALIZADA(S)] ━━━`,
      failSummary,
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`,
      ...tail
    ].join('\n');
  }

  const head = lines.slice(0, 20);
  const tail = lines.slice(-20);
  return [
    ...head,
    `\n[... Caveman Shrink: ${lines.length - 40} linhas intermediárias omitidas ...]`,
    ...tail
  ].join('\n');
}

module.exports = {
  compressProse,
  compressMarkdownContent,
  compressMarkdown: compressMarkdownContent,
  sanitizeChatOutput: compressProse,
  compressMemoryFile,
  compressCommandOutput
};
