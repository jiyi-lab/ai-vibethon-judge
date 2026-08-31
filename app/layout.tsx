import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";

// 웹폰트는 전부 셀프호스트 — 행사장 네트워크가 불안해도 스크린 타이포가 유지돼야 한다.
// next/font 는 빌드 시점에 폰트를 받아 같은 오리진에서 서빙하므로 런타임 CDN 의존이 없다.
//
// 본문은 SUIT, 디스플레이는 Anton, 영문 서브는 Inter — 브랜드 가이드(8/19):
// 영문 ANTON(제목)·INTER(서브), 국문 SUIT(제목·본문). 이전의 Pretendard 전환은
// 되돌린 상태로, Pretendard 파일은 남겨두되 로드하지 않는다 (되돌릴 일 대비).
const suit = localFont({
  src: "./fonts/SUIT-Variable.woff2",
  weight: "100 900",
  variable: "--font-suit",
  display: "swap",
});

const anton = Anton({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-anton",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 바이브톤 심사",
  description: "AI 바이브톤 심사 및 토너먼트 결과 발표",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className={`${suit.variable} ${anton.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
