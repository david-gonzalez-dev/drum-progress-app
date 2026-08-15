import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drum Progress",
  description: "Keep your rhythm. Build your streak.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Drum Progress" },
};

// Reading headers() opts this layout into per-request dynamic rendering,
// which is required for the CSP nonce set in middleware.ts to stay fresh
// (a statically cached page would keep serving the first request's nonce).
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  await headers();
  return <html lang="en"><body>{children}</body></html>;
}
