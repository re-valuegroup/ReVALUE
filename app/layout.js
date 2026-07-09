import "./globals.css";

export const metadata = {
  title: "ReVALUE Studio Manager",
  description: "SNS運用代行 業務管理システム",
};

export default function RootLayout({ children }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
