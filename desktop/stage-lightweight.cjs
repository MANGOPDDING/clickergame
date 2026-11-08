const { copyFileSync, mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { config } = require('../package.json');

const root = resolve(__dirname, '..');
const html = readFileSync(join(root, config.gameSource), 'utf8');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 1) throw new Error('Expected one inline game script');

const dist = join(root, 'dist', 'tauri-web');
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, 'game.js'), scripts[0][1]);
writeFileSync(join(dist, 'index.html'), html.replace(scripts[0][0], () => [
  '<script src="save-transfer.js"></script>',
  '<script src="game.js"></script>',
  '<script src="lightweight.js"></script>'
].join('\n')));
for (const file of ['save-transfer.js', 'lightweight.js']) {
  copyFileSync(join(__dirname, file), join(dist, file));
}
