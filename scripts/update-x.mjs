// 大物のX（旧Twitter）投稿から、日本株の銘柄への言及を拾って data/x-posts.json に貯める。
// xAI（Grok）APIの x_search ツールを使う。GitHub Actions から1日1回実行する。
//
//   - 監視するアカウントは data/x-accounts.json（@なしのハンドル名）。1回に20件まで
//   - 初回は14日分、以降は直近3日分を見て、投稿URLで重複を除いて足していく
//   - 90日より古い投稿は消す
//
// 必要な環境変数: XAI_API_KEY（console.x.ai で発行）
// 任意: XAI_MODEL（既定 grok-4.7）, X_DAYS（さかのぼる日数）
import fs from "node:fs";

const KEY = process.env.XAI_API_KEY;
const MODEL = process.env.XAI_MODEL || "grok-4.7";
const KEEP_DAYS = 90;
const file = (name) => new URL(`../data/${name}`, import.meta.url);

if (!KEY) {
  console.error("XAI_API_KEY が設定されていません");
  process.exit(1);
}

const readJson = (name, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(file(name), "utf8"));
  } catch {
    return fallback;
  }
};
const ymd = (d) => d.toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 86400 * 1000);

const accounts = readJson("x-accounts.json", []);
const store = readJson("x-posts.json", { updatedAt: null, posts: [] });
const days = Number(process.env.X_DAYS) || (store.posts.length ? 3 : 14);
const from = ymd(daysAgo(days));
const to = ymd(daysAgo(-1)); // to_date はその日を含まないので明日まで
const labelOf = Object.fromEntries(accounts.map((a) => [a.handle.toLowerCase(), a.label]));

const PROMPT = `次のXアカウントの ${from} 以降の投稿を調べ、日本の上場株（個別銘柄）に触れている投稿をすべて挙げてください。
対象: ${accounts.map((a) => "@" + a.handle).join(", ")}

各投稿について、次のキーを持つJSON配列だけを出力してください（説明文やコードブロックは不要）:
[{"handle":"@なしのハンドル","postedAt":"YYYY-MM-DD","url":"投稿のURL","secCode":"4桁の証券コード（分からなければnull）","name":"銘柄名","stance":"buy|sell|hold|mention","summary":"何を言っているかを日本語40字以内で"}]
- stance は 買った・買い増し=buy、売った・利確・損切り=sell、保有継続=hold、それ以外=mention
- 推測で投稿を作らないこと。該当がなければ [] を出力`;

async function callGrok(handles) {
  const body = {
    model: MODEL,
    input: [{ role: "user", content: PROMPT }],
    tools: [{ type: "x_search", allowed_x_handles: handles, from_date: from, to_date: to }],
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
      body: JSON.stringify(body),
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (attempt === 3 || (res.status < 500 && res.status !== 429)) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
    await new Promise((r) => setTimeout(r, 3000 * attempt));
  }
}

// Responses API の出力から本文テキストを取り出す
function outputText(j) {
  if (typeof j.output_text === "string") return j.output_text;
  return (j.output || [])
    .filter((o) => o.type === "message")
    .flatMap((o) => o.content || [])
    .map((c) => c.text || "")
    .join("\n");
}

function parsePosts(text) {
  const m = text.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[0]);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

const clean = (p, batch) => {
  // ハンドルが抜けていたり表記ゆれがあるときは、URLから補う。1人だけ見ているならその人
  const fromUrl = String(p.url || "").match(/^https:\/\/(?:x|twitter)\.com\/([^/]+)\/status\//)?.[1];
  let handle = String(p.handle || "").replace(/^@/, "");
  if (!labelOf[handle.toLowerCase()]) handle = fromUrl && fromUrl !== "i" ? fromUrl : batch.length === 1 ? batch[0] : handle;
  const url = typeof p.url === "string" && /^https:\/\/(x|twitter)\.com\//.test(p.url) ? p.url : null;
  if (!handle || !url || !labelOf[handle.toLowerCase()]) return null; // 監視対象以外・URLなしは捨てる
  const code = typeof p.secCode === "string" && /^[0-9][0-9A-Z]{3}$/.test(p.secCode) ? p.secCode : null;
  return {
    handle,
    label: labelOf[handle.toLowerCase()],
    postedAt: /^\d{4}-\d{2}-\d{2}$/.test(p.postedAt) ? p.postedAt : null,
    url,
    secCode: code,
    name: String(p.name || "").slice(0, 40),
    stance: ["buy", "sell", "hold", "mention"].includes(p.stance) ? p.stance : "mention",
    summary: String(p.summary || "").slice(0, 80),
  };
};

if (!accounts.length) {
  console.log("監視するアカウントがありません（data/x-accounts.json）");
  process.exit(0);
}

console.log(`X投稿: ${accounts.length} アカウント、${from} 以降を確認します`);
const found = [];
const debug = []; // 動作確認用：Grokの返答をそのまま残す（data/x-debug.json）
for (let i = 0; i < accounts.length; i += 20) {
  const handles = accounts.slice(i, i + 20).map((a) => a.handle);
  const j = await callGrok(handles);
  const text = outputText(j);
  const raw = parsePosts(text);
  const posts = raw.map((p) => clean(p, handles)).filter(Boolean);
  const u = j.usage?.server_side_tool_usage_details;
  console.log(`  ${handles.join(",")}: ${posts.length} 件（Grokの返答 ${raw.length} 件）${u ? `（検索${u.x_search_calls ?? "?"}回）` : ""}`);
  debug.push({ handles, model: j.model, status: j.status, usage: j.usage, raw: raw.length, kept: posts.length, text: text.slice(0, 3000), error: j.error });
  found.push(...posts);
}

// 1つの投稿で複数の銘柄に触れることがあるので、投稿URL×銘柄で重複を除く
const keyOf = (p) => `${p.url}|${p.secCode || p.name}`;
const byUrl = new Map(store.posts.map((p) => [keyOf(p), p]));
let added = 0;
for (const p of found) {
  if (!byUrl.has(keyOf(p))) added++;
  byUrl.set(keyOf(p), { ...byUrl.get(keyOf(p)), ...p });
}
const cutoff = ymd(daysAgo(KEEP_DAYS));
const posts = [...byUrl.values()]
  .filter((p) => !p.postedAt || p.postedAt >= cutoff)
  .sort((a, b) => (b.postedAt || "").localeCompare(a.postedAt || ""));

fs.writeFileSync(file("x-posts.json"), JSON.stringify({ updatedAt: new Date().toISOString(), posts }, null, 1) + "\n");
fs.writeFileSync(file("x-debug.json"), JSON.stringify({ at: new Date().toISOString(), from, to, debug }, null, 1) + "\n");
console.log(`新規 ${added} 件、合計 ${posts.length} 件`);
