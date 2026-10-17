// EDINETの書類一覧を日付ごとに見て、ウォッチ対象の大量保有報告書を data/history.json に貯める。
// GitHub Actions から毎日実行する（.github/workflows/history.yml）。
//
//   node scripts/update-history.mjs            … 履歴が空なら3年分、あれば直近14日分を取り直す
//   node scripts/update-history.mjs --days 1095 … 指定日数ぶん取り直す（ウォッチ対象を増やしたとき用）
//
// 必要な環境変数: EDINET_API_KEY
import fs from "node:fs";

const BASE = process.env.EDINET_BASE || "https://api.edinet-fsa.go.jp/api/v2";
const KEY = process.env.EDINET_API_KEY;
const HISTORY = new URL("../data/history.json", import.meta.url);
const WATCHLIST = JSON.parse(fs.readFileSync(new URL("../data/watchlist.json", import.meta.url), "utf8"));
const FULL_DAYS = 365 * 3;
const RECENT_DAYS = 14;
const DELAY_MS = Number(process.env.DELAY_MS ?? 400); // EDINETに負担をかけないための間隔

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
const patterns = WATCHLIST.flatMap((w) => w.patterns.map(normalize));
const isWatched = (name) => {
  const n = normalize(name);
  return patterns.some((p) => n.includes(p));
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function datesBack(days) {
  const out = [];
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  for (let i = 0; i < days; i++) out.push(new Date(nowJst.getTime() - i * 86400 * 1000).toISOString().slice(0, 10));
  return out;
}

async function fetchDay(date) {
  const url = `${BASE}/documents.json?date=${date}&type=2&Subscription-Key=${KEY}`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}（再試行しません）`);
      const json = await res.json();
      if (json.metadata?.status && json.metadata.status !== "200") throw new Error(json.metadata.message);
      return json.results || [];
    } catch (e) {
      if (attempt === 4 || String(e.message).includes("再試行しません")) throw e;
      await sleep(2000 * attempt);
    }
  }
}

function load() {
  try {
    return JSON.parse(fs.readFileSync(HISTORY, "utf8"));
  } catch {
    return { updatedAt: null, oldest: null, failedDates: [], items: [] };
  }
}

const argDays = (() => {
  const i = process.argv.indexOf("--days");
  return i > 0 ? Number(process.argv[i + 1]) : null;
})();

const history = load();
const days = argDays || (history.items.length === 0 && !history.oldest ? FULL_DAYS : RECENT_DAYS);
// 前回失敗した日も取り直す
const dates = [...new Set([...datesBack(days), ...(history.failedDates || [])])].sort().reverse();
const byId = new Map(history.items.map((d) => [d.docID, d]));
let added = 0;
const failed = [];
const failedDates = [];

console.log(`${dates.at(-1)} 〜 ${dates[0]} の ${days} 日分を確認します`);
for (const [i, date] of dates.entries()) {
  try {
    const docs = await fetchDay(date);
    for (const d of docs) {
      if (d.docTypeCode !== "350" && d.docTypeCode !== "360") continue;
      if (!isWatched(d.filerName || "")) continue;
      if (!byId.has(d.docID)) added++;
      byId.set(d.docID, {
        docID: d.docID,
        submitDateTime: d.submitDateTime,
        docTypeCode: d.docTypeCode,
        filerName: d.filerName,
        docDescription: d.docDescription,
        subjectEdinetCode: d.subjectEdinetCode,
        issuerEdinetCode: d.issuerEdinetCode,
        withdrawalStatus: d.withdrawalStatus,
      });
    }
  } catch (e) {
    failed.push(`${date}: ${e.message}`);
    failedDates.push(date);
  }
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${dates.length} 日 済み（新規 ${added} 件）`);
  await sleep(DELAY_MS);
}

const items = [...byId.values()].sort((a, b) => (a.submitDateTime < b.submitDateTime ? 1 : -1));
const oldest = [history.oldest, dates.at(-1)].filter(Boolean).sort()[0];
fs.writeFileSync(HISTORY, JSON.stringify({ updatedAt: new Date().toISOString(), oldest, failedDates, items }) + "\n");

console.log(`完了: 全 ${items.length} 件（今回の新規 ${added} 件）`);
if (failed.length) {
  console.log(`取得に失敗した日: ${failed.length} 日`);
  failed.slice(0, 20).forEach((f) => console.log("  " + f));
  // 半分以上失敗したら、キーの誤りなどの可能性が高いので失敗扱いにする
  if (failed.length > dates.length / 2) process.exit(1);
}
