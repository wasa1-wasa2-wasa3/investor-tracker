// 大量保有報告書・変更報告書の XBRL→CSV(type=5) から「株券等保有割合」を取り出す。
// Next のサーバーと scripts/update-holdings.mjs の両方から使うので .mjs にしている。
import { unzipSync } from "fflate";

const decodeCsv = (bytes) => {
  const le = bytes[0] === 0xff && bytes[1] === 0xfe;
  return new TextDecoder(le ? "utf-16le" : "utf-8").decode(bytes).replace(/^﻿/, "");
};

// 列: 要素ID / 項目名 / コンテキストID / 相対年度 / 連結・個別 / 期間・時点 / ユニットID / 単位 / 値
function parseCsvRows(text) {
  const rows = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const c = line.split("\t").map((s) => s.replace(/^"|"$/g, ""));
    if (c.length < 9) continue;
    rows.push({ id: c[0], name: c[1], context: c[2], value: c.slice(8).join("\t") });
  }
  return rows;
}

// "0.0821" / "8.21" / "8.21%" → 8.21（%表記に揃える）
function toPct(v) {
  const n = parseFloat(String(v).replace(/[%％,\s]/g, ""));
  if (!Number.isFinite(n) || n < 0) return null;
  const pct = n <= 1 ? n * 100 : n;
  return pct > 100 ? null : Math.round(pct * 100) / 100;
}

// 共同保有者がいると、提出者ごとの割合と「合計」が両方入る。
// 合計のコンテキストがあればそれを使い、無ければ一番大きい値（＝合計以上にはならない）を使う。
function pick(rows) {
  const vals = rows.map((r) => ({ ...r, pct: toPct(r.value) })).filter((r) => r.pct != null);
  if (!vals.length) return null;
  const total = vals.filter((r) => /total|合計|総計/i.test(r.context + r.name));
  const pool = total.length ? total : vals;
  return Math.max(...pool.map((r) => r.pct));
}

export function holdingFromRows(rows) {
  const isLast = (r) => /PerLastReport|LastReport|直前/i.test(r.id + r.name);
  const isRatio = (r) => /HoldingRatioOfShareCertificatesEtc/i.test(r.id) || /株券等保有割合/.test(r.name);
  const ratioRows = rows.filter(isRatio);
  const ratio = pick(ratioRows.filter((r) => !isLast(r)));
  const prev = pick(ratioRows.filter(isLast));
  if (ratio == null && prev == null) return null;
  return { ratio, prev };
}

export function holdingFromZip(buf) {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("CSVのzipが返ってきませんでした");
  const rows = [];
  for (const [name, bytes] of Object.entries(unzipSync(buf))) {
    if (name.toLowerCase().endsWith(".csv")) rows.push(...parseCsvRows(decodeCsv(bytes)));
  }
  return holdingFromRows(rows);
}
