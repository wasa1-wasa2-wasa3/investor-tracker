// 「イナゴ度」：1銘柄について、Xにもう群衆が来ているか（話題の量・増え方・買い報告・煽り）と、
// 明らかな危険情報（減配・優待廃止・不祥事など）だけをGrok（xAI API の x_search）に調べてもらう。
// 何を買うかは大物（アクティビスト・長期投資家）が決める。Xは「いつ買うか」の温度計として使う。
// 画面のボタンを押したときだけ呼ぶ（app/api/xvoice）。
//
// 必要な環境変数: XAI_API_KEY（console.x.ai で発行）
// 任意: XAI_MODEL（既定 grok-4.7）

export const XVOICE_DAYS = 14; // 直近7日と、その前の7日を比べる

export const LEVELS = {
  quiet: { icon: "🌱", label: "静か", note: "大物は買ったが、まだ群衆は来ていない" },
  gathering: { icon: "🦗", label: "集まり始め", note: "話題が増えてきた" },
  swarming: { icon: "🦗🦗", label: "群がっている", note: "煽りが多い・高値づかみ注意" },
};

export const DANGER_KINDS = {
  dividend_cut: "減配・無配",
  yutai_cut: "優待の廃止・改悪",
  downgrade: "下方修正・赤字",
  dilution: "増資・売出し",
  scandal: "不祥事・処分",
  big_sell: "大物の売却",
  other: "その他",
};

const ymd = (d) => d.toISOString().slice(0, 10);

function buildPrompt(code, name, from, mid) {
  return `X（旧Twitter）で ${from} 以降に投稿された、日本株「${name || ""}（証券コード ${code}）」についての投稿を調べてください。
目的は銘柄の良し悪しの評価ではなく、(1) 個人投資家の群衆がどのくらい集まっているか（イナゴ度）と、(2) 明らかな危険情報があるか、の2点だけを知ることです。

次のキーを持つJSONオブジェクトだけを出力してください（説明文やコードブロックは不要）:
{"recent":直近7日（${mid}以降）の投稿数のおおよそ,"before":その前の7日の投稿数のおおよそ,"buyReports":直近7日に「買った」「IN」「買い増し」と報告した人数のおおよそ,"hype":直近7日に「爆上げ」「テンバガー」「まだ間に合う」「仕込み時」などの煽りが目立つなら true,"level":"quiet|gathering|swarming","summary":"Xでの話題のされ方を日本語60字以内で","dangers":[{"kind":"dividend_cut|yutai_cut|downgrade|dilution|scandal|big_sell|other","text":"何が起きたかを日本語50字以内で","fact":開示や報道で確認できる事実なら true、噂・個人の推測なら false,"url":"根拠の投稿または記事のURL"}]}

- スパム・宣伝・自動投稿・株価を読み上げるだけのbotは数えない
- level: 個人の投稿がほとんどない=quiet、話題が増えている・買い報告が出始めた=gathering、投稿が多く煽りや買い報告が目立つ=swarming
- dangers は、減配・無配、優待の廃止や改悪、下方修正・赤字転落、公募増資や売出し、不祥事・行政処分・監査法人の辞任、大株主や著名投資家の売却報告 だけ。株価が下がった・弱気な意見 は入れない。なければ []
- 実在する投稿・記事だけを挙げ、推測で投稿やURLを作らないこと`;
}

async function callGrok(prompt, from, to) {
  const body = {
    model: process.env.XAI_MODEL || "grok-4.7",
    input: [{ role: "user", content: prompt }],
    tools: [{ type: "x_search", from_date: from, to_date: to }, { type: "web_search" }],
  };
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch("https://api.x.ai/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.XAI_API_KEY}` },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    if (res.ok) return res.json();
    const text = await res.text();
    if (attempt === 2 || (res.status < 500 && res.status !== 429)) throw new Error(`Grok HTTP ${res.status}: ${text.slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 3000));
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

const count = (v) => (Number.isFinite(Number(v)) ? Math.max(0, Math.round(Number(v))) : null);

// Grokの返答を検証して、表示してよい形にそろえる。URLが http(s) でない危険情報は捨てる
export function cleanVoice(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const dangers = (Array.isArray(o.dangers) ? o.dangers : [])
    .filter((d) => typeof d?.url === "string" && /^https:\/\/[^\s]+$/.test(d.url) && d.text)
    .slice(0, 4)
    .map((d) => ({
      kind: DANGER_KINDS[d.kind] ? d.kind : "other",
      text: String(d.text).slice(0, 80),
      fact: d.fact === true,
      url: d.url,
    }));
  return {
    level: LEVELS[o.level] ? o.level : "quiet",
    recent: count(o.recent),
    before: count(o.before),
    buyReports: count(o.buyReports),
    hype: o.hype === true,
    summary: String(o.summary || "").slice(0, 100),
    dangers,
  };
}

export async function fetchXVoice(code, name) {
  const from = ymd(new Date(Date.now() - XVOICE_DAYS * 86400 * 1000));
  const mid = ymd(new Date(Date.now() - 7 * 86400 * 1000));
  const to = ymd(new Date(Date.now() + 86400 * 1000)); // to_date はその日を含まないので明日まで
  const j = await callGrok(buildPrompt(code, name, from, mid), from, to);
  const voice = cleanVoice(outputText(j));
  if (!voice) throw new Error("Grokの返答を読み取れませんでした");
  return { ...voice, from };
}
