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
  const proxyPath = path.join("/");
  const target = `${backendUrl}/${proxyPath}${req.nextUrl.search}`;

  try {
    const res = await fetch(target, {
      method: req.method,
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
      },
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
      // Follow redirects internally so we don't fight Next.js trailingSlash handling.
    });

    const contentType = res.headers.get("content-type") ?? "application/json";

    // For HTML responses (e.g. Swagger UI), rewrite relative asset paths
    // so they resolve correctly regardless of trailing slash in the browser URL.
    if (contentType.includes("text/html")) {
      let html = await res.text();
      // Replace ./some-asset with /indexer-api/api-docs/some-asset
      const base = `/indexer-api/${proxyPath.replace(/\/$/, "")}`;
      html = html.replace(/"\.\//g, `"${base}/`);
      html = html.replace(/'\.\//g, `'${base}/`);
      return new NextResponse(html, {
        status: res.status,
        headers: {
          "content-type": contentType,
          "cache-control": res.headers.get("cache-control") ?? "no-store",
        },
      });
    }

    const body = await res.arrayBuffer();

    return new NextResponse(body, {
      status: res.status,
      headers: {
        "content-type": contentType,
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
