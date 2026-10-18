import { holdingFromZip } from "./holding-parse.mjs";
import { isMock } from "./edinet";
import saved from "../data/holdings.json";

const BASE = process.env.EDINET_BASE || "https://api.edinet-fsa.go.jp/api/v2";
const memo = new Map(); // 同じサーバーが生きている間の使い回し

// モック用：docID から決まった架空の割合を作る
const MOCK_FIXED = {
  S100MOCK1: { ratio: 5.12, prev: null, purpose: { tag: "純投資", text: "純投資" } },
  S100MOCK9: { ratio: 6.4, prev: 5.12, purpose: { tag: "純投資", text: "純投資" } },
};
function mockHolding(docId) {
  if (MOCK_FIXED[docId]) return MOCK_FIXED[docId];
  const n = [...docId].reduce((a, c) => a + c.charCodeAt(0), 0);
  const table = [
    { ratio: 5.12, prev: null, purpose: { tag: "純投資", text: "純投資" } },
    { ratio: 8.43, prev: 7.21, purpose: { tag: "提案あり", text: "投資及び状況に応じて経営陣への助言、重要提案行為等を行うこと" } },
    { ratio: 3.9, prev: 5.33, purpose: { tag: "純投資", text: "純投資" } },
    { ratio: 12.05, prev: 11.88, purpose: { tag: "政策", text: "政策投資及び業務提携関係の維持" } },
    { ratio: 6.7, prev: 7.95, purpose: { tag: "純投資", text: "純投資" } },
  ];
  return table[n % table.length];
}

async function fetchHolding(docId) {
  const url = `${BASE}/documents/${docId}?type=5&Subscription-Key=${process.env.EDINET_API_KEY}`;
  // 報告書の中身は後から変わらないので長めにキャッシュ
  const res = await fetch(url, { next: { revalidate: 60 * 60 * 24 * 7 } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return holdingFromZip(new Uint8Array(await res.arrayBuffer()));
}

// docID の配列 → { docID: {ratio, prev} | null }
export async function getHoldings(ids, { maxLive = 30, concurrency = 4 } = {}) {
  const out = {};
  const todo = [];
  for (const id of ids) {
    if (isMock()) out[id] = mockHolding(id);
    else if (saved.items[id] !== undefined) out[id] = saved.items[id];
    else if (memo.has(id)) out[id] = memo.get(id);
    else todo.push(id);
  }
  const live = todo.slice(0, maxLive);
  let i = 0;
  async function worker() {
    while (i < live.length) {
      const id = live[i++];
      try {
        const h = await fetchHolding(id);
        memo.set(id, h);
        out[id] = h;
      } catch {
        // 取れなかったものは返さない（次回また試す）
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { holdings: out, pending: todo.length - live.length };
}
