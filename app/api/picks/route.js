import { getLargeHoldingFilings } from "../../../lib/edinet";
import { getQuotes } from "../../../lib/quotes";
import { groupBySecurity, rankPicks } from "../../../lib/picks";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 180;
const TTL = 60 * 60 * 1000; // 株価は1時間ごとに取り直す
let cache = { at: 0, body: null };

// GET /api/picks … 大物が半年以内に買った銘柄から、配当×爆発力で上位10銘柄
export async function GET() {
  if (cache.body && Date.now() - cache.at < TTL) return Response.json(cache.body);
  const { filings } = await getLargeHoldingFilings({ days: DAYS });
  const groups = groupBySecurity(filings);
  let quotes = {};
  let error = null;
  try {
    quotes = await getQuotes(groups.map((g) => g.secCode));
  } catch (e) {
    error = `株価データを取得できませんでした（${e.message}）`;
  }
  const picks = rankPicks(groups, quotes);
  const body = { days: DAYS, candidates: groups.length, updatedAt: new Date().toISOString(), error, picks };
  if (!error && picks.length) cache = { at: Date.now(), body };
  return Response.json(body);
}
