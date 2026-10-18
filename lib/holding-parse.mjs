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

const clean = (s = "") =>
  s.replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/&amp;/g, "&").replace(/[\s　]+/g, " ").trim();

// 保有目的の文から分類する。「重要提案行為等を行う予定はない」のような否定に注意
export function classifyPurpose(text) {
  const t = clean(text || "");
  if (!t) return null;
  const proposal = /重要提案行為/.test(t) && !/重要提案行為[^。]*?(行わない|行う予定は(な|あ)|行うことは(な|あ)|予定はない|予定はありません|ありません)/.test(t);
  let tag = "その他";
  if (/経営(に)?参加|支配/.test(t)) tag = "経営参加";
  else if (proposal) tag = "提案あり";
  else if (/純投資/.test(t)) tag = "純投資";
  else if (/政策投資|業務提携|資本提携|取引関係/.test(t)) tag = "政策";
  else if (/担保|貸株|借株|トレーディング|ブローカー/.test(t)) tag = "業務上";
  return { tag, text: t.slice(0, 200) };
}

export function holdingFromRows(rows) {
  const isLast = (r) => /PerLastReport|LastReport|直前/i.test(r.id + r.name);
  const isRatio = (r) => /HoldingRatioOfShareCertificatesEtc/i.test(r.id) || /株券等保有割合/.test(r.name);
  const ratioRows = rows.filter(isRatio);
  const ratio = pick(ratioRows.filter((r) => !isLast(r)));
  const prev = pick(ratioRows.filter(isLast));
  // 保有目的は提出者・共同保有者ごとに入る。最初の提出者のもの（＝並びで最初）を使う
  const purposeRow = rows.find((r) => /PurposeOfHolding/i.test(r.id) || r.name === "保有目的");
  const purpose = classifyPurpose(purposeRow?.value);
  if (ratio == null && prev == null && !purpose) return null;
  return { ratio, prev, purpose };
}

export function holdingFromZip(buf) {
  if (buf[0] !== 0x50 || buf[1] !== 0x4b) throw new Error("CSVのzipが返ってきませんでした");
  const rows = [];
  for (const [name, bytes] of Object.entries(unzipSync(buf))) {
    if (name.toLowerCase().endsWith(".csv")) rows.push(...parseCsvRows(decodeCsv(bytes)));
  }
  return holdingFromRows(rows);
}
