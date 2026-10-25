"use client";
import { useEffect, useState } from "react";
import { X_BY_CODE, STANCE } from "../lib/xposts";
import XVoice from "./XVoice";
import { hasYutai, sizeLabel, chaseWarning, MIN_MARKET_CAP_OKU, MIN_TURNOVER_OKU } from "../lib/fit";

const fmtOku = (v) => (v == null ? "—" : v >= 10000 ? `${(v / 10000).toFixed(1)}兆` : `${v.toLocaleString()}億`);
const fmt = (v, d = 1, unit = "") => (v == null ? "—" : `${v.toFixed(d)}${unit}`);

export default function Picks() {
  const [data, setData] = useState(null);
  const [open, setOpen] = useState(true);
  const [yutaiOnly, setYutaiOnly] = useState(false); // 「優待ありのみ」：20選に関係なく優待あり銘柄を全件

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

  const list = (yutaiOnly ? data?.yutaiPicks : data?.picks) || [];

  return (
    <aside className="picks">
      <details open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary>
          <span className="picks-title">{yutaiOnly ? `優待あり銘柄（${list.length}件）` : "有望銘柄20選"}</span>
          <span className="picks-sub">大物購入 × 中大型 × 配当・優待（半年以内）{!open && "　▼タップで開く"}</span>
        </summary>

        <button
          className={`yutai-toggle ${yutaiOnly ? "on" : ""}`}
          onClick={() => setYutaiOnly((v) => !v)}
          aria-pressed={yutaiOnly}
        >
          優待ありのみ
        </button>

        {!data && <div className="picks-empty">集計中…</div>}
        {data?.error && <div className="picks-empty">{data.error}</div>}
        {data && !data.error && yutaiOnly && list.length === 0 && (
          <div className="picks-empty">優待あり銘柄はありません</div>
        )}

        <ol className="picks-list">
          {list.map((p, i) => (
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
                {p.buildingUp && (
                  <span className="buildup" title={`${p.buildingUp.who}が続けて買い増し`}>
                    買い増し中 {p.buildingUp.from === 0 ? "新規" : `${p.buildingUp.from.toFixed(1)}%`}→{p.buildingUp.to.toFixed(1)}%
                  </span>
                )}
                {X_BY_CODE[p.secCode] && (
                  <a className="xbadge" href={X_BY_CODE[p.secCode][0].url} target="_blank" rel="noreferrer"
                    title={X_BY_CODE[p.secCode].map((x) => `${x.label}: ${x.summary}`).join("\n")}>
                    X {X_BY_CODE[p.secCode][0].label}が{STANCE[X_BY_CODE[p.secCode][0].stance]}
                  </a>
                )}
                {p.investors.map((v) => (
                  <span key={v.id} className={`htag ${v.horizon}`}>{v.label}</span>
                ))}
              </div>
              <div className="pick-stats">
                <span>利回り <b>{p.quote.yieldPct === 0 ? "無配" : fmt(p.quote.yieldPct, 2, "%")}</b></span>
                {hasYutai(p.yutai) && (
                  <span className="yutai yes" title={p.yutai.text || ""}>優待あり</span>
                )}
                <span>PBR <b>{fmt(p.quote.pbr, 2)}</b></span>
                <span>
                  時価総額 <b>{fmtOku(p.quote.marketCapOku)}</b>
                  {sizeLabel(p.quote.marketCapOku) && <span className="size-tag">{sizeLabel(p.quote.marketCapOku)}</span>}
                </span>
                <span>売買代金 <b>{p.quote.turnoverOku == null ? "—" : `${fmt(p.quote.turnoverOku, 1)}億/日`}</b></span>
                {chaseWarning(p.quote) && <span className="chase">{chaseWarning(p.quote)}</span>}
              </div>
              <XVoice code={p.secCode} name={p.name} />
            </li>
          ))}
        </ol>

        {list.length > 0 && (
          <p className="picks-note">
            点数＝大物40（続けて買い増しで加点）＋長期保有30（配当＋優待）＋爆発力30（PBRの低さ＋52週高値からの距離）。時価総額{MIN_MARKET_CAP_OKU.toLocaleString()}億未満・売買代金1日{MIN_TURNOVER_OKU}億未満は対象外。候補 {data.candidates} 銘柄から。優待は有価証券報告書の「株主に対する特典」欄より。
            投資判断はご自身で。
          </p>
        )}
      </details>
    </aside>
  );
}
