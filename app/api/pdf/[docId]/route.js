import { fetchPdf, isMock } from "../../../../lib/edinet";

// APIキーをブラウザに出さないため、PDFはサーバー経由で返す
export async function GET(_req, { params }) {
  const { docId } = await params;
  if (!/^S100[A-Z0-9]{4}$/.test(docId)) return new Response("bad docId", { status: 400 });
  if (isMock()) return new Response("モックモードではPDFはありません", { status: 404 });
  const res = await fetchPdf(docId);
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.includes("pdf")) return new Response("PDFを取得できませんでした", { status: 502 });
  return new Response(res.body, {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${docId}.pdf"` },
  });
}
