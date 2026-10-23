import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Archivo, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "sonner";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-bricolage",
  axes: ["opsz", "wdth"],
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocDrift — Docs that never drift",
  description:
    "A background codebase-to-documentation synchronizer. tree-sitter ASTs, a Mastra agent workflow and open-weight Gemma draft the doc PR for you — 100% free, 0 cloud calls required.",
  keywords: [
    "DocDrift",
    "documentation",
    "tree-sitter",
    "Mastra",
    "Gemma",
    "open-source AI",
    "Hacktoberfest",
  ],
  authors: [{ name: "DocDrift Contributors" }],
  openGraph: {
    title: "DocDrift — Docs that never drift",
    description:
      "Your code drifted. Your docs didn't. An open-source agent crew that drafts the documentation PR for you.",
    siteName: "DocDrift",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#080706",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${bricolage.variable} ${archivo.variable} ${plexMono.variable} scroll-smooth`}
    >
      <body className="min-h-screen bg-ink-950 font-sans text-mist antialiased">
        {children}
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "rgba(20,18,16,0.92)",
              border: "1px solid rgba(214,208,197,0.16)",
              color: "#f0ede7",
              backdropFilter: "blur(12px)",
            },
          }}
        />
      </body>
    </html>
  );
}
