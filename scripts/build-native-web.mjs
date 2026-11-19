import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const rootDir = path.resolve(import.meta.dirname, '..');
const distDir = path.join(rootDir, 'dist');

console.log('[DayRhythm] Building standalone native web bundle (no Workbox SW cache)...');

execSync('npx vite build', {
  cwd: rootDir,
  stdio: 'inherit',
  env: {
    ...process.env,
    NATIVE_APP: 'true',
    VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
  },
});

const indexHtml = path.join(distDir, 'index.html');
if (!fs.existsSync(indexHtml)) {
  throw new Error('Build failed: dist/index.html was not generated.');
}

const assetsDir = path.join(distDir, 'assets');
const assetFiles = fs.existsSync(assetsDir) ? fs.readdirSync(assetsDir) : [];
if (assetFiles.length === 0) {
  throw new Error('Build failed: dist/assets is empty.');
}

console.log(`[DayRhythm] Native web bundle verified (${assetFiles.length} assets in dist/assets).`);
