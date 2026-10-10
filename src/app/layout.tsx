import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";
import TabletScale from "./tablet-scale";

export const metadata: Metadata = {
  title: "DrumSkills",
  description: "Keep your rhythm. Build your streak.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "DrumSkills" },
};

// The iPhone build draws edge to edge under the notch/status bar (padding comes from the safe-area CSS);
// the normal website keeps the browser default.
const IS_NATIVE = process.env.NEXT_PUBLIC_NATIVE === "1";
export const viewport: Viewport = IS_NATIVE ? { viewportFit: "cover", themeColor: "#080909" } : {};

// Reading headers() opts this layout into per-request dynamic rendering,
// which is required for the CSP nonce set in middleware.ts to stay fresh
// (a statically cached page would keep serving the first request's nonce).
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await headers();
  return <html lang="en" className={IS_NATIVE ? "native" : undefined}><body><TabletScale />{children}</body></html>;
}
