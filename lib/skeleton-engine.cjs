'use strict';

/**
 * Antigravity GSD Kit - Skeleton Engine
 * Extrai assinaturas, tipos e interfaces com números de linha sem carregar corpos de funções.
 */

const fs = require('fs');
const path = require('path');

class SkeletonEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot || process.cwd();
  }

  getOutline(filePath) {
    const fullPath = path.isAbsolute(filePath) ? filePath : path.join(this.projectRoot, filePath);
    if (!fs.existsSync(fullPath)) {
      throw new Error(`Arquivo não encontrado: ${filePath}`);
    }

    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      throw new Error(`O caminho informado é um diretório: ${filePath}`);
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const ext = path.extname(fullPath).toLowerCase();
    const lines = content.split(/\r?\n/);
    const outline = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (ext === '.go') {
        if (trimmed.startsWith('func ') || trimmed.startsWith('type ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.ts', '.js', '.tsx', '.jsx'].includes(ext)) {
        if (
          trimmed.startsWith('function ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('interface ') ||
          trimmed.startsWith('type ') ||
          trimmed.startsWith('export const') ||
          trimmed.startsWith('export function') ||
          trimmed.startsWith('export class') ||
          trimmed.startsWith('export interface') ||
          trimmed.startsWith('export type')
        ) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.py') {
        if (trimmed.startsWith('def ') || trimmed.startsWith('class ') || trimmed.startsWith('async def ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.cs', '.java'].includes(ext)) {
        if (
          (trimmed.includes(' class ') || trimmed.includes(' interface ') || trimmed.includes(' record ')) ||
          ((trimmed.includes('public ') || trimmed.includes('private ') || trimmed.includes('protected ')) && trimmed.includes('('))
        ) {
          if (!trimmed.endsWith(';')) outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.rs') {
        if (trimmed.startsWith('fn ') || trimmed.startsWith('pub fn ') || trimmed.startsWith('struct ') || trimmed.startsWith('pub struct ') || trimmed.startsWith('enum ') || trimmed.startsWith('pub enum ') || trimmed.startsWith('impl ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else {
        if (trimmed.endsWith('{') && (trimmed.includes('function') || trimmed.includes('class') || trimmed.includes('def '))) {
          outline.push(`${i + 1}: ${line}`);
        }
      }
    }

    if (outline.length === 0) {
      return `Nenhum símbolo estrutural de alto nível detectado em ${path.basename(filePath)} (${lines.length} linhas).`;
    }

    const relPath = path.relative(this.projectRoot, fullPath);
    const banner = [
      `🦴 [Skeleton Outline] ${relPath} (${lines.length} linhas no total)`,
      `   Mostrando apenas assinaturas e tipos para navegação cirúrgica:`,
      ''
    ];

    return banner.join('\n') + outline.join('\n');
  }
}

module.exports = SkeletonEngine;
