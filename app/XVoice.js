"use client";
import { useState } from "react";
import { LEVELS, DANGER_KINDS } from "../lib/xvoice";
import { rangePosition } from "../lib/fit";

// イナゴ度（Xにもう群衆が来ているか）と危険情報。ボタンを押したときだけGrokに聞く。
// 結果はこの端末に3日間残すので、開き直しても呼び直さない（費用がかからない）
const TTL = 3 * 24 * 60 * 60 * 1000;
const PARALLEL = 4; // 同時に問い合わせる銘柄数
const keyOf = (code) => `inago:${code}`;

export function loadSaved(code) {
  try {
    const s = JSON.parse(localStorage.getItem(keyOf(code)) || "null");
    return s && Date.now() - s.at < TTL ? s : null;
  } catch {
    return null;
  }
}

async function fetchOne(p) {
  const r = await fetch(`/api/xvoice?code=${p.secCode}&name=${encodeURIComponent(p.name || "")}`);
  const text = await r.text();
  let d;
  try {
    d = JSON.parse(text);
  } catch {
    // Vercelの時間切れ（504）などはJSONではなく文字のページが返る
    throw new Error(r.status === 504 ? "時間切れ（Grokの返事が遅すぎました）" : `サーバーエラー（HTTP ${r.status}）`);
  }
  if (!r.ok || d.error) {
    const e = new Error(d.error || `HTTP ${r.status}`);
    e.stop = d.stop || r.status === 429;
    throw e;
  }
  try {
    localStorage.setItem(keyOf(p.secCode), JSON.stringify(d));
  } catch {}
  return d;
}

// 「静か × 52週の安値寄り × 危険なし」＝大物は買ったが、まだ誰も来ていない
const isAhead = (p, v) => v.level === "quiet" && !v.dangers.length && (rangePosition(p.quote) ?? 1) < 0.6;

const shortName = (n) => (n || "").replace(/^株式会社|株式会社$/g, "").slice(0, 12);

function toText(rows) {
  const lines = ["【イナゴ度まとめ】Grok調べ・直近7日"];
  for (const { p, v } of rows) {
    lines.push(`- ${shortName(p.name)}（${p.secCode}・${p.total}点）${LEVELS[v.level].icon}${LEVELS[v.level].label} 投稿${v.recent ?? "?"}件（前週${v.before ?? "?"}件）買い報告${v.buyReports ?? "?"}人 ${v.summary}`);
    for (const d of v.dangers) lines.push(`  🔴${DANGER_KINDS[d.kind]}：${d.text}（${d.fact ? "事実" : "噂"}）${d.url}`);
  }
  return lines.join("\n");
}

