"use client";
import { useEffect, useMemo, useState } from "react";
import { WATCHLIST } from "../lib/watchlist";

export default function Home() {
  const [days, setDays] = useState(7);
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/filings?days=${days}${all ? "&all=1" : ""}`);
      setData(await res.json());
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { load(); }, [days, all]);

  const filings = useMemo(() => {
    const list = data?.filings || [];
    return filter ? list.filter((f) => f.investorId === filter) : list;
  }, [data, filter]);

  const counts = useMemo(() => {
    const c = {};
    for (const f of data?.filings || []) if (f.investorId) c[f.investorId] = (c[f.investorId] || 0) + 1;
    return c;
  }, [data]);

  return (
    <main>
      <h1>大物ウォッチ</h1>
      <p className="sub">EDINETの大量保有報告書から、ウォッチ対象の投資家の新規・変更を拾います（PoC）</p>

      <div className="controls">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>今日</option>
          <option value={3}>3日</option>
          <option value={7}>7日</option>
          <option value={14}>14日</option>
        </select>
        <label className="chk">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          対象外の提出者も表示
        </label>
        <button onClick={load} disabled={loading}>{loading ? "取得中…" : "再取得"}</button>
      </div>

      {data?.mock && <div className="banner">モックデータを表示中です。EDINET_API_KEY を設定すると実データに切り替わります。</div>}
      {data?.errors?.length > 0 && <div className="banner">一部の日付で取得エラー: {data.errors.join(" / ")}</div>}

      <div className="chips">
        <button className={`chip ${!filter ? "on" : ""}`} onClick={() => setFilter(null)}>すべて</button>
        {WATCHLIST.map((w) => (
          <button key={w.id} className={`chip ${filter === w.id ? "on" : ""}`} onClick={() => setFilter(w.id)}>
            {w.label}{counts[w.id] ? ` ${counts[w.id]}` : ""}
          </button>
        ))}
      </div>

      <div className="list">
        {filings.map((f) => (
          <div key={f.docId} className={`item ${f.investorId ? "" : "other"}`}>
            <div className="top">
              <span className={`badge ${f.docType === "新規" ? "new" : "chg"}`}>{f.docType}</span>
              <span className="who">{f.investor || f.filerName}</span>
              <span>→</span>
              <span className="target">{f.targetName || f.targetEdinetCode || "対象不明"}</span>
              {f.secCode && <span className="code">{f.secCode}</span>}
            </div>
            <div className="links">
              {f.secCode && (
                <a href={`https://kabutan.jp/stock/?code=${f.secCode}`} target="_blank" rel="noreferrer">株探</a>
              )}
              <a href={`/api/pdf/${f.docId}`} target="_blank" rel="noreferrer">PDF</a>
            </div>
            <div className="meta">
              {f.submittedAt}・{f.description}・提出者: {f.filerName}{f.withdrawn ? "・取下げ" : ""}
            </div>
          </div>
        ))}
        {!loading && filings.length === 0 && <div className="empty">該当する報告書はありません</div>}
      </div>
    </main>
  );
}
