// 当日の大量保有報告書をEDINETから取り、ウォッチ対象（data/watchlist.json）の新着だけを通知する。
// GitHub Actions から平日の日中に15分おきに実行する（.github/workflows/watch.yml）。
//
//   node scripts/watch-new.mjs            … 新着があれば通知
//   DRY_RUN=1 node scripts/watch-new.mjs  … 通知せずに画面に出すだけ（状態も保存しない）
//
// 通知済みの書類IDは STATE_FILE（既定 .watch-state/seen.json）に覚える。Actionsではキャッシュで持ち越す。
// 状態ファイルが無い初回は、その日の既存分を「通知済み」にするだけで通知しない（いきなり大量に届くのを防ぐ）。
//
// 必要な環境変数: EDINET_API_KEY
// 通知先（どちらか、または両方）:
//   DISCORD_WEBHOOK_URL                         … Discordのチャンネルの Webhook URL
//   LINE_CHANNEL_ACCESS_TOKEN + LINE_USER_ID    … LINE公式アカウント（Messaging API）からのプッシュ
// 任意: APP_URL（通知に付けるイナゴライダーのURL）, WATCH_DATE（YYYY-MM-DD、テスト用に日付を固定）
import fs from "node:fs";
import path from "node:path";
import { unzipSync } from "fflate";

const BASE = process.env.EDINET_BASE || "https://api.edinet-fsa.go.jp/api/v2";
const CODELIST_URL = process.env.CODELIST_URL || "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip";
const KEY = process.env.EDINET_API_KEY;
const STATE_FILE = process.env.STATE_FILE || ".watch-state/seen.json";
const DRY_RUN = process.env.DRY_RUN === "1";
const DISCORD = process.env.DISCORD_WEBHOOK_URL;
const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const LINE_TO = process.env.LINE_USER_ID;
const APP_URL = process.env.APP_URL || "";
const KEEP_DAYS = 10; // 通知済みIDを覚えておく日数

const WATCHLIST = JSON.parse(fs.readFileSync(new URL("../data/watchlist.json", import.meta.url), "utf8"));
const HORIZON_LABEL = { long: "長期", activist: "アクティビスト", broad: "分散" };

if (!KEY) {
  console.error("EDINET_API_KEY が設定されていません");
  process.exit(1);
}

// lib/watchlist.js と同じ正規化
const normalize = (s = "") =>
  s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　\s・･]/g, "")
    .toLowerCase();
const compiled = WATCHLIST.map((w) => ({ ...w, norm: w.patterns.map(normalize) }));
const matchInvestor = (name) => {
  const n = normalize(name);
  return compiled.find((w) => w.norm.some((p) => n.includes(p))) || null;
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const todayJst = () => new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
const kindOf = (desc = "") => (desc.includes("訂正") ? "訂正" : desc.includes("変更報告書") ? "変更" : "新規");

async function fetchDay(date) {
  const url = `${BASE}/documents.json?date=${date}&type=2&Subscription-Key=${KEY}`;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch(url).catch((e) => ({ ok: false, status: 0, error: e }));
    if (res.ok) {
      const json = await res.json();
      // 日付が変わった直後などで、その日の一覧がまだ無い
      if (json.metadata?.status === "404") return null;
      if (json.metadata?.status && json.metadata.status !== "200") throw new Error(`EDINET: ${json.metadata.message}`);
      return json.results || [];
    }
    if (res.status === 404) return null;
    if (attempt === 3 || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
      throw new Error(`EDINET ${date}: HTTP ${res.status} ${res.error?.message || ""}`);
    }
    await sleep(3000 * attempt);
  }
}

// EDINETコードリスト → { EDINETコード: { name, secCode } }（新着があるときだけ取りに行く）
async function fetchCodes() {
  try {
    const res = await fetch(CODELIST_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const csvName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".csv"));
    const text = new TextDecoder("shift_jis").decode(files[csvName]);
    const map = {};
    for (const line of text.split(/\r?\n/).slice(2)) {
      const c = line.split('","').map((s) => s.replace(/^"|"$/g, ""));
      if (c[0]) map[c[0]] = { name: c[6], secCode: c[11] ? c[11].slice(0, 4) : null };
    }
    return map;
  } catch (e) {
    console.log(`コードリストを取れませんでした（社名なしで通知します）: ${e.message}`);
    return {};
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
  } catch {
    return null;
  }
}

function saveState(state) {
  const cutoff = new Date(Date.now() - KEEP_DAYS * 86400 * 1000).toISOString().slice(0, 10);
  for (const [id, d] of Object.entries(state.seen)) if (d < cutoff) delete state.seen[id];
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...state, updatedAt: new Date().toISOString() }) + "\n");
}

