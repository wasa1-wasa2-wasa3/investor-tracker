// 「イナゴ度」：Xにもう群衆が来ているか（話題の量・増え方・買い報告・煽り）と、明らかな危険情報。
// 何を買うかは大物（アクティビスト・長期投資家）が決める。Xは「いつ買うか」の温度計として使う。
//
// 流れ（費用をかけないため、xAIのAPIは使わない）:
//   1. 平日夜：GitHub Actions が20選を data/inago-targets.json に書き出す
//   2. 土曜朝：Grok Bot（定期実行）がそれを読んで調べ、「[イナゴ度]」Issue に JSON を投稿 → data/inago.json に取り込み
//   3. 土曜の昼前：Claude（定期実行）が危険情報を一次情報で裏取りし、各危険情報に check を書き足す
import data from "../data/inago.json";

export const INAGO = data;
export const INAGO_BY_CODE = Object.fromEntries((data.items || []).map((i) => [i.secCode, i]));

export const LEVELS = {
  quiet: { icon: "🌱", label: "静か", note: "大物は買ったが、まだ群衆は来ていない" },
  gathering: { icon: "🦗", label: "集まり始め", note: "話題が増えてきた" },
  swarming: { icon: "🦗🦗", label: "群がっている", note: "煽りが多い・高値づかみ注意" },
};

export const DANGER_KINDS = {
  dividend_cut: "減配・無配",
  yutai_cut: "優待の廃止・改悪",
  downgrade: "下方修正・赤字",
  dilution: "増資・売出し",
  scandal: "不祥事・処分",
  big_sell: "大物の売却",
  other: "その他",
};

// Claudeの裏取り結果
export const CHECKS = {
  confirmed: { label: "✓ 確認済み", cls: "ok" },
  unconfirmed: { label: "未確認", cls: "" },
  wrong: { label: "✕ 誤り", cls: "ng" },
};
