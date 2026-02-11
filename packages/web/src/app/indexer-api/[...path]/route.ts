/**
 * Catch-all API route that proxies requests to the indexer backend.
 *
 * This runs server-side at request time, so API_URL is read from the
 * runtime environment (e.g. Docker Compose) — not baked at build time.
 *
 * Browser → /indexer-api/api/blocks → Next.js server → http://explorer-indexer:3001/api/blocks
 */
import { NextRequest, NextResponse } from "next/server";

function getBackendUrl(): string {
  return process.env.API_URL ?? "http://localhost:3001";
}

async function handler(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const backendUrl = getBackendUrl();
  const target = `${backendUrl}/${path.join("/")}${req.nextUrl.search}`;

  try {
    const res = await fetch(target, {
      method: req.method,
      redirect: "manual",
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
      },
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
    });

    // Forward redirects, rewriting Location to go through the proxy path.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location") ?? "";
      // Rewrite absolute-path redirects: /api-docs/ → /indexer-api/api-docs/
      const proxied = location.startsWith("/")
        ? `/indexer-api${location}`
        : location;
      return NextResponse.redirect(new URL(proxied, req.url), res.status as 301 | 302 | 307 | 308);
    }

    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": res.headers.get("content-type") ?? "application/json",
        "cache-control": res.headers.get("cache-control") ?? "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: "Indexer API unreachable", detail: message },
      { status: 502 },
    );
  }
}

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const DELETE = handler;
export const PATCH = handler;

export const dynamic = "force-dynamic";
