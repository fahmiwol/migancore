import type { Metadata } from "next";
import { Orbitron, Inter } from "next/font/google";
import "./globals.css";

// Self-hosted Google fonts (zero runtime dependency on Google at request time).
const orbitron = Orbitron({ subsets: ["latin"], variable: "--font-orbitron", display: "swap" });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "MiganPro — Asisten AI Pribadi",
  description: "Asisten AI pribadi yang tumbuh bersama Anda. Self-hosted, privat.",
};

// The dashboard is auth-gated + personalized → it must NOT be statically prerendered.
// Static prerender emits `Cache-Control: s-maxage=31536000`, which pinned stale HTML
// (old chunk refs) for a year so deploys never reached the browser. force-dynamic →
// the page is rendered per-request and served no-store. See FINDINGS F-023.
export const dynamic = "force-dynamic";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${orbitron.variable} ${inter.variable}`}>
      <body>{children}</body>
    </html>
  );
}
