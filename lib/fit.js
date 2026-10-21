// イナゴライダーの目的（大物が乗っている・長く持てる銘柄を探す）から外れるものを判定する。
// 一覧（ブラウザ）と10選（サーバー）の両方で使う。

export const TAKEOVER_RATIO = 33.4; // これを超える大株主は買収・親会社・創業家級（TOBの3分の1ルールの目安）

const PURPOSE_OFF = {
  経営参加: "経営参加・支配が目的",
  政策: "政策投資・持ち合い",
  業務上: "担保・業務上の保有",
};

// 1つの「投資家×銘柄」について、自分自身の理由
export function ownReason({ tob, ratio, purpose }) {
  if (tob) return `TOB（公開買付け）の対象・買付者 ${tob.filerName}`;
  if (ratio != null && ratio >= TAKEOVER_RATIO) return `保有${ratio.toFixed(1)}%（買収・親会社級）`;
  if (purpose && PURPOSE_OFF[purpose.tag]) return PURPOSE_OFF[purpose.tag];
  return null;
}

// 同じ銘柄に33%超の大株主がいれば、その銘柄ごと目的外（浮動株が少ない・買収が進んでいる）
export function stockReasons(entries) {
  const out = {};
  for (const e of entries) {
    if (!e.secKey) continue;
    if (e.tob) out[e.secKey] = `TOB（公開買付け）の対象・買付者 ${e.tob.filerName}`;
    else if (!out[e.secKey] && e.ratio != null && e.ratio >= TAKEOVER_RATIO)
      out[e.secKey] = `${e.who}が${e.ratio.toFixed(1)}%保有（買収・親会社級）`;
  }
  return out;
}

// コンセプトは「高配当・優待で長く持って爆発を待つ」。利回りが低く優待もないものは目的外
export const MIN_YIELD = 2.5;

// 「優待あり」の判定（バッジ表示・採点・絞り込みで共通）
export const hasYutai = (yutai) => yutai?.status === "yes";

// 規模と流動性。小型株は開示で値が飛びやすく、大物が売るときに逃げ場がない。
// 一般的な区分（TOPIX規模別）は 大型=TOPIX100・中型=Mid400・小型=それ以外 で、時価総額＋流動性で決まる。
// ここでは個人で扱いやすい目安として、時価総額と1日の売買代金で足切りする。
export const MIN_MARKET_CAP_OKU = 1000; // これ未満は小型株として目的外（億円）
export const MIN_TURNOVER_OKU = 1; // 1日の平均売買代金がこれ未満は流動性不足として目的外（億円）
export const LARGE_CAP_OKU = 10000; // これ以上を「大型」と表示（億円）

export function sizeLabel(marketCapOku) {
  if (marketCapOku == null) return null;
  if (marketCapOku >= LARGE_CAP_OKU) return "大型";
  if (marketCapOku >= MIN_MARKET_CAP_OKU) return "中型";
  return "小型";
}

export function sizeReason(quote) {
  const mc = quote?.marketCapOku;
  if (mc != null && mc < MIN_MARKET_CAP_OKU) return `時価総額${mc.toLocaleString()}億（小型株）`;
  const t = quote?.turnoverOku;
  if (t != null && t < MIN_TURNOVER_OKU) return `売買代金 1日${t.toFixed(2)}億（流動性不足）`;
  return null;
}

// 52週の値幅の中でどこにいるか（0=安値、1=高値）
export function rangePosition(quote) {
  const { price, high52, low52 } = quote || {};
  if (price == null || high52 == null || low52 == null || high52 <= low52) return null;
  return Math.min(1, Math.max(0, (price - low52) / (high52 - low52)));
}

// 盛り上がりきった後に飛び乗らないための警告（除外はしない）
export function chaseWarning(quote) {
  const p = rangePosition(quote);
  if (p != null && p >= 0.9) return "52週高値圏（飛び乗り注意）";
  return null;
}

export function incomeReason(yieldPct, yutai) {
  if (yieldPct == null) return null; // 株価が取れていないうちは判定しない
  if (yieldPct >= MIN_YIELD || hasYutai(yutai)) return null;
  const y = yieldPct === 0 ? "無配" : `利回り${yieldPct.toFixed(2)}%`;
  return `${y}・${yutai?.status === "no" ? "優待なし" : "優待未確認"}（高配当・優待の条件外）`;
}
