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

export function incomeReason(yieldPct, yutai) {
  if (yieldPct == null) return null; // 株価が取れていないうちは判定しない
  if (yieldPct >= MIN_YIELD || hasYutai(yutai)) return null;
  const y = yieldPct === 0 ? "無配" : `利回り${yieldPct.toFixed(2)}%`;
  return `${y}・${yutai?.status === "no" ? "優待なし" : "優待未確認"}（高配当・優待の条件外）`;
}
