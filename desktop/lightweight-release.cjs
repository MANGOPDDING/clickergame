const { copyFileSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');
const { version } = require('../src-tauri/tauri.conf.json');

const tag = process.env.RELEASE_TAG;
const repository = process.env.GITHUB_REPOSITORY;
if (tag !== `v${version}`) throw new Error(`Expected release tag v${version}`);
if (!/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(repository || '')) {
  throw new Error('Expected GITHUB_REPOSITORY in owner/name format');
}

const bundle = 'src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis';
const installers = readdirSync(bundle).filter(name => name.endsWith(`_${version}_x64-setup.exe`));
if (installers.length !== 1) throw new Error('Expected exactly one x64 NSIS installer');
const installer = join(bundle, installers[0]);
const size = statSync(installer).size;
if (size > 10_000_000) throw new Error(`Installer exceeds 10 MB: ${size} bytes`);
const signature = readFileSync(installer + '.sig', 'utf8').trim();
if (!signature) throw new Error('No update signature');

const out = 'dist/lightweight-release';
mkdirSync(out, { recursive: true });
const filename = `LittleTownChroniclesLite-Setup-${version}.exe`;
copyFileSync(installer, join(out, filename));
copyFileSync(installer + '.sig', join(out, filename + '.sig'));
const manifest = {
  version,
  platforms: {
    'windows-x86_64': {
      signature,
      url: `https://github.com/${repository}/releases/download/${tag}/${filename}`
    }
  }
};
writeFileSync(join(out, 'latest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Lightweight installer: ${size} bytes`);
