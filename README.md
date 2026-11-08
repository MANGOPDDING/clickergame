# clickergame
4meandfriend

## 小さな町の年代記 Windows版

HTML版V34をWindowsアプリにしたものです。Windows x64向けのインストーラーを作成できます。ゲーム内容は `package.json` の `config.gameSource` で指定します。

## 手元で試す

Node.js 24を用意し、プロジェクトのフォルダーで実行します。

```powershell
npm ci
npm start
npm run build:windows
```

`npm start` は開発用です。最後のコマンドで `dist/LittleTownChronicles-Setup-0.34.0.exe` が生成されます。この試用インストーラーにはGitHubの配布先が設定されていません。友達には、以下で作成するGitHub Releasesのインストーラーを渡してください。

## 最初の配布

1. このリポジトリでバージョンタグをプッシュすると、GitHub ActionsがWindows用の初回インストーラーと更新用ファイルを作成します。
2. [Releases](https://github.com/MANGOPDDING/clickergame/releases)の下書きにインストーラー、`latest.yml`、`.blockmap`が揃ったら公開します。
3. 友達にはReleaseページの `LittleTownChronicles-Setup-0.34.0.exe` を初回だけインストールしてもらいます。

アプリは起動時と起動中の4時間ごとに公開済みの新版を確認し、バックグラウンドで取得します。取得済みの更新はアプリを閉じると適用されます。「更新 → 更新を確認」から手動でも確認できます。

初回の試作ビルドはWindowsのコード署名が付いていないため、Windowsに警告が出ることがあります。署名を付ける場合は、GitHub Actionsのシークレット `CSC_LINK` と `CSC_KEY_PASSWORD` を設定します。署名付きで配布を始めた場合は、以後も同じ発行元の証明書でビルドします。

## 次のアップデート

1. 新しいゲームHTMLを追加し、`package.json` の `config.gameSource` をそのファイルに切り替えます。
2. `npm run test:game` で確認し、`npm version patch --no-git-tag-version` でバージョンを上げます。
3. 新しいHTML、`package.json` と `package-lock.json` をコミットしてプッシュします。バージョンと一致するタグ（例 `v0.34.1`）を作成してプッシュします。
4. GitHub Releasesで下書きを確認し、公開します。

更新してもWindowsアプリのセーブは同じ場所（`%APPDATA%\LittleTownChronicles`）に保存されます。開発用の `npm start` は別の保存先を使います。

## 既存のHTML版からセーブを移す

Windowsアプリでは「セーブ書き出し」「セーブ取り込み」が使えます。従来のHTML版のセーブは、次の方法で一度だけ移せます。

1. ブラウザーで**普段プレイしている同じHTMLファイル**を開きます。
2. EdgeまたはChromeで `Ctrl+Shift+J` を押してコンソールを開き、以下を実行します。`true` が出ればクリップボードにセーブが入っています。

```javascript
(() => {
  const save = localStorage.getItem('townSaveV7');
  if (!save) return false;
  copy(save);
  return true;
})();
```

3. メモ帳に貼り付け、UTF-8の `journey-save.json` として保存します。`false` が出た場合は、進行が表示されている元のHTMLとブラウザーを確認してください。
4. Windowsアプリ上部の「セーブ取り込み」で、そのJSONファイルを選びます。

## 参照

- [GitHub Releasesの説明](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases)
- [electron-builder v26の自動更新](https://www.electron.build/v26/docs/features/auto-update/)
