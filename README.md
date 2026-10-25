# イナゴライダー

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
3. 社名・証券コードは、サーバーがEDINETコードリストを1日1回自動で取得して変換する（`/api/status` で件数を確認できる）
4. Vercelに置くときは、環境変数 `EDINET_API_KEY` を設定する

## 過去の履歴（30日〜半年）

EDINETは1日分ずつしか取れないので、GitHub Actions が平日19時半ごろに自動で取りに行き、
ウォッチ対象の報告書だけを `data/history.json` に貯める（`.github/workflows/history.yml`）。
コミットされるとVercelが自動で再デプロイする。

- 準備：GitHubのリポジトリの Settings → Secrets and variables → Actions に `EDINET_API_KEY` を登録
- 初回：Actions タブの「履歴の更新」→「Run workflow」。空欄のまま実行すると半年分を取得（5分前後）
- ウォッチ対象を増やしたら：同じ画面で日数に `180` を入れて実行すると、過去分も取り直す
- もっと昔まで見たくなったら：日数に `365` などを入れて実行すれば履歴を足せる（画面の期間メニューも足す）

## 配当利回り・優待

- 配当利回り・PBR・時価総額：Yahoo Finance から1時間ごとに取得（`/api/quotes`、`lib/quotes.js`）
- 優待：各社の最新の有価証券報告書「株主に対する特典」欄を読む（`scripts/update-yutai.mjs` → `data/yutai.json`）
  - 履歴の更新と同じGitHub Actionsで実行。初回は有報を探すため過去400日分の書類一覧を見る（10分前後）
  - 有報は年1回なので、優待の新設・廃止の反映は次の有報まで遅れることがある

## ファイル

| ファイル | 役割 |
|---|---|
| `data/watchlist.json` | ウォッチ対象・分類・提出者名に含まれる文字列。**ここを育てる** |
| `data/history.json` | 自動で貯まる過去の報告書（手で編集しない） |
| `scripts/update-history.mjs` | 履歴を集めるスクリプト |
| `lib/edinet.js` | 書類一覧APIの取得と照合 |
| `app/api/filings` | `GET /api/filings?days=7&all=1` |
| `app/api/pdf/[docId]` | PDFをサーバー経由で返す（キーを隠すため） |
| `scripts/build-codes.mjs` | EDINETコードリスト → `data/codes.json` |

## 最初にやること（実データで）

- 「対象外の提出者も表示」をオンにして14日ぶん眺め、ウォッチ対象なのに拾えていない提出者名を `data/watchlist.json` に足す。特に光通信は関連会社名が多い。
- 井村俊哉さんなど個人は、本人名義で出しているか要確認。

## 次の段階

- Vercel Cronで1日数回チェックし、新着だけLINEやメールに通知
- 手応えがあれば、マルチバガーくんに「大物の動き」タブとして統合し、銘柄ごとにスコア表示
