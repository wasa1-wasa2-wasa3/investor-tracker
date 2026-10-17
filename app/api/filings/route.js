import { getLargeHoldingFilings } from "../../../lib/edinet";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/filings?days=7&all=1
export async function GET(req) {
  const { searchParams } = new URL(req.url);
  const days = Math.min(Math.max(parseInt(searchParams.get("days") || "7", 10), 1), 365 * 5);
  const all = searchParams.get("all") === "1";
  const data = await getLargeHoldingFilings({ days, all });
  return Response.json(data);
}
