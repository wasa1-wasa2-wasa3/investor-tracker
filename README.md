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

## 大物のX投稿（Grok Bot）

Grok Bot（SuperGrok / Cursor Pro 以上で使えるxAIのエージェント）に、監視アカウントの投稿から銘柄の言及をまとめてもらい、
GitHub の Issue に投稿してもらう。Issue が作られると `.github/workflows/x-import.yml` が本文の JSON を `data/x-posts.json` に取り込み、
結果を返信して Issue を閉じる。20選の採点には使わず、「Xの大物」と「X ○○が買い」バッジで参考表示するだけ。

- 取り込む条件：タイトルが `[X投稿]` で始まる／投稿者がリポジトリの持ち主（別のアカウントを許すならリポジトリ変数 `X_IMPORT_AUTHORS` にカンマ区切り）
- 監視対象（`data/x-accounts.json`）以外のアカウントや、x.com の投稿URLでないものは捨てる
- 本文はデータとしてだけ読み、実行しない

### Grok Bot への頼み方（例）

> 毎週土曜の朝に、X の @kabu_st0ck と @57jbgw2 の直近7日間の投稿から、日本の上場株（個別銘柄）に触れている投稿を全部探してください。
> 見つけたら GitHub の wasa1-wasa2-wasa3/investor-tracker に Issue を作ってください。
> タイトルは「[X投稿] YYYY-MM-DD」、本文は次の形の JSON 配列だけを ```json で囲んで書いてください（推測で投稿を作らないこと）。
> `[{"handle":"@なし","postedAt":"YYYY-MM-DD","url":"投稿のURL","secCode":"4桁の証券コード（不明ならnull）","name":"銘柄名","stance":"buy|sell|hold|mention","summary":"日本語40字以内"}]`
> stance は 買った・買い増し=buy、売った・利確・損切り=sell、保有継続=hold、それ以外=mention。

### xAI API で取る場合（従量課金）

`scripts/update-x.mjs` が API の x_search で同じことをする。費用がかかる（2人で1回1〜2ドル程度）ので普段は止めてある。
使うときはリポジトリ変数 `X_SOURCE=api` とシークレット `XAI_API_KEY` を設定する。

## イナゴ度（毎週土曜・費用ゼロ）

何を買うかは大物（アクティビスト・長期投資家）が決める。Xは「群衆がもう来ているか＝いつ買うか」の温度計として使う。
xAIのAPIは1銘柄0.6〜1ドルかかったのでやめ、Grok Bot（無料枠）とClaude（定額）をGitHub経由でつなぐ。

1. **平日夜**：履歴の更新（history.yml）の最後に、20選を `data/inago-targets.json` に書き出す（`scripts/update-inago-targets.mjs`、公開中のアプリの `/api/picks` を読む。URLはリポジトリ変数 `APP_URL` で変更可）
2. **土曜朝**：Grok Bot（定期実行）が `data/inago-targets.json` を読んで調べ、タイトル `[イナゴ度] YYYY-MM-DD` の Issue に JSON を投稿 → x-import.yml が `data/inago.json` に取り込む（`scripts/import-inago-issue.mjs`、対象リストにない銘柄は捨てる）
3. **土曜の昼前**：Claude（定期実行）が危険情報を一次情報で裏取りし、`dangers[].check`（confirmed / unconfirmed / wrong）と `checkNote` を書き足してコミット

- イナゴ度：🌱静か／🦗集まり始め／🦗🦗群がっている
- 🔴危険情報：減配・無配、優待の廃止や改悪、下方修正、増資・売出し、不祥事・処分、大物の売却 だけ
- 🌱先回り候補：静か × 52週の安値寄り × 危険なし（Claudeが「誤り」とした危険情報は数えない）
- 画面：20選の上の「イナゴ度まとめ」と、各銘柄のバッジ（`app/XVoice.js`、`lib/inago.js`）。20選の採点には使わない

### Grok Bot への頼み方（定期実行：毎週土曜 7:00）

> 毎週土曜の朝7時に、GitHub の wasa1-wasa2-wasa3/investor-tracker の data/inago-targets.json を読み、targets の各銘柄について、X で直近14日に投稿された内容を調べてください。
> 目的は銘柄の評価ではなく、(1) 個人投資家の群衆がどのくらい集まっているか（イナゴ度）と (2) 明らかな危険情報 の2点だけです。
> 調べ終わったら同じリポジトリに Issue を作ってください。タイトルは「[イナゴ度] YYYY-MM-DD」、本文は次の形の JSON 配列だけを ```json で囲んで書いてください。
> `[{"secCode":"4桁","name":"銘柄名","recent":直近7日の投稿数のおおよそ,"before":その前の7日の投稿数のおおよそ,"buyReports":直近7日に買った・IN・買い増しと報告した人数のおおよそ,"hype":煽り（爆上げ・テンバガー・まだ間に合う等）が目立つならtrue,"level":"quiet|gathering|swarming","summary":"Xでの話題のされ方を60字以内","dangers":[{"kind":"dividend_cut|yutai_cut|downgrade|dilution|scandal|big_sell|other","text":"何が起きたか50字以内","fact":開示や報道で確認できればtrue・噂ならfalse,"url":"根拠の投稿または記事のURL"}]}]`
> ルール：スパム・宣伝・bot は数えない。level は 個人の投稿がほとんどない=quiet、話題が増えている・買い報告が出始めた=gathering、投稿が多く煽りや買い報告が目立つ=swarming。dangers は 減配・無配、優待の廃止や改悪、下方修正・赤字転落、公募増資や売出し、不祥事・行政処分・監査法人の辞任、大株主や著名投資家の売却 だけ（株価下落や弱気な意見は入れない）。なければ []。全銘柄を必ず含めること。実在する投稿・記事だけを使い、推測で作らないこと。

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
