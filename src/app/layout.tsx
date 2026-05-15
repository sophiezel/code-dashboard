import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Hermes Dashboard",
  description: "投研数据后台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" className="dark">
      <body className="bg-zinc-950 text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
