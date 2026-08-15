import { NextRequest, NextResponse } from "next/server";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, "ws");

// Generates a fresh nonce per request so script-src can drop 'unsafe-inline'.
// Next.js auto-applies this nonce to the hydration scripts it injects — see
// src/app/layout.tsx, which reads headers() to opt the route into per-request
// dynamic rendering (a static/cached page can't carry a per-request nonce).
const isDev = process.env.NODE_ENV !== "production";

export function middleware(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");

  const csp = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `img-src 'self' data:`,
    `font-src 'self' https://fonts.gstatic.com`,
    `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin} ${supabaseWsOrigin}` : ""}`,
    `frame-src 'none'`,
    `frame-ancestors 'self'`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `upgrade-insecure-requests`,
  ].join("; ");

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
