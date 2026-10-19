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

    const baseName = path.basename(fullPath).toLowerCase();
    const isDockerfile = ext === '.dockerfile' || baseName === 'dockerfile' || baseName.startsWith('dockerfile.') || baseName === 'containerfile';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (isDockerfile) {
        if (/^(FROM|ARG|ENV|WORKDIR|EXPOSE|ENTRYPOINT|CMD|HEALTHCHECK|USER|VOLUME)\b/i.test(trimmed)) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.go') {
        if (trimmed.startsWith('func ') || trimmed.startsWith('type ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.ts', '.js', '.tsx', '.jsx', '.cjs', '.mjs'].includes(ext)) {
        if (
          trimmed.startsWith('function ') ||
          trimmed.startsWith('async function ') ||
          trimmed.startsWith('class ') ||
          trimmed.startsWith('interface ') ||
          trimmed.startsWith('type ') ||
          trimmed.startsWith('export const') ||
          trimmed.startsWith('export function') ||
          trimmed.startsWith('export async function') ||
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
          (trimmed.includes(' class ') || trimmed.includes(' interface ') || trimmed.includes(' record ') || trimmed.includes(' enum ')) ||
          ((trimmed.includes('public ') || trimmed.includes('private ') || trimmed.includes('protected ')) && trimmed.includes('('))
        ) {
          if (!trimmed.endsWith(';')) outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.rs') {
        if (trimmed.startsWith('fn ') || trimmed.startsWith('pub fn ') || trimmed.startsWith('pub async fn ') || trimmed.startsWith('struct ') || trimmed.startsWith('pub struct ') || trimmed.startsWith('enum ') || trimmed.startsWith('pub enum ') || trimmed.startsWith('trait ') || trimmed.startsWith('pub trait ') || trimmed.startsWith('impl ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.php') {
        if (
          trimmed.startsWith('class ') ||
          trimmed.startsWith('interface ') ||
          trimmed.startsWith('trait ') ||
          trimmed.startsWith('enum ') ||
          trimmed.startsWith('abstract class ') ||
          trimmed.includes('function ')
        ) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.rb') {
        if (trimmed.startsWith('class ') || trimmed.startsWith('module ') || trimmed.startsWith('def ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.dart') {
        if (
          trimmed.startsWith('class ') ||
          trimmed.startsWith('abstract class ') ||
          trimmed.startsWith('mixin ') ||
          trimmed.startsWith('enum ') ||
          trimmed.startsWith('extension ') ||
          (trimmed.includes('(') && trimmed.endsWith('{') && !trimmed.startsWith('if ') && !trimmed.startsWith('for ') && !trimmed.startsWith('while '))
        ) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.ex', '.exs'].includes(ext)) {
        if (trimmed.startsWith('defmodule ') || trimmed.startsWith('def ') || trimmed.startsWith('defp ') || trimmed.startsWith('defmacro ')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'].includes(ext)) {
        if (
          trimmed.startsWith('class ') ||
          trimmed.startsWith('struct ') ||
          trimmed.startsWith('namespace ') ||
          trimmed.startsWith('template') ||
          (trimmed.includes('(') && (trimmed.endsWith('{') || trimmed.endsWith(';')) && !trimmed.startsWith('if') && !trimmed.startsWith('for') && !trimmed.startsWith('while'))
        ) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.lua') {
        if (
          trimmed.startsWith('function ') ||
          trimmed.startsWith('local function ') ||
          /^[A-Za-z_][A-Za-z0-9_.:]*\s*=\s*function\s*\(/.test(trimmed)
        ) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.sh', '.bash', '.zsh'].includes(ext)) {
        if (
          /^function\s+[A-Za-z_][A-Za-z0-9_-]*/.test(trimmed) ||
          /^[A-Za-z_][A-Za-z0-9_-]*\s*\(\)\s*\{?/.test(trimmed)
        ) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.sql') {
        if (/^(CREATE|ALTER)\s+(OR\s+REPLACE\s+)?(TABLE|VIEW|MATERIALIZED\s+VIEW|FUNCTION|PROCEDURE|INDEX|UNIQUE\s+INDEX|TYPE|TRIGGER|SCHEMA)\b/i.test(trimmed)) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.yaml', '.yml', '.tpl'].includes(ext)) {
        if (/^[A-Za-z0-9_.-]+\s*:/.test(line) && !trimmed.startsWith('#')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.json', '.jsonc'].includes(ext)) {
        if (/^\s{1,4}"[^"]+"\s*:/.test(line)) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.html', '.htm'].includes(ext)) {
        if (/<(html|head|body|header|nav|main|section|article|aside|footer|form|template|script|style)\b/i.test(trimmed) || /\bid=["'][^"']+["']/i.test(trimmed)) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.css', '.scss', '.less'].includes(ext)) {
        if ((trimmed.endsWith('{') && !trimmed.startsWith('//') && !trimmed.startsWith('/*')) || trimmed.startsWith('@media') || trimmed.startsWith('@keyframes')) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.kt', '.kts'].includes(ext)) {
        if (/^(?:public|private|protected|internal|open|abstract|data|sealed|suspend|inline|override|\s)*(?:class|interface|object|fun|enum\s+class)\s+/.test(trimmed)) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (ext === '.swift') {
        if (/^(?:public|private|internal|fileprivate|open|final|static|mutating|\s)*(?:class|struct|enum|protocol|extension|actor|func)\s+/.test(trimmed)) {
          outline.push(`${i + 1}: ${line}`);
        }
      } else if (['.tf', '.tfvars'].includes(ext)) {
        if (/^(resource|data|module|variable|output|provider|locals|terraform)\b/.test(trimmed)) {
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
