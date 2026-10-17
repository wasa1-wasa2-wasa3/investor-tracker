// 「有望銘柄10選」の採点。コンセプト：
//   大物投資家が購入 × 中〜高配当で長く持てる × 持っている間に爆発を狙う
// 100点満点 = 大物(40) + 長期保有(30: 配当＋優待) + 爆発力(30)

const HORIZON_POINTS = { long: 30, activist: 22, broad: 8 };

// 明らかな売却・訂正は候補にしない
export function isCandidate(f) {
  if (!f.secCode || f.withdrawn) return false;
  if (f.docType === "訂正") return false;
  if ((f.description || "").includes("短期大量譲渡")) return false;
  return true;
}

// 銘柄ごとにまとめる
export function groupBySecurity(filings) {
  const map = new Map();
  for (const f of filings.filter(isCandidate)) {
    const g = map.get(f.secCode) || {
      secCode: f.secCode,
      name: f.targetName,
      investors: new Map(),
      hasNew: false,
      latestAt: f.submittedAt,
      filings: 0,
      yutai: f.yutai,
    };
    g.filings++;
    if (f.submittedAt > g.latestAt) g.latestAt = f.submittedAt;
    if (f.docType === "新規" && f.horizon !== "broad") g.hasNew = true;
    if (f.investorId) g.investors.set(f.investorId, { id: f.investorId, label: f.investor, horizon: f.horizon });
    map.set(f.secCode, g);
  }
  return [...map.values()].map((g) => ({ ...g, investors: [...g.investors.values()] }));
}

export function scoreInvestors(g) {
  const best = Math.max(0, ...g.investors.map((i) => HORIZON_POINTS[i.horizon] ?? 0));
  let s = best;
  if (g.hasNew) s += 6;
  if (g.investors.length >= 2) s += 4;
  return Math.min(40, s);
}

export function scoreDividend(yieldPct) {
  if (yieldPct == null) return 0;
  if (yieldPct >= 5) return 30;
  if (yieldPct >= 4) return 25;
  if (yieldPct >= 3) return 20;
  if (yieldPct >= 2) return 10;
  return 0;
}

// 配当に優待を上乗せ（優待ありで+10、上限30）
export function scoreHolding(yieldPct, yutai) {
  return Math.min(30, scoreDividend(yieldPct) + (yutai?.status === "yes" ? 10 : 0));
}

export function scoreExplosion({ marketCapOku, pbr }) {
  let s = 0;
  if (marketCapOku != null) {
    if (marketCapOku <= 300) s += 15;
    else if (marketCapOku <= 1000) s += 11;
    else if (marketCapOku <= 3000) s += 6;
  }
  if (pbr != null) {
    if (pbr < 0.7) s += 15;
    else if (pbr < 1.0) s += 11;
    else if (pbr < 1.5) s += 6;
  }
  return s;
}

export function rankPicks(groups, quotes, limit = 10) {
  return groups
    .map((g) => {
      const q = quotes[g.secCode] || {};
      const investor = scoreInvestors(g);
      const dividend = scoreHolding(q.yieldPct, g.yutai);
      const explosion = scoreExplosion(q);
      return { ...g, quote: q, scores: { investor, dividend, explosion }, total: investor + dividend + explosion };
    })
    .filter((p) => p.quote.price != null)
    .sort((a, b) => b.total - a.total || (a.latestAt < b.latestAt ? 1 : -1))
    .slice(0, limit);
}
