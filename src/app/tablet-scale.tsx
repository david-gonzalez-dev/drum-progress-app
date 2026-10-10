"use client";
import { useEffect } from "react";

// On an iPad the phone layout would otherwise sit small in the middle of a huge screen. This tells the
// browser the page is only ~690-860 px wide, so iOS scales the whole phone layout up (text, photo and
// buttons together) to fill the tablet. Phones and desktop browsers are left alone.
// Each tab can ask for its own scale (see setTabletScale), e.g. the Practice hub is shrunk so it fits one screen.
const NAV_REFERENCE_SCALE = 1.35; // the menu bar is sized to look the same as on the Home tab, whatever each tab's scale is
let scale = 1.35;
export function setTabletScale(next: number) {
  scale = next;
  if (typeof window !== "undefined") window.dispatchEvent(new Event("tabletscalechange"));
}
export default function TabletScale() {
  useEffect(() => {
    const isTablet = navigator.maxTouchPoints > 1 && Math.min(window.screen.width, window.screen.height) >= 700;
    if (!isTablet) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute("content") ?? "width=device-width, initial-scale=1";
    const cover = original.includes("viewport-fit=cover") ? ", viewport-fit=cover" : "";
    const short = Math.min(window.screen.width, window.screen.height);
    const long = Math.max(window.screen.width, window.screen.height);
    function apply() {
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      // Capped so a very wide landscape screen doesn't make cards stretch endlessly.
      const width = Math.min(860, Math.round((portrait ? short : long) / scale));
      meta!.setAttribute("content", `width=${width}${cover}`);
      document.documentElement.style.setProperty("--nav-k", String(NAV_REFERENCE_SCALE / scale));
      // iOS doesn't always apply the exact width asked for, so measure the scale it really used (screen points
      // per CSS pixel) shortly afterwards and size the menu bar from that.
      [60, 300].forEach((ms) => window.setTimeout(syncNav, ms));
    }
    function syncNav() {
      const side = window.matchMedia("(orientation: portrait)").matches ? short : long;
      const real = side / window.innerWidth;
      if (real > 0.5 && real < 4) document.documentElement.style.setProperty("--nav-k", String(NAV_REFERENCE_SCALE / real));
    }
    document.documentElement.classList.add("is-tablet");
    apply();
    window.addEventListener("resize", syncNav);
    window.addEventListener("tabletscalechange", apply);
    window.addEventListener("orientationchange", apply);
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("resize", syncNav);
      window.removeEventListener("tabletscalechange", apply);
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("resize", apply);
      meta.setAttribute("content", original);
      document.documentElement.classList.remove("is-tablet");
      document.documentElement.style.removeProperty("--nav-k");
    };
  }, []);
  return null;
}
