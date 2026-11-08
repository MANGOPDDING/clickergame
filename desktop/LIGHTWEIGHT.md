# Windows軽量版

V34のゲームをTauri 2とWindowsのWebView2で動かします。インストーラーの目標は10 MB以下です。WindowsにWebView2がなければ、初回セットアップがMicrosoftから取得します。ゲーム本体は端末に入り、通信できない状態でも遊べます。

## インストールとセーブ移行

[GitHub Releases](https://github.com/MANGOPDDING/clickergame/releases)から `LittleTownChroniclesLite-Setup-0.35.0.exe` を取得します。

すでにElectron版を使っている場合は、旧版で「セーブ書き出し」を押し、軽量版をインストールして「セーブ取り込み」から保存したJSONを選びます。軽量版で進行を確認してから旧版をアンインストールできます。以前のブラウザー版のセーブは、[HTML版からセーブを移す手順](../README.md#既存のhtml版からセーブを移す)でも移せます。

軽量版の起動時と起動中の4時間ごとに、GitHub Releasesで新版を確認します。「更新を確認」ボタンでも確認できます。署名が正しい新版を取得したら、ゲームを閉じる際にセーブを保存し、更新を適用します。次に起動したときも同じセーブを使います。

## 次のリリース

1. `package.json` の `config.gameSource` にゲームHTMLを指定します。
2. `src-tauri/Cargo.toml` と `src-tauri/tauri.conf.json` の軽量版バージョンを上げます。Cargoでビルドして `src-tauri/Cargo.lock` も更新します。
3. GitHubの `main` に変更をプッシュし、軽量版バージョンに一致するタグをプッシュします。必要なら「Build lightweight Windows release」を手動で起動して同じタグを指定できます。
4. 下書きに軽量版インストーラー、`.sig`、`latest.json`、`latest.yml` が揃ったら公開し、GitHubの最新リリースに設定します。`latest.json` は軽量版用です。`latest.yml` は旧Electron版が更新を確認できるようにするためのファイルです。

GitHub Actionsでは `TAURI_SIGNING_PRIVATE_KEY` を使います。公開鍵はアプリに組み込まれています。既存プレイヤーに更新を届けるため、同じ更新署名鍵を保管し続けます。更新署名とWindowsのコード署名は別です。Windowsのコード署名なしでビルドしたインストーラーは、実行時に警告が出ることがあります。

ローカルで署名付きのインストーラーを作るには、WindowsのC++ビルドツール、Rust（MSVC）、Node.jsを用意し、更新署名鍵を `TAURI_SIGNING_PRIVATE_KEY` 環境変数に設定します。

```powershell
npm ci
npm run test:game
npm run build:lightweight -- -- --locked
```
