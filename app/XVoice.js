"use client";
import { useState } from "react";
import { INAGO, INAGO_BY_CODE, LEVELS, DANGER_KINDS, CHECKS } from "../lib/inago";
import { rangePosition } from "../lib/fit";

// イナゴ度のまとめ。毎週日曜にGrok Botが調べ、Claudeが危険情報を裏取りした結果を表示する（費用ゼロ）
const shortName = (n) => (n || "").replace(/^株式会社|株式会社$/g, "").slice(0, 12);
const fmtDate = (iso) => (iso ? new Date(iso).toLocaleDateString("ja-JP", { month: "numeric", day: "numeric" }) : "");

// 「静か × 52週の安値寄り × 危険なし」＝大物は買ったが、まだ誰も来ていない
const isAhead = (p, v) => v.level === "quiet" && !liveDangers(v).length && p?.quote && (rangePosition(p.quote) ?? 1) < 0.6;
// Claudeが「誤り」と判定した危険情報は数えない
const liveDangers = (v) => v.dangers.filter((d) => d.check !== "wrong");

function Danger({ d, name }) {
  const c = CHECKS[d.check];
  return (
    <div className={`inago-drow ${d.fact || d.check === "confirmed" ? "" : "rumor"} ${d.check === "wrong" ? "wrong" : ""}`}>
      {name && <b>{name} </b>}🔴 {DANGER_KINDS[d.kind]}：{d.text}
      <span className="inago-fact">{d.fact ? "事実" : "噂"}</span>
      {c && <span className={`inago-check ${c.cls}`} title={d.checkNote || ""}>{c.label}</span>}
      <a href={d.url} target="_blank" rel="noreferrer">根拠</a>
      {d.checkNote && <div className="inago-note">Claude：{d.checkNote}</div>}
    </div>
  );
}

function toText(rows) {
  const lines = [`【イナゴ度まとめ】Grok調べ ${fmtDate(INAGO.updatedAt)}`];
  for (const { p, v } of rows) {
    lines.push(`- ${shortName(v.name)}（${v.secCode}${p ? `・${p.total}点` : ""}）${LEVELS[v.level].icon}${LEVELS[v.level].label} 投稿${v.recent ?? "?"}件（前週${v.before ?? "?"}件）買い報告${v.buyReports ?? "?"}人 ${v.summary}`);
    for (const d of v.dangers) lines.push(`  🔴${DANGER_KINDS[d.kind]}：${d.text}（${d.fact ? "事実" : "噂"}${d.check ? "・" + CHECKS[d.check]?.label : ""}）${d.url}`);
  }
  return lines.join("\n");
}

// 20選の上に出す要約
export function XSummary({ list }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const items = INAGO.items || [];
  if (!items.length) {
    return <div className="inago-empty">🦗 イナゴ度：毎週日曜の14時にGrokが調べて、ここに表示されます</div>;
  }
  const byCode = Object.fromEntries(list.map((p) => [p.secCode, p]));
  const rows = items.map((v) => ({ p: byCode[v.secCode], v }));
  const danger = rows.filter((r) => liveDangers(r.v).length);
  const ahead = rows.filter((r) => isAhead(r.p, r.v));
  const byLevel = (lv) => rows.filter((r) => r.v.level === lv);
  const names = (rs) => rs.map(({ p, v }) => <span key={v.secCode}>{shortName(v.name)}{p && <i> {p.total}点</i>}</span>);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <details className="inago" open={open} onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="inago-head">
        🦗 イナゴ度まとめ（{fmtDate(INAGO.updatedAt)}・Grok調べ）
        {danger.length > 0 && <span className="inago-red">🔴{danger.length}銘柄</span>}
        {ahead.length > 0 && <span className="inago-ahead">🌱先回り{ahead.length}</span>}
      </summary>
      <div className="inago-sum">
        {danger.length > 0 && (
          <section className="inago-danger">
            <h4>🔴 危険情報あり</h4>
            {danger.map(({ v }) => liveDangers(v).map((d) => <Danger key={v.secCode + d.url} d={d} name={shortName(v.name)} />))}
          </section>
        )}
        {ahead.length > 0 && (
          <section>
            <h4>🌱 先回り候補<small>　静か × 安値寄り × 危険なし</small></h4>
            <div className="inago-names">{names(ahead)}</div>
          </section>
        )}
        {["swarming", "gathering", "quiet"].map((lv) =>
          byLevel(lv).length ? (
            <section key={lv}>
              <h4>{LEVELS[lv].icon} {LEVELS[lv].label}<small>　{LEVELS[lv].note}</small></h4>
              <div className="inago-names">{names(byLevel(lv))}</div>
            </section>
          ) : null
        )}
        <button className="xvoice-copy" onClick={copy}>{copied ? "コピーしました" : "まとめをコピー"}</button>
        {INAGO.issueUrl && <a className="inago-issue" href={INAGO.issueUrl} target="_blank" rel="noreferrer">Grokの元データ</a>}
        <p className="picks-note">投稿数はGrok（AI）のおおよその数です。危険情報は根拠を開いて確認してください。✓確認済み・✕誤りはClaudeが一次情報で裏取りした結果です。</p>
      </div>
    </details>
  );
}

// 各銘柄の行に出すバッジ。タップで詳細
export function XBadge({ code }) {
  const [open, setOpen] = useState(false);
  const v = INAGO_BY_CODE[code];
  if (!v) return null;
  const L = LEVELS[v.level];
  const ds = liveDangers(v);
  return (
    <div className="xvoice">
      <button className={`inago-badge ${v.level}`} onClick={() => setOpen((o) => !o)}>
        {L.icon} {L.label}
        {ds.length > 0 && <span className="inago-red">🔴{ds.length}</span>}
        {open ? " ▲" : " ▼"}
      </button>
      {open && (
        <div className="xvoice-body">
          <div className="xvoice-count">
            投稿 <b>{v.recent ?? "?"}</b>件（前週 {v.before ?? "?"}件）・買い報告 <b>{v.buyReports ?? "?"}</b>人
            {v.hype && <span className="chase">煽り多め</span>}
            <span className="xvoice-when">（{fmtDate(INAGO.updatedAt)}調べ）</span>
          </div>
          {v.summary && <p className="xvoice-summary">{v.summary}</p>}
          {v.dangers.map((d) => <Danger key={d.url} d={d} />)}
        </div>
      )}
    </div>
  );
}
