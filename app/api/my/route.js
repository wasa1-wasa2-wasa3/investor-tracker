import { isLoggedIn, isConfigured, parseHoldings, riskSettings } from "../../../lib/my-auth";
import { getLargeHoldingFilings } from "../../../lib/edinet";
import { getHoldings } from "../../../lib/holdings";
import { getQuotes } from "../../../lib/quotes";
import { getCodes } from "../../../lib/codes";
import yutaiData from "../../../data/yutai.json";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DAYS = 180;
const ALERT_DAYS = 30; // これより新しい大物の動きを「お知らせ」に出す
const NO_STORE = { "Cache-Control": "no-store, private" };
const NEAR_STOP_PCT = 5; // 撤退価格まで株価の5%以内に近づいたら「接近」

// 1件の報告書で、大物が増やしたのか減らしたのか
function direction(f, h) {
  if ((f.description || "").includes("短期大量譲渡")) return "down";
  if (f.docType === "新規") return "new";
  if (!h || h.ratio == null || h.prev == null) return null;
  if (h.ratio > h.prev) return "up";
  if (h.ratio < h.prev) return "down";
  return "flat";
}

// 撤退ライン：銘柄ごとの撤退価格 → なければ取得単価から下落率（銘柄ごと → 全体の既定）
function stopInfo(m, price, risk) {
  let stopPrice = m.stopPrice;
  let basis = stopPrice != null ? "price" : null;
  const pct = m.stopPct ?? risk.stopPct;
  if (stopPrice == null && pct != null && m.cost != null) {
    stopPrice = Math.round(m.cost * (1 - pct / 100) * 100) / 100;
    basis = `-${pct}%`;
  }
  if (stopPrice == null) return null;
  const distancePct = price != null ? Math.round(((price - stopPrice) / price) * 1000) / 10 : null;
  const status = price == null ? null : price <= stopPrice ? "broken" : distancePct <= NEAR_STOP_PCT ? "near" : "ok";
  // 撤退ラインで売った場合の損益
  const lossAtStop = m.cost != null && m.shares != null ? Math.round((stopPrice - m.cost) * m.shares) : null;
  return { price: stopPrice, basis, distancePct, status, lossAtStop };
}

// GET /api/my … ログイン中だけ、自分の保有銘柄と、それぞれの大物の動きを返す
export async function GET(req) {
  if (!isConfigured()) return Response.json({ error: "not_configured" }, { status: 503, headers: NO_STORE });
  if (!isLoggedIn(req)) return Response.json({ error: "login" }, { status: 401, headers: NO_STORE });

  const mine = parseHoldings();
  const risk = riskSettings();
  const codesSet = new Set(mine.map((m) => m.secCode));

  // 証券コード → 社名・業種・優待
  const codes = await getCodes();
  const info = {};
  for (const [edinet, c] of Object.entries(codes)) {
    if (c.secCode && codesSet.has(c.secCode) && (!info[c.secCode] || c.listed)) {
      const y = yutaiData.items[edinet];
      info[c.secCode] = { name: c.name, industry: c.industry, yutai: y ? { status: y.status, text: y.text } : null };
    }
  }

  // 大物の報告書（半年分）から、保有銘柄のものだけ
  const { filings } = await getLargeHoldingFilings({ days: DAYS });
  const related = filings.filter((f) => f.secCode && codesSet.has(f.secCode) && !f.withdrawn && f.docType !== "訂正");
  let ratios = {};
  try {
    ({ holdings: ratios } = await getHoldings(related.map((f) => f.docId), { maxLive: 40 }));
  } catch {}

  let quotes = {};
  let quoteError = null;
  try {
    quotes = await getQuotes([...codesSet]);
  } catch (e) {
    quoteError = `株価を取得できませんでした（${e.message}）`;
  }

  const since = new Date(Date.now() + 9 * 3600 * 1000 - ALERT_DAYS * 86400 * 1000).toISOString().slice(0, 10);
  const alerts = [];

  const stocks = mine.map((m) => {
    const q = quotes[m.secCode] || null;
    const events = related
      .filter((f) => f.secCode === m.secCode)
      .map((f) => {
        const h = ratios[f.docId];
        return {
          date: f.submittedAt.slice(0, 10),
          who: f.investor || f.filerName,
          docType: f.docType,
          ratio: h?.ratio ?? null,
          prev: h?.prev ?? null,
          dir: direction(f, h),
          docId: f.docId,
        };
      }); // 新しい順

    // 大物ごとの最新の状態
    const latest = new Map();
    for (const e of events) if (!latest.has(e.who)) latest.set(e.who, e);
    const investors = [...latest.values()].map((e) => ({
      who: e.who,
      ratio: e.ratio,
      dir: e.dir,
      date: e.date,
      below5: e.ratio != null && e.ratio < 5,
    }));

    for (const e of events) {
      if (e.date < since) continue;
      if (e.dir === "down") alerts.push({ kind: "sell", secCode: m.secCode, name: info[m.secCode]?.name, ...e });
      else if (e.dir === "up" || e.dir === "new") alerts.push({ kind: "buy", secCode: m.secCode, name: info[m.secCode]?.name, ...e });
    }

    const price = q?.price ?? null;
    const pl = price != null && m.cost != null && m.shares != null ? Math.round((price - m.cost) * m.shares) : null;
    const plPct = price != null && m.cost ? Math.round(((price - m.cost) / m.cost) * 1000) / 10 : null;
    const value = price != null && m.shares != null ? price * m.shares : null;
    return { ...m, ...(info[m.secCode] || {}), quote: q, pl, plPct, value, stop: stopInfo(m, price, risk), investors, events };
  });

  // 1銘柄の上限：資産総額 × 上限%
  const holdingsValue = stocks.reduce((s, x) => s + (x.value ?? 0), 0);
  const total = risk.total ?? holdingsValue;
  const maxValue = total > 0 ? total * (risk.maxPct / 100) : null;
  for (const s of stocks) {
    s.weightPct = s.value != null && total > 0 ? Math.round((s.value / total) * 1000) / 10 : null;
    s.overLimit = s.value != null && maxValue != null && s.value > maxValue;
    // 上限まで減らすなら何株にするか（100株単位で切り捨て）
    s.limitShares = s.overLimit && s.quote?.price ? Math.floor(maxValue / s.quote.price / 100) * 100 : null;
  }
  const riskOut = { total: Math.round(total), totalSource: risk.total != null ? "env" : "holdings", maxPct: risk.maxPct, maxValue: maxValue != null ? Math.round(maxValue) : null, stopPct: risk.stopPct, nearStopPct: NEAR_STOP_PCT };

  alerts.sort((a, b) => (a.date < b.date ? 1 : -1));
  return Response.json(
    { updatedAt: new Date().toISOString(), days: DAYS, alertDays: ALERT_DAYS, quoteError, risk: riskOut, stocks, alerts },
    { headers: NO_STORE },
  );
}
