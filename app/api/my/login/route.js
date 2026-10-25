import { checkPassword, sessionCookie, clearCookie, isConfigured, tooManyTries, recordFail, clearFails } from "../../../../lib/my-auth";

export const dynamic = "force-dynamic";

const ipOf = (req) => (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";

// POST /api/my/login  { password } → 合っていればログイン用のCookieを返す
export async function POST(req) {
  if (!isConfigured()) return Response.json({ error: "合言葉がまだ設定されていません（環境変数 MY_PASSWORD）" }, { status: 503 });
  const ip = ipOf(req);
  if (tooManyTries(ip)) return Response.json({ error: "まちがいが続いたため、15分ほど待ってからもう一度試してください" }, { status: 429 });
  let password = "";
  try {
    ({ password } = await req.json());
  } catch {}
  if (!checkPassword(password)) {
    recordFail(ip);
    await new Promise((r) => setTimeout(r, 800)); // 総当たりを遅くする
    return Response.json({ error: "合言葉がちがいます" }, { status: 401 });
  }
  clearFails(ip);
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookie(), "Cache-Control": "no-store" } });
}

// DELETE /api/my/login → ログアウト
export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": clearCookie(), "Cache-Control": "no-store" } });
}
