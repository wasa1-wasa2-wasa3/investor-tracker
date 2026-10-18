// data/history.json に貯まった報告書（訂正以外）の「株券等保有割合」を読み、data/holdings.json に貯める。
// 報告書の中身は後から変わらないので、一度読めたものは読み直さない。GitHub Actions から履歴更新のあとに実行する。
//
// 必要な環境変数: EDINET_API_KEY
import fs from "node:fs";
import { holdingFromZip } from "../lib/holding-parse.mjs";

const BASE = process.env.EDINET_BASE || "https://api.edinet-fsa.go.jp/api/v2";
const KEY = process.env.EDINET_API_KEY;
const DELAY_MS = Number(process.env.DELAY_MS ?? 400);
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

const history = readJson("history.json", { items: [] });
const store = readJson("holdings.json", { updatedAt: null, items: {} });
const keep = new Set(history.items.map((d) => d.docID));
for (const id of Object.keys(store.items)) if (!keep.has(id)) delete store.items[id]; // 履歴から落ちた分は消す

const targets = history.items.filter(
  (d) => d.docTypeCode === "350" && !String(d.docDescription || "").includes("訂正") && (store.items[d.docID] == null || !("purpose" in store.items[d.docID]))
);
console.log(`保有割合: 新しく ${targets.length} 件を読みます`);
let ok = 0, miss = 0, err = 0;
for (const [i, d] of targets.entries()) {
  try {
    const res = await fetchRetry(`${BASE}/documents/${d.docID}?type=5&Subscription-Key=${KEY}`);
    const h = holdingFromZip(new Uint8Array(await res.arrayBuffer()));
    if (h) {
      store.items[d.docID] = h;
      ok++;
      if (ok <= 5) console.log(`  例 ${d.docID} ${d.filerName}: ${h.ratio}%（前回 ${h.prev ?? "—"}%）`);
    } else miss++;
  } catch (e) {
    err++;
    console.log(`  ${d.docID}: ${e.message}`);
  }
  if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${targets.length} 件 済み`);
  await sleep(DELAY_MS);
}
store.updatedAt = new Date().toISOString();
fs.writeFileSync(file("holdings.json"), JSON.stringify(store) + "\n");
console.log(`読めた ${ok} / 割合が見つからず ${miss} / エラー ${err} / 保存済み合計 ${Object.keys(store.items).length}`);
