#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');

function minifyMarkdown(content) {
  return content
    // Remove multiple blank lines
    .replace(/\n{3,}/g, '\n\n')
    // Remove leading/trailing spaces on empty lines
    .replace(/^[ \t]+$/gm, '')
    // Compact list items if they are separated by blank lines
    .replace(/(\n- [^\n]+)\n+(?=- )/g, '$1\n')
    // Compact bullet points with descriptions
    .replace(/- \*\*([^*]+)\*\*:\s+/g, '- **$1**: ')
    .trim();
}

function processDirectory(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  let saved = 0;
  for (const file of files) {
    if (file.endsWith('.md')) {
      const fullPath = path.join(dir, file);
      const content = fs.readFileSync(fullPath, 'utf8');
      const minified = minifyMarkdown(content);
      if (content.length !== minified.length) {
        fs.writeFileSync(fullPath, minified, 'utf8');
        saved += (content.length - minified.length);
      }
    }
  }
  return saved;
}

function processRulesDirectory(dir) {
  if (!fs.existsSync(dir)) return 0;
  const files = fs.readdirSync(dir);
  let saved = 0;
  for (const file of files) {
    if (file.endsWith('.md')) {
      const fullPath = path.join(dir, file);
      let content = fs.readFileSync(fullPath, 'utf8');
      
      // Inject JIT progressive disclosure if missing and not already a bridge
      if (!content.startsWith('---') && !content.includes('trigger: model_decision')) {
        const desc = \`Regra sobre \${file.replace('.md', '')}\`;
        const frontmatter = \`---\\ntrigger: model_decision\\ndescription: \${desc}\\n---\\n\`;
        content = frontmatter + content;
      }
      
      const minified = minifyMarkdown(content);
      if (content !== minified) {
        fs.writeFileSync(fullPath, minified, 'utf8');
        saved += (content.length - minified.length);
      }
    }
  }
  return saved;
}

function main() {
  const targetDir = process.argv[2] || process.cwd();
  const agentsDir = path.join(targetDir, '.agents', 'agents');
  const skillsDir = path.join(targetDir, '.agents', 'skills');
  const rulesDir = path.join(targetDir, '.agents', 'rules');
  
  let totalSaved = 0;
  totalSaved += processDirectory(agentsDir) || 0;
  totalSaved += processDirectory(skillsDir) || 0;
  totalSaved += processRulesDirectory(rulesDir) || 0;
  
  // Also minify GEMINI.md
  const geminiPath = path.join(targetDir, '.agents', 'GEMINI.md');
  if (fs.existsSync(geminiPath)) {
    const content = fs.readFileSync(geminiPath, 'utf8');
    const minified = minifyMarkdown(content);
    if (content.length !== minified.length) {
      fs.writeFileSync(geminiPath, minified, 'utf8');
      totalSaved += (content.length - minified.length);
    }
  }
  
  console.log(`[Shrink Prompts] Otimização concluída. Economia extra de ${totalSaved} bytes nas instruções ativas.`);
}

main();
