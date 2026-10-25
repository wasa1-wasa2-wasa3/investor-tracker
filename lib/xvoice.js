// 「Xの声」：1銘柄について、X全体の直近の投稿から強気・弱気の傾向をGrok（xAI API）にまとめてもらう。
// 毎日全銘柄を調べると費用がかさむので、画面のボタンを押したときだけ呼ぶ（app/api/xvoice）。
//
// 必要な環境変数: XAI_API_KEY（console.x.ai で発行）
// 任意: XAI_MODEL（既定 grok-4.7）

export const XVOICE_DAYS = 14; // 何日分の投稿を見るか
export const TONES = { bull: "強気が多い", bear: "弱気が多い", mixed: "意見が割れている", quiet: "話題が少ない" };

const ymd = (d) => d.toISOString().slice(0, 10);

function buildPrompt(code, name, from) {
  return `X（旧Twitter）で ${from} 以降に投稿された、日本株「${name || ""}（証券コード ${code}）」についての投稿を調べ、個人投資家の受け止め方をまとめてください。

次のキーを持つJSONオブジェクトだけを出力してください（説明文やコードブロックは不要）:
{"tone":"bull|bear|mixed|quiet","bull":強気の投稿者のおおよその人数,"bear":弱気の投稿者のおおよその人数,"summary":"全体の傾向を日本語80字以内で","points":[{"stance":"bull|bear|neutral","text":"その投稿が言っていることを日本語50字以内で","url":"投稿のURL","postedAt":"YYYY-MM-DD"}]}

- スパム・宣伝・自動投稿・株価を読み上げるだけのbotは数えない
- 「買った」「売った」などの行動と、その理由が書かれた投稿を優先する。ニュースの見出しだけの投稿は neutral
- points は理由がはっきりした投稿を最大6件。強気と弱気の両方があれば両方入れる
- tone: 強気が明らかに多い=bull、弱気が明らかに多い=bear、拮抗=mixed、意見を述べた投稿が3人未満=quiet
- 実在する投稿だけを挙げ、推測で投稿やURLを作らないこと。該当がなければ points は []`;
}

async function callGrok(prompt, from, to) {
  const body = {
    model: process.env.XAI_MODEL || "grok-4.7",
    input: [{ role: "user", content: prompt }],
    tools: [{ type: "x_search", from_date: from, to_date: to }],
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

// Grokの返答を検証して、表示してよい形にそろえる。x.comの投稿URLでないものは捨てる
export function cleanVoice(text) {
  const m = String(text || "").match(/\{[\s\S]*\}/);
  if (!m) return null;
  let o;
  try {
    o = JSON.parse(m[0]);
  } catch {
    return null;
  }
  const points = (Array.isArray(o.points) ? o.points : [])
    .filter((p) => typeof p?.url === "string" && /^https:\/\/(x|twitter)\.com\/[^/]+\/status\/\d+/.test(p.url))
    .slice(0, 6)
    .map((p) => ({
      stance: ["bull", "bear", "neutral"].includes(p.stance) ? p.stance : "neutral",
      text: String(p.text || "").slice(0, 80),
      url: p.url,
      postedAt: /^\d{4}-\d{2}-\d{2}$/.test(p.postedAt) ? p.postedAt : null,
    }));
  return {
    tone: TONES[o.tone] ? o.tone : "quiet",
    bull: count(o.bull),
    bear: count(o.bear),
    summary: String(o.summary || "").slice(0, 120),
    points,
  };
}

export async function fetchXVoice(code, name) {
  const from = ymd(new Date(Date.now() - XVOICE_DAYS * 86400 * 1000));
  const to = ymd(new Date(Date.now() + 86400 * 1000)); // to_date はその日を含まないので明日まで
  const j = await callGrok(buildPrompt(code, name, from), from, to);
  const voice = cleanVoice(outputText(j));
  if (!voice) throw new Error("Grokの返答を読み取れませんでした");
  return { ...voice, from, searches: j.usage?.server_side_tool_usage_details?.x_search_calls ?? null };
}
