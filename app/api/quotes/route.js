import { getQuotes } from "../../../lib/quotes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TTL = 60 * 60 * 1000;
const cache = new Map(); // code -> { at, quote }

// GET /api/quotes?codes=7242,8871 … 配当利回り・PBR・時価総額など（1時間キャッシュ）
export async function GET(req) {
  const codes = [...new Set((new URL(req.url).searchParams.get("codes") || "").split(","))]
    .filter((c) => /^[0-9A-Z]{4}$/.test(c))
    .slice(0, 400);
  const now = Date.now();
  const need = codes.filter((c) => !(cache.get(c) && now - cache.get(c).at < TTL));
  let error = null;
  if (need.length) {
    try {
      const fresh = await getQuotes(need);
      for (const c of need) if (fresh[c]) cache.set(c, { at: now, quote: fresh[c] });
    } catch (e) {
      error = e.message;
    }
  }
  const quotes = Object.fromEntries(codes.filter((c) => cache.get(c)).map((c) => [c, cache.get(c).quote]));
  return Response.json({ error, quotes }, { headers: { "Cache-Control": "no-store" } });
}
