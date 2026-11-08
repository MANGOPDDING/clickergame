const { Script } = require('node:vm');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { config } = require('../package.json');

function gameContent() {
  const version = config.gameVersion;
  if (!Number.isSafeInteger(version) || version < 1 || version > 0xffffffff) {
    throw new Error('config.gameVersion must be a positive 32-bit integer');
  }
  const source = readFileSync(resolve(__dirname, '..', config.gameSource), 'utf8');
  const scripts = [...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  if (scripts.length !== 1 || (source.match(/<script\b/gi) || []).length !== 1) {
    throw new Error('Expected exactly one inline game script');
  }
  const script = `${scripts[0][1]}\nwindow.__journeyGameReady = ${version};\n`;
  new Script(script, { filename: config.gameSource });
  const html = source.replace(scripts[0][0], () => [
    `<meta name="journey-game-version" content="${version}">`,
    '<script src="save-transfer.js"></script>',
    `<script src="game.js?v=${version}"></script>`,
    '<script src="lightweight.js"></script>'
  ].join('\n'));
  return { protocol: 1, version, html, script };
}

module.exports = { gameContent };
