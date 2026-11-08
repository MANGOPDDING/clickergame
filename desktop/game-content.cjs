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
  const markup = source.replace(scripts[0][0], () => [
    `<meta name="journey-game-version" content="${version}">`,
    '<script src="save-transfer.js"></script>',
    `<script src="game.js?v=${version}"></script>`,
    '<script src="lightweight.js"></script>'
  ].join('\n'));
  const styles = [];
  // Keep the HTML free of inline style elements. Tauri adds a style nonce to
  // embedded HTML, which makes Chromium reject the game's later style elements.
  const html = markup.replace(/<style(?:\s+id="([^"]+)")?\s*>([\s\S]*?)<\/style>/gi,
    (_, id, css) => {
      styles.push({ id, css });
      return '';
    });
  if (!styles.length || /<style\b/i.test(html)) {
    throw new Error('Expected supported style elements in the game HTML');
  }
  const loadStyles = `for (const { id, css } of ${JSON.stringify(styles)}) {
    const style = document.createElement('style');
    if (id) style.id = id;
    style.textContent = css;
    document.head.appendChild(style);
  }`;
  const script = `${loadStyles}\n${scripts[0][1]}\nwindow.__journeyGameReady = ${version};\n`;
  new Script(script, { filename: config.gameSource });
  return { protocol: 1, version, html, script };
}

module.exports = { gameContent };
