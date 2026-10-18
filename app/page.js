"use client";
import { useEffect, useMemo, useState } from "react";
import { WATCHLIST, HORIZONS } from "../lib/watchlist";
import Picks from "./Picks";
import HoldInfo from "./HoldInfo";

const HORIZON_LABEL = Object.fromEntries(HORIZONS.map((h) => [h.id, h.label]));

export default function Home() {
  const [days, setDays] = useState(7);
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(null);
  const [horizon, setHorizon] = useState(null);
  const [quotes, setQuotes] = useState({});

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

  // 表示中の銘柄の配当利回りなどをまとめて取る
  useEffect(() => {
    const codes = [...new Set((data?.filings || []).map((f) => f.secCode).filter(Boolean))].filter((c) => !quotes[c]);
    if (!codes.length) return;
    fetch(`/api/quotes?codes=${codes.join(",")}`)
      .then((r) => r.json())
      .then((j) => setQuotes((q) => ({ ...q, ...j.quotes })))
      .catch(() => {});
  }, [data]);

  const filings = useMemo(() => {
    let list = data?.filings || [];
    if (horizon) list = list.filter((f) => f.horizon === horizon);
    if (filter) list = list.filter((f) => f.investorId === filter);
    return list;
  }, [data, filter, horizon]);

  // 訂正は「動き」ではないので本体から外し、末尾に折りたたんで出す
  const mainList = useMemo(() => filings.filter((f) => f.docType !== "訂正"), [filings]);
  const fixList = useMemo(() => filings.filter((f) => f.docType === "訂正"), [filings]);
  const moves = useMemo(() => (data?.filings || []).filter((f) => f.docType !== "訂正"), [data]);

  const hcounts = useMemo(() => {
    const c = {};
    for (const f of moves) if (f.horizon) c[f.horizon] = (c[f.horizon] || 0) + 1;
    return c;
  }, [moves]);

  function pickHorizon(h) {
    setHorizon(h);
    setFilter(null);
  }

  const counts = useMemo(() => {
    const c = {};
    for (const f of moves) if (f.investorId) c[f.investorId] = (c[f.investorId] || 0) + 1;
    return c;
  }, [moves]);

  return (
    <main>
      <h1>イナゴライダー</h1>
      <p className="sub">大物投資家が買った銘柄に乗る。EDINETの大量保有報告書から新規・変更を拾います</p>

      <div className="layout">
      <Picks />
      <section className="feed">
      <div className="controls">
        <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
          <option value={1}>今日</option>
          <option value={3}>3日</option>
          <option value={7}>7日</option>
          <option value={14}>14日</option>
          <option value={30}>30日</option>
          <option value={90}>90日</option>
          <option value={180}>半年</option>
        </select>
        <label className="chk">
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
          対象外の提出者も表示
        </label>
        <button onClick={load} disabled={loading}>{loading ? "取得中…" : "再取得"}</button>
      </div>

      {data?.mock && <div className="banner">モックデータを表示中です。EDINET_API_KEY を設定すると実データに切り替わります。</div>}
      {data?.usedHistory && (
        <div className="banner">
          {data.history.count === 0
            ? "過去の履歴データがまだありません。GitHubの「履歴の更新」を一度実行すると表示されます。"
            : `15日以上前は保存済みの履歴から表示しています（最終更新 ${new Date(data.history.updatedAt).toLocaleString("ja-JP")}、${data.history.oldest} 以降）。この期間ではウォッチ対象外は表示されません。`}
        </div>
      )}
      {data?.errors?.length > 0 && <div className="banner">一部の日付で取得エラー: {data.errors.join(" / ")}</div>}

      <div className="tabs">
        <button className={`tab ${!horizon ? "on" : ""}`} onClick={() => pickHorizon(null)}>すべて</button>
        {HORIZONS.map((h) => (
          <button key={h.id} className={`tab ${horizon === h.id ? "on" : ""}`} onClick={() => pickHorizon(h.id)}>
            {h.label}{hcounts[h.id] ? ` ${hcounts[h.id]}` : ""}
          </button>
        ))}
      </div>

      <div className="chips">
        <button className={`chip ${!filter ? "on" : ""}`} onClick={() => setFilter(null)}>すべて</button>
        {WATCHLIST.filter((w) => !horizon || w.horizon === horizon).map((w) => (
          <button key={w.id} className={`chip ${filter === w.id ? "on" : ""}`} onClick={() => setFilter(w.id)}>
            {w.label}{counts[w.id] ? ` ${counts[w.id]}` : ""}
          </button>
        ))}
      </div>

      <div className="list">
        {mainList.map((f) => (
          <div key={f.docId} className={`item ${f.investorId ? "" : "other"} ${f.horizon === "long" && f.docType === "新規" ? "hot" : ""}`}>
            <div className="top">
              {f.horizon === "long" && f.docType === "新規" && <span className="star" title="長期投資家の新規">★</span>}
              <span className={`badge ${f.docType === "新規" ? "new" : f.docType === "訂正" ? "fix" : "chg"}`}>{f.docType}</span>
              <span className="who">{f.investor || f.filerName}</span>
              {f.horizon && <span className={`htag ${f.horizon}`}>{HORIZON_LABEL[f.horizon]}</span>}
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
            {f.secCode && <HoldInfo quote={quotes[f.secCode]} yutai={f.yutai} />}
            <div className="meta">
              {f.submittedAt}・{f.description}・提出者: {f.filerName}{f.withdrawn ? "・取下げ" : ""}
            </div>
          </div>
        ))}
        {!loading && mainList.length === 0 && <div className="empty">該当する報告書はありません</div>}
      </div>

      {fixList.length > 0 && (
        <details className="fixes">
          <summary>訂正報告書 {fixList.length}件<span className="fixes-note">（過去の報告書の記載ミスの修正。売買の動きではありません）</span></summary>
          <div className="fix-list">
            {fixList.map((f) => (
              <div key={f.docId} className="fix-row">
                <span className="fix-date">{f.submittedAt?.slice(5, 16)}</span>
                <span className="fix-who">{f.investor || f.filerName}</span>
                <span className="fix-target">→ {f.targetName || f.targetEdinetCode || "対象不明"}{f.secCode ? ` ${f.secCode}` : ""}</span>
                <a href={`/api/pdf/${f.docId}`} target="_blank" rel="noreferrer">PDF</a>
              </div>
            ))}
          </div>
        </details>
      )}
      </section>
      </div>
    </main>
  );
}
