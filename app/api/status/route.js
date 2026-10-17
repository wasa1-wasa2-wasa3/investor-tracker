import { getCodes, codesStatus } from "../../../lib/codes";
import { isMock } from "../../../lib/edinet";

export const dynamic = "force-dynamic";

// 動作確認用: GET /api/status
export async function GET() {
  if (!isMock()) await getCodes();
  return Response.json({ mock: isMock(), codes: codesStatus() });
}
