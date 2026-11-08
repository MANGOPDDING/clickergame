const { copyFileSync, mkdirSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { gameContent } = require('./game-content.cjs');

const root = resolve(__dirname, '..');
const content = gameContent();

const dist = join(root, 'dist', 'tauri-web');
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'game.js'), content.script);
writeFileSync(join(dist, 'index.html'), content.html);
writeFileSync(join(dist, 'game-version.txt'), String(content.version));
for (const file of ['save-transfer.js', 'lightweight.js']) {
  copyFileSync(join(__dirname, file), join(dist, file));
}
