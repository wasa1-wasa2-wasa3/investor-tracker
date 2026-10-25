import { matchInvestor } from "./watchlist";
import { MOCK_DOCS } from "./mock";
import fallbackCodes from "../data/codes.json";
import { getCodes } from "./codes";
import history from "../data/history.json";
import yutai from "../data/yutai.json";

// これより長い期間は、GitHub Actionsが貯めた履歴(data/history.json)から出す
export const LIVE_MAX_DAYS = 14;
const LIVE_DAYS_WITH_HISTORY = 3; // 履歴の更新前の当日分などは直接取りに行く

const BASE = process.env.EDINET_BASE || "https://api.edinet-fsa.go.jp/api/v2";
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
  // キャッシュしない：メンテナンス中のHTMLページがキャッシュに残ると、復旧後もエラーが出続けるため
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`EDINET ${date}: HTTP ${res.status}`);
  const text = await res.text();
  if (!text.trim().startsWith("{")) {
    // EDINETはメンテナンス中などにJSONではなくHTMLのページを返すことがある
    const title = text.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
    throw new Error(`EDINET ${date}: JSONではなくHTMLが返りました${title ? `（${title}）` : ""}`);
  }
  const json = JSON.parse(text);
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

const TOB_TYPES = new Set(["240", "270"]);

function toFiling(doc, investor, codes, tob) {
  // 大量保有報告書では subjectEdinetCode / issuerEdinetCode に「対象の発行会社」が入る
  const targetCode = doc.subjectEdinetCode || doc.issuerEdinetCode;
  const target = codes[targetCode];
  return {
    docId: doc.docID,
    submittedAt: doc.submitDateTime,
    investorId: investor?.id ?? null,
    investor: investor?.label ?? null,
    style: investor?.style ?? null,
    horizon: investor?.horizon ?? null,
    filerName: doc.filerName,
    docType: kindOf(doc.docDescription),
    description: doc.docDescription,
    targetEdinetCode: targetCode,
    targetName: target?.name ?? null,
    industry: target?.industry ?? null,
    secCode: target?.secCode ?? null,
    yutai: yutai.items[targetCode] ? { status: yutai.items[targetCode].status, text: yutai.items[targetCode].text } : null,
    withdrawn: doc.withdrawalStatus === "1",
    tob: tob?.[targetCode] ?? null,
  };
}

// 指定日数ぶんの大量保有報告書を取得。all=true ならウォッチ対象外も返す（直近14日以内のみ）
export async function getLargeHoldingFilings({ days = 7, all = false } = {}) {
  const useHistory = !isMock() && days > LIVE_MAX_DAYS;
  const dates = isMock() ? ["mock"] : recentDates(useHistory ? LIVE_DAYS_WITH_HISTORY : days);
  const codes = isMock() ? fallbackCodes : await getCodes();
  const errors = [];
  const byId = new Map();
  const raw = [];
  const tob = { ...(history.tob || {}) };
  const failedDates = [];
  for (const date of dates) {
    try {
      const docs = await fetchDocList(date);
      for (const doc of docs) {
        if (TOB_TYPES.has(doc.docTypeCode) && doc.subjectEdinetCode && doc.withdrawalStatus !== "1") {
          const prev = tob[doc.subjectEdinetCode];
          if (!prev || doc.submitDateTime > prev.at) tob[doc.subjectEdinetCode] = { at: doc.submitDateTime, filerName: doc.filerName };
        }
        if (!LARGE_HOLDING_TYPES.has(doc.docTypeCode)) continue;
        const inv = matchInvestor(doc.filerName || "");
        if (!inv && !(all && !useHistory)) continue;
        raw.push([doc, inv]);
      }
    } catch (e) {
      const msg = String(e.message || e);
      // 日付が変わった直後は、今日の一覧がまだEDINETに無い（Not Found）。エラー扱いしない
      if (date === dates[0] && /Not Found|HTTP 404/i.test(msg)) continue;
      errors.push(msg);
      failedDates.push(date);
    }
  }
  for (const [doc, inv] of raw) byId.set(doc.docID, toFiling(doc, inv, codes, tob));
  // EDINETから取れなかった日は、GitHub Actionsが貯めた履歴（ウォッチ対象のみ）で代用する
  if (!isMock() && failedDates.length) {
    const failed = new Set(failedDates);
    for (const doc of history.items) {
      if (!failed.has(doc.submitDateTime.slice(0, 10)) || byId.has(doc.docID)) continue;
      const inv = matchInvestor(doc.filerName || "");
      if (inv) byId.set(doc.docID, toFiling(doc, inv, codes, tob));
    }
  }
  if (useHistory) {
    const cutoff = recentDates(days).at(-1);
    for (const doc of history.items) {
      if (doc.submitDateTime.slice(0, 10) < cutoff) break; // 新しい順に並んでいる
      if (byId.has(doc.docID)) continue;
      const inv = matchInvestor(doc.filerName || "");
      if (inv) byId.set(doc.docID, toFiling(doc, inv, codes, tob));
    }
  }
  const results = [...byId.values()].sort((a, b) => (a.submittedAt < b.submittedAt ? 1 : -1));
  return {
    mock: isMock(),
    errors: summarizeErrors(errors),
    fallbackDates: failedDates,
    usedHistory: useHistory,
    history: { updatedAt: history.updatedAt, oldest: history.oldest, count: history.items.length },
    filings: results,
  };
}

// 同じ内容のエラーが日付ぶん並ぶと読めないので、日付を外してまとめる
function summarizeErrors(errors) {
  const groups = new Map();
  for (const e of errors) {
    const m = e.match(/^EDINET (\d{4}-\d{2}-\d{2}): (.*)$/);
    const key = m ? m[2] : e;
    if (!groups.has(key)) groups.set(key, []);
    if (m) groups.get(key).push(m[1].slice(5));
  }
  return [...groups].map(([msg, ds]) => (ds.length ? `${msg}（${ds.length}日分: ${ds.join(", ")}）` : msg));
}

export async function fetchPdf(docId) {
  const url = `${BASE}/documents/${docId}?type=2&Subscription-Key=${process.env.EDINET_API_KEY}`;
  return fetch(url);
}
