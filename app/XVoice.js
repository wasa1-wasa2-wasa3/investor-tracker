"use client";
import { useEffect, useState } from "react";
import { TONES } from "../lib/xvoice";

// 「Xの声を見る」ボタン。押したときだけGrokを呼ぶ（費用を抑えるため）。
// 結果はこの端末にも3日間残すので、開き直しても呼び直さない
const TTL = 3 * 24 * 60 * 60 * 1000;
const STANCE = { bull: "強気", bear: "弱気", neutral: "中立" };
const keyOf = (code) => `xvoice:${code}`;

function loadSaved(code) {
  try {
    const s = JSON.parse(localStorage.getItem(keyOf(code)) || "null");
    return s && Date.now() - s.at < TTL ? s : null;
  } catch {
    return null;
  }
}

function toText(name, code, d) {
  const v = d.voice;
  const lines = [
    `【Xの声】${name}（${code}）${v.from}以降・Grok調べ`,
    `${TONES[v.tone]}（強気${v.bull ?? "?"}人／弱気${v.bear ?? "?"}人）`,
    v.summary,
    ...v.points.map((p) => `- [${STANCE[p.stance]}] ${p.text} ${p.url}`),
  ];
  return lines.join("\n");
}

export default function XVoice({ code, name }) {
  const [state, setState] = useState({ status: "idle" });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const s = loadSaved(code);
    if (s) setState({ status: "done", data: s, open: false });
  }, [code]);

  const ask = async () => {
    if (state.status === "done") return setState((s) => ({ ...s, open: !s.open }));
    setState({ status: "loading" });
    try {
      const r = await fetch(`/api/xvoice?code=${code}&name=${encodeURIComponent(name || "")}`);
      const d = await r.json();
      if (!r.ok || d.error) throw new Error(d.error || `HTTP ${r.status}`);
      try {
        localStorage.setItem(keyOf(code), JSON.stringify(d));
      } catch {}
      setState({ status: "done", data: d, open: true });
    } catch (e) {
      setState({ status: "error", message: e.message });
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(toText(name, code, state.data));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  const d = state.data;
  return (
    <div className="xvoice">
      <button className="xvoice-btn" onClick={ask} disabled={state.status === "loading"}>
        {state.status === "loading"
          ? "Grokに聞いています…（30秒ほど）"
          : state.status === "done"
            ? `Xの声：${TONES[d.voice.tone]}${state.open ? " ▲" : " ▼"}`
            : "Xの声を見る"}
      </button>
      {state.status === "error" && <div className="xvoice-err">{state.message}</div>}
      {state.status === "done" && state.open && (
        <div className="xvoice-body">
          <div className="xvoice-count">
            強気 <b>{d.voice.bull ?? "?"}</b>人・弱気 <b>{d.voice.bear ?? "?"}</b>人
            <span className="xvoice-when">
              （{d.voice.from}以降／{new Date(d.at).toLocaleDateString("ja-JP")}に取得）
            </span>
          </div>
          {d.voice.summary && <p className="xvoice-summary">{d.voice.summary}</p>}
          <ul className="xvoice-points">
            {d.voice.points.map((p) => (
              <li key={p.url}>
                <span className={`xstance ${p.stance === "bull" ? "buy" : p.stance === "bear" ? "sell" : ""}`}>
                  {STANCE[p.stance]}
                </span>{" "}
                {p.text}{" "}
                <a href={p.url} target="_blank" rel="noreferrer">投稿</a>
              </li>
            ))}
          </ul>
          <button className="xvoice-copy" onClick={copy}>{copied ? "コピーしました" : "結果をコピー（Claudeで裏取り用）"}</button>
          <p className="picks-note">Grok（AI）の判定です。人数はおおよそで、要約が誤っていることもあります。元の投稿を確認してください。</p>
        </div>
      )}
    </div>
  );
}
