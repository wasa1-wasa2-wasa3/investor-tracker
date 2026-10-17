import watchlist from "../data/watchlist.json";

// ウォッチ対象の投資家と、EDINETの「提出者名(filerName)」に含まれる文字列。
// horizon: long=長期 / activist=アクティビスト / broad=分散・機械的（ネット上の一般的な評判で分類）
// 提出者名は日本語・英語・カタカナが混在するので、思いつく表記を複数書いておく。
// 一覧そのものは data/watchlist.json（履歴収集スクリプトと共有）。
// 実データを見て、引っかからなかった表記はそこに足していく。
export const HORIZONS = [
  { id: "long", label: "長期" },
  { id: "activist", label: "アクティビスト" },
  { id: "broad", label: "分散" },
];

export const WATCHLIST = watchlist;

// 全角英数・全角スペースを半角に揃え、小文字化して比較する
export function normalize(s = "") {
  return s
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[　\s・･]/g, "")
    .toLowerCase();
}

const compiled = WATCHLIST.map((w) => ({ ...w, norm: w.patterns.map(normalize) }));

export function matchInvestor(filerName) {
  const n = normalize(filerName);
  return compiled.find((w) => w.norm.some((p) => n.includes(p))) || null;
}
