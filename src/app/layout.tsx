import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { Tajawal } from "next/font/google";
import { ReactQueryProvider } from "@/components/providers/react-query-provider";
import { TopLoader } from "@/components/layout/top-loader";
import "./globals.css";

// ── Premium Arabic font — Tajawal ─────────────────────────────
// Chosen for: superior optical metrics, excellent number legibility,
// tight tracking perfect for data-dense ERP interfaces.
const tajawal = Tajawal({
  subsets: ["arabic", "latin"],
  weight: ["300", "400", "500", "700"],
  variable: "--font-tajawal",
  display: "swap",
  preload: true,
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Kapy Pharma — نظام إدارة الموارد",
    template: "%s | Kapy Pharma",
  },
  description:
    "نظام متكامل لإدارة موارد شركة Kapy Pharma للتوزيع الدوائي — المخازن، المبيعات، الصيدليات، والخزينة.",
  keywords: ["kapy pharma", "erp", "crm", "pharmaceutical", "distribution", "توزيع دوائي"],
  authors: [{ name: "Kapy Pharma" }],
  robots: "noindex, nofollow",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning className={tajawal.variable}>
      <body className={`antialiased ${tajawal.className}`}>
        <Suspense fallback={null}>
          <TopLoader />
        </Suspense>
        <ReactQueryProvider>{children}</ReactQueryProvider>
      </body>
    </html>
  );
}
