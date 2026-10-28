#!/usr/bin/env node
'use strict';

/**
 * Antigravity GSD Kit — Alias para gsd-agy-config.cjs
 * Redireciona chamadas legadas de gsd-agy-settings para a Central Unificada gsd-agy-config.
 */

const { main } = require('./gsd-agy-config.cjs');
if (typeof main === 'function') {
  main().catch((err) => {
    console.error('🛑 Erro no alias gsd-agy-settings:', err);
    process.exit(1);
  });
}
