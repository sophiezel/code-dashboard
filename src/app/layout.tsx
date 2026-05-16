import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "天工 Dashboard",
  description: "量化投研数据平台",
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
