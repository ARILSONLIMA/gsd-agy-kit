'use strict';

/**
 * Antigravity GSD Kit - Multi-Language Hybrid LSP Engine
 * Fornece Diagnostics, Definition, References, Hover/Symbols e Rename
 * para 20 ecossistemas: Go, TypeScript/JavaScript (vtsls/ts_ls), Python (basedpyright/pyright/ruff),
 * Rust, PHP, C/C++, Java, C# (Roslyn/csharp-ls), Ruby, Dart, Elixir, Lua, Shell/Bash,
 * HTML/CSS/JSON (vscode-langservers-extracted), YAML/Helm, SQL (sqls), Docker, Kotlin, Swift e Terraform.
 * Zero dependências npm externas. Combina binários LSP/compiladores nativos com fallback AST/estrutural.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const SkeletonEngine = require('./skeleton-engine.cjs');
const ErrorGuard = require('./error-guard.cjs');

/**
 * Binários que o diagnostics() realmente sabe acionar para validar cada linguagem.
 * Se NENHUM estiver instalado, a validação estrutural (regex/chaves) NÃO pode ser
 * apresentada como "zero erros": o motor retorna erro explícito com o comando de instalação.
 * (Linguagem sem entrada aqui, como HTML/CSS, só possui validador estrutural embutido.)
 */
const REAL_DIAG_TOOLS = {
  go: { bins: ['go', 'gopls'], install: 'sudo apt-get install -y golang-go (ou https://go.dev/dl)' },
  ts: { bins: ['tsc', 'node'], install: 'npm install -g typescript' },
  python: { bins: ['basedpyright', 'pyright', 'ruff', 'python3', 'python'], install: 'pip install basedpyright ruff' },
  rust: { bins: ['cargo', 'rustc'], install: 'rustup (https://rustup.rs)' },
  php: { bins: ['php'], install: 'sudo apt-get install -y php-cli' },
  cpp: { bins: ['clangd', 'clang++', 'g++', 'gcc'], install: 'sudo apt-get install -y clangd g++' },
  java: { bins: ['javac', 'java'], install: 'sudo apt-get install -y default-jdk' },
  csharp: { bins: ['dotnet', 'csc'], install: 'https://dotnet.microsoft.com/download' },
  ruby: { bins: ['ruby'], install: 'sudo apt-get install -y ruby' },
  dart: { bins: ['dart'], install: 'https://dart.dev/get-dart' },
  elixir: { bins: ['mix', 'elixirc'], install: 'sudo apt-get install -y elixir' },
  lua: { bins: ['luac', 'luacheck', 'lua'], install: 'sudo apt-get install -y lua5.4 (ou: luarocks install luacheck)' },
  bash: { bins: ['shellcheck', 'bash', 'sh'], install: 'sudo apt-get install -y shellcheck' },
  yaml: { bins: ['yamllint'], install: 'pip install yamllint' },
  sql: { bins: ['sqlfluff'], install: 'pip install sqlfluff' },
  docker: { bins: ['hadolint', 'docker'], install: 'brew install hadolint (ou https://github.com/hadolint/hadolint)' },
  kotlin: { bins: ['ktlint', 'kotlinc'], install: 'brew install ktlint' },
  swift: { bins: ['sourcekit-lsp', 'swiftc', 'swift'], install: 'Instale o toolchain Swift (https://swift.org/install)' },
  terraform: { bins: ['terraform-ls', 'terraform', 'tflint'], install: 'brew install terraform (ou https://developer.hashicorp.com/terraform/install)' }
};

const IGNORED_DIRS = new Set([
  '.git', 'node_modules', '.agents', '.planning', 'graphify-out',
  'dist', 'build', 'out', 'target', 'vendor', '__pycache__', '.venv', 'venv', '.next', 'coverage'
]);

const CODE_EXTENSIONS = new Set([
  '.go', '.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs',
  '.py', '.rs', '.php', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp',
  '.java', '.cs', '.rb', '.dart', '.ex', '.exs',
  '.lua', '.sh', '.bash', '.zsh', '.sql', '.dockerfile',
  '.html', '.htm', '.css', '.scss', '.less', '.json', '.jsonc',
  '.yaml', '.yml', '.tpl', '.kt', '.kts', '.swift', '.tf', '.tfvars'
]);

