"use client";
import { pickTop3, reasons, HELD_INDUSTRIES, MIN_YIELD_TOP3, MIN_YIELD_WITH_YUTAI } from "../lib/top3";

const shortName = (n) => (n || "").replace(/^株式会社|株式会社$/g, "");

// 20選から「実際に買う3銘柄」の候補。順位より組み合わせ（分散）を重視する
export default function Top3({ picks }) {
  const { picks: top, note } = pickTop3(picks || []);
  return (
    <section className="top3">
      <h3>🎯 3銘柄に絞ると</h3>
      {top.length === 0 && <div className="picks-empty">{note}</div>}
      <ol className="top3-list">
        {top.map((p) => (
          <li key={p.secCode}>
            <div className="top3-head">
              <a href={`https://kabutan.jp/stock/?code=${p.secCode}`} target="_blank" rel="noreferrer">{shortName(p.name)}</a>
              <span className="code">{p.secCode}</span>
              {p.industry && <span className="size-tag">{p.industry}</span>}
              <span className="top3-score">{p.total}点</span>
            </div>
            <div className="top3-why">
              {p.investors.map((v) => <span key={v.id} className={`htag ${v.horizon}`}>{v.label}</span>)}
              {reasons(p).map((r) => <span key={r} className="top3-reason">{r}</span>)}
            </div>
          </li>
        ))}
      </ol>
      {note && top.length > 0 && <p className="picks-note">※条件を少しゆるめました：{note}</p>}
      <p className="picks-note">
        選び方：①大物が買い増し中 ②利回り{MIN_YIELD_TOP3}%以上、または優待あり＋利回り{MIN_YIELD_WITH_YUTAI}%以上 ③予想EPSが減る銘柄は除く ④52週高値圏は除く（EPSが伸びている高値はブレイクとして残す） ⑤業種と大物がかぶらない（{HELD_INDUSTRIES.join("・")}は保有済みのため除く）。点数の高い順に当てはめています。
        買う前に、直近の決算と適時開示（減配・下方修正）を確認してください。投資判断はご自身で。
      </p>
    </section>
  );
}
