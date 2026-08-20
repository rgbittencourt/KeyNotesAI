import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_URL || "http://localhost:3000"),
  title: "KeyNotesAI — Inteligência para suas reuniões",
  description: "Você foca na reunião, a IA cuida do resto.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/favicon.png", shortcut: "/favicon.png", apple: "/keynotesai-logo.png" },
  openGraph: { title: "KeyNotesAI", description: "Você foca na reunião, a IA cuida do resto.", images: ["/og.png"] },
  twitter: { card: "summary_large_image", title: "KeyNotesAI", description: "Você foca na reunião, a IA cuida do resto.", images: ["/og.png"] },
};
export const viewport: Viewport = { themeColor: "#151616", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body className={`${geistSans.variable} ${geistMono.variable}`}>{children}</body></html>; }
