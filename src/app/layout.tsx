import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Fraunces, Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
});

const siteUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: "Atlas",
  description:
    "Privacy-first, local-first research agent. Research questions, analyze documents, and build evidence-backed answers with citations.",
  applicationName: "Atlas",
  openGraph: {
    title: "Atlas | Autonomous Research Agent",
    description:
      "Research questions. Analyze documents. Build evidence-backed answers. Local-first. No account.",
    type: "website",
    siteName: "Atlas",
    images: [{ url: "/atlas-logo.jpg", width: 720, height: 720, alt: "Atlas" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#02050b",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${fraunces.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col font-sans" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
