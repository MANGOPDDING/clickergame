const { execFileSync } = require('node:child_process');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { gameContent } = require('./game-content.cjs');

const content = gameContent();
if (process.env.CONTENT_TAG !== `game-v${content.version}`) {
  throw new Error(`Expected content tag game-v${content.version}`);
}
if (!process.env.TAURI_SIGNING_PRIVATE_KEY) throw new Error('Content signing key is missing');
const out = 'dist/game-content';
mkdirSync(out, { recursive: true });
const payload = JSON.stringify(content);
const file = join(out, 'payload.json');
writeFileSync(file, payload);
execFileSync(process.execPath, [
  require.resolve('@tauri-apps/cli/tauri.js'), 'signer', 'sign', '--app-version', `0.0.${content.version}`, file
], { stdio: ['ignore', 'ignore', 'inherit'] });
const signature = readFileSync(file + '.sig', 'utf8').trim();
const envelope = JSON.stringify({ payload, signature }) + '\n';
if (Buffer.byteLength(envelope) > 4 * 1024 * 1024) throw new Error('Game update exceeds 4 MiB');
writeFileSync(join(out, 'latest.json'), envelope);
console.log(`Game V${content.version}: ${Buffer.byteLength(envelope)} bytes`);
