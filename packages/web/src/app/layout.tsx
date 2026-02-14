import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { SearchBar } from "../components/SearchBar";
import { Providers } from "../components/Providers";
import { HeaderNav } from "../components/HeaderNav";
import { TokenInfo } from "../components/TokenInfo";
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

/**
 * Banner background image that sits behind the header navigation.
 * Uses the chain-specific banner from theme config, falling back to
 * a subtle gradient derived from the accent colour.
 * Rendered absolutely inside the <header> so it never affects layout.
 */
function BannerBackground() {
  if (theme.banner) {
    return (
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <Image
          src={theme.banner}
          alt=""
          fill
          priority
          className="object-cover object-center"
        />
      </div>
    );
  }

  /* Fallback: a subtle gradient glow using the accent colour */
  return (
    <div
      className="absolute inset-0 pointer-events-none"
      aria-hidden="true"
      style={{
        background: `linear-gradient(180deg, ${theme.accentColor}18 0%, transparent 100%)`,
      }}
    />
  );
}

/**
 * Subscan-style two-row header:
 *   Row 1: Logo  ·  nav links  ·  chain badge + SS58 selector
 *   Row 2: Search bar  ·  token symbol
 * Both rows sit on top of the banner background.
 */
function Header() {
  const apiDocsUrl = "/indexer-api/api-docs/";
  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/60 backdrop-blur-md">
      <div className="absolute inset-0 z-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <BannerBackground />
        {/* Semi-transparent overlay so nav text stays readable */}
        <div className="absolute inset-0 bg-zinc-950/60" />
      </div>

      {/* Row 1 — branding + navigation (z-20 so dropdowns overlap Row 2) */}
      <div className="relative z-20 max-w-7xl mx-auto px-4 h-12 flex items-center justify-between gap-4">
        {/* Left: brand wordmark or logo + name */}
        <Link href="/" className="flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 transition-colors cursor-pointer">
          {theme.brand ? (
            <Image
              src={theme.brand}
              alt={theme.name}
              width={140}
              height={28}
              className="h-6 w-auto"
              priority
            />
          ) : (
            <>
              {theme.logo && (
                <Image
                  src={theme.logo}
                  alt={theme.name}
                  width={24}
                  height={24}
                  className="rounded-full"
                />
              )}
              <span className="text-base font-bold text-accent">{theme.name}</span>
            </>
          )}
        </Link>

        {/* Center / right: nav links + chain badge */}
        <HeaderNav apiDocsUrl={apiDocsUrl} />
      </div>

      {/* Row 2 — search bar + token info */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 h-11 flex items-center justify-between gap-4">
        <SearchBar />
        <TokenInfo symbol={theme.tokenSymbol} />
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
