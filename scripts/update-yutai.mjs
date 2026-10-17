// 大物が保有報告を出した銘柄について、最新の有価証券報告書の「株主に対する特典」欄を読み、
// 株主優待の有無と内容を data/yutai.json に貯める。GitHub Actions から履歴更新のあとに実行する。
//
//   1. 書類一覧APIを日付ごとに見て、各社の最新の有価証券報告書(docTypeCode=120)を覚える（data/asr-index.json）
//      初回は過去400日分、以降はまだ見ていない日だけを見る
//   2. 対象銘柄の有報をCSV形式(type=5)で取り、「株主に対する特典」の文を取り出す
//
// 必要な環境変数: EDINET_API_KEY
import fs from "node:fs";
import { unzipSync } from "fflate";

const BASE = process.env.EDINET_BASE || "https://api.edinet-fsa.go.jp/api/v2";
const KEY = process.env.EDINET_API_KEY;
const DELAY_MS = Number(process.env.DELAY_MS ?? 400);
const WINDOW_DAYS = 400;
const file = (name) => new URL(`../data/${name}`, import.meta.url);

if (!KEY) {
  console.error("EDINET_API_KEY が設定されていません");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = (name, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
};

function datesBack(days) {
  const out = [];
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  for (let i = 0; i < days; i++) out.push(new Date(nowJst.getTime() - i * 86400 * 1000).toISOString().slice(0, 10));
  return out;
}

async function fetchRetry(url) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(url);
      if (res.status === 429 || res.status >= 500) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      if (attempt === 4) throw e;
      await sleep(2000 * attempt);
    }
  }
}

// ---------- 1. 各社の最新の有価証券報告書を覚える ----------
const index = readJson("asr-index.json", { scanned: [], latest: {} });
const today = datesBack(1)[0];
const windowDates = datesBack(WINDOW_DAYS);
const scanned = new Set(index.scanned.filter((d) => d >= windowDates.at(-1) && d < today));
const toScan = windowDates.filter((d) => !scanned.has(d));
console.log(`書類一覧: ${toScan.length} 日分を確認します`);

for (const [i, date] of toScan.entries()) {
  try {
    const res = await fetchRetry(`${BASE}/documents.json?date=${date}&type=2&Subscription-Key=${KEY}`);
    const json = await res.json();
    if (json.metadata?.status && json.metadata.status !== "200") throw new Error(json.metadata.message);
    for (const d of json.results || []) {
      if (d.docTypeCode !== "120" || !d.edinetCode || d.withdrawalStatus === "1") continue;
      const prev = index.latest[d.edinetCode];
      if (!prev || d.submitDateTime > prev.submitDateTime) {
        index.latest[d.edinetCode] = { docID: d.docID, submitDateTime: d.submitDateTime, periodEnd: d.periodEnd };
      }
    }
    if (date < today) scanned.add(date); // 今日の分は夕方以降に増えるので、毎回見直す
  } catch (e) {
    console.log(`  ${date}: ${e.message}`);
  }
  if ((i + 1) % 100 === 0) console.log(`  ${i + 1}/${toScan.length} 日 済み`);
  await sleep(DELAY_MS);
}
index.scanned = [...scanned].sort();
fs.writeFileSync(file("asr-index.json"), JSON.stringify(index) + "\n");
console.log(`有報を把握している会社: ${Object.keys(index.latest).length} 社`);

// ---------- 2. 「株主に対する特典」を読む ----------
const decodeCsv = (bytes) => {
  const le = bytes[0] === 0xff && bytes[1] === 0xfe;
  const text = new TextDecoder(le ? "utf-16le" : "utf-8").decode(bytes);
  return text.replace(/^﻿/, "");
};
const clean = (s = "") =>
  s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/[\s　]+/g, " ")
    .trim();

const NONE = /^(該当事項は?(あり|有り)ません|該当事項なし|該当なし|なし|無し|ありません|特にありません|―|－|-)/;

export function classify(text) {
  if (text == null) return { status: "unknown", text: null };
  const t = clean(text).replace(/^[：:\s]+/, "");
  if (!t || NONE.test(t.replace(/\s/g, ""))) return { status: "no", text: null };
  return { status: "yes", text: t.slice(0, 240) };
}

export function findBenefit(rows) {
  // 表の1項目として「株主に対する特典」がある場合
  for (const r of rows) {
    if ((r.name || "").includes("株主に対する特典")) return r.value;
  }
  // 株式事務の概要がひとかたまりの文章(TextBlock)になっている場合
  for (const r of rows) {
    const v = r.value || "";
    const at = v.indexOf("株主に対する特典");
    if (at < 0) continue;
    let rest = clean(v.slice(at + "株主に対する特典".length));
    // 次の見出しや注記で切る
    rest = rest.split(/（注|\(注|第[0-9０-９]+【|【/)[0]; // eslint-disable-line no-useless-escape
    return rest;
  }
  return null;
}

function parseCsvRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const c = line.split("\t").map((s) => s.replace(/^"|"$/g, ""));
    if (c.length < 9) continue;
    rows.push({ id: c[0], name: c[1], value: c.slice(8).join("\t") });
  }
  return rows;
}

async function readBenefit(docID) {
  const res = await fetchRetry(`${BASE}/documents/${docID}?type=5&Subscription-Key=${KEY}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("CSVのzipが返ってきませんでした");
  const files = unzipSync(buf);
  const rows = [];
  for (const [name, bytes] of Object.entries(files)) {
    if (name.toLowerCase().endsWith(".csv")) rows.push(...parseCsvRows(decodeCsv(bytes)));
  }
  return findBenefit(rows);
}

const history = readJson("history.json", { items: [] });
const targets = [...new Set(history.items.map((d) => d.issuerEdinetCode || d.subjectEdinetCode).filter(Boolean))];
const yutai = readJson("yutai.json", { updatedAt: null, items: {} });
let checked = 0;
const counts = { yes: 0, no: 0, unknown: 0, noReport: 0, error: 0 };

for (const code of targets) {
  const asr = index.latest[code];
  if (!asr) {
    counts.noReport++;
    continue;
  }
  const prev = yutai.items[code];
  if (prev && prev.docID === asr.docID && (prev.status !== "unknown" || (prev.tries || 0) >= 3)) {
    counts[prev.status]++;
    continue;
  }
  try {
    const raw = await readBenefit(asr.docID);
    const r = classify(raw);
    yutai.items[code] = {
      docID: asr.docID,
      periodEnd: asr.periodEnd,
      status: r.status,
      text: r.text,
      tries: r.status === "unknown" ? (prev?.docID === asr.docID ? (prev.tries || 0) + 1 : 1) : 0,
    };
    counts[r.status]++;
    if (checked < 5) console.log(`  例 ${code}: ${r.status} ${r.text ? r.text.slice(0, 60) : ""}`);
  } catch (e) {
    counts.error++;
    console.log(`  ${code} (${asr.docID}): ${e.message}`);
  }
  checked++;
  await sleep(DELAY_MS);
}

yutai.updatedAt = new Date().toISOString();
fs.writeFileSync(file("yutai.json"), JSON.stringify(yutai) + "\n");
console.log(`対象 ${targets.length} 社 / 今回読んだ有報 ${checked} 件`);
console.log(`優待あり ${counts.yes} / なし ${counts.no} / 読めず ${counts.unknown} / 有報なし ${counts.noReport} / エラー ${counts.error}`);
