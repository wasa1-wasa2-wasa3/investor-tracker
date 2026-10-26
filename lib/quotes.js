// Yahoo Finance（非公式）から、配当利回り・PBR・時価総額などをまとめて取る。
// マルチバガーくんと同じく v7/quote を crumb 付きで使う。
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const BATCH = 100;

async function getCrumb() {
  const r1 = await fetch("https://fc.yahoo.com/", { headers: { "User-Agent": UA }, redirect: "follow" });
  const cookie = (r1.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
  const r2 = await fetch("https://query2.finance.yahoo.com/v1/test/getcrumb", {
    headers: { "User-Agent": UA, Cookie: cookie },
  });
  const crumb = (await r2.text()).trim();
  if (!crumb || crumb.length < 3) throw new Error("crumb empty");
  return { crumb, cookie };
}

async function getCrumbWithRetry() {
  for (let i = 0; i < 3; i++) {
    try {
      return await getCrumb();
    } catch (e) {
      if (i === 2) throw e;
      await new Promise((r) => setTimeout(r, 1500 * (i + 1)));
    }
  }
}

const num = (v) => (v != null && isFinite(Number(v)) ? Number(v) : null);

function toQuote(q) {
  const price = num(q.regularMarketPrice);
  const rate = num(q.dividendRate) ?? num(q.trailingAnnualDividendRate);
  // 利回り(%)。予想配当÷株価を優先し、なければ実績利回りを使う
  let yieldPct = null;
  if (rate > 0 && price > 0) yieldPct = (rate / price) * 100;
  else if (num(q.trailingAnnualDividendYield) > 0) yieldPct = num(q.trailingAnnualDividendYield) * 100;
  else if (rate === 0 || num(q.trailingAnnualDividendYield) === 0) yieldPct = 0; // 無配
  const pbr = num(q.priceToBook);
  const mc = num(q.marketCap);
  // 1日の平均売買代金（億円）。3か月平均の出来高×株価
  const vol = num(q.averageDailyVolume3Month) ?? num(q.averageDailyVolume10Day);
  const turnover = vol != null && price > 0 ? (vol * price) / 1e8 : null;
  // EPS：実績（直近12か月）と予想（今期 or 来期）。予想÷実績で「EPSが伸びる見込みか」を見る
  const epsTtm = num(q.epsTrailingTwelveMonths);
  const epsFwd = num(q.epsCurrentYear) ?? num(q.epsForward);
  let epsGrowthPct = null;
  if (epsTtm != null && epsFwd != null && epsTtm > 0) epsGrowthPct = Math.round((epsFwd / epsTtm - 1) * 1000) / 10;
  else if (epsTtm != null && epsTtm <= 0 && epsFwd != null && epsFwd > 0) epsGrowthPct = 100; // 赤字→黒字転換
  return {
    epsTtm,
    epsFwd,
    epsGrowthPct,
    price,
    changePct: num(q.regularMarketChangePercent),
    yieldPct: yieldPct != null ? Math.round(yieldPct * 100) / 100 : null,
    pbr: pbr > 0 ? Math.round(pbr * 100) / 100 : null,
    marketCapOku: mc > 0 ? Math.round(mc / 1e8) : null,
    turnoverOku: turnover != null ? Math.round(turnover * 100) / 100 : null,
    per: num(q.trailingPE) > 0 ? Math.round(num(q.trailingPE) * 10) / 10 : null,
    high52: num(q.fiftyTwoWeekHigh),
    low52: num(q.fiftyTwoWeekLow),
  };
}

// 動作確認用の疑似データ（QUOTES_MOCK=1）
function mockQuote(code) {
  const n = [...code].reduce((a, c) => a + c.charCodeAt(0), 0);
  return {
    price: 500 + (n % 50) * 40,
    changePct: ((n % 7) - 3) / 2,
    yieldPct: (n % 6) * 0.9,
    pbr: 0.4 + (n % 12) * 0.15,
    marketCapOku: 50 + (n % 20) * 180,
    turnoverOku: (n % 10) * 0.6,
    per: 8 + (n % 15),
    high52: 520 + (n % 50) * 48,
    low52: 380 + (n % 50) * 30,
    epsTtm: 100,
    epsFwd: 80 + (n % 9) * 8,
    epsGrowthPct: -20 + (n % 9) * 8,
  };
}

// codes: ["7058", "472A", ...] → { "7058": {...}, ... }
export async function getQuotes(codes) {
  const out = {};
  if (process.env.QUOTES_MOCK === "1") {
    for (const c of codes) out[c] = mockQuote(c);
    return out;
  }
  const { crumb, cookie } = await getCrumbWithRetry();
  const symbols = codes.map((c) => `${c}.T`);
  for (let i = 0; i < symbols.length; i += BATCH) {
    const batch = symbols.slice(i, i + BATCH);
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${batch.join(",")}&crumb=${encodeURIComponent(crumb)}`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Cookie: cookie }, signal: ctrl.signal });
      const data = await res.json();
      for (const q of data?.quoteResponse?.result ?? []) out[q.symbol.replace(/\.T$/, "")] = toQuote(q);
    } finally {
      clearTimeout(timer);
    }
  }
  return out;
}
