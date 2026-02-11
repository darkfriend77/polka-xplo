import type { Metadata } from "next";
import Image from "next/image";
import { SearchBar } from "../components/SearchBar";
import { Providers } from "../components/Providers";
import { HeaderNav } from "../components/HeaderNav";
import { theme } from "../lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: `${theme.name} Explorer`,
  description: `Block explorer for ${theme.name} — powered by PAPI`,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className="dark"
      style={{ "--color-accent": theme.accentColor } as React.CSSProperties}
    >
      <body className="min-h-screen flex flex-col">
        <Providers theme={theme}>
          <Header />
          <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">{children}</main>
          <Footer />
        </Providers>
      </body>
    </html>
  );
}

function Header() {
  const apiDocsUrl = "/indexer-api/api-docs";
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between gap-4">
        <a href="/" className="flex items-center gap-2 shrink-0">
          {theme.logo && (
            <Image
              src={theme.logo}
              alt={theme.name}
              width={28}
              height={28}
              className="rounded-full"
            />
          )}
          <span className="text-lg font-bold text-accent">{theme.name}</span>
        </a>

        <SearchBar />

        <HeaderNav apiDocsUrl={apiDocsUrl} />
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-zinc-800 py-4 text-center text-xs text-zinc-500">
      {theme.name} Explorer &mdash; Powered by PAPI
    </footer>
  );
}