function buildMessage(f) {
  const target = f.targetName ? `${f.targetName}${f.secCode ? `（${f.secCode}）` : ""}` : `EDINETコード ${f.targetCode}`;
  const draft = `【イナゴライダー検知】${f.investor}が ${target} の大量保有報告書（${f.kind}）を提出。\n#日本株 #大量保有報告書`;
  return [
    `🚨 ${f.kind === "新規" ? "新規5%超え" : "変更報告"}｜${f.investor}（${HORIZON_LABEL[f.horizon] || f.style}）`,
    `対象: ${target}`,
    `提出者: ${f.filerName}`,
    `提出: ${f.submittedAt}`,
    `書類: https://disclosure2.edinet-fsa.go.jp/WZEK0040.aspx?${f.docId}`,
    APP_URL ? `アプリ: ${APP_URL}` : null,
    "",
    "▼X投稿の下書き",
    draft,
  ]
    .filter((l) => l !== null)
    .join("\n");
}

async function postDiscord(text) {
  const res = await fetch(DISCORD, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content: text.slice(0, 1990) }),
  });
  if (res.status === 429) {
    const j = await res.json().catch(() => ({}));
    await sleep(((j.retry_after ?? 2) + 0.5) * 1000);
    return postDiscord(text);
  }
  if (!res.ok) throw new Error(`Discord: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
}

async function postLine(texts) {
  // 1回のプッシュで5件まで
  for (let i = 0; i < texts.length; i += 5) {
    const res = await fetch("https://api.line.me/v2/bot/message/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${LINE_TOKEN}` },
      body: JSON.stringify({ to: LINE_TO, messages: texts.slice(i, i + 5).map((t) => ({ type: "text", text: t.slice(0, 4900) })) }),
    });
    if (!res.ok) throw new Error(`LINE: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
  }
}

// ---- 本体 ----
const date = process.env.WATCH_DATE || todayJst();
const docs = await fetchDay(date);
if (docs === null) {
  console.log(`${date} の書類一覧はまだありません`);
  process.exit(0);
}

const hits = [];
for (const d of docs) {
  if (d.docTypeCode !== "350" || d.withdrawalStatus === "1") continue; // 350=大量保有（新規・変更）。360=訂正は通知しない
  const inv = matchInvestor(d.filerName || "");
  if (inv) hits.push({ d, inv });
}

const state = loadState();
const firstRun = !state;
const seen = state?.seen || {};
const fresh = hits.filter(({ d }) => !seen[d.docID]);
console.log(`${date}: 書類 ${docs.length} 件、ウォッチ対象の大量保有 ${hits.length} 件、未通知 ${fresh.length} 件`);

if (firstRun && !DRY_RUN) {
  for (const { d } of hits) seen[d.docID] = date;
  saveState({ seen });
  console.log("初回なので、今ある分を通知済みとして記録しました（次回から新着だけ通知します）");
  process.exit(0);
}
if (!fresh.length) {
  if (!DRY_RUN) saveState({ seen });
  process.exit(0);
}

const codes = await fetchCodes();
const filings = fresh
  .sort((a, b) => (a.d.submitDateTime < b.d.submitDateTime ? -1 : 1))
  .map(({ d, inv }) => {
    const targetCode = d.subjectEdinetCode || d.issuerEdinetCode;
    return {
      docId: d.docID,
      submittedAt: d.submitDateTime,
      filerName: d.filerName,
      investor: inv.label,
      horizon: inv.horizon,
      style: inv.style,
      kind: kindOf(d.docDescription),
      targetCode,
      targetName: codes[targetCode]?.name ?? null,
      secCode: codes[targetCode]?.secCode ?? null,
    };
  });
const texts = filings.map(buildMessage);

if (DRY_RUN) {
  console.log(texts.join("\n\n----\n\n"));
  process.exit(0);
}
if (!DISCORD && !(LINE_TOKEN && LINE_TO)) {
  console.log("通知先が未設定です（DISCORD_WEBHOOK_URL または LINE_CHANNEL_ACCESS_TOKEN+LINE_USER_ID）。内容だけ出します:\n");
  console.log(texts.join("\n\n----\n\n"));
} else {
  // 送れなかったものは通知済みにしない（次回もう一度送る）
  const errors = [];
  for (const [i, f] of filings.entries()) {
    try {
      if (DISCORD) await postDiscord(texts[i]);
      seen[f.docId] = date;
    } catch (e) {
      errors.push(e.message);
    }
    await sleep(500);
  }
  if (LINE_TOKEN && LINE_TO) {
    try {
      await postLine(texts);
      for (const f of filings) seen[f.docId] = date;
    } catch (e) {
      errors.push(e.message);
    }
  }
  saveState({ seen });
  console.log(`通知 ${filings.length} 件`);
  if (errors.length) {
    console.error("通知に失敗:\n  " + errors.join("\n  "));
    process.exit(1);
  }
  process.exit(0);
}
for (const f of filings) seen[f.docId] = date;
saveState({ seen });
