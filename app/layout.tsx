import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, Fraunces } from "next/font/google";

import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  axes: ["opsz"],
  variable: "--font-fraunces",
  display: "swap",
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-archivo",
  display: "swap",
});

const FAVICON = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="10" fill="#b23a26"/><text x="32" y="47" font-family="Georgia, serif" font-size="42" font-weight="700" fill="#f7f1e4" text-anchor="middle">Y</text></svg>',
)}`;

const SPEKO_URL =
  "https://speko.ai?utm_source=yap-index&utm_medium=viral&utm_campaign=viral-3x";

export const metadata: Metadata = {
  metadataBase: new URL("https://yap-index.speko.dev"),
  title: "The Yap Index - the talking speed of tech, measured",
  description:
    "A leaderboard of how fast the biggest tech podcasts actually talk: words per minute, marathon monologues, and filler habits, measured with Speko speech-to-text.",
  icons: { icon: FAVICON },
  openGraph: {
    siteName: "The Yap Index",
    type: "website",
    title: "The Yap Index - the talking speed of tech, measured",
    description:
      "Who actually talks the most in tech? The leaderboard of podcast talking speed.",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${archivo.variable}`}>
      <body className="bg-paper font-body text-ink antialiased">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-4 sm:px-8">
          <div className="flex-1">{children}</div>
          <footer className="mt-24 border-t border-rule pb-10 pt-6 text-sm text-ink-soft">
            <nav className="flex flex-wrap gap-x-6 gap-y-2">
              <Link href="/" className="hover:text-press">
                Leaderboard
              </Link>
              <Link href="/yap" className="hover:text-press">
                Measure your yap
              </Link>
              <Link href="/methodology" className="hover:text-press">
                Methodology
              </Link>
              <Link href="/delist" className="hover:text-press">
                Delist a show
              </Link>
            </nav>
            <p className="mt-6">
              Built on{" "}
              <a
                href={SPEKO_URL}
                className="font-medium text-press underline underline-offset-2"
              >
                Speko
              </a>{" "}
              - the voice AI platform. Every number on this site came out of
              the Speko speech-to-text API.
            </p>
            <p className="mt-2 text-xs">
              Leaderboard format inspired by yappers.context.dev. Stats are
              estimates; read the methodology before quoting them in anger.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
