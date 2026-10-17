import "./globals.css";

export const metadata = {
  title: "大物ウォッチ",
  description: "著名投資家の大量保有報告書をEDINETから拾うPoC",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
