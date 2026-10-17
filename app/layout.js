import "./globals.css";

export const metadata = {
  title: "イナゴライダー",
  description: "大物投資家が買った銘柄に乗る。EDINETの大量保有報告書から候補を拾う",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
