import { hasYutai, chaseWarning } from "./fit";
// 20選から「実際に買う3銘柄」に絞る。点数の順位より組み合わせを重視する:
//   1. 本気度：大物が今も買い増している（「買い増し中」）銘柄を優先
//   2. 長く持てる：利回り3%以上か、優待あり＋利回り2%以上（優待だけで利回りが低いものは外す）
//   3. 飛び乗らない：52週高値圏は外す
//   4. 分散：業種がかぶらない・買っている大物がかぶらない・すでに持っている業種は増やさない
// 条件が厳しすぎて3つそろわないときは、4→1の順にゆるめる。投資判断はご自身で。

export const TOP_N = 3;
export const MIN_YIELD_TOP3 = 3;
// 優待ありでも、利回りがこれ未満なら「長く持てる」とはみなさない
export const MIN_YIELD_WITH_YUTAI = 2;
// すでに持っている業種（増やさない）。東証33業種の名前で書く
export const HELD_INDUSTRIES = ["小売業"];

// 値動きが似る業種はひとまとめにして「かぶり」とみなす
const INDUSTRY_GROUPS = {
  銀行業: "金融",
  "証券、商品先物取引業": "金融",
  保険業: "金融",
  その他金融業: "金融",
  不動産業: "不動産",
  "電気・ガス業": "インフラ",
  陸運業: "運輸",
  海運業: "運輸",
  空運業: "運輸",
  "倉庫・運輸関連業": "運輸",
};
export const industryGroup = (ind) => (ind ? INDUSTRY_GROUPS[ind] || ind : null);

const canHoldLong = (p) => {
  const y = p.quote?.yieldPct ?? 0;
  return y >= MIN_YIELD_TOP3 || (hasYutai(p.yutai) && y >= MIN_YIELD_WITH_YUTAI);
};

export function pickTop3(picks) {
  const base = picks.filter((p) => canHoldLong(p) && !chaseWarning(p.quote) && !HELD_INDUSTRIES.includes(p.industry));
  const steps = [
    { buying: true, diverseInvestor: true, note: null },
    { buying: true, diverseInvestor: false, note: "買っている大物がかぶっています" },
    { buying: false, diverseInvestor: true, note: "「買い増し中」以外も含めました" },
    { buying: false, diverseInvestor: false, note: "「買い増し中」以外も含め、大物もかぶっています" },
  ];
  for (const step of steps) {
    const chosen = [];
    const groups = new Set();
    const investors = new Set();
    for (const p of base) {
      if (step.buying && !p.buildingUp) continue;
      const g = industryGroup(p.industry) || `?${p.secCode}`; // 業種不明は他とかぶらない扱い
      if (groups.has(g)) continue;
      const who = p.investors.map((v) => v.label);
      if (step.diverseInvestor && who.some((w) => investors.has(w))) continue;
      chosen.push(p);
      groups.add(g);
      who.forEach((w) => investors.add(w));
      if (chosen.length === TOP_N) return { picks: chosen, note: step.note };
    }
  }
  return { picks: [], note: "条件に合う銘柄が3つそろいませんでした" };
}

// 選んだ理由（画面に出す短い言葉）
export function reasons(p) {
  const r = [];
  if (p.buildingUp) r.push(`${p.buildingUp.who}が買い増し中`);
  const y = p.quote?.yieldPct;
  if (y != null && (y >= MIN_YIELD_TOP3 || hasYutai(p.yutai))) r.push(`利回り${y.toFixed(1)}%`);
  if (hasYutai(p.yutai)) r.push("優待あり");
  if (p.quote?.pbr != null && p.quote.pbr < 1) r.push(`PBR${p.quote.pbr.toFixed(2)}`);
  return r;
}
