import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Drum Progress",
  description: "Keep your rhythm. Build your streak.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Drum Progress" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
