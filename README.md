# Video Downloader

X (Twitter) のツイートに動画・画像のダウンロードボタンを追加するブラウザ拡張です。
画像は元のアップロードサイズ（`name=orig`）で保存します。
Chrome 用と Firefox 用の両方をビルドできます。

## かんたんインストール（ビルド不要）

[release フォルダ](release/) にパッケージ済みファイルがあります。

### Chrome / Edge

1. [VideoDownloaderX-chrome.zip](https://github.com/kaki373/VideoDownloaderX/raw/main/release/VideoDownloaderX-chrome.zip) をダウンロードして好きな場所に解凍
2. `chrome://extensions` を開き、右上の「デベロッパーモード」を ON
3. 「パッケージ化されていない拡張機能を読み込む」→ 解凍したフォルダを選択
4. x.com を開く（開いていたタブは F5 で再読み込み）

### Firefox

1. [VideoDownloaderX-firefox.xpi](https://github.com/kaki373/VideoDownloaderX/raw/main/release/VideoDownloaderX-firefox.xpi) をダウンロード
2. `about:debugging#/runtime/this-firefox` を開く
3. 「一時的なアドオンを読み込む...」→ ダウンロードした .xpi を選択
4. x.com を開く（開いていたタブは F5 で再読み込み）

※ 通常版 Firefox は未署名アドオンを常設インストールできないため一時読み込みになります
（再起動で消えるので読み込み直してください）。
Firefox Developer Edition / ESR なら `about:config` で
`xpinstall.signatures.required` を `false` にしたうえで、
`about:addons` → 歯車アイコン → 「ファイルからアドオンをインストール...」→ .xpi を選ぶと
常設インストールできます。

## 仕組み

1. `injected.js`（ページの MAIN ワールドで実行）が `fetch` / `XMLHttpRequest` をフックし、
   X 自身の GraphQL API レスポンスから各ツイートの mp4 動画 URL（最高ビットレート）と
   画像 URL を抽出
2. `content.js` が 3 種類のダウンロードボタン（↓アイコン）を追加
   - アクションバー（返信・RT・いいねの並び）… そのツイートの動画・画像をまとめて保存
   - 各画像のホバー … その 1 枚だけを最大サイズで保存
   - 最大化中に出る浮動ボタン … メディアビューアやフルスクリーンなど
     アクションバーが見えない状態でも押せる
3. クリックすると `background.js` がブラウザのダウンロード機能で
   `スクリーンネーム_ツイートID.mp4` / `スクリーンネーム_ツイートID_1.jpg` として保存
4. 画像 URL は `?format=<元の形式>&name=orig` に変換して原寸で取得。
   `orig` が配信されないものは `4096x4096` に自動フォールバック
5. タイムライン経由で URL を捕捉できなかったツイートは、公開の
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

### まとめてダウンロード

- 動画・アニメ GIF・画像のいずれかが付いたツイートのアクションバー右端に ↓ ボタンが出ます
- クリックでそのツイートのメディアを全て保存。成功すると緑、失敗すると赤に一瞬変わります
- 動画が複数ある場合は `_1`, `_2` … と連番になります（1 本だけなら連番なし）
- 画像は常に `_1`, `_2` … の連番が付きます

### 1 枚だけダウンロード

- 画像にマウスを乗せると右上に ↓ ボタンが出ます
- クリックするとその 1 枚だけを最大サイズで保存します
- 引用リツイート内の画像でも、引用元のツイート ID でファイル名が付きます

### 最大化しているとき

- 画像・動画をクリックして開いたメディアビューアや、動画プレイヤーの
  フルスクリーン中は、画面右上に ↓ ボタンが出ます
- ビューアで画像を表示中はその 1 枚を、動画を表示中はその動画を保存します

## 制限事項

- mp4 の variant が提供される通常の動画・GIF が対象です。
  ライブ配信や DRM 付きコンテンツは対象外です
- 引用リツイート内の動画は、引用元ツイートを開いてダウンロードしてください
  （画像はホバーの ↓ ボタンでそのまま保存できます）
- X 側の API レスポンス構造が変わると追従修正が必要になることがあります
- ダウンロードしたコンテンツの利用は私的利用の範囲で、各コンテンツの
  権利者の権利と X の利用規約に従ってください