// 20選の上に出す「まとめて調べる」ボタンと要約
export function XSummary({ list, voices, setVoices }) {
  const [run, setRun] = useState(null); // { done, total, errors }
  const [copied, setCopied] = useState(false);

  const rows = list.filter((p) => voices[p.secCode]).map((p) => ({ p, v: voices[p.secCode].voice }));
  const todo = list.filter((p) => !voices[p.secCode]);
  const running = run && run.done < run.total;

  const start = async () => {
    const queue = [...todo];
    const errors = [];
    let done = 0;
    setRun({ done: 0, total: queue.length, errors });
    const worker = async () => {
      while (queue.length) {
        const p = queue.shift();
        try {
          const d = await fetchOne(p);
          setVoices((m) => ({ ...m, [p.secCode]: d }));
        } catch (e) {
          if (e.stop) {
            // 残高切れ・今日の上限は全銘柄同じなので、1回だけ表示して残りはやめる
            if (!errors.some((x) => x.startsWith("中止"))) errors.push(`中止：${e.message}`);
          } else errors.push(`${shortName(p.name)}：${e.message}`);
          if (e.stop) {
            done += queue.length; // 今日の上限なら残りはやめる
            queue.length = 0;
          }
        }
        done++;
        setRun((r) => ({ ...r, done: Math.min(done, r.total), errors: [...errors] }));
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    setRun((r) => ({ ...r, done: r.total }));
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const danger = rows.filter((r) => r.v.dangers.length);
  const ahead = rows.filter((r) => isAhead(r.p, r.v));
  const byLevel = (lv) => rows.filter((r) => r.v.level === lv);

  return (
    <div className="inago">
      {todo.length > 0 && (
        <button className="inago-btn" onClick={start} disabled={running}>
          {running
            ? `Grokに聞いています… ${run.done}/${run.total}銘柄`
            : rows.length
              ? `残り${todo.length}銘柄のイナゴ度を調べる`
              : `${list.length}銘柄のイナゴ度をまとめて調べる`}
        </button>
      )}
      {running && <div className="inago-bar"><span style={{ width: `${(run.done / run.total) * 100}%` }} /></div>}
      {run?.errors?.length > 0 && !running && (
        <div className="xvoice-err">調べられなかった銘柄：{run.errors.join("／")}</div>
      )}

      {rows.length > 0 && (
        <div className="inago-sum">
          {danger.length > 0 && (
            <section className="inago-danger">
              <h4>🔴 危険情報あり</h4>
              {danger.map(({ p, v }) =>
                v.dangers.map((d) => (
                  <div key={p.secCode + d.url} className={`inago-drow ${d.fact ? "" : "rumor"}`}>
                    <b>{shortName(p.name)}</b> {DANGER_KINDS[d.kind]}：{d.text}
                    <span className="inago-fact">{d.fact ? "事実" : "噂"}</span>
                    <a href={d.url} target="_blank" rel="noreferrer">根拠</a>
                  </div>
                ))
              )}
            </section>
          )}
          {ahead.length > 0 && (
            <section>
              <h4>🌱 先回り候補（静か × 安値寄り × 危険なし）</h4>
              <div className="inago-names">
                {ahead.map(({ p }) => <span key={p.secCode}>{shortName(p.name)} <i>{p.total}点</i></span>)}
              </div>
            </section>
          )}
          {["swarming", "gathering", "quiet"].map((lv) =>
            byLevel(lv).length ? (
              <section key={lv}>
                <h4>{LEVELS[lv].icon} {LEVELS[lv].label}<small>　{LEVELS[lv].note}</small></h4>
                <div className="inago-names">
                  {byLevel(lv).map(({ p }) => <span key={p.secCode}>{shortName(p.name)} <i>{p.total}点</i></span>)}
                </div>
              </section>
            ) : null
          )}
          <button className="xvoice-copy" onClick={copy}>{copied ? "コピーしました" : "まとめをコピー（Claudeで裏取り用）"}</button>
          <p className="picks-note">Grok（AI）の判定で、投稿数はおおよそです。危険情報は必ず根拠を開いて確認してください。何を買うかは大物の動き、いつ買うかの目安にXを使う想定です。</p>
        </div>
      )}
    </div>
  );
}

// 各銘柄の行に出すバッジ。タップで詳細
export function XBadge({ data }) {
  const [open, setOpen] = useState(false);
  if (!data) return null;
  const v = data.voice;
  const L = LEVELS[v.level];
  return (
    <div className="xvoice">
      <button className={`inago-badge ${v.level}`} onClick={() => setOpen((o) => !o)}>
        {L.icon} {L.label}
        {v.dangers.length > 0 && <span className="inago-red">🔴{v.dangers.length}</span>}
        {open ? " ▲" : " ▼"}
      </button>
      {open && (
        <div className="xvoice-body">
          <div className="xvoice-count">
            投稿 <b>{v.recent ?? "?"}</b>件（前週 {v.before ?? "?"}件）・買い報告 <b>{v.buyReports ?? "?"}</b>人
            {v.hype && <span className="chase">煽り多め</span>}
            <span className="xvoice-when">（{new Date(data.at).toLocaleDateString("ja-JP")}に取得）</span>
          </div>
          {v.summary && <p className="xvoice-summary">{v.summary}</p>}
          {v.dangers.map((d) => (
            <div key={d.url} className={`inago-drow ${d.fact ? "" : "rumor"}`}>
              🔴 {DANGER_KINDS[d.kind]}：{d.text}
              <span className="inago-fact">{d.fact ? "事実" : "噂"}</span>
              <a href={d.url} target="_blank" rel="noreferrer">根拠</a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
