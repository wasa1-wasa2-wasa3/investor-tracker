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
  const { stocks, alerts, alertDays, quoteError, risk } = data;
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

      <RiskPanel stocks={stocks} risk={risk} />

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
            <div className="my-risk-row">
              {s.weightPct != null && (
                <span className={`my-weight ${s.overLimit ? "over" : ""}`}>
                  資産の{s.weightPct}%{s.overLimit && `（上限${risk.maxPct}%超え${s.limitShares ? `・${s.limitShares.toLocaleString()}株まで` : s.limitShares === 0 ? "・1単元でも超える" : ""}）`}
                </span>
              )}
              {s.stop ? (
                <span className={`my-stop ${s.stop.status || ""}`}>
                  撤退 {s.stop.price.toLocaleString()}円{s.stop.basis !== "price" ? `（取得${s.stop.basis}）` : ""}
                  {s.stop.status === "broken" ? "・割れています" : s.stop.distancePct != null ? `・あと${s.stop.distancePct}%` : ""}
                  {s.stop.lossAtStop != null && <small>（撤退時 {signed(s.stop.lossAtStop, "円")}）</small>}
                </span>
              ) : (
                <span className="my-stop none">撤退ライン未設定</span>
              )}
            </div>
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

// 資金管理：撤退ラインを割った・近い銘柄と、上限を超えている銘柄
function RiskPanel({ stocks, risk }) {
  const broken = stocks.filter((s) => s.stop?.status === "broken");
  const near = stocks.filter((s) => s.stop?.status === "near");
  const over = stocks.filter((s) => s.overLimit);
  const noStop = stocks.filter((s) => !s.stop).length;
  const ok = !broken.length && !near.length && !over.length;
  return (
    <section className={`my-risk ${ok ? "" : "warn"}`}>
      <h2>資金管理</h2>
      <p className="my-risk-rule">
        1銘柄は資産の<b>{risk.maxPct}%</b>まで（<b>{yen(risk.maxValue)}</b>）
        <small>
          資産総額 {yen(risk.total)}
          {risk.totalSource === "holdings" && "（MY_TOTAL未設定のため、ここに載っている銘柄の評価額で計算）"}
        </small>
      </p>
      {ok && <p className="picks-empty">撤退ラインを割った銘柄も、上限を超えた銘柄もありません。</p>}
      <ul className="my-risk-list">
        {broken.map((s) => (
          <li key={`b${s.secCode}`} className="broken">
            <span className="tag">撤退ライン割れ</span>
            <b>{s.name || s.secCode}</b> 現在 {s.quote.price.toLocaleString()}円 ／ 撤退 {s.stop.price.toLocaleString()}円。買う前に決めたルールどおりなら売りどきです
          </li>
        ))}
        {near.map((s) => (
          <li key={`n${s.secCode}`} className="near">
            <span className="tag">撤退ライン接近</span>
            <b>{s.name || s.secCode}</b> あと{s.stop.distancePct}%で撤退 {s.stop.price.toLocaleString()}円
          </li>
        ))}
        {over.map((s) => (
          <li key={`o${s.secCode}`} className="over">
            <span className="tag">上限超え</span>
            <b>{s.name || s.secCode}</b> 資産の{s.weightPct}%（{yen(Math.round(s.value))}）
            {s.limitShares ? `。上限内にするなら${s.limitShares.toLocaleString()}株まで` : s.limitShares === 0 ? "。1単元でも上限を超える金額です" : ""}
          </li>
        ))}
      </ul>
      {noStop > 0 && <p className="picks-note">撤退ラインが未設定の銘柄が{noStop}つあります。MY_HOLDINGSに撤退価格を書くか、MY_STOP_PCTで一律に設定できます。</p>}
      <SizeCalc risk={risk} stocks={stocks} />
    </section>
  );
}

// これから買う銘柄の上限株数
function SizeCalc({ risk, stocks }) {
  const [code, setCode] = useState("");
  const [res, setRes] = useState(null);
  const [err, setErr] = useState("");
  async function calc(e) {
    e.preventDefault();
    setErr("");
    setRes(null);
    const c = code.trim().toUpperCase();
    if (!/^[0-9][0-9A-Z]{3}$/.test(c)) return setErr("証券コードを4けたで入れてください（例：8585）");
    try {
      const j = await (await fetch(`/api/quotes?codes=${c}`)).json();
      const q = j.quotes?.[c];
      if (!q?.price) return setErr("株価を取得できませんでした");
      const held = stocks.find((s) => s.secCode === c);
      const room = Math.max(0, (risk.maxValue ?? 0) - (held?.value ?? 0));
      const units = Math.floor(room / (q.price * 100));
      setRes({ code: c, price: q.price, held, room, units, stop: risk.stopPct != null ? Math.round(q.price * (1 - risk.stopPct / 100)) : null });
    } catch {
      setErr("株価を取得できませんでした");
    }
  }
  return (
    <form className="my-calc" onSubmit={calc}>
      <label htmlFor="my-calc-code">これから買う銘柄の上限</label>
      <input id="my-calc-code" inputMode="text" placeholder="証券コード" value={code} onChange={(e) => setCode(e.target.value)} />
      <button type="submit">計算</button>
      {err && <p className="my-error">{err}</p>}
      {res && (
        <p className="my-calc-out">
          {res.code} 株価 {res.price.toLocaleString()}円 → 1単元 {yen(Math.round(res.price * 100))}。
          {res.held && `すでに${yen(Math.round(res.held.value ?? 0))}持っているので、`}
          あと{yen(Math.round(res.room))}まで＝<b>{res.units > 0 ? `${(res.units * 100).toLocaleString()}株（${res.units}単元）まで` : "1単元も買えません（上限超え）"}</b>
          {res.stop != null && res.units > 0 && `。今の株価で買うなら撤退ラインは${res.stop.toLocaleString()}円（-${risk.stopPct}%）`}
        </p>
      )}
    </form>
  );
}
