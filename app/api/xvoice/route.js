import { fetchXVoice } from "../../../lib/xvoice";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// 同じ銘柄は3日間キャッシュして、Grokを呼び直さない（サーバーが再起動すると消える）
const TTL = 3 * 24 * 60 * 60 * 1000;
const cache = new Map(); // code -> { at, voice }
// 使いすぎ防止：1日に呼べる回数（リポジトリ外の人がURLを叩いても費用が膨らまないように）
const DAILY_LIMIT = Number(process.env.XVOICE_DAILY_LIMIT) || 60; // 20銘柄まとめて調べても数回分
let usage = { day: "", n: 0 };
const NO_STORE = { headers: { "Cache-Control": "no-store" } };

// GET /api/xvoice?code=4043&name=トクヤマ … その銘柄のイナゴ度と危険情報（Grok）
export async function GET(req) {
  const q = new URL(req.url).searchParams;
  const code = q.get("code") || "";
  const name = (q.get("name") || "").slice(0, 30);
  if (!/^[0-9][0-9A-Z]{3}$/.test(code)) return Response.json({ error: "証券コードが正しくありません" }, { status: 400, ...NO_STORE });

  const hit = cache.get(code);
  if (hit && Date.now() - hit.at < TTL) return Response.json({ code, at: hit.at, cached: true, voice: hit.voice }, NO_STORE);

  if (!process.env.XAI_API_KEY) return Response.json({ error: "XAI_API_KEY が設定されていません" }, { status: 503, ...NO_STORE });
  const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  if (usage.day !== today) usage = { day: today, n: 0 };
  if (usage.n >= DAILY_LIMIT) return Response.json({ error: `今日の上限（${DAILY_LIMIT}回）に達しました。明日また試してください` }, { status: 429, ...NO_STORE });

  usage.n++;
  try {
    const voice = await fetchXVoice(code, name);
    const at = Date.now();
    cache.set(code, { at, voice });
    return Response.json({ code, at, cached: false, voice }, NO_STORE);
  } catch (e) {
    return Response.json({ error: `Xの声を取得できませんでした（${e.message}）` }, { status: 502, ...NO_STORE });
  }
}
