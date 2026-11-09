# Windows軽量版

V34のゲームをTauri 2とWindowsのWebView2で動かします。インストーラーの目標は10 MB以下です。WindowsにWebView2がなければ、初回セットアップがMicrosoftから取得します。ゲーム本体は端末に入り、通信できない状態でも遊べます。

## インストールとセーブ移行

[GitHub Releases](https://github.com/MANGOPDDING/clickergame/releases)から最新版の `LittleTownChroniclesLite-Setup-<バージョン>.exe` を取得します。

すでにElectron版を使っている場合は、旧版で「セーブ書き出し」を押し、軽量版をインストールして「セーブ取り込み」から保存したJSONを選びます。軽量版で進行を確認してから旧版をアンインストールできます。以前のブラウザー版のセーブは、[HTML版からセーブを移す手順](../README.md#既存のhtml版からセーブを移す)でも移せます。

軽量版 v0.35.1 以降は「セーブ書き出し」を押すと、Windowsの保存画面でフォルダーとファイル名を選べます。

軽量版の起動時と起動中の4時間ごとに、GitHub Releasesで新版を確認します。「更新を確認」ボタンでも確認できます。署名が正しい新版を取得したら、ゲームを閉じる際にセーブを保存し、更新を適用します。次に起動したときも同じセーブを使います。

## ゲームだけ更新する（v0.36.0以降）

敵や装備の調整、ゲーム画面など、HTML内の変更はインストーラーのビルドなしで配布できます。

1. 新しいゲームHTMLを追加し、`package.json` の `config.gameSource` をそのファイルに切り替え、`config.gameVersion` を上げます（例 34 → 35）。
2. `npm run test:game` で確認し、変更を `main` にプッシュします。
3. 同じ番号の `game-v35` タグをプッシュします。「Publish game data」がHTMLとJavaScriptを確認して署名し、同じリポジトリの `game-updates` ブランチに配布データを置きます。タグがある場合はこのワークフローを手動で実行することもできます。
4. 軽量版は起動中にゲームデータを取得して、次回起動時に反映します。上部に現在のゲーム版を表示します。「更新を確認」から手動でも取得できます。

取得や署名確認に失敗した場合は、手元のゲームで遊べます。取得済みの新版は起動が確認できてから保存済みの版に昇格します。署名にはアプリ本体と別の `GAME_CONTENT_SIGNING_PRIVATE_KEY` を使います。

## アプリ本体を更新する

1. Windowsの機能や更新の仕組みを変更します。同梱するゲームを変える場合は `package.json` のゲーム設定も更新します。
2. `src-tauri/Cargo.toml` と `src-tauri/tauri.conf.json` の軽量版バージョンを上げます。Cargoでビルドして `src-tauri/Cargo.lock` も更新します。
3. 公開するときに、GitHubの `main` に変更をプッシュし、軽量版バージョンに一致するタグをプッシュします（例 `v0.36.1`）。GitHub Actionsの「Build lightweight Windows release」がテスト、署名付きインストーラーの作成、最新リリースへの公開を行います。タグがある場合は、このワークフローを手動で起動して公開することもできます。
4. 公開後、軽量版は `latest.json` から更新を確認します。`latest.yml` は旧Electron版向けの確認先です。

GitHub Actionsでは `TAURI_SIGNING_PRIVATE_KEY` を使います。公開鍵はアプリに組み込まれています。既存プレイヤーに更新を届けるため、同じ更新署名鍵を保管し続けます。更新署名とWindowsのコード署名は別です。Windowsのコード署名なしでビルドしたインストーラーは、実行時に警告が出ることがあります。

ローカルで署名付きのインストーラーを作るには、WindowsのC++ビルドツール、Rust（MSVC）、Node.jsを用意し、更新署名鍵を `TAURI_SIGNING_PRIVATE_KEY` 環境変数に設定します。

```powershell
npm ci
npm run test:game
npm run build:lightweight -- -- --locked
```
