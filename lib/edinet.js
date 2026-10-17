import { matchInvestor } from "./watchlist";
import { MOCK_DOCS } from "./mock";
import fallbackCodes from "../data/codes.json";
import { getCodes } from "./codes";

const BASE = "https://api.edinet-fsa.go.jp/api/v2";
// 350 = 大量保有報告書（新規の大量保有報告書と変更報告書の両方）, 360 = 訂正報告書
// 新規か変更かは docDescription で見分ける
const LARGE_HOLDING_TYPES = new Set(["350", "360"]);

export const isMock = () => !process.env.EDINET_API_KEY || process.env.MOCK === "1";

// JSTの日付文字列 YYYY-MM-DD を過去 n 日ぶん作る（今日を含む）
export function recentDates(days) {
  const out = [];
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  for (let i = 0; i < days; i++) {
    const d = new Date(nowJst.getTime() - i * 86400 * 1000);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

async function fetchDocList(date) {
  if (isMock()) return MOCK_DOCS.filter((d) => d.submitDateTime.startsWith(date) || date === "mock");
  const url = `${BASE}/documents.json?date=${date}&type=2&Subscription-Key=${process.env.EDINET_API_KEY}`;
  const res = await fetch(url, { next: { revalidate: 600 } }); // 10分キャッシュ
  if (!res.ok) throw new Error(`EDINET ${date}: HTTP ${res.status}`);
  const json = await res.json();
  if (json.metadata?.status && json.metadata.status !== "200") {
    throw new Error(`EDINET ${date}: ${json.metadata.message}`);
  }
  return json.results || [];
}

function kindOf(desc = "") {
  if (desc.includes("訂正")) return "訂正";
  if (desc.includes("変更報告書")) return "変更";
  return "新規";
}

function toFiling(doc, investor, codes) {
  // 大量保有報告書では subjectEdinetCode / issuerEdinetCode に「対象の発行会社」が入る
  const targetCode = doc.subjectEdinetCode || doc.issuerEdinetCode;
  const target = codes[targetCode];
  return {
    docId: doc.docID,
    submittedAt: doc.submitDateTime,
    investorId: investor?.id ?? null,
    investor: investor?.label ?? null,
    style: investor?.style ?? null,
    filerName: doc.filerName,
    docType: kindOf(doc.docDescription),
    description: doc.docDescription,
    targetEdinetCode: targetCode,
    targetName: target?.name ?? null,
    secCode: target?.secCode ?? null,
    withdrawn: doc.withdrawalStatus === "1",
  };
}

// 指定日数ぶんの大量保有報告書を取得。all=true ならウォッチ対象外も返す
export async function getLargeHoldingFilings({ days = 7, all = false } = {}) {
  const dates = isMock() ? ["mock"] : recentDates(days);
  const codes = isMock() ? fallbackCodes : await getCodes();
  const errors = [];
  const results = [];
  for (const date of dates) {
    try {
      const docs = await fetchDocList(date);
      for (const doc of docs) {
        if (!LARGE_HOLDING_TYPES.has(doc.docTypeCode)) continue;
        const inv = matchInvestor(doc.filerName || "");
        if (!inv && !all) continue;
        results.push(toFiling(doc, inv, codes));
      }
    } catch (e) {
      errors.push(String(e.message || e));
    }
  }
  results.sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return { mock: isMock(), dates: isMock() ? [] : dates, errors, filings: results };
}

export async function fetchPdf(docId) {
  const url = `${BASE}/documents/${docId}?type=2&Subscription-Key=${process.env.EDINET_API_KEY}`;
  return fetch(url);
}
