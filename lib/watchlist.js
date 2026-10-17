// ウォッチ対象の投資家と、EDINETの「提出者名(filerName)」に含まれる文字列。
// 提出者名は日本語・英語・カタカナが混在するので、思いつく表記を複数書いておく。
// 実データを見て、引っかからなかった表記はここに足していく。
export const WATCHLIST = [
  { id: "satsuki", label: "五月（片山晃）", style: "個人・成長株", patterns: ["片山晃"] },
  { id: "imura", label: "井村俊哉", style: "個人・集中投資", patterns: ["井村俊哉"] },
  {
    id: "hikari",
    label: "光通信グループ",
    style: "中小型の大量保有",
    patterns: ["光通信", "UH Partners", "ＵＨ　Ｐａｒｔｎｅｒｓ", "エスアイエル", "インフォサービス"],
  },
  {
    id: "murakami",
    label: "村上世彰系",
    style: "アクティビスト",
    patterns: ["シティインデックスイレブンス", "エスグラントコーポレーション", "南青山不動産", "村上世彰", "野村絢", "村上貴輝", "ATRA"],
  },
  { id: "strategic", label: "ストラテジックキャピタル", style: "アクティビスト", patterns: ["ストラテジックキャピタル"] },
  { id: "effissimo", label: "エフィッシモ", style: "アクティビスト", patterns: ["エフィッシモ", "Effissimo"] },
  { id: "dalton", label: "ダルトン", style: "アクティビスト", patterns: ["ダルトン", "Dalton"] },
  { id: "oasis", label: "オアシス", style: "アクティビスト", patterns: ["オアシス", "Oasis Management"] },
  { id: "3d", label: "3Dインベストメント", style: "アクティビスト", patterns: ["3D Investment", "３Ｄ", "スリーディー"] },
  { id: "berkshire", label: "バークシャー", style: "長期・大型", patterns: ["バークシャー", "Berkshire", "ナショナル・インデムニティー", "National Indemnity"] },
];

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
