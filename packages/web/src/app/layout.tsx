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
    <footer className="py-6 text-xs text-zinc-500">
      {/* Centered rule ~ 1/3 page width */}
      <div className="mx-auto mb-4 w-1/3 border-t border-zinc-800" />

      <div className="mx-auto flex items-center justify-center gap-2 px-4">
        <span>{theme.name} Explorer &mdash; Powered by PAPI</span>
        <span className="text-zinc-700">|</span>
        <span className="flex items-center gap-1">
          We{" "}
          <svg width="13" height="13" viewBox="0 0 24 24" fill="#E6007A" className="inline-block">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>{" "}
          Polkadot!
        </span>
        <span className="text-zinc-700">|</span>
        <a
          href="https://github.com/10igma/polka-xplo/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
          title="GitHub"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57v-2.23c-3.34.73-4.04-1.42-4.04-1.42a3.18 3.18 0 0 0-1.34-1.76c-1.08-.74.09-.73.09-.73a2.52 2.52 0 0 1 1.84 1.24 2.56 2.56 0 0 0 3.5 1 2.56 2.56 0 0 1 .76-1.6c-2.67-.3-5.47-1.34-5.47-5.93a4.64 4.64 0 0 1 1.24-3.22 4.3 4.3 0 0 1 .12-3.18s1-.32 3.3 1.23a11.38 11.38 0 0 1 6 0c2.3-1.55 3.3-1.23 3.3-1.23a4.3 4.3 0 0 1 .12 3.18 4.64 4.64 0 0 1 1.24 3.22c0 4.61-2.8 5.63-5.48 5.92a2.87 2.87 0 0 1 .82 2.23v3.29c0 .31.22.69.83.57A12 12 0 0 0 12 .3" />
          </svg>
        </a>
      </div>
    </footer>
  );
}
