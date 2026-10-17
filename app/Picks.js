"use client";
import { useEffect, useState } from "react";

const fmtOku = (v) => (v == null ? "—" : v >= 10000 ? `${(v / 10000).toFixed(1)}兆` : `${v.toLocaleString()}億`);
const fmt = (v, d = 1, unit = "") => (v == null ? "—" : `${v.toFixed(d)}${unit}`);

export default function Picks() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);

  // スマホでは一覧を先に見られるよう、最初は閉じておく
  useEffect(() => {
    setOpen(window.matchMedia("(min-width: 1000px)").matches);
  }, []);

  useEffect(() => {
    fetch("/api/picks")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData({ error: "読み込みに失敗しました", picks: [] }));
  }, []);

  return (
    <aside className="picks">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span className="picks-title">有望銘柄10選</span>
          <span className="picks-sub">大物購入 × 配当・優待 × 爆発力（半年以内）{!open && "　▼タップで開く"}</span>
        </summary>

        {!data && <div className="picks-empty">集計中…</div>}
        {data?.error && <div className="picks-empty">{data.error}</div>}

        <ol className="picks-list">
          {data?.picks?.map((p, i) => (
            <li key={p.secCode} className="pick">
              <div className="pick-head">
                <span className="rank">{i + 1}</span>
                <a className="pick-name" href={`https://kabutan.jp/stock/?code=${p.secCode}`} target="_blank" rel="noreferrer">
                  {p.name || p.secCode}
                </a>
                <span className="code">{p.secCode}</span>
                <span className="total" title={`大物${p.scores.investor}・長期保有${p.scores.dividend}・爆発力${p.scores.explosion}`}>
                  {p.total}
                </span>
              </div>
              <div className="pick-who">
                {p.hasNew && <span className="star" title="長期・アクティビストの新規あり">★</span>}
                {p.investors.map((v) => (
                  <span key={v.id} className={`htag ${v.horizon}`}>{v.label}</span>
                ))}
              </div>
              <div className="pick-stats">
                <span>利回り <b>{p.quote.yieldPct === 0 ? "無配" : fmt(p.quote.yieldPct, 2, "%")}</b></span>
                {p.yutai?.status === "yes" && (
                  <span className="yutai yes" title={p.yutai.text || ""}>優待あり</span>
                )}
                <span>PBR <b>{fmt(p.quote.pbr, 2)}</b></span>
                <span>時価総額 <b>{fmtOku(p.quote.marketCapOku)}</b></span>
              </div>
            </li>
          ))}
        </ol>

        {data?.picks?.length > 0 && (
          <p className="picks-note">
            点数＝大物40＋長期保有30（配当＋優待）＋爆発力30。候補 {data.candidates} 銘柄から。優待は有価証券報告書の「株主に対する特典」欄より。
            「変更」には売却も含まれるので、PDFで保有割合を確認してください。投資判断はご自身で。
          </p>
        )}
      </details>
    </aside>
  );
}