const LANGUAGE_REGISTRY = {
  go: {
    id: 'go',
    name: 'Go (gopls)',
    manifests: ['go.mod'],
    extensions: ['.go'],
    lspBinaries: ['gopls'],
    checkerBinaries: ['gopls', 'go'],
    astGrepLang: 'go',
    install: {
      label: 'gopls (Go Official LSP)',
      default: 'go install golang.org/x/tools/gopls@latest',
      checkCmd: 'gopls version'
    }
  },
  ts: {
    id: 'ts',
    name: 'TypeScript / JavaScript (vtsls / ts_ls)',
    manifests: ['tsconfig.json', 'jsconfig.json', 'package.json'],
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs'],
    lspBinaries: ['vtsls', 'typescript-language-server', 'ts_ls'],
    checkerBinaries: ['vtsls', 'typescript-language-server', 'tsc', 'biome', 'eslint', 'node'],
    astGrepLang: 'ts',
    install: {
      label: 'vtsls + typescript-language-server (TS/JS/Node LSP)',
      default: 'npm install -g @vtsls/language-server typescript-language-server typescript',
      fallback: 'npm install -g typescript-language-server typescript',
      checkCmd: 'vtsls --version'
    }
  },
  python: {
    id: 'python',
    name: 'Python (pyright / basedpyright / ruff)',
    manifests: ['pyproject.toml', 'requirements.txt', 'setup.py', 'Pipfile'],
    extensions: ['.py'],
    lspBinaries: ['basedpyright-langserver', 'basedpyright', 'pyright-langserver', 'pyright', 'ruff', 'pylsp'],
    checkerBinaries: ['basedpyright', 'pyright', 'ruff', 'pylsp', 'python3', 'python'],
    astGrepLang: 'py',
    install: {
      label: 'basedpyright / pyright + ruff (Python Type Checker & Fast Linter LSP)',
      default: 'pip install basedpyright ruff',
      fallback: 'npm install -g pyright',
      checkCmd: 'pyright --version'
    }
  },
  rust: {
    id: 'rust',
    name: 'Rust (rust-analyzer)',
    manifests: ['Cargo.toml'],
    extensions: ['.rs'],
    lspBinaries: ['rust-analyzer'],
    checkerBinaries: ['rust-analyzer', 'cargo', 'rustc'],
    astGrepLang: 'rust',
    install: {
      label: 'rust-analyzer (Rust Official LSP)',
      default: 'rustup component add rust-analyzer',
      checkCmd: 'rust-analyzer --version'
    }
  },
  php: {
    id: 'php',
    name: 'PHP (intelephense)',
    manifests: ['composer.json'],
    extensions: ['.php'],
    lspBinaries: ['intelephense', 'phpactor'],
    checkerBinaries: ['intelephense', 'phpstan', 'phpactor', 'php'],
    astGrepLang: 'php',
    install: {
      label: 'intelephense (PHP Language Server)',
      default: 'npm install -g intelephense',
      checkCmd: 'intelephense --version'
    }
  },
  cpp: {
    id: 'cpp',
    name: 'C / C++ (clangd)',
    manifests: ['CMakeLists.txt', 'compile_commands.json', 'Makefile', 'meson.build'],
    extensions: ['.c', '.cpp', '.cc', '.cxx', '.h', '.hpp'],
    lspBinaries: ['clangd', 'ccls'],
    checkerBinaries: ['clangd', 'clang++', 'g++', 'gcc'],
    astGrepLang: 'cpp',
    install: {
      label: 'clangd (LLVM C/C++ LSP)',
      linux: 'sudo apt-get update && sudo apt-get install -y clangd',
      darwin: 'brew install llvm',
      win32: 'winget install --id LLVM.LLVM -e',
      default: 'apt/brew/winget install clangd',
      checkCmd: 'clangd --version'
    }
  },
  java: {
    id: 'java',
    name: 'Java (jdtls)',
    manifests: ['pom.xml', 'build.gradle', 'build.gradle.kts'],
    extensions: ['.java'],
    lspBinaries: ['jdtls'],
    checkerBinaries: ['jdtls', 'javac', 'mvn', 'gradle'],
    astGrepLang: 'java',
    install: {
      label: 'jdtls / JDK (Eclipse Java Language Server & Compiler)',
      linux: 'sudo apt-get update && sudo apt-get install -y default-jdk',
      darwin: 'brew install jdtls',
      win32: 'winget install --id EclipseAdoptium.Temurin.21.JDK -e',
      default: 'brew/apt/winget install jdtls / default-jdk',
      checkCmd: 'javac -version'
    }
  },
  csharp: {
    id: 'csharp',
    name: 'C# (Roslyn / csharp-ls)',
    manifests: ['global.json', 'Directory.Build.props'],
    extensions: ['.cs'],
    lspBinaries: ['csharp-ls', 'Microsoft.CodeAnalysis.LanguageServer', 'roslyn', 'OmniSharp'],
    checkerBinaries: ['csharp-ls', 'Microsoft.CodeAnalysis.LanguageServer', 'dotnet'],
    astGrepLang: 'cs',
    install: {
      label: 'csharp-ls (.NET C# Roslyn Language Server)',
      default: 'dotnet tool install --global csharp-ls',
      checkCmd: 'csharp-ls --version'
    }
  },
  lua: {
    id: 'lua',
    name: 'Lua (lua-language-server)',
    manifests: ['.luarc.json', '.luacheckrc', 'init.lua'],
    extensions: ['.lua'],
    lspBinaries: ['lua-language-server'],
    checkerBinaries: ['lua-language-server', 'luac', 'luacheck', 'lua'],
    astGrepLang: 'lua',
    install: {
      label: 'lua-language-server (Lua Official LSP)',
      linux: 'sudo apt-get update && sudo apt-get install -y lua5.4',
      darwin: 'brew install lua-language-server',
      win32: 'winget install --id LuaLS.lua-language-server -e',
      default: 'brew/winget install lua-language-server',
      checkCmd: 'lua-language-server --version'
    }
  },
  bash: {
    id: 'bash',
    name: 'Shell / Bash (bash-language-server)',
    manifests: ['.shellcheckrc', 'setup.sh', 'install.sh'],
    extensions: ['.sh', '.bash', '.zsh'],
    lspBinaries: ['bash-language-server'],
    checkerBinaries: ['bash-language-server', 'shellcheck', 'bash', 'shfmt'],
    astGrepLang: 'bash',
    install: {
      label: 'bash-language-server + shellcheck (Bash/Shell LSP)',
      default: 'npm install -g bash-language-server',
      fallback: 'sudo apt-get install -y shellcheck',
      checkCmd: 'bash-language-server --version'
    }
  },
  web: {
    id: 'web',
    name: 'HTML / CSS / JSON (vscode-langservers)',
    manifests: ['index.html', '.stylelintrc', 'biome.json'],
    extensions: ['.html', '.htm', '.css', '.scss', '.less', '.json', '.jsonc'],
    lspBinaries: ['vscode-html-language-server', 'vscode-css-language-server', 'vscode-json-language-server', 'biome'],
    checkerBinaries: ['vscode-json-language-server', 'vscode-html-language-server', 'vscode-css-language-server', 'biome', 'node'],
    astGrepLang: 'html',
    install: {
      label: 'vscode-langservers-extracted (HTML/CSS/JSON/ESLint LSP)',
      default: 'npm install -g vscode-langservers-extracted',
      checkCmd: 'vscode-json-language-server --version'
    }
  },
  yaml: {
    id: 'yaml',
    name: 'YAML / Helm (yaml-language-server)',
    manifests: ['Chart.yaml', 'docker-compose.yml', 'docker-compose.yaml', '.yamllint'],
    extensions: ['.yaml', '.yml', '.tpl'],
    lspBinaries: ['yaml-language-server', 'helm_ls'],
    checkerBinaries: ['yaml-language-server', 'helm_ls', 'yamllint', 'helm'],
    astGrepLang: 'yaml',
    install: {
      label: 'yaml-language-server (YAML / Kubernetes / Helm LSP)',
      default: 'npm install -g yaml-language-server',
      checkCmd: 'yaml-language-server --version'
    }
  },
  sql: {
    id: 'sql',
    name: 'SQL (sqls)',
    manifests: ['sqlc.yaml', 'sqlc.json', '.sqlfluff'],
    extensions: ['.sql'],
    lspBinaries: ['sqls', 'postgres-language-server'],
    checkerBinaries: ['sqls', 'sqlfluff', 'sqllint'],
    astGrepLang: 'sql',
    install: {
      label: 'sqls (SQL Language Server)',
      default: 'go install github.com/sqls-server/sqls@latest',
      fallback: 'pip install sqlfluff',
      checkCmd: 'sqls --version'
    }
  },
  docker: {
    id: 'docker',
    name: 'Docker (dockerfile-language-server)',
    manifests: ['Dockerfile', 'Containerfile', 'docker-compose.yml', 'docker-compose.yaml'],
    extensions: ['.dockerfile'],
    lspBinaries: ['docker-langserver', 'docker-language-server', 'dockerfile-language-server'],
    checkerBinaries: ['docker-langserver', 'hadolint', 'docker'],
    astGrepLang: 'dockerfile',
    install: {
      label: 'dockerfile-language-server-nodejs (Docker Official LSP)',
      default: 'npm install -g dockerfile-language-server-nodejs',
      checkCmd: 'docker-langserver --version'
    }
  },
  ruby: {
    id: 'ruby',
    name: 'Ruby (solargraph / ruby-lsp)',
    manifests: ['Gemfile'],
    extensions: ['.rb'],
    lspBinaries: ['solargraph', 'ruby-lsp'],
    checkerBinaries: ['solargraph', 'ruby-lsp', 'rubocop', 'ruby'],
    astGrepLang: 'rb',
    install: {
      label: 'solargraph (Ruby LSP)',
      default: 'gem install solargraph',
      checkCmd: 'solargraph -v'
    }
  },
  dart: {
    id: 'dart',
    name: 'Dart / Flutter',
    manifests: ['pubspec.yaml'],
    extensions: ['.dart'],
    lspBinaries: ['dart'],
    checkerBinaries: ['dart', 'flutter'],
    astGrepLang: 'dart',
    install: {
      label: 'dart language-server (Dart SDK)',
      default: 'dart --version',
      checkCmd: 'dart --version'
    }
  },
  elixir: {
    id: 'elixir',
    name: 'Elixir (elixir-ls)',
    manifests: ['mix.exs'],
    extensions: ['.ex', '.exs'],
    lspBinaries: ['elixir-ls'],
    checkerBinaries: ['elixir-ls', 'mix', 'elixir'],
    astGrepLang: 'elixir',
    install: {
      label: 'elixir-ls (Elixir LSP)',
      default: 'mix local.hex --force',
      checkCmd: 'elixir --version'
    }
  },
  kotlin: {
    id: 'kotlin',
    name: 'Kotlin (kotlin-language-server)',
    manifests: ['build.gradle.kts', 'settings.gradle.kts'],
    extensions: ['.kt', '.kts'],
    lspBinaries: ['kotlin-language-server'],
    checkerBinaries: ['kotlin-language-server', 'kotlinc', 'ktlint', 'gradle'],
    astGrepLang: 'kt',
    install: {
      label: 'kotlin-language-server (Kotlin LSP)',
      darwin: 'brew install kotlin-language-server',
      default: 'brew/sdkman install kotlin-language-server',
      checkCmd: 'kotlin-language-server --version'
    }
  },
  swift: {
    id: 'swift',
    name: 'Swift (sourcekit-lsp)',
    manifests: ['Package.swift'],
    extensions: ['.swift'],
    lspBinaries: ['sourcekit-lsp'],
    checkerBinaries: ['sourcekit-lsp', 'swiftc', 'swift'],
    astGrepLang: 'swift',
    install: {
      label: 'sourcekit-lsp (Apple Swift Official LSP)',
      default: 'swift --version',
      checkCmd: 'sourcekit-lsp --help'
    }
  },
  terraform: {
    id: 'terraform',
    name: 'Terraform / HCL (terraform-ls)',
    manifests: ['main.tf', 'providers.tf', 'versions.tf', 'terraform.tf'],
    extensions: ['.tf', '.tfvars'],
    lspBinaries: ['terraform-ls'],
    checkerBinaries: ['terraform-ls', 'terraform', 'tflint'],
    astGrepLang: 'hcl',
    install: {
      label: 'terraform-ls (HashiCorp Terraform Official LSP)',
      darwin: 'brew install hashicorp/tap/terraform-ls',
      win32: 'winget install --id HashiCorp.TerraformLS -e',
      default: 'brew/winget/apt install terraform-ls',
      checkCmd: 'terraform-ls --version'
    }
  }
};

class LspEngine {
  constructor(projectRoot) {
    this.projectRoot = projectRoot ? path.resolve(projectRoot) : process.cwd();
    this.skeleton = new SkeletonEngine(this.projectRoot);
    this._binCache = new Map();
    this._spawnFailures = [];
    this._lastNonZero = null;
  }

  /**
   * spawnSync rastreável: registra falhas reais de execução (binário ausente, timeout,
   * erro de spawn) e o último código de saída != 0 para que diagnostics() nunca
   * converta uma ferramenta quebrada em "zero erros".
   */
  _spawn(bin, args, options) {
    const res = spawnSync(bin, args, options);
    if (res.error) {
      this._spawnFailures.push({
        bin,
        args,
        code: res.error.code || 'ERR',
        message: res.error.message,
        timedOut: res.error.code === 'ETIMEDOUT'
      });
    } else if (res.status !== 0) {
      this._lastNonZero = {
        bin,
        args,
        status: res.status,
        signal: res.signal || null,
        stderr: String(res.stderr || '').trim(),
        stdout: String(res.stdout || '').trim()
      };
    }
    return res;
  }

