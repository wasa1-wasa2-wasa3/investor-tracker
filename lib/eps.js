// 会社予想ベースのEPS成長率を株探（kabutan.jp）の「業績」ページから取る。
// 「通期」の表で、予想の行（行頭に「予」）の修正1株益 ÷ 直前の実績の行の修正1株益。
// Yahoo の「直近12か月の実績EPS」と「予想EPS」は期間がずれて大きすぎる数字が出るため、こちらを使う。
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)";
const TTL = 12 * 60 * 60 * 1000; // 決算は頻繁に変わらないので12時間キャッシュ
const cache = new Map(); // code -> { at, value }

const strip = (h) => h.replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/[\s　]+/g, " ").trim();
const toNum = (t) => {
  const s = t.replace(/[,，\s]/g, "").replace(/^[＋+]/, "").replace(/^[－−▲△]/, "-");
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : null;
};

const growth = (now, before) => {
  if (now == null || before == null) return null;
  if (before > 0) return Math.round((now / before - 1) * 1000) / 10;
  return now > 0 ? 100 : null; // 赤字→黒字転換
};

// HTML → { epsFwd, epsPrev, epsGrowthPct, opGrowthPct, period } または null
// opGrowthPct＝営業利益（本業のもうけ）の伸び。EPSだけ大きく伸びる「前期の特損の反動」を見分けるのに使う
export function parseFinance(html) {
  // 「修正1株益」を見出しに持つ最初の表＝通期の業績推移
  const tables = html.match(/<table[\s\S]*?<\/table>/g) || [];
  for (const t of tables) {
    const rows = t.match(/<tr[\s\S]*?<\/tr>/g) || [];
    const header = rows.find((r) => r.includes("1株益"));
    if (!header) continue;
    const heads = (header.match(/<t[hd][\s\S]*?<\/t[hd]>/g) || []).map(strip);
    const epsCol = heads.findIndex((h) => h.includes("1株益"));
    if (epsCol < 1) continue;
    const opCol = heads.findIndex((h) => h.includes("営業"));
    let prev = null;
    for (const r of rows) {
      if (r === header) continue;
      const cells = (r.match(/<t[hd][\s\S]*?<\/t[hd]>/g) || []).map(strip);
      if (cells.length <= epsCol) continue;
      const label = cells[0];
      const m = label.match(/(\d{4})\.(\d{2})/);
      if (!m) continue; // 前期比などの行
      const eps = toNum(cells[epsCol]);
      if (label.includes("予")) {
        if (eps == null || prev?.eps == null) return null; // 直前の実績が読めないなら比べない
        const op = opCol > 0 ? toNum(cells[opCol]) : null;
        return {
          epsFwd: eps,
          epsPrev: prev.eps,
          epsGrowthPct: growth(eps, prev.eps),
          opGrowthPct: growth(op, prev.op),
          period: `${m[1]}.${m[2]}`,
        };
      }
      prev = { eps, op: opCol > 0 ? toNum(cells[opCol]) : null };
    }
    return null; // 通期の表はあったが予想の行がない
  }
  return null;
}

async function fetchOne(code) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(`https://kabutan.jp/stock/finance?code=${code}`, {
      headers: { "User-Agent": UA, "Accept-Language": "ja" },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return parseFinance(await res.text());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// codes → { code: { epsFwd, epsPrev, epsGrowthPct, period } | null }
export async function getCompanyEps(codes, { concurrency = 4 } = {}) {
  const out = {};
  const need = [];
  for (const c of codes) {
    const hit = cache.get(c);
    if (hit && Date.now() - hit.at < TTL) out[c] = hit.value;
    else need.push(c);
  }
  for (let i = 0; i < need.length; i += concurrency) {
    const batch = need.slice(i, i + concurrency);
    const vals = await Promise.all(batch.map(fetchOne));
    batch.forEach((c, j) => {
      out[c] = vals[j];
      if (vals[j]) cache.set(c, { at: Date.now(), value: vals[j] }); // 失敗はキャッシュしない
    });
  }
  return out;
}
