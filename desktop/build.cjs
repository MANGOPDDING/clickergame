const { Arch, build, Platform } = require('electron-builder');
const { config, version } = require('../package.json');

const repository = process.env.JOURNEY_RELEASE_REPOSITORY;
const repoPattern = /^([A-Za-z0-9][A-Za-z0-9-]*)\/([A-Za-z0-9_.-]+)$/;
const match = repository && repoPattern.exec(repository);
if (repository && !match) throw new Error('JOURNEY_RELEASE_REPOSITORY must be owner/repository');
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
  throw new Error(`The tag must match package.json: v${version}`);
}

build({
  targets: Platform.WINDOWS.createTarget(['nsis'], Arch.x64),
  publish: 'never',
  config: {
    appId: 'jp.littletown.chronicles',
    executableName: 'LittleTownChronicles',
    artifactName: 'LittleTownChronicles-Setup-${version}.${ext}',
    directories: { output: match ? 'dist/release' : 'dist' },
    files: ['desktop/main.cjs', 'desktop/save-transfer.js', config.gameSource, 'package.json'],
    publish: match ? { provider: 'github', owner: match[1], repo: match[2], private: false } : null,
    nsis: {
      oneClick: false,
      perMachine: false,
      allowElevation: false,
      deleteAppDataOnUninstall: false
    }
  }
}).catch(error => {
  console.error(error);
  process.exitCode = 1;
});