  /**
   * Verifica de forma segura se um binário da allow-list está disponível no PATH.
   */
  hasBinary(binName) {
    if (this._binCache.has(binName)) return this._binCache.get(binName);
    const versionArgsMap = {
      gopls: ['version'],
      go: ['version'],
      javac: ['-version'],
      ruby: ['-v'],
      solargraph: ['-v'],
      php: ['-v'],
      node: ['-v'],
      lua: ['-v'],
      luac: ['-v'],
      kotlinc: ['-version'],
      'sourcekit-lsp': ['--help']
    };
    const args = versionArgsMap[binName] || ['--version'];
    try {
      const res = spawnSync(binName, args, { stdio: 'ignore', timeout: 4000, shell: process.platform === 'win32' });
      const ok = Boolean(res && !res.error && res.status === 0);
      this._binCache.set(binName, ok);
      return ok;
    } catch {
      this._binCache.set(binName, false);
      return false;
    }
  }

  /**
   * Sonda um binário e devolve a causa real quando ele não responde
   * (ausente no PATH, timeout ou código de saída != 0 com stderr).
   */
  probeBinary(binName) {
    const res = ErrorGuard.spawnStrict(binName, ['--version'], { timeout: 4000 });
    if (res.ok) return { ok: true, reason: null };
    return {
      ok: false,
      reason: ErrorGuard.describeSpawnFailure(res, binName),
      stderr: res.stderr || res.errorMessage || '',
      exitCode: res.status
    };
  }

  /**
   * Retorna a versão resumida de um binário se instalado, ou null.
   */
  getBinaryVersion(binName) {
    const versionArgsMap = {
      gopls: ['version'],
      go: ['version'],
      javac: ['-version'],
      ruby: ['-v'],
      solargraph: ['-v'],
      php: ['-v'],
      node: ['-v'],
      lua: ['-v'],
      luac: ['-v'],
      kotlinc: ['-version'],
      'sourcekit-lsp': ['--help']
    };
    const args = versionArgsMap[binName] || ['--version'];
    try {
      const res = spawnSync(binName, args, { encoding: 'utf8', timeout: 4000, shell: process.platform === 'win32' });
      if (res && res.status === 0) {
        const out = ((res.stdout || '') + '\n' + (res.stderr || '')).trim();
        return out.split(/\r?\n/)[0].trim() || 'OK';
      }
    } catch {}
    return null;
  }

  /**
   * Detecta todas as linguagens presentes no projeto (raiz e subpastas padrão).
   */
  detectProjectStacks(targetDir = this.projectRoot) {
    const rootDir = path.resolve(targetDir);
    const commonSubdirs = ['', 'frontend', 'backend', 'web', 'ui', 'api', 'server', 'client', 'app', 'services', 'scripts', 'infra', 'sql', 'migrations'];
    const detected = [];

    const hasManifest = (manifestList) => {
      for (const sub of commonSubdirs) {
        const base = sub ? path.join(rootDir, sub) : rootDir;
        if (!fs.existsSync(base)) continue;
        for (const m of manifestList) {
          if (fs.existsSync(path.join(base, m))) return true;
        }
      }
      return false;
    };

    const hasExtensionInRootOrSub = (extList) => {
      for (const sub of ['', 'scripts', 'sql', 'migrations', 'infra', 'helm', 'charts']) {
        const base = sub ? path.join(rootDir, sub) : rootDir;
        if (!fs.existsSync(base)) continue;
        try {
          const entries = fs.readdirSync(base);
          if (entries.some(e => extList.includes(path.extname(e).toLowerCase()))) return true;
        } catch {}
      }
      return false;
    };

    const hasCsprojOrSln = () => {
      for (const sub of ['', ...commonSubdirs]) {
        const base = sub ? path.join(rootDir, sub) : rootDir;
        if (!fs.existsSync(base)) continue;
        try {
          const entries = fs.readdirSync(base);
          if (entries.some(e => e.endsWith('.csproj') || e.endsWith('.sln'))) return true;
        } catch {}
      }
      return false;
    };

    for (const key of Object.keys(LANGUAGE_REGISTRY)) {
      const spec = LANGUAGE_REGISTRY[key];
      let present = false;
      if (key === 'csharp') {
        present = hasManifest(spec.manifests) || hasCsprojOrSln();
      } else if (['sql', 'lua', 'terraform'].includes(key)) {
        present = hasManifest(spec.manifests) || hasExtensionInRootOrSub(spec.extensions);
      } else {
        present = hasManifest(spec.manifests);
      }

      if (present) {
        const activeLsp = spec.lspBinaries.find(b => this.hasBinary(b)) || null;
        const activeChecker = spec.checkerBinaries.find(b => this.hasBinary(b)) || null;
        const isHealthy = Boolean(activeLsp || activeChecker);
        const installCmd = spec.install[process.platform] || spec.install.default;

        detected.push({
          id: spec.id,
          name: spec.name,
          activeLsp,
          activeChecker,
          activeBinary: activeLsp || activeChecker,
          hasDedicatedLsp: Boolean(activeLsp),
          isHealthy,
          installLabel: spec.install.label,
          installCmd,
          installFallback: spec.install.fallback || null,
          spec
        });
      }
    }

    return detected;
  }

  /**
   * Verifica a saúde estrita da stack do projeto para o Circuit Breaker e Health Check.
   * Modo rigoroso: TODA linguagem detectada exige LSP/checker saudável.
   */
  checkStackHealth(targetDir = this.projectRoot) {
    const stacks = this.detectProjectStacks(targetDir);
    const missingStacks = [];

    for (const st of stacks) {
      // Para Go, gopls é tradicionalmente exigido quando há go.mod
      if (st.id === 'go' && !this.hasBinary('gopls')) {
        missingStacks.push({
          ...st,
          missingBinary: 'gopls'
        });
      } else if (!st.isHealthy) {
        missingStacks.push({
          ...st,
          missingBinary: st.spec.lspBinaries[0] || st.spec.checkerBinaries[0]
        });
      }
    }

    if (missingStacks.length > 0) {
      const details = missingStacks
        .map(m => `${m.name}: instale '${m.missingBinary}' com: ${m.installCmd}`)
        .join(' | ');
      const repairCommands = [];
      for (const m of missingStacks) {
        if (m.installCmd) repairCommands.push(m.installCmd);
        if (m.installFallback) repairCommands.push(m.installFallback);
      }
      return {
        ok: false,
        stacks,
        missingStacks,
        repairCommands,
        error: `Ferramenta LSP/análise ausente para a stack do projeto (${details})`
      };
    }

    return {
      ok: true,
      stacks,
      missingStacks: [],
      error: null
    };
  }

  /**
   * Resolve um caminho seguro dentro ou relativo ao projeto.
   */
  _resolveSafePath(inputPath, enforceProjectBoundary = false) {
    if (!inputPath) return this.projectRoot;
    const resolved = path.isAbsolute(inputPath)
      ? path.resolve(inputPath)
      : path.resolve(this.projectRoot, inputPath);
    if (enforceProjectBoundary) {
      const rootWithSep = this.projectRoot.endsWith(path.sep)
        ? this.projectRoot
        : this.projectRoot + path.sep;
      if (resolved !== this.projectRoot && !resolved.startsWith(rootWithSep)) {
        return null;
      }
    }
    return resolved;
  }

  /**
   * Infere a linguagem a partir do argumento lang, da extensão do arquivo ou da stack do projeto.
   */
  _resolveLanguage(lang, filePath) {
    if (lang) {
      const normalized = String(lang).toLowerCase().trim();
      const aliasMap = {
        go: 'go', golang: 'go', gopls: 'go',
        ts: 'ts', typescript: 'ts', tsx: 'ts', js: 'ts', javascript: 'ts', jsx: 'ts', node: 'ts', cjs: 'ts', mjs: 'ts', vtsls: 'ts', ts_ls: 'ts',
        py: 'python', python: 'python', pyright: 'python', basedpyright: 'python', ruff: 'python',
        rs: 'rust', rust: 'rust',
        php: 'php', intelephense: 'php',
        c: 'cpp', cpp: 'cpp', 'c++': 'cpp', cc: 'cpp', cxx: 'cpp', clangd: 'cpp',
        java: 'java', jdtls: 'java',
        cs: 'csharp', csharp: 'csharp', 'c#': 'csharp', dotnet: 'csharp', roslyn: 'csharp',
        rb: 'ruby', ruby: 'ruby',
        dart: 'dart', flutter: 'dart',
        ex: 'elixir', exs: 'elixir', elixir: 'elixir',
        lua: 'lua', luals: 'lua',
        sh: 'bash', bash: 'bash', shell: 'bash', zsh: 'bash',
        html: 'web', htm: 'web', css: 'web', scss: 'web', less: 'web', json: 'web', jsonc: 'web', web: 'web',
        yaml: 'yaml', yml: 'yaml', helm: 'yaml', k8s: 'yaml',
        sql: 'sql', sqls: 'sql', postgres: 'sql', mysql: 'sql', sqlite: 'sql',
        docker: 'docker', dockerfile: 'docker', containerfile: 'docker',
        kt: 'kotlin', kts: 'kotlin', kotlin: 'kotlin',
        swift: 'swift',
        tf: 'terraform', tfvars: 'terraform', hcl: 'terraform', terraform: 'terraform'
      };
      if (aliasMap[normalized] && LANGUAGE_REGISTRY[aliasMap[normalized]]) {
        return LANGUAGE_REGISTRY[aliasMap[normalized]];
      }
    }

    if (filePath) {
      const base = path.basename(String(filePath)).toLowerCase();
      if (base === 'dockerfile' || base.startsWith('dockerfile.') || base === 'containerfile' || base.startsWith('containerfile.')) {
        return LANGUAGE_REGISTRY.docker;
      }
      const ext = path.extname(String(filePath)).toLowerCase();
      for (const spec of Object.values(LANGUAGE_REGISTRY)) {
        if (spec.extensions.includes(ext)) return spec;
      }
    }

    const detected = this.detectProjectStacks();
    if (detected.length > 0) return detected[0].spec;
    return LANGUAGE_REGISTRY.ts;
  }

