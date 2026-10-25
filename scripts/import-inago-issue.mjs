// Grok Bot が GitHub の Issue に投稿した「イナゴ度」（JSON）を data/inago.json に取り込む。
// .github/workflows/x-import.yml から、タイトルが「[イナゴ度]」で始まる Issue が作られた／編集されたときに実行される。
//
// 本文の JSON 配列（```json で囲んでもよい）:
// [{"secCode":"4043","name":"トクヤマ","recent":12,"before":4,"buyReports":3,"hype":false,
//   "level":"quiet|gathering|swarming","summary":"60字以内",
//   "dangers":[{"kind":"dividend_cut|yutai_cut|downgrade|dilution|scandal|big_sell|other","text":"50字以内","fact":true,"url":"https://..."}]}]
//
// 本文はデータとしてだけ扱い、実行はしない。調査対象リストにある銘柄だけを残す。
import fs from "node:fs";

const file = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = (path, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};
const out = (msg) => fs.appendFileSync(process.env.GITHUB_OUTPUT || "/dev/null", msg + "\n");

const event = readJson(process.env.GITHUB_EVENT_PATH, {});
const issue = event.issue || {};
const body = String(issue.body || "");
const targets = readJson(file("inago-targets.json"), { targets: [] }).targets;
const nameOf = Object.fromEntries(targets.map((t) => [t.secCode, t.name]));

const LEVELS = ["quiet", "gathering", "swarming"];
const KINDS = ["dividend_cut", "yutai_cut", "downgrade", "dilution", "scandal", "big_sell", "other"];
const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);

function extract(text) {
  const block = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const src = block ? block[1] : text;
  const m = src.match(/\[[\s\S]*\]/);
  if (!m) return null;
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : null;
  } catch {
    return null;
  }
}

function clean(p) {
  if (!p || typeof p !== "object") return null;
  const secCode = String(p.secCode || "");
  if (!nameOf[secCode]) return null; // 調査対象以外は捨てる
  const dangers = (Array.isArray(p.dangers) ? p.dangers : [])
    .filter((d) => d && typeof d.url === "string" && /^https:\/\/\S+$/.test(d.url) && d.text)
    .slice(0, 4)
    .map((d) => ({
      kind: KINDS.includes(d.kind) ? d.kind : "other",
      text: String(d.text).slice(0, 80),
      fact: d.fact === true,
      url: d.url,
    }));
  return {
    secCode,
    name: nameOf[secCode],
    level: LEVELS.includes(p.level) ? p.level : "quiet",
    recent: count(p.recent),
    before: count(p.before),
    buyReports: count(p.buyReports),
    hype: p.hype === true,
    summary: String(p.summary || "").slice(0, 100),
    dangers,
  };
}

const arr = extract(body);
if (!arr) {
  out("result=本文にJSON配列が見つかりませんでした。形式を確認してください。");
  out("changed=false");
  process.exit(0);
}
const items = arr.map(clean).filter(Boolean);
if (!items.length) {
  out(`result=受け取り ${arr.length} 件のうち、調査対象の銘柄がありませんでした（data/inago-targets.json を確認）。`);
  out("changed=false");
  process.exit(0);
}
const store = { updatedAt: new Date().toISOString(), issue: issue.number ?? null, issueUrl: issue.html_url ?? null, items };
fs.writeFileSync(file("inago.json"), JSON.stringify(store, null, 1) + "\n");
const missing = targets.filter((t) => !items.some((i) => i.secCode === t.secCode)).map((t) => t.name);
console.log(`イナゴ度 ${items.length} 銘柄を取り込み`);
out(`result=イナゴ度を ${items.length} 銘柄取り込みました（受け取り ${arr.length} 件）。${missing.length ? `結果がなかった銘柄：${missing.join("、")}` : ""}`);
out("changed=true");
