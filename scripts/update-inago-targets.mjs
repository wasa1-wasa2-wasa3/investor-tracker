// Grok Bot が日曜14時に読む「イナゴ度を調べる銘柄リスト」（費用を抑えるため20選の上位10銘柄）を data/inago-targets.json に書き出す。
// 20選の計算はアプリ（/api/picks）と同じものを使いたいので、公開中のアプリから取ってくる。
// .github/workflows/history.yml から平日夜に実行する。
import fs from "node:fs";

const APP_URL = process.env.APP_URL || "https://investor-tracker-drab.vercel.app";
const LIMIT = 10;
const file = new URL("../data/inago-targets.json", import.meta.url);

const res = await fetch(`${APP_URL}/api/picks`, { cache: "no-store" });
if (!res.ok) throw new Error(`/api/picks HTTP ${res.status}`);
const data = await res.json();
if (data.error || !data.picks?.length) {
  console.log(`20選を取れなかったので前回のリストのままにします（${data.error || "0件"}）`);
  process.exit(0);
}
const targets = data.picks.slice(0, LIMIT).map((p) => ({ secCode: p.secCode, name: p.name, total: p.total }));
fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), targets }, null, 1) + "\n");
console.log(`イナゴ度の調査対象 ${targets.length} 銘柄を書き出しました`);
