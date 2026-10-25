"use client";
import { useEffect, useState } from "react";
import HoldInfo from "../HoldInfo";

// 合言葉で入る「マイ銘柄」。トップページからはリンクしない
const yen = (v) => (v == null ? "—" : `${v.toLocaleString()}円`);
const signed = (v, unit = "") => (v == null ? "—" : `${v > 0 ? "+" : ""}${v.toLocaleString()}${unit}`);
const DIR = { new: "新規で買い", up: "買い増し", down: "売り（減少）", flat: "変化なし" };

export default function My() {
  const [state, setState] = useState("loading"); // loading | login | ready | not_configured | error
  const [data, setData] = useState(null);
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setState("loading");
    try {
      const res = await fetch("/api/my", { cache: "no-store" });
      if (res.status === 401) return setState("login");
      if (res.status === 503) return setState("not_configured");
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || `HTTP ${res.status}`);
      setData(j);
      setState("ready");
    } catch (e) {
      setMsg(String(e.message || e));
      setState("error");
    }
  }
  useEffect(() => { load(); }, []);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/my/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) return setMsg(j.error || "ログインできませんでした");
      setPassword("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch("/api/my/login", { method: "DELETE" });
    setData(null);
    setState("login");
  }

  return (
    <main className="my">
      <h1>マイ銘柄</h1>
      <p className="sub">保有銘柄と、そこに入っている大物の動き（直近半年）。この画面は合言葉を知っている人だけが開けます。</p>

      {state === "loading" && <p className="empty">読み込み中…</p>}

      {state === "not_configured" && (
        <p className="banner">合言葉がまだ設定されていません。Vercelの環境変数に MY_PASSWORD と MY_HOLDINGS を入れてください。</p>
      )}

      {state === "login" && (
        <form className="my-login" onSubmit={login}>
          <label htmlFor="my-password">合言葉</label>
          <input
            id="my-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={busy}>{busy ? "確認中…" : "開く"}</button>
          {msg && <p className="my-error">{msg}</p>}
        </form>
      )}

      {state === "error" && (
        <p className="banner">読み込めませんでした：{msg} <button type="button" onClick={load}>もう一度</button></p>
      )}

      {state === "ready" && data && <Ready data={data} onLogout={logout} />}
    </main>
  );
}

function Ready({ data, onLogout }) {
  const { stocks, alerts, alertDays, quoteError } = data;
  const total = stocks.reduce((s, x) => s + (x.pl ?? 0), 0);
  const value = stocks.reduce((s, x) => s + (x.quote?.price != null && x.shares ? x.quote.price * x.shares : 0), 0);
  const sells = alerts.filter((a) => a.kind === "sell");

  return (
    <>
      <div className="my-summary">
        <div><span className="k">評価額</span><b>{yen(Math.round(value))}</b></div>
        <div><span className="k">含み損益</span><b className={total >= 0 ? "pos" : "neg"}>{signed(total, "円")}</b></div>
        <div><span className="k">銘柄数</span><b>{stocks.length}</b></div>
        <button type="button" className="my-logout" onClick={onLogout}>ログアウト</button>
      </div>
      {quoteError && <p className="banner">{quoteError}</p>}

      <section className="my-alerts">
        <h2>大物の動き（直近{alertDays}日）</h2>
        {alerts.length === 0 ? (
          <p className="picks-empty">保有銘柄に、大物の新しい動きはありません。</p>
        ) : (
          <ul>
            {alerts.map((a) => (
              <li key={a.docId} className={`my-alert ${a.kind}`}>
                <span className="my-alert-kind">{a.kind === "sell" ? "売り" : "買い"}</span>
                <span className="my-alert-body">
                  <b>{a.name || a.secCode}</b>：{a.who}が{DIR[a.dir]}
                  {a.ratio != null && (
                    <span className="my-ratio">
                      {a.prev != null ? `${a.prev.toFixed(2)}% → ` : ""}{a.ratio.toFixed(2)}%
                    </span>
                  )}
                </span>
                <span className="my-date">{a.date}</span>
              </li>
            ))}
          </ul>
        )}
        {sells.length > 0 && (
          <p className="picks-note">大物が売り始めたら「爆発の局面が終わりつつある」サインです。優待や配当など、持ち続ける理由が残っているかで判断してください。</p>
        )}
      </section>

      <section className="list">
        {stocks.map((s) => (
          <article key={s.secCode} className="item my-stock">
            <div className="top">
              <span className="target"><b>{s.name || s.secCode}</b></span>
              <span className="code">{s.secCode}</span>
              {s.industry && <span className="htag">{s.industry}</span>}
            </div>
            <div className="my-pl">
              {s.plPct != null && <span className={s.plPct >= 0 ? "pos" : "neg"}>{signed(s.plPct, "%")}</span>}
            </div>
            <div className="meta my-meta">
              {s.shares != null && <span>{s.shares.toLocaleString()}株</span>}
              {s.cost != null && <span>取得 {s.cost.toLocaleString()}円</span>}
              <span>現在 {s.quote?.price != null ? `${s.quote.price.toLocaleString()}円` : "—"}</span>
              {s.pl != null && <span className={s.pl >= 0 ? "pos" : "neg"}>{signed(s.pl, "円")}</span>}
            </div>
            <HoldInfo quote={s.quote} yutai={s.yutai} />
            <div className="my-investors">
              {s.investors.length === 0 ? (
                <span className="hold-sub">半年以内に大物の報告書なし</span>
              ) : (
                s.investors.map((v) => (
                  <span key={v.who} className={`my-inv ${v.dir || ""}`}>
                    {v.who} {v.ratio != null ? `${v.ratio.toFixed(2)}%` : ""}
                    {v.dir && ` ${DIR[v.dir]}`}
                    {v.below5 && "（5%割れ）"}
                    <small> {v.date}</small>
                  </span>
                ))
              )}
            </div>
          </article>
        ))}
      </section>
    </>
  );
}
