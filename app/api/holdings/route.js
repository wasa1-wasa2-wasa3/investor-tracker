import { getHoldings } from "../../../lib/holdings";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/holdings?ids=S100XXXX,S100YYYY → 各報告書の株券等保有割合と前回の割合
export async function GET(req) {
  const ids = (new URL(req.url).searchParams.get("ids") || "")
    .split(",")
    .filter((id) => /^S100[A-Z0-9]{4,5}$/.test(id))
    .slice(0, 200);
  const data = await getHoldings(ids);
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
