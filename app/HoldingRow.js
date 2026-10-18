"use client";
import { useState } from "react";
import HoldInfo from "./HoldInfo";
import { buildUp } from "../lib/trend";

const THRESHOLD = 5; // 大量保有報告の基準。これを割ると報告義務がなくなる＝実質売り抜け

const PURPOSE_CLASS = { 純投資: "pure", 提案あり: "act", 経営参加: "act", 政策: "pol", 業務上: "etc", その他: "etc" };

const fmt = (n) => `${n.toFixed(2)}%`;
const fmtDiff = (d) => `${d > 0 ? "+" : ""}${d.toFixed(2)}`;

// 投資家×銘柄の報告書の束（新しい順）と、各報告書の保有割合から、いまの状態を出す
export function holdingState(group, holdings) {
  const latest = group[0];
  const h = holdings[latest.docId];
  if (h === undefined) return { loading: true };
  const ratio = h?.ratio ?? null;
  let prev = h?.prev ?? null;
  if (prev == null && group[1]) prev = holdings[group[1].docId]?.ratio ?? null;
  const diff = ratio != null && prev != null ? ratio - prev : null;
  const sold = ratio != null && ratio < THRESHOLD;
  return { ratio, prev, diff, sold };
}

export default function HoldingRow({ group, holdings, quote, horizonLabel }) {
  const [open, setOpen] = useState(false);
  const [showPurpose, setShowPurpose] = useState(false);
  const f = group[0];
  const st = holdingState(group, holdings);
  const isNew = f.docType === "新規";
  const trend = buildUp(group, holdings);
  const purpose = group.map((g) => holdings[g.docId]?.purpose).find(Boolean);
  const hot = f.horizon === "long" && group.some((g) => g.docType === "新規") && !st.sold;

  let status;
  if (st.loading) status = <span className="ratio muted">保有割合 …</span>;
  else if (st.ratio == null) status = <span className="ratio muted">保有割合 不明</span>;
  else if (st.sold)
    status = (
      <span className="ratio sold-tag">
        {fmt(st.ratio)} 5%割れ（売り抜け）
      </span>
    );
  else
    status = (
      <span className="ratio">
        保有 <b>{fmt(st.ratio)}</b>
        {isNew && <span className="ratio-new">新規</span>}
        {!isNew && st.diff != null && (
          <span className={`ratio-diff ${st.diff > 0 ? "up" : st.diff < 0 ? "down" : ""}`}>
            {st.diff > 0 ? "↑" : st.diff < 0 ? "↓" : "→"}
            {fmtDiff(st.diff)}
          </span>
        )}
      </span>
    );

  return (
    <div className={`item ${f.investorId ? "" : "other"} ${hot ? "hot" : ""} ${st.sold ? "sold" : ""}`}>
      <div className="top">
        {hot && <span className="star" title="長期投資家の新規">★</span>}
        <span className="who">{f.investor || f.filerName}</span>
        {f.horizon && <span className={`htag ${f.horizon}`}>{horizonLabel}</span>}
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
      <div className="status">
        {status}
        {trend.streak >= 2 && !st.sold && (
          <span className="buildup" title="報告書ごとの保有割合が続けて増えている回数">
            {trend.streak}回連続↑ {trend.from === 0 ? "新規" : fmt(trend.from)}→{fmt(trend.to)}
          </span>
        )}
        {purpose && (
          <button
            type="button"
            className={`ptag p-${PURPOSE_CLASS[purpose.tag] || "etc"}`}
            onClick={() => setShowPurpose((o) => !o)}
            aria-expanded={showPurpose}
            title="保有目的（報告書の記載）"
          >
            {purpose.tag} {showPurpose ? "▲" : "▼"}
          </button>
        )}
        {purpose && showPurpose && <p className="purpose-text">保有目的：{purpose.text}</p>}
      </div>
      {f.secCode && <HoldInfo quote={quote} yutai={f.yutai} />}
      <div className="meta">
        最新 {f.submittedAt}・{f.docType}
        {group.length > 1 && (
          <>
            {"・"}
            <button type="button" className="more" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
              報告書 {group.length}件 {open ? "▲" : "▼"}
            </button>
          </>
        )}
      </div>
      {open && (
        <ul className="history">
          {group.map((g) => {
            const r = holdings[g.docId]?.ratio;
            return (
              <li key={g.docId}>
                <span className="fix-date">{g.submittedAt?.slice(0, 16)}</span>
                <span>{g.docType}</span>
                <span className="h-ratio">{r != null ? fmt(r) : "—"}</span>
                <a href={`/api/pdf/${g.docId}`} target="_blank" rel="noreferrer">PDF</a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
