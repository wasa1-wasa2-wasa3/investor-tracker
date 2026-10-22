"use client";
import { X_POSTS, X_UPDATED_AT, STANCE } from "../lib/xposts";

// 大物のX投稿で触れられた銘柄（Grokで毎日収集）。20選の採点には使わず、参考として並べるだけ
export default function XPosts() {
  if (!X_UPDATED_AT) return null;
  return (
    <details className="fixes xposts">
      <summary>
        Xの大物 {X_POSTS.length}件
        <span className="fixes-note">（監視アカウントの投稿から、Grokが銘柄の言及を拾ったもの・直近90日）</span>
      </summary>
      {X_POSTS.length === 0 && <div className="picks-empty">まだ言及はありません</div>}
      <div className="fix-list">
        {X_POSTS.map((p) => (
          <div key={`${p.url}|${p.secCode || p.name}`} className="fix-row xpost">
            <span className="fix-date">{p.postedAt?.slice(5) || "—"}</span>
            <span className="fix-who">{p.label}</span>
            <span className={`xstance ${p.stance}`}>{STANCE[p.stance]}</span>
            <span className="fix-target">
              {p.secCode ? (
                <a href={`https://kabutan.jp/stock/?code=${p.secCode}`} target="_blank" rel="noreferrer">
                  {p.name || p.secCode} {p.secCode}
                </a>
              ) : (
                p.name
              )}
            </span>
            <span className="xsummary">{p.summary}</span>
            <a href={p.url} target="_blank" rel="noreferrer">投稿</a>
          </div>
        ))}
      </div>
      <p className="picks-note">要約はGrok（AI）によるもので、誤りがあり得ます。必ず元の投稿を確認してください。</p>
    </details>
  );
}
