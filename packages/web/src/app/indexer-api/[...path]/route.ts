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
      headers: {
        "content-type": req.headers.get("content-type") ?? "application/json",
      },
      body: req.method !== "GET" && req.method !== "HEAD" ? await req.text() : undefined,
    });

    const body = await res.text();

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
