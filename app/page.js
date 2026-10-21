"use client";
import { useEffect, useMemo, useState } from "react";
import { WATCHLIST, HORIZONS } from "../lib/watchlist";
import Picks from "./Picks";
import HoldingRow from "./HoldingRow";
import { ownReason, stockReasons, incomeReason, sizeReason, hasYutai } from "../lib/fit";
import { buildUp, isBuildingUp } from "../lib/trend";

const HORIZON_LABEL = Object.fromEntries(HORIZONS.map((h) => [h.id, h.label]));

export default function Home() {
  const [days, setDays] = useState(7);
  const [all, setAll] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState(null);
  const [horizon, setHorizon] = useState(null);
  const [quotes, setQuotes] = useState({});
  const [holdings, setHoldings] = useState({});
  const [buying, setBuying] = useState(false); // 「買い増し中」だけに絞る
  const [yutaiOnly, setYutaiOnly] = useState(false); // 「優待あり」だけに絞る

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

  // 各報告書の保有割合をまとめて取る（訂正は除く）
  useEffect(() => {
    const ids = (data?.filings || []).filter((f) => f.docType !== "訂正").map((f) => f.docId).filter((id) => !(id in holdings));
    if (!ids.length) return;
    let cancelled = false;
    (async () => {
      // 1回で読める件数（サーバー側の上限30）ずつ、順番に取りに行く
      for (let i = 0; i < ids.length && !cancelled; i += 30) {
        try {
          const j = await (await fetch(`/api/holdings?ids=${ids.slice(i, i + 30).join(",")}`)).json();
          const got = { ...j.holdings };
          if (!cancelled) setHoldings((h) => ({ ...h, ...got }));
        } catch {}
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

  const filings = useMemo(() => {
    let list = data?.filings || [];
    if (horizon) list = list.filter((f) => f.horizon === horizon);
    if (filter) list = list.filter((f) => f.investorId === filter);
    return list;
  }, [data, filter, horizon]);

  // 訂正は「動き」ではないので本体から外し、末尾に折りたたんで出す
  const mainList = useMemo(() => filings.filter((f) => f.docType !== "訂正"), [filings]);
  // 投資家×銘柄で1行にまとめる（並びは最新の報告書の新しい順）
  const groupKey = (f) => `${f.investorId || f.filerName}|${f.secCode || f.targetEdinetCode}`;
  const secKey = (f) => f.secCode || f.targetEdinetCode;
  const groupUp = (list) => {
    const map = new Map();
    for (const f of list) {
      const key = groupKey(f);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(f);
    }
    return [...map.values()];
  };
  const entryOf = (g) => ({
    secKey: secKey(g[0]),
    who: g[0].investor || g[0].filerName,
    tob: g[0].tob,
    ratio: holdings[g[0].docId]?.ratio ?? null,
    purpose: g.map((x) => holdings[x.docId]?.purpose).find(Boolean),
  });
  // 銘柄ごとの目的外理由は、絞り込み前の全データで判定する
  const stockOff = useMemo(
    () => stockReasons(groupUp((data?.filings || []).filter((f) => f.docType !== "訂正")).map(entryOf)),
    [data, holdings]
  );
  const [groups, offGroups] = useMemo(() => {
    const keep = [], off = [];
    for (const g of groupUp(mainList)) {
      const reason =
        ownReason(entryOf(g)) ||
        stockOff[secKey(g[0])] ||
        incomeReason(quotes[g[0].secCode]?.yieldPct, g[0].yutai) ||
        sizeReason(quotes[g[0].secCode]);
      if (reason) off.push({ g, reason });
      else if (yutaiOnly && !hasYutai(g[0].yutai)) continue;
      else if (!buying || isBuildingUp(buildUp(g, holdings))) keep.push(g);
    }
    return [keep, off];
  }, [mainList, holdings, stockOff, quotes, buying, yutaiOnly]);

  // 買い増しは何回分かの報告書が要るので、短い期間のときは半年に広げる
  function toggleBuying() {
    if (!buying && days < 90) setDays(180);
    setBuying((b) => !b);
  }
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
      <p className="sub">大物投資家が買った銘柄に乗る。EDINETの大量保有報告書から、誰がいま何%持っているかを拾います</p>

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
        <button className={`buying-toggle ${buying ? "on" : ""}`} onClick={toggleBuying} aria-pressed={buying}>
          ↑ 買い増し中
        </button>
        <button className={`buying-toggle ${yutaiOnly ? "on" : ""}`} onClick={() => setYutaiOnly((v) => !v)} aria-pressed={yutaiOnly}>
          優待あり
        </button>
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
        {groups.map((g) => (
          <HoldingRow
            key={g[0].docId}
            group={g}
            holdings={holdings}
            quote={quotes[g[0].secCode]}
            horizonLabel={HORIZON_LABEL[g[0].horizon]}
          />
        ))}
        {!loading && groups.length === 0 && (
          <div className="empty">
            {buying
              ? "この期間に続けて買い増している銘柄はありません"
              : yutaiOnly
                ? "この期間に優待あり銘柄はありません"
                : "該当する報告書はありません"}
          </div>
        )}
      </div>

      {offGroups.length > 0 && (
        <details className="fixes">
          <summary>目的外 {offGroups.length}件<span className="fixes-note">（低配当で優待なし・小型株・流動性不足・TOB・親会社級の大株主・持ち合いなど）</span></summary>
          <div className="fix-list">
            {offGroups.map(({ g, reason }) => (
              <div key={g[0].docId} className="fix-row">
                <span className="fix-who">{g[0].investor || g[0].filerName}</span>
                <span className="fix-target">→ {g[0].targetName || g[0].targetEdinetCode || "対象不明"}{g[0].secCode ? ` ${g[0].secCode}` : ""}</span>
                <span className="off-reason">{reason}</span>
                <a href={`/api/pdf/${g[0].docId}`} target="_blank" rel="noreferrer">PDF</a>
              </div>
            ))}
          </div>
        </details>
      )}

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
