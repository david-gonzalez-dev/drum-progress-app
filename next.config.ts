import type { NextConfig } from "next";
import path from "path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const supabaseOrigin = supabaseUrl ? new URL(supabaseUrl).origin : "";
const supabaseWsOrigin = supabaseOrigin.replace(/^http/, "ws");
const isDev = process.env.NODE_ENV !== "production";

// Google Fonts (@import in globals.css), Supabase (auth/db), and the app's
// own origin are the only external resources this app actually loads.
// script-src/style-src need 'unsafe-inline' because Next.js injects
// unnonced hydration scripts and React renders dynamic inline style={} —
// see the audit notes in the accompanying commit message.
const csp = [
  `default-src 'self'`,
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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

const permissionsPolicy = [
  "camera=()",
  "microphone=()",
  "geolocation=()",
  "payment=()",
  "usb=()",
  "magnetometer=()",
  "gyroscope=()",
  "accelerometer=()",
  "midi=()",
  "interest-cohort=()",
  "display-capture=()",
  "picture-in-picture=()",
  "autoplay=()",
  "screen-wake-lock=()",
  "fullscreen=()",
].join(", ");

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: permissionsPolicy },
        ],
      },
    ];
  },
};

export default nextConfig;
