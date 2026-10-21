// 「買い増し中」の判定。一覧（ブラウザ）と20選（サーバー）の両方で使う。
//
// 同じ投資家×銘柄の報告書（新しい順）と、各報告書の保有割合から、
// 保有割合を古い順に並べて「最新まで何回続けて増えたか」を数える。
//   - 新規の大量保有報告書は 0% → 保有割合 への増加として1回に数える
//   - 期間内で一番古い変更報告書は、報告書にある「前回の割合」を起点にする
//   - 割合が読めていない報告書は飛ばす
export function buildUp(groupNewestFirst, holdings) {
  const series = [];
  const oldestFirst = [...groupNewestFirst].reverse();
  for (const [i, f] of oldestFirst.entries()) {
    const h = holdings[f.docId];
    if (!h || h.ratio == null) continue;
    if (series.length === 0 && i === 0) {
      if (f.docType === "新規") series.push(0);
      else if (h.prev != null) series.push(h.prev);
    }
    series.push(h.ratio);
  }
  let streak = 0;
  for (let i = series.length - 1; i > 0 && series[i] > series[i - 1]; i--) streak++;
  if (!streak) return { streak: 0 };
  const start = series[series.length - 1 - streak];
  // adds = 新規の買いを除いた「買い増し」の回数
  return { streak, adds: start === 0 ? streak - 1 : streak, from: start, to: series[series.length - 1] };
}

// 新規で買っただけではなく、その後も含めて1回以上続けて買い増している
export const isBuildingUp = (t) => (t.adds ?? 0) >= 1;
