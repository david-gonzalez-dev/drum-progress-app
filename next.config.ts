import type { NextConfig } from "next";
import path from "path";

// Content-Security-Policy is set in middleware.ts instead of here, because it
// needs a fresh per-request nonce for script-src (see middleware.ts for why).

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
