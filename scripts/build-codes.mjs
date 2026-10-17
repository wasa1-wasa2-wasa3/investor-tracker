// EDINETコードリスト(CSV)から「EDINETコード → 社名・証券コード」の辞書を作る。
// 1. EDINETのサイトから「EDINETコードリスト」(EdinetcodeDlInfo.zip) をダウンロードして解凍
// 2. node scripts/build-codes.mjs path/to/EdinetcodeDlInfo.csv
// CSVは Shift_JIS、1行目は注記、2行目がヘッダー。
import fs from "node:fs";

const file = process.argv[2];
if (!file) {
  console.error("使い方: node scripts/build-codes.mjs EdinetcodeDlInfo.csv");
  process.exit(1);
}
const text = new TextDecoder("shift_jis").decode(fs.readFileSync(file));
const lines = text.split(/\r?\n/).slice(2).filter(Boolean);

const parse = (line) => line.split('","').map((s) => s.replace(/^"|"$/g, ""));
const out = {};
for (const line of lines) {
  const c = parse(line);
  // 0:EDINETコード 1:提出者種別 2:上場区分 ... 6:提出者名 ... 11:証券コード
  const [code, , listed] = c;
  if (listed !== "上場") continue;
  const sec = c[11] ? c[11].slice(0, 4) : null;
  out[code] = { name: c[6], secCode: sec };
}
fs.writeFileSync(new URL("../data/codes.json", import.meta.url), JSON.stringify(out));
console.log(`${Object.keys(out).length} 社を data/codes.json に書き出しました`);
