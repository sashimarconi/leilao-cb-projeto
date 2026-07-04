#!/usr/bin/env node
'use strict';

const { execSync } = require('child_process');
const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');

// 1. Bundle api/server.js → api/server.bundle.cjs (standalone, sem deps externas)
console.log('[build] Bundling API server...');
esbuild.buildSync({
  entryPoints: [path.join(__dirname, 'api/server.js')],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outfile: path.join(__dirname, 'api/server.bundle.cjs'),
  external: ['pg-native'],
  logLevel: 'info',
});
console.log('[build] API bundle created: api/server.bundle.cjs');

// 2. Build frontend Vite
console.log('[build] Building frontend...');
execSync('pnpm --filter @workspace/leilao-cb run build', {
  stdio: 'inherit',
  cwd: path.join(__dirname, '../..'),
  env: { ...process.env, BASE_PATH: '/', PORT: '3000' },
});
console.log('[build] Frontend built to dist/');
