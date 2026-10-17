# 大物ウォッチ（PoC）

EDINETの大量保有報告書（新規=350 / 変更=360）を取得し、ウォッチ対象の投資家が提出したものだけを一覧表示する。マルチバガーくんとは別アプリ。

## 動かし方

```
npm install
npm run dev
```

APIキーが無い状態では**モックデータ**（架空銘柄）で表示される。

## 実データに切り替える

1. EDINETのサイトでAPIキーを取得（無料、メールアドレス登録）
2. `.env.local` を作って書く
   ```
   EDINET_API_KEY=取得したキー
   ```
3. 社名・証券コードを出すための辞書を作る
   - EDINETのサイトから「EDINETコードリスト」（EdinetcodeDlInfo.zip）をダウンロードして解凍
   - `npm run codes -- EdinetcodeDlInfo.csv`
   - `data/codes.json` が上場企業ぶんで上書きされる（今入っているのは架空のサンプル）
4. Vercelに置くときは、環境変数 `EDINET_API_KEY` を設定する

## ファイル

| ファイル | 役割 |
|---|---|
| `lib/watchlist.js` | ウォッチ対象と、提出者名に含まれる文字列。**ここを育てる** |
| `lib/edinet.js` | 書類一覧APIの取得と照合 |
| `app/api/filings` | `GET /api/filings?days=7&all=1` |
| `app/api/pdf/[docId]` | PDFをサーバー経由で返す（キーを隠すため） |
| `scripts/build-codes.mjs` | EDINETコードリスト → `data/codes.json` |

## 最初にやること（実データで）

- 「対象外の提出者も表示」をオンにして14日ぶん眺め、ウォッチ対象なのに拾えていない提出者名を `watchlist.js` に足す。特に光通信は関連会社名が多い。
- 井村俊哉さんなど個人は、本人名義で出しているか要確認。

## 次の段階

- Vercel Cronで1日数回チェックし、新着だけLINEやメールに通知
- X（cisさん等）の投稿監視を追加
- 手応えがあれば、マルチバガーくんに「大物の動き」タブとして統合し、銘柄ごとにスコア表示