  /**
   * 1. DIAGNOSTICS: Verifica erros de compilação/tipagem/sintaxe de forma cirúrgica e compacta.
   */
  diagnostics({ file_path, lang } = {}) {
    const spec = this._resolveLanguage(lang, file_path);
    const targetFile = file_path ? this._resolveSafePath(file_path) : null;
    if (targetFile && !fs.existsSync(targetFile)) {
      return { text: `Erro: arquivo não encontrado: ${file_path}`, isError: true };
    }

    const isSingleFile = Boolean(targetFile && fs.statSync(targetFile).isFile());
    const relFile = targetFile ? path.relative(this.projectRoot, targetFile) : null;
    let rawErrors = [];
    let toolUsed = '';
    this._spawnFailures = [];
    this._lastNonZero = null;

    try {
      if (spec.id === 'go') {
        if (isSingleFile && this.hasBinary('gopls')) {
          toolUsed = 'gopls check';
          const res = this._spawn('gopls', ['check', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000 });
          rawErrors = this._splitLines((res.stdout || '') + '\n' + (res.stderr || ''));
        } else if (this.hasBinary('go')) {
          toolUsed = 'go vet';
          const args = ['vet', isSingleFile ? `./${path.dirname(relFile)}` : './...'];
          const res = this._spawn('go', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stdout || '') + '\n' + (res.stderr || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'ts') {
        const ext = isSingleFile ? path.extname(targetFile).toLowerCase() : '';
        const isJsFile = ['.js', '.cjs', '.mjs'].includes(ext);

        if (isSingleFile && isJsFile && this.hasBinary('node')) {
          toolUsed = 'node --check';
          const res = this._spawn(process.execPath, ['--check', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else if (this.hasBinary('tsc') && fs.existsSync(path.join(this.projectRoot, 'tsconfig.json'))) {
          toolUsed = 'tsc --noEmit';
          const res = this._spawn('tsc', ['--noEmit', '--pretty', 'false'], { cwd: this.projectRoot, encoding: 'utf8', timeout: 20000, shell: process.platform === 'win32' });
          if (res.status !== 0) {
            const lines = this._splitLines((res.stdout || '') + '\n' + (res.stderr || ''));
            rawErrors = (isSingleFile && relFile) ? lines.filter(l => l.includes(relFile) || l.includes(path.basename(targetFile))) : lines;
            if (isSingleFile && rawErrors.length === 0 && lines.length > 0) this._lastNonZero = null;
          }
        } else if (!isSingleFile && this.hasBinary('node')) {
          const scanDir = targetFile || this.projectRoot;
          const jsFiles = this._walkCodeFiles(scanDir, ['.js', '.cjs', '.mjs']).slice(0, 45);
          const otherTsFiles = this._walkCodeFiles(scanDir, ['.ts', '.tsx', '.jsx']).slice(0, 30);
          if (jsFiles.length > 0) {
            toolUsed = `node --check (${jsFiles.length} arquivos)`;
            for (const f of jsFiles) {
              const res = this._spawn(process.execPath, ['--check', f], { cwd: this.projectRoot, encoding: 'utf8', timeout: 6000 });
              if (res.status !== 0) {
                rawErrors.push(...this._splitLines((res.stderr || '') + '\n' + (res.stdout || '')));
              }
            }
          }
          if (otherTsFiles.length > 0) {
            if (!toolUsed) toolUsed = 'structural-syntax-check';
            for (const f of otherTsFiles) {
              rawErrors.push(...this._fallbackSyntaxDiagnostics(f, spec.extensions));
            }
          }
          if (!toolUsed) {
            toolUsed = 'structural-syntax-check';
            rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'python') {
        if (this.hasBinary('basedpyright')) {
          toolUsed = 'basedpyright';
          const args = targetFile ? [targetFile] : ['.'];
          const res = this._spawn('basedpyright', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000, shell: process.platform === 'win32' });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '').filter(l => /error:|warning:/i.test(l));
          }
        } else if (this.hasBinary('pyright')) {
          toolUsed = 'pyright';
          const args = targetFile ? [targetFile] : ['.'];
          const res = this._spawn('pyright', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000, shell: process.platform === 'win32' });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '').filter(l => /error:|warning:/i.test(l));
          }
        } else if (this.hasBinary('ruff')) {
          toolUsed = 'ruff check';
          const args = ['check', targetFile || '.'];
          const res = this._spawn('ruff', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else if (isSingleFile && (this.hasBinary('python3') || this.hasBinary('python'))) {
          const pyBin = this.hasBinary('python3') ? 'python3' : 'python';
          toolUsed = `${pyBin} -m py_compile`;
          const res = this._spawn(pyBin, ['-m', 'py_compile', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'rust') {
        if (this.hasBinary('cargo') && fs.existsSync(path.join(this.projectRoot, 'Cargo.toml'))) {
          toolUsed = 'cargo check';
          const res = this._spawn('cargo', ['check', '--message-format=short', '--quiet'], { cwd: this.projectRoot, encoding: 'utf8', timeout: 25000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'php') {
        if (isSingleFile && this.hasBinary('php')) {
          toolUsed = 'php -l';
          const res = this._spawn('php', ['-l', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'cpp') {
        if (isSingleFile && this.hasBinary('clangd')) {
          toolUsed = 'clangd --check';
          const res = this._spawn('clangd', [`--check=${targetFile}`], { cwd: this.projectRoot, encoding: 'utf8', timeout: 12000 });
          const combined = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          rawErrors = combined.filter(l => /\b(error|fatal error):/i.test(l) && !/^I\[/.test(l));
        } else {
          const compiler = this.hasBinary('clang++') ? 'clang++' : (this.hasBinary('g++') ? 'g++' : null);
          if (isSingleFile && compiler) {
            toolUsed = `${compiler} -fsyntax-only`;
            const res = this._spawn(compiler, ['-fsyntax-only', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
            if (res.status !== 0) {
              rawErrors = this._splitLines(res.stderr || '');
            }
          } else {
            toolUsed = 'structural-syntax-check';
            rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
          }
        }
      } else if (spec.id === 'java') {
        if (isSingleFile && this.hasBinary('javac')) {
          toolUsed = 'javac -Xlint:syntax';
          const res = this._spawn('javac', ['-proc:none', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stderr || '');
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'csharp') {
        if (this.hasBinary('dotnet')) {
          toolUsed = 'dotnet build --no-restore';
          const args = ['build', '--no-restore', '--nologo', '-v', 'q'];
          if (isSingleFile && (targetFile.endsWith('.csproj') || targetFile.endsWith('.sln'))) {
            args.push(targetFile);
          }
          const res = this._spawn('dotnet', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 25000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stdout || '') + '\n' + (res.stderr || '')).filter(l => /\berror\s+[A-Z]+\d+:/i.test(l));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'ruby') {
        if (isSingleFile && this.hasBinary('ruby')) {
          toolUsed = 'ruby -c';
          const res = this._spawn('ruby', ['-c', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stderr || '');
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'dart') {
        if (this.hasBinary('dart')) {
          toolUsed = 'dart analyze';
          const args = ['analyze', targetFile || '.'];
          const res = this._spawn('dart', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'elixir') {
        if (this.hasBinary('mix') && fs.existsSync(path.join(this.projectRoot, 'mix.exs'))) {
          toolUsed = 'mix compile';
          const res = this._spawn('mix', ['compile', '--return-errors'], { cwd: this.projectRoot, encoding: 'utf8', timeout: 20000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else if (isSingleFile && this.hasBinary('elixirc')) {
          toolUsed = 'elixirc';
          const res = this._spawn('elixirc', ['--ignore-module-conflict', '-o', os.tmpdir(), targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'lua') {
        if (isSingleFile && this.hasBinary('luac')) {
          toolUsed = 'luac -p';
          const res = this._spawn('luac', ['-p', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 8000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else if (isSingleFile && this.hasBinary('luacheck')) {
          toolUsed = 'luacheck';
          const res = this._spawn('luacheck', ['--no-color', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 8000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else {
          toolUsed = 'lua-structural-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'bash') {
        const shFiles = isSingleFile ? [targetFile] : this._walkCodeFiles(targetFile || this.projectRoot, spec.extensions).slice(0, 35);
        if (shFiles.length > 0 && this.hasBinary('shellcheck')) {
          toolUsed = isSingleFile ? 'shellcheck' : `shellcheck (${shFiles.length} scripts)`;
          const res = this._spawn('shellcheck', ['-f', 'gcc', ...shFiles], { cwd: this.projectRoot, encoding: 'utf8', timeout: 10000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else if (shFiles.length > 0 && this.hasBinary('bash')) {
          toolUsed = isSingleFile ? 'bash -n' : `bash -n (${shFiles.length} scripts)`;
          for (const sf of shFiles) {
            const res = this._spawn('bash', ['-n', sf], { cwd: this.projectRoot, encoding: 'utf8', timeout: 6000 });
            if (res.status !== 0) {
              rawErrors.push(...this._splitLines((res.stderr || '') + '\n' + (res.stdout || '')));
            }
          }
        } else {
          toolUsed = 'bash-structural-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'web') {
        toolUsed = 'web-syntax-validator';
        rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
      } else if (spec.id === 'yaml') {
        if (isSingleFile && this.hasBinary('yamllint')) {
          toolUsed = 'yamllint';
          const res = this._spawn('yamllint', ['-f', 'parsable', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 8000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else {
          toolUsed = 'yaml-structural-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'sql') {
        if (isSingleFile && this.hasBinary('sqlfluff')) {
          toolUsed = 'sqlfluff lint';
          const res = this._spawn('sqlfluff', ['lint', '--nocolor', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 12000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else {
          toolUsed = 'sql-structural-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'docker') {
        if (isSingleFile && this.hasBinary('hadolint')) {
          toolUsed = 'hadolint';
          const res = this._spawn('hadolint', ['--no-color', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 8000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stdout || '');
          }
        } else {
          toolUsed = 'dockerfile-structural-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'kotlin') {
        if (this.hasBinary('ktlint')) {
          toolUsed = 'ktlint';
          const args = targetFile ? [targetFile] : [];
          const res = this._spawn('ktlint', args, { cwd: this.projectRoot, encoding: 'utf8', timeout: 15000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stdout || '') + '\n' + (res.stderr || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'swift') {
        if (isSingleFile && this.hasBinary('swiftc')) {
          toolUsed = 'swiftc -typecheck';
          const res = this._spawn('swiftc', ['-typecheck', targetFile], { cwd: this.projectRoot, encoding: 'utf8', timeout: 12000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines(res.stderr || '');
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else if (spec.id === 'terraform') {
        if (this.hasBinary('terraform')) {
          toolUsed = 'terraform validate';
          const res = this._spawn('terraform', ['validate', '-no-color'], { cwd: isSingleFile ? path.dirname(targetFile) : (targetFile || this.projectRoot), encoding: 'utf8', timeout: 12000 });
          if (res.status !== 0) {
            rawErrors = this._splitLines((res.stderr || '') + '\n' + (res.stdout || ''));
          }
        } else {
          toolUsed = 'structural-syntax-check';
          rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
        }
      } else {
        toolUsed = 'structural-syntax-check';
        rawErrors = this._fallbackSyntaxDiagnostics(targetFile, spec.extensions);
      }
    } catch (err) {
      return this._toolFailure(spec, relFile || 'workspace', `Erro ao executar diagnósticos (${spec.name}): ${err.message}`, {
        stderr: err.stack || err.message,
        hint: 'Execute "node .agents/mcp-server.cjs lsp health" para ver o estado das ferramentas da stack.'
      });
    }

    const scopeLabel = relFile || 'workspace';
    const usedStructural = /(structural|syntax-validator)/.test(toolUsed);
    const realTools = REAL_DIAG_TOOLS[spec.id];

    // 1. Falha real de execução (binário ausente, timeout, erro de spawn): nunca vira "zero erros".
    if (this._spawnFailures.length > 0) {
      const f = this._spawnFailures[0];
      const cause = f.timedOut
        ? `'${f.bin}' excedeu o tempo limite e foi interrompido`
        : (f.code === 'ENOENT' ? `binário '${f.bin}' não encontrado no PATH` : `'${f.bin}' falhou ao iniciar (${f.code}): ${f.message}`);
      return this._toolFailure(spec, scopeLabel, `Falha da ferramenta de diagnóstico em ${scopeLabel}: ${cause}.`, {
        command: `${f.bin} ${(f.args || []).join(' ')}`.trim(),
        stderr: f.message,
        hint: f.timedOut
          ? 'Reduza o escopo informando file_path, ou verifique se a ferramenta está travada.'
          : `Instale/repare a ferramenta: ${(realTools && realTools.install) || spec.install[process.platform] || spec.install.default}`
      });
    }

    // 2. Validação estrutural (regex/chaves) sem NENHUM validador real instalado não pode afirmar "zero erros".
    if (usedStructural && realTools) {
      if (!isSingleFile && this._walkCodeFiles(targetFile || this.projectRoot, spec.extensions).length === 0) {
        return {
          text: `🩺 [LSP Diagnostics • ${spec.name}]\nℹ️ Nenhum arquivo ${spec.name} encontrado em ${scopeLabel} para diagnosticar.`,
          isError: false,
          hasDiagnostics: false,
          kind: 'ok'
        };
      }
      const nativeJson = isSingleFile && ['.json', '.jsonc'].includes(path.extname(targetFile).toLowerCase());
      const anyReal = realTools.bins.some(b => this.hasBinary(b));
      if (!anyReal && !nativeJson) {
        const partial = rawErrors.length > 0
          ? ` Achados estruturais parciais: ${rawErrors.slice(0, 5).join(' | ')}`
          : '';
        const res = this._toolFailure(spec, scopeLabel,
          `Nenhum validador real de ${spec.name} instalado (procurados: ${realTools.bins.join(', ')}). A checagem estrutural embutida não é confiável para afirmar "zero erros".${partial}`,
          {
            stderr: `Binários ausentes no PATH: ${realTools.bins.join(', ')}`,
            hint: `Instale: ${realTools.install}`
          });
        res.hasDiagnostics = rawErrors.length > 0;
        return res;
      }
    }

    // 3. Ferramenta retornou exit != 0 sem nenhuma linha de diagnóstico reconhecível.
    if (rawErrors.length === 0 && this._lastNonZero) {
      const nz = this._lastNonZero;
      return this._toolFailure(spec, scopeLabel,
        `'${nz.bin}' terminou com código ${nz.status}${nz.signal ? ` (sinal ${nz.signal})` : ''} sem diagnósticos legíveis em ${scopeLabel}.`,
        {
          command: `${nz.bin} ${(nz.args || []).join(' ')}`.trim(),
          exitCode: nz.status,
          stderr: nz.stderr || nz.stdout || '(sem saída)',
          hint: 'Execute o comando acima manualmente para reproduzir; verifique a instalação/versão da ferramenta.'
        });
    }

    if (rawErrors.length === 0) {
      return {
        text: `🩺 [LSP Diagnostics • ${spec.name}] (${toolUsed})\n✅ Zero erros detectados em ${scopeLabel}.`,
        isError: false,
        hasDiagnostics: false,
        kind: 'ok'
      };
    }

    // 4. A ferramenta funcionou e encontrou erros reais no código.
    const capped = rawErrors.slice(0, 20);
    const more = rawErrors.length > 20 ? `\n... (+${rawErrors.length - 20} linhas omitidas para economia de tokens)` : '';
    return {
      text: `🛑 [ERROS DE CÓDIGO • LSP Diagnostics • ${spec.name}] (${toolUsed}) — ${rawErrors.length} linha(s) de diagnóstico em ${scopeLabel}:\n` +
            capped.map(l => `  • ${l}`).join('\n') + more,
      isError: true,
      hasDiagnostics: true,
      kind: 'code'
    };
  }

  /**
   * Resultado padronizado de falha da PRÓPRIA ferramenta/LSP (não do código analisado).
   * O chamador (MCP/CLI/hook) registra e exibe via ErrorGuard.
   */
  _toolFailure(spec, scopeLabel, title, extra = {}) {
    const lines = [
      `🛑 [FALHA DA FERRAMENTA LSP • ${spec.name}] ${title}`
    ];
    if (extra.command) lines.push(`   Comando: ${extra.command}`);
    if (extra.exitCode !== undefined && extra.exitCode !== null) lines.push(`   Código de saída: ${extra.exitCode}`);
    if (extra.stderr) lines.push(`   Causa real: ${ErrorGuard.sanitizeText(extra.stderr, 600).split('\n').slice(0, 6).join('\n               ')}`);
    if (extra.hint) lines.push(`   💡 Como corrigir: ${extra.hint}`);
    return {
      text: lines.join('\n'),
      isError: true,
      hasDiagnostics: false,
      kind: 'tool',
      toolFailure: {
        component: 'lsp_diagnostics',
        title: `${spec.name}: ${title}`,
        command: extra.command || null,
        exitCode: extra.exitCode === undefined ? null : extra.exitCode,
        stderr: extra.stderr || null,
        hint: extra.hint || null,
        file: scopeLabel === 'workspace' ? null : scopeLabel
      }
    };
  }

  /**
   * Executa o gopls e devolve { out } ou { failure }. Qualquer falha real (binário ausente,
   * timeout, exit != 0) vira resultado de erro explícito com o stderr real, nunca fallback mudo.
   */
  _goplsQuery(op, args, timeout, targetFile) {
    const res = ErrorGuard.spawnStrict('gopls', args, { cwd: this.projectRoot, timeout });
    if (res.ok) return { out: (res.stdout || '').trim() };
    const rel = targetFile ? path.relative(this.projectRoot, targetFile) : null;
    const failure = this._toolFailure(
      LANGUAGE_REGISTRY.go,
      rel || 'workspace',
      `gopls ${op} falhou${res.timedOut ? ' (tempo limite excedido)' : ''}${res.status !== null && res.status !== undefined ? ` com código ${res.status}` : ''}.`,
      {
        command: `gopls ${args.map(a => (a === targetFile ? rel : a)).join(' ')}`,
        exitCode: res.status,
        stderr: (res.stderr || res.errorMessage || '(sem saída)').trim(),
        hint: 'Confirme a posição (arquivo:linha:coluna) e a saúde do gopls: "gopls version" / "go install golang.org/x/tools/gopls@latest".'
      }
    );
    failure.toolFailure.component = `lsp_${op}`;
    return { failure };
  }

  /**
   * 2. DEFINITION: Localiza onde um símbolo é declarado/definido no projeto.
   */
  definition({ symbol, file_path, line, column, lang } = {}) {
    const spec = this._resolveLanguage(lang, file_path);
    const targetFile = file_path ? this._resolveSafePath(file_path) : null;

    // Se gopls estiver disponível e coordenadas exatas forem fornecidas
    if (spec.id === 'go' && targetFile && line && column && this.hasBinary('gopls')) {
      const q = this._goplsQuery('definition', ['definition', `${targetFile}:${line}:${column}`], 10000, targetFile);
      if (q.failure) return q.failure;
      if (q.out) {
        return {
          text: `🎯 [LSP Definition • Go (gopls)]\n${q.out}`,
          isError: false
        };
      }
    }

    // Se não informou symbol mas informou file_path + line, extrai o identificador na linha/coluna
    let targetSymbol = symbol ? String(symbol).trim() : '';
    if (!targetSymbol && targetFile && line) {
      targetSymbol = this._extractSymbolAtPosition(targetFile, Number(line), Number(column || 1));
    }

    if (!targetSymbol) {
      return {
        text: 'Erro: informe o nome do símbolo (symbol) ou (file_path + line) para localizar a definição.',
        isError: true
      };
    }

    const defs = this._findDeclarations(targetSymbol, spec, targetFile);
    if (defs.length === 0) {
      return {
        text: `🔍 [LSP Definition • ${spec.name}] Nenhuma definição encontrada para o símbolo "${targetSymbol}".`,
        isError: false
      };
    }

    const formatted = defs.slice(0, 10).map(d => `📍 ${d.relPath}:${d.line} [${d.kind}] ➔ ${d.signature}`);
    return {
      text: `🎯 [LSP Definition • ${spec.name}] ${defs.length} definição(ões) para "${targetSymbol}":\n` + formatted.join('\n'),
      isError: false
    };
  }

  /**
   * 3. REFERENCES: Lista todas as referências a um símbolo no projeto antes de editar/refatorar.
   */
  references({ symbol, file_path, line, column, lang, limit = 25 } = {}) {
    const spec = this._resolveLanguage(lang, file_path);
    const targetFile = file_path ? this._resolveSafePath(file_path) : null;

    if (spec.id === 'go' && targetFile && line && column && this.hasBinary('gopls')) {
      const q = this._goplsQuery('references', ['references', `${targetFile}:${line}:${column}`], 10000, targetFile);
      if (q.failure) return q.failure;
      if (q.out) {
        const lines = this._splitLines(q.out).slice(0, limit);
        return {
          text: `🔗 [LSP References • Go (gopls)] ${lines.length} referência(s):\n` + lines.map(l => `  📄 ${l}`).join('\n'),
          isError: false
        };
      }
    }

    let targetSymbol = symbol ? String(symbol).trim() : '';
    if (!targetSymbol && targetFile && line) {
      targetSymbol = this._extractSymbolAtPosition(targetFile, Number(line), Number(column || 1));
    }

    if (!targetSymbol) {
      return {
        text: 'Erro: informe o nome do símbolo (symbol) ou (file_path + line) para buscar referências.',
        isError: true
      };
    }

    const searchRoot = targetFile && fs.existsSync(targetFile) && fs.statSync(targetFile).isDirectory()
      ? targetFile
      : this.projectRoot;

    const refs = this._findSymbolOccurrences(targetSymbol, searchRoot, spec, Number(limit) || 25);
    if (refs.length === 0) {
      return {
        text: `🔗 [LSP References • ${spec.name}] Nenhuma referência encontrada para "${targetSymbol}".`,
        isError: false
      };
    }

    const formatted = refs.map(r => `  📄 ${r.relPath}:${r.line} ${r.isDef ? '[DEF]' : '[REF]'} ➔ ${r.snippet}`);
    return {
      text: `🔗 [LSP References • ${spec.name}] ${refs.length} ocorrência(s) encontrada(s) para "${targetSymbol}":\n` + formatted.join('\n'),
      isError: false
    };
  }

  /**
   * 4. HOVER & SYMBOLS: Inspeciona assinatura completa, tipo e docstring de um símbolo, ou lista símbolos do arquivo.
   */
  hover({ symbol, file_path, line, column, lang } = {}) {
    const spec = this._resolveLanguage(lang, file_path);
    const targetFile = file_path ? this._resolveSafePath(file_path) : null;

    // Se pediu apenas o arquivo sem símbolo nem linha, lista os símbolos estruturais do arquivo (lsp_symbols)
    if (targetFile && !symbol && !line) {
      if (!fs.existsSync(targetFile)) {
        return { text: `Erro: arquivo não encontrado: ${file_path}`, isError: true };
      }
      if (spec.id === 'go' && this.hasBinary('gopls')) {
        const q = this._goplsQuery('symbols', ['symbols', targetFile], 8000, targetFile);
        if (q.failure) return q.failure;
        if (q.out) {
          return {
            text: `🧭 [LSP Symbols • Go (gopls)] ${path.relative(this.projectRoot, targetFile)}:\n${q.out}`,
            isError: false
          };
        }
      }
      const outline = this.skeleton.getOutline(targetFile);
      return { text: outline, isError: false };
    }

    if (spec.id === 'go' && targetFile && line && column && this.hasBinary('gopls')) {
      const q = this._goplsQuery('hover', ['definition', `${targetFile}:${line}:${column}`], 8000, targetFile);
      if (q.failure) return q.failure;
      if (q.out) {
        return {
          text: `💡 [LSP Hover • Go (gopls)]\n${q.out}`,
          isError: false
        };
      }
    }

    let targetSymbol = symbol ? String(symbol).trim() : '';
    if (!targetSymbol && targetFile && line) {
      targetSymbol = this._extractSymbolAtPosition(targetFile, Number(line), Number(column || 1));
    }

    if (!targetSymbol) {
      return {
        text: 'Erro: informe symbol ou file_path para inspecionar assinatura/símbolos.',
        isError: true
      };
    }

    const defs = this._findDeclarations(targetSymbol, spec, targetFile);
    if (defs.length === 0) {
      return {
        text: `💡 [LSP Hover • ${spec.name}] Símbolo "${targetSymbol}" não encontrado.`,
        isError: false
      };
    }

    const primary = defs[0];
    const hoverDetails = this._extractHoverBlock(primary.fullPath, primary.line);
    return {
      text: `💡 [LSP Hover • ${spec.name}] ${targetSymbol} (${primary.relPath}:${primary.line} • ${primary.kind}):\n${hoverDetails}`,
      isError: false
    };
  }

  /**
   * 5. RENAME: Renomeia um símbolo com segurança em todo o escopo (com suporte a dry_run).
   */
  rename({ symbol, new_name, path: targetPath = '.', lang, dry_run = false } = {}) {
    const oldSym = symbol ? String(symbol).trim() : '';
    const newSym = new_name ? String(new_name).trim() : '';

    if (!oldSym || !newSym) {
      return { text: 'Erro: symbol (nome atual) e new_name (novo nome) são obrigatórios.', isError: true };
    }

    const validIdent = /^[A-Za-z_$][A-Za-z0-9_$]*$/;
    if (!validIdent.test(oldSym) || !validIdent.test(newSym)) {
      return { text: `Erro: identificadores inválidos para rename ("${oldSym}" -> "${newSym}").`, isError: true };
    }

    if (oldSym === newSym) {
      return { text: 'Erro: o novo nome é idêntico ao nome atual.', isError: true };
    }

    const spec = this._resolveLanguage(lang, targetPath !== '.' ? targetPath : null);
    const scopePath = this._resolveSafePath(targetPath, true);
    if (!scopePath) {
      return { text: `Erro de segurança: caminho alvo fora dos limites do workspace (${targetPath}).`, isError: true };
    }
    if (!fs.existsSync(scopePath)) {
      return { text: `Erro: caminho alvo não encontrado: ${targetPath}`, isError: true };
    }

    const files = fs.statSync(scopePath).isFile()
      ? [scopePath]
      : this._walkCodeFiles(scopePath, spec ? spec.extensions : null);

    const wordRegex = new RegExp(`\\b${this._escapeRegex(oldSym)}\\b`, 'g');
    const affectedFiles = [];
    const failedFiles = [];
    let totalReplacements = 0;

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (!wordRegex.test(content)) continue;
        wordRegex.lastIndex = 0;

        const lines = content.split(/\r?\n/);
        const changedLines = [];
        for (let i = 0; i < lines.length; i++) {
          if (wordRegex.test(lines[i])) {
            changedLines.push(i + 1);
          }
          wordRegex.lastIndex = 0;
        }

        if (changedLines.length > 0) {
          const matchesInFile = (content.match(wordRegex) || []).length;
          totalReplacements += matchesInFile;
          const rel = path.relative(this.projectRoot, file);
          affectedFiles.push({ file, rel, count: matchesInFile, lines: changedLines });

          if (!dry_run) {
            const updated = content.replace(wordRegex, newSym);
            fs.writeFileSync(file, updated, 'utf8');
          }
        }
      } catch (err) {
        failedFiles.push({ rel: path.relative(this.projectRoot, file), message: err.message });
      }
    }

    if (affectedFiles.length === 0 && failedFiles.length === 0) {
      return {
        text: `✏️ [LSP Rename] Nenhuma ocorrência do símbolo "${oldSym}" encontrada em ${targetPath}.`,
        isError: false
      };
    }

    const modeTag = dry_run ? '[DRY-RUN / SIMULAÇÃO]' : '✅ [APLICADO]';
    const summaryLines = affectedFiles.slice(0, 15).map(
      f => `  📄 ${f.rel} (${f.count} substituição(ões) nas linhas: ${f.lines.slice(0, 8).join(', ')}${f.lines.length > 8 ? '...' : ''})`
    );
    if (failedFiles.length > 0) {
      const failLines = failedFiles.slice(0, 10).map(f => `  ❌ ${f.rel}: ${f.message}`);
      return {
        text: `🛑 [LSP Rename • FALHA PARCIAL] "${oldSym}" ➔ "${newSym}": ${failedFiles.length} arquivo(s) NÃO puderam ser lidos/gravados (${affectedFiles.length} processado(s) com sucesso):\n` +
              failLines.join('\n') + (summaryLines.length ? `\nArquivos processados:\n${summaryLines.join('\n')}` : '') +
              '\n💡 Como corrigir: verifique permissões/arquivos bloqueados e rode o rename novamente (use --dry-run para simular).',
        isError: true,
        kind: 'tool',
        toolFailure: {
          component: 'lsp_rename',
          title: `Rename "${oldSym}" -> "${newSym}" falhou em ${failedFiles.length} arquivo(s)`,
          stderr: failLines.join('\n'),
          hint: 'Verifique permissões/arquivos bloqueados e rode o rename novamente.'
        }
      };
    }

    return {
      text: `✏️ [LSP Rename] ${modeTag} "${oldSym}" ➔ "${newSym}" (${totalReplacements} ocorrências em ${affectedFiles.length} arquivo(s)):\n` +
            summaryLines.join('\n'),
      isError: false
    };
  }

  // ===========================================================================
  // Helpers Internos
  // ===========================================================================

  _splitLines(str) {
    if (!str) return [];
    return String(str)
      .split(/\r?\n/)
      .map(l => l.trim())
      .filter(Boolean);
  }

  _escapeRegex(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  _extractSymbolAtPosition(filePath, lineNum, colNum) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const targetLine = lines[lineNum - 1] || '';
      if (!targetLine) return '';

      const idx = Math.max(0, Math.min(targetLine.length - 1, (colNum || 1) - 1));
      const left = targetLine.slice(0, idx + 1).match(/[A-Za-z_$][A-Za-z0-9_$]*$/);
      const right = targetLine.slice(idx + 1).match(/^[A-Za-z0-9_$]*/);
      if (left) {
        return left[0] + (right ? right[0] : '');
      }
      const firstIdent = targetLine.match(/[A-Za-z_$][A-Za-z0-9_$]*/);
      return firstIdent ? firstIdent[0] : '';
    } catch {
      return '';
    }
  }

  _fallbackSyntaxDiagnostics(targetFile, allowedExtensions = null) {
    if (!targetFile || (fs.existsSync(targetFile) && fs.statSync(targetFile).isDirectory())) {
      const scanRoot = (targetFile && fs.existsSync(targetFile)) ? targetFile : this.projectRoot;
      const files = this._walkCodeFiles(scanRoot, allowedExtensions).slice(0, 50);
      const allErrors = [];
      for (const f of files) {
        allErrors.push(...this._fallbackSyntaxDiagnostics(f, allowedExtensions));
        if (allErrors.length >= 25) break;
      }
      return allErrors;
    }
    if (!fs.existsSync(targetFile)) {
      return [];
    }
    const errors = [];
    try {
      const content = fs.readFileSync(targetFile, 'utf8');
      const ext = path.extname(targetFile).toLowerCase();
      const base = path.basename(targetFile).toLowerCase();
      const rel = path.relative(this.projectRoot, targetFile);
      const lines = content.split(/\r?\n/);

      // 1. JSON / JSONC
      if (ext === '.json' || ext === '.jsonc') {
        try {
          const clean = ext === '.jsonc'
            ? content.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
            : content;
          JSON.parse(clean);
        } catch (err) {
          errors.push(`${rel}: SyntaxError JSON: ${err.message}`);
        }
        return errors;
      }

      // 2. YAML / Helm
      if (ext === '.yaml' || ext === '.yml') {
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i];
          if (/^\s*\t/.test(l)) {
            errors.push(`${rel}:${i + 1}:1: YAML SyntaxError: indentação com TAB detectada (use apenas espaços).`);
          }
        }
        return errors;
      }

      // 3. Dockerfile / Containerfile
      if (ext === '.dockerfile' || base === 'dockerfile' || base.startsWith('dockerfile.') || base === 'containerfile') {
        const hasFrom = lines.some(l => /^\s*FROM\s+\S+/i.test(l));
        if (!hasFrom) {
          errors.push(`${rel}:1:1: Dockerfile Error: instrução obrigatória 'FROM' não encontrada.`);
        }
        return errors;
      }

      // 4. Lua (balanceamento de function/if/do/repeat ... end/until)
      if (ext === '.lua') {
        let depth = 0;
        for (let i = 0; i < lines.length; i++) {
          const t = lines[i].replace(/--.*$/, '').trim();
          if (!t) continue;
          const opens = (t.match(/\b(function|then|do|repeat)\b/g) || []).length;
          const closes = (t.match(/\b(end|until)\b/g) || []).length;
          depth += (opens - closes);
        }
        if (depth !== 0) {
          errors.push(`${rel}:1:1: Lua SyntaxError: desbalanceamento de blocos (function/then/do vs end).`);
        }
        return errors;
      }

      // 5. SQL (balanceamento de parênteses)
      if (ext === '.sql') {
        let parenDepth = 0;
        for (let i = 0; i < lines.length; i++) {
          const l = lines[i].replace(/--.*$/, '');
          for (const ch of l) {
            if (ch === '(') parenDepth++;
            else if (ch === ')') parenDepth--;
          }
        }
        if (parenDepth !== 0) {
          errors.push(`${rel}:1:1: SQL SyntaxError: parênteses desbalanceados na query/DDL.`);
        }
        return errors;
      }

      // 6. Verificação leve de delimitadores em linguagens baseadas em chaves (incluindo CSS/SCSS/Kotlin/Swift/Terraform)
      if (['.ts', '.tsx', '.js', '.jsx', '.cjs', '.mjs', '.go', '.rs', '.php', '.java', '.cs', '.c', '.cpp', '.cc', '.cxx', '.h', '.hpp', '.dart', '.css', '.scss', '.less', '.kt', '.kts', '.swift', '.tf'].includes(ext)) {
        let braceDepth = 0;
        let lastOpenLine = 1;
        let inBlockComment = false;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          for (let c = 0; c < line.length; c++) {
            const ch = line[c];
            const next = line[c + 1];
            if (inBlockComment) {
              if (ch === '*' && next === '/') { inBlockComment = false; c++; }
              continue;
            }
            if (ch === '/' && next === '*') { inBlockComment = true; c++; continue; }
            if (ch === '/' && next === '/') break;
            if (ch === '"' || ch === "'" || ch === '`') {
              const quote = ch;
              c++;
              while (c < line.length && line[c] !== quote) {
                if (line[c] === '\\') c++;
                c++;
              }
              continue;
            }
            if (ch === '{') {
              braceDepth++;
              lastOpenLine = i + 1;
            } else if (ch === '}') {
              braceDepth--;
              if (braceDepth < 0) {
                errors.push(`${rel}:${i + 1}:1: SyntaxError: '}' inesperado sem bloco correspondente.`);
                braceDepth = 0;
              }
            }
          }
        }
        if (braceDepth > 0) {
          errors.push(`${rel}:${lastOpenLine}:1: SyntaxError: bloco '{' não fechado até o final do arquivo.`);
        }
      }
    } catch (err) {
      errors.push(`${path.relative(this.projectRoot, targetFile)}: não foi possível analisar o arquivo (${err.message}).`);
    }
    return errors;
  }

  _walkCodeFiles(dir, allowedExtensions = null, results = [], depth = 0) {
    if (depth > 6 || !fs.existsSync(dir)) return results;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this._walkCodeFiles(full, allowedExtensions, results, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase();
          const base = entry.name.toLowerCase();
          const isDocker = base === 'dockerfile' || base.startsWith('dockerfile.') || base === 'containerfile';
          if (allowedExtensions && allowedExtensions.length > 0) {
            if (allowedExtensions.includes(ext) || (allowedExtensions.includes('.dockerfile') && isDocker)) {
              results.push(full);
            }
          } else if (CODE_EXTENSIONS.has(ext) || isDocker) {
            results.push(full);
          }
        }
      }
    } catch {}
    return results;
  }

  _isDeclarationLine(trimmedLine, symbol, ext) {
    const s = this._escapeRegex(symbol);
    const patterns = [
      // JS / TS
      { kind: 'function', re: new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?function\\s*\\*?\\s+${s}\\b`) },
      { kind: 'class', re: new RegExp(`^(?:export\\s+)?(?:default\\s+)?(?:abstract\\s+)?class\\s+${s}\\b`) },
      { kind: 'interface', re: new RegExp(`^(?:export\\s+)?interface\\s+${s}\\b`) },
      { kind: 'type', re: new RegExp(`^(?:export\\s+)?type\\s+${s}\\b`) },
      { kind: 'enum', re: new RegExp(`^(?:export\\s+)?(?:const\\s+)?enum\\s+${s}\\b`) },
      { kind: 'const/var', re: new RegExp(`^(?:export\\s+)?(?:const|let|var)\\s+${s}\\s*=(?!\\s*require\\s*\\()`) },
      // Go
      { kind: 'func', re: new RegExp(`^func\\s+(?:\\([^)]+\\)\\s*)?${s}\\b`) },
      { kind: 'type', re: new RegExp(`^type\\s+${s}\\b`) },
      // Python
      { kind: 'def', re: new RegExp(`^(?:async\\s+)?def\\s+${s}\\b`) },
      { kind: 'class', re: new RegExp(`^class\\s+${s}\\b`) },
      // Rust
      { kind: 'fn', re: new RegExp(`^(?:pub(?:\\([^)]+\\))?\\s+)?(?:async\\s+)?(?:unsafe\\s+)?fn\\s+${s}\\b`) },
      { kind: 'struct', re: new RegExp(`^(?:pub(?:\\([^)]+\\))?\\s+)?struct\\s+${s}\\b`) },
      { kind: 'enum', re: new RegExp(`^(?:pub(?:\\([^)]+\\))?\\s+)?enum\\s+${s}\\b`) },
      { kind: 'trait', re: new RegExp(`^(?:pub(?:\\([^)]+\\))?\\s+)?trait\\s+${s}\\b`) },
      // Lua
      { kind: 'lua-fn', re: new RegExp(`^(?:local\\s+)?function\\s+(?:[A-Za-z_][A-Za-z0-9_]*[.:])?${s}\\b`) },
      { kind: 'lua-fn', re: new RegExp(`^(?:local\\s+)?(?:[A-Za-z_][A-Za-z0-9_]*\\.)?${s}\\s*=\\s*function\\b`) },
      // Bash / Shell
      { kind: 'sh-fn', re: new RegExp(`^(?:function\\s+)?${s}\\s*\\(\\s*\\)`) },
      { kind: 'sh-fn', re: new RegExp(`^function\\s+${s}\\b`) },
      // SQL
      { kind: 'sql-ddl', re: new RegExp(`^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TABLE|VIEW|MATERIALIZED\\s+VIEW|FUNCTION|PROCEDURE|INDEX|TYPE)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?(?:[A-Za-z0-9_]+\\.)?["\`\\[]?${s}["\`\\]]?\\b`, 'i') },
      // Docker
      { kind: 'docker-stage', re: new RegExp(`^FROM\\s+\\S+\\s+AS\\s+${s}\\b`, 'i') },
      { kind: 'docker-arg', re: new RegExp(`^(?:ARG|ENV)\\s+${s}(?:=|\\b)`, 'i') },
      // Kotlin & Swift
      { kind: 'kt/swift-fn', re: new RegExp(`^(?:public|private|protected|internal|open|override|suspend|inline|mutating|static|\\s)*fun(?:c)?\\s+(?:<[^>]+>\\s*)?${s}\\b`) },
      // Terraform
      { kind: 'tf-block', re: new RegExp(`^(?:resource|data|module|variable|output)\\s+(?:"[^"]+"\\s+)?"${s}"`) },
      // PHP / Java / C# / Dart / C++
      { kind: 'method/func', re: new RegExp(`^(?:public|private|protected|static|final|abstract|async|virtual|override|\\s)*function\\s+&?${s}\\b`) },
      { kind: 'member', re: new RegExp(`^(?:public|private|protected|internal|static|final|synchronized|virtual|override|async|[A-Za-z0-9_<>\\[\\]]+\\s+)+${s}\\s*\\(`) },
      { kind: 'struct/class', re: new RegExp(`^(?:public|private|protected|internal|abstract|final|sealed|partial|data|open|\\s)*(?:class|interface|trait|struct|record|enum|mixin|object|protocol|actor)\\s+${s}\\b`) },
      // Ruby / Elixir
      { kind: 'module', re: new RegExp(`^(?:module|defmodule)\\s+${s}\\b`) },
      { kind: 'def', re: new RegExp(`^(?:def|defp|defmacro)\\s+(?:self\\.)?${s}\\b`) }
    ];

    for (const p of patterns) {
      if (p.re.test(trimmedLine)) return p.kind;
    }
    return null;
  }

  _findDeclarations(symbol, spec, preferredFile = null) {
    const files = [];
    if (preferredFile && fs.existsSync(preferredFile) && fs.statSync(preferredFile).isFile()) {
      files.push(preferredFile);
    }
    const workspaceFiles = this._walkCodeFiles(this.projectRoot, spec ? spec.extensions : null);
    for (const f of workspaceFiles) {
      if (!files.includes(f)) files.push(f);
    }

    // Fallback: se não achou na extensão da linguagem primária, busca em todos os arquivos de código
    if (files.length === 0) {
      files.push(...this._walkCodeFiles(this.projectRoot, null));
    }

    const results = [];
    const wordRe = new RegExp(`\\b${this._escapeRegex(symbol)}\\b`);

    for (const file of files) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (!wordRe.test(content)) continue;
        const ext = path.extname(file).toLowerCase();
        const lines = content.split(/\r?\n/);

        for (let i = 0; i < lines.length; i++) {
          const trimmed = lines[i].trim();
          if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('#') || trimmed.startsWith('*')) continue;
          const kind = this._isDeclarationLine(trimmed, symbol, ext);
          if (kind) {
            results.push({
              fullPath: file,
              relPath: path.relative(this.projectRoot, file),
              line: i + 1,
              kind,
              signature: trimmed.slice(0, 120)
            });
          }
        }
      } catch {}
    }

    const priorityWeight = (kind) => {
      if (['class', 'struct', 'interface', 'trait', 'type', 'enum', 'module', 'struct/class'].includes(kind)) return 1;
      if (['function', 'func', 'def', 'fn', 'method/func'].includes(kind)) return 2;
      return 3;
    };

    results.sort((a, b) => priorityWeight(a.kind) - priorityWeight(b.kind));
    return results;
  }

  _findSymbolOccurrences(symbol, searchRoot, spec, limit = 25) {
    const files = this._walkCodeFiles(searchRoot, null);
    const wordRe = new RegExp(`\\b${this._escapeRegex(symbol)}\\b`);
    const results = [];

    for (const file of files) {
      if (results.length >= limit) break;
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (!wordRe.test(content)) continue;
        const ext = path.extname(file).toLowerCase();
        const lines = content.split(/\r?\n/);
        const relPath = path.relative(this.projectRoot, file);

        for (let i = 0; i < lines.length; i++) {
          if (results.length >= limit) break;
          const trimmed = lines[i].trim();
          if (!trimmed) continue;
          if (wordRe.test(trimmed)) {
            const isDef = Boolean(this._isDeclarationLine(trimmed, symbol, ext));
            results.push({
              relPath,
              line: i + 1,
              isDef,
              snippet: trimmed.slice(0, 110)
            });
          }
        }
      } catch {}
    }

    // Ordena definições primeiro
    results.sort((a, b) => (b.isDef ? 1 : 0) - (a.isDef ? 1 : 0));
    return results;
  }

  _extractHoverBlock(filePath, declLineNum) {
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      const lines = content.split(/\r?\n/);
      const idx = declLineNum - 1;

      // Captura comentários/docstrings imediatamente acima da declaração (até 8 linhas)
      let startIdx = idx;
      for (let i = idx - 1; i >= Math.max(0, idx - 8); i--) {
        const t = lines[i].trim();
        if (t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('*/') || t.startsWith('///') || t.startsWith('@') || t.startsWith('#[')) {
          startIdx = i;
        } else {
          break;
        }
      }

      // Captura a assinatura (e campos se for struct/interface curta, até 12 linhas)
      const endIdx = Math.min(lines.length - 1, idx + 10);
      const snippet = [];
      for (let i = startIdx; i <= endIdx; i++) {
        snippet.push(`  ${i + 1}: ${lines[i]}`);
        if (i >= idx && (lines[i].trim().endsWith('}') || lines[i].trim().endsWith(';'))) {
          break;
        }
      }
      return snippet.join('\n');
    } catch {
      return '';
    }
  }
}

module.exports = LspEngine;
module.exports.LANGUAGE_REGISTRY = LANGUAGE_REGISTRY;
module.exports.REAL_DIAG_TOOLS = REAL_DIAG_TOOLS;
