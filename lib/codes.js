import { unzipSync } from "fflate";
import fallback from "../data/codes.json";

// EDINETコードリスト（全提出者のEDINETコード・社名・証券コード）
const CODELIST_URL = process.env.CODELIST_URL || "https://disclosure2dl.edinet-fsa.go.jp/searchdocument/codelist/Edinetcode.zip";
const TTL = 24 * 3600 * 1000;

let cache = { at: 0, map: null, error: null };

// CSVは Shift_JIS、1行目は注記、2行目がヘッダー。
// 列: 0 EDINETコード / 2 上場区分 / 6 提出者名 / 10 提出者業種（東証33業種） / 11 証券コード(5桁)
function parse(csvText) {
  const map = {};
  for (const line of csvText.split(/\r?\n/).slice(2)) {
    if (!line) continue;
    const c = line.split('","').map((s) => s.replace(/^"|"$/g, ""));
    if (!c[0]) continue;
    map[c[0]] = { name: c[6], secCode: c[11] ? c[11].slice(0, 4) : null, listed: c[2] === "上場", industry: c[10] || null };
  }
  return map;
}

export async function getCodes() {
  if (cache.map && Date.now() - cache.at < TTL) return cache.map;
  try {
    const res = await fetch(CODELIST_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
    const csvName = Object.keys(files).find((n) => n.toLowerCase().endsWith(".csv"));
    if (!csvName) throw new Error("zipの中にCSVがありません");
    const text = new TextDecoder("shift_jis").decode(files[csvName]);
    cache = { at: Date.now(), map: parse(text), error: null };
  } catch (e) {
    // 取れなかったら同梱の辞書で代用し、1時間後に再挑戦
    cache = { at: Date.now() - TTL + 3600 * 1000, map: cache.map || fallback, error: String(e.message || e) };
  }
  return cache.map;
}

export function codesStatus() {
  return {
    loadedAt: cache.at ? new Date(cache.at).toISOString() : null,
    count: cache.map ? Object.keys(cache.map).length : 0,
    error: cache.error,
  };
}
