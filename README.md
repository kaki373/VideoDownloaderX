# Video Downloader

X (Twitter) のタイムライン上の各ツイートに動画ダウンロードボタンを追加するブラウザ拡張です。
Chrome 用と Firefox 用の両方をビルドできます。

## 仕組み

1. `injected.js`（ページの MAIN ワールドで実行）が `fetch` / `XMLHttpRequest` をフックし、
   X 自身の GraphQL API レスポンスから各ツイートの mp4 動画 URL（最高ビットレート）を抽出
2. `content.js` が動画付きツイートのアクションバー（返信・RT・いいねの並び）に
   ダウンロードボタン（↓アイコン）を追加
3. クリックすると `background.js` がブラウザのダウンロード機能で
   `スクリーンネーム_ツイートID.mp4` として保存
4. タイムライン経由で URL を捕捉できなかったツイートは、公開の
   syndication エンドポイント（埋め込みツイート用 API）でフォールバック解決

## ビルド

```powershell
cd x-video-downloader
.\build.ps1
```

`dist\chrome` と `dist\firefox` が生成されます。

## インストール

### Chrome / Edge

1. `chrome://extensions` を開く
2. 右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ `dist\chrome` フォルダを選択

### Firefox（一時的な読み込み）

Firefox 版は Manifest V2 なので、読み込むだけでサイトへのアクセス権限が
自動的に付与されます（権限タブの操作は不要）。

1. アドレスバーに `about:debugging#/runtime/this-firefox` と入力して開く
2. 「一時的なアドオンを読み込む...」をクリック
3. `dist\firefox\manifest.json` を選択
4. x.com を開く（すでに開いていたタブは **F5 で再読み込み**する）

※ 一時的なアドオンは Firefox を再起動すると消えるので、再起動後は
同じ手順で読み込み直してください。常用する場合は
`about:config` で `xpinstall.signatures.required` を false にできる
Firefox Developer Edition / ESR で、`dist\firefox` の中身を zip 化して
`about:addons` からインストールしてください。

## 使い方

- 動画（またはアニメ GIF）付きツイートのアクションバー右端に ↓ ボタンが出ます
- クリックでダウンロード開始。成功すると緑、失敗すると赤に一瞬変わります
- 1 ツイートに複数動画がある場合は `_1`, `_2` … と連番で全て保存されます

## 制限事項

- mp4 の variant が提供される通常の動画・GIF が対象です。
  ライブ配信や DRM 付きコンテンツは対象外です
- 引用リツイート内の動画は、引用元ツイートを開いてダウンロードしてください
- X 側の API レスポンス構造が変わると追従修正が必要になることがあります
- ダウンロードしたコンテンツの利用は私的利用の範囲で、各コンテンツの
  権利者の権利と X の利用規約に従ってください
