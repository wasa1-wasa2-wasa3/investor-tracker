import { getLargeHoldingFilings } from "../../../lib/edinet";
import { getQuotes } from "../../../lib/quotes";
import { groupBySecurity, rankPicks, isCandidate } from "../../../lib/picks";
import { getHoldings } from "../../../lib/holdings";
import { ownReason, stockReasons } from "../../../lib/fit";
import history from "../../../data/history.json";
import yutai from "../../../data/yutai.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 180;
const TTL = 60 * 60 * 1000; // 株価は1時間ごとに取り直す
let cache = { at: 0, key: null, body: null };
// 履歴や優待が更新されたら作り直す
const DATA_KEY = `${history.updatedAt}|${yutai.updatedAt}`;
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

// GET /api/picks … 大物が半年以内に買った銘柄から、配当×爆発力で上位10銘柄
export async function GET() {
  if (cache.body && cache.key === DATA_KEY && Date.now() - cache.at < TTL) return Response.json(cache.body, NO_STORE);
  const { filings } = await getLargeHoldingFilings({ days: DAYS });
  const groups = groupBySecurity(await dropOffTarget(filings));
  let quotes = {};
  let error = null;
  try {
    quotes = await getQuotes(groups.map((g) => g.secCode));
  } catch (e) {
    error = `株価データを取得できませんでした（${e.message}）`;
  }
  const picks = rankPicks(groups, quotes);
  const body = { days: DAYS, candidates: groups.length, updatedAt: new Date().toISOString(), dataKey: DATA_KEY, error, picks };
  if (!error && picks.length) cache = { at: Date.now(), key: DATA_KEY, body };
  return Response.json(body, NO_STORE);
}

// 目的外（TOB・33%超の大株主・経営参加・持ち合い・業務上・5%割れ）を候補から外す
async function dropOffTarget(filings) {
  const latest = new Map(); // 投資家×銘柄 → 最新の報告書
  for (const f of filings.filter(isCandidate)) {
    const k = `${f.investorId || f.filerName}|${f.secCode}`;
    if (!latest.has(k)) latest.set(k, f); // filings は新しい順
  }
  let holdings = {};
  try {
    ({ holdings } = await getHoldings([...latest.values()].map((f) => f.docId), { maxLive: 40 }));
  } catch {}
  const entries = [...latest.entries()].map(([k, f]) => ({
    k,
    secKey: f.secCode,
    who: f.investor || f.filerName,
    tob: f.tob,
    ratio: holdings[f.docId]?.ratio ?? null,
    purpose: holdings[f.docId]?.purpose ?? null,
  }));
  const stockOff = stockReasons(entries);
  const off = new Set(entries.filter((e) => ownReason(e) || stockOff[e.secKey] || (e.ratio != null && e.ratio < 5)).map((e) => e.k));
  return filings.filter((f) => !off.has(`${f.investorId || f.filerName}|${f.secCode}`));
}
