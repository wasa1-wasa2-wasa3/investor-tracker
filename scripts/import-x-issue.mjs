// Grok Bot が GitHub の Issue に投稿した「X投稿のまとめ」（JSON）を data/x-posts.json に取り込む。
// .github/workflows/x-import.yml から、Issue が作られた／編集されたときに実行される。
//
// Issue の本文に、次の形の JSON 配列を入れてもらう（```json で囲んでもよい）:
// [{"handle":"kabu_st0ck","postedAt":"2026-10-22","url":"https://x.com/kabu_st0ck/status/...","secCode":"6146",
//   "name":"ディスコ","stance":"buy|sell|hold|mention","summary":"40字以内"}]
//
// 本文はデータとしてだけ扱い、実行はしない。監視対象のアカウント・正しいURLの投稿だけを残す。
import fs from "node:fs";

const KEEP_DAYS = 90;
const file = (name) => new URL(`../data/${name}`, import.meta.url);
const readJson = (path, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
};
const ymd = (d) => d.toISOString().slice(0, 10);
const out = (msg) => fs.appendFileSync(process.env.GITHUB_OUTPUT || "/dev/null", msg + "\n");

const event = readJson(process.env.GITHUB_EVENT_PATH, {});
const body = String(event.issue?.body || "");
const accounts = readJson(file("x-accounts.json"), []);
const store = readJson(file("x-posts.json"), { updatedAt: null, posts: [] });
const labelOf = Object.fromEntries(accounts.map((a) => [a.handle.toLowerCase(), a.label]));

// 本文から JSON 配列を取り出す（コードブロック優先）
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
  const url = typeof p.url === "string" && /^https:\/\/(x|twitter)\.com\/[A-Za-z0-9_]+\/status\/\d+/.test(p.url) ? p.url.split("?")[0] : null;
  const fromUrl = url?.match(/\.com\/([^/]+)\/status\//)?.[1];
  let handle = String(p.handle || "").replace(/^@/, "");
  if (!labelOf[handle.toLowerCase()] && fromUrl) handle = fromUrl;
  if (!url || !labelOf[handle.toLowerCase()]) return null;
  return {
    handle,
    label: labelOf[handle.toLowerCase()],
    postedAt: /^\d{4}-\d{2}-\d{2}$/.test(p.postedAt) ? p.postedAt : null,
    url,
    secCode: typeof p.secCode === "string" && /^[0-9][0-9A-Z]{3}$/.test(p.secCode) ? p.secCode : null,
    name: String(p.name || "").slice(0, 40),
    stance: ["buy", "sell", "hold", "mention"].includes(p.stance) ? p.stance : "mention",
    summary: String(p.summary || "").slice(0, 80),
    source: "grok-bot",
  };
}

const arr = extract(body);
if (!arr) {
  out("result=本文にJSON配列が見つかりませんでした。形式を確認してください。");
  out("changed=false");
  process.exit(0);
}
const found = arr.map(clean).filter(Boolean);

const keyOf = (p) => `${p.url}|${p.secCode || p.name}`;
const map = new Map(store.posts.map((p) => [keyOf(p), p]));
let added = 0;
for (const p of found) {
  if (!map.has(keyOf(p))) added++;
  map.set(keyOf(p), { ...map.get(keyOf(p)), ...p });
}
const cutoff = ymd(new Date(Date.now() - KEEP_DAYS * 86400 * 1000));
const posts = [...map.values()]
  .filter((p) => !p.postedAt || p.postedAt >= cutoff)
  .sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));

fs.writeFileSync(file("x-posts.json"), JSON.stringify({ updatedAt: new Date().toISOString(), posts }, null, 1) + "\n");
const skipped = arr.length - found.length;
console.log(`受け取り ${arr.length} 件 / 取り込み ${found.length} 件（新規 ${added}）/ 除外 ${skipped} 件 / 合計 ${posts.length} 件`);
out(`result=受け取り ${arr.length} 件のうち ${found.length} 件を取り込みました（新規 ${added} 件、監視対象外やURL不正で除外 ${skipped} 件）。合計 ${posts.length} 件。`);
out(`changed=${added > 0 || found.length > 0}`);
