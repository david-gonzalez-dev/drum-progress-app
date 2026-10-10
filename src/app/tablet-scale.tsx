"use client";
import { useEffect } from "react";

// On an iPad the phone layout would otherwise sit small in the middle of a huge screen. This tells the
// browser the page is only ~830-860 px wide, so iOS scales the whole phone layout up (text, photo and
// buttons together) to fill the tablet. One fixed scale for every tab: changing it per tab made the
// menu bar glitch every time you switched. Phones and desktop browsers are left alone.
const SCALE = 1.25;
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
      const width = Math.min(860, Math.round((portrait ? short : long) / SCALE));
      const next = `width=${width}${cover}`;
      if (meta!.getAttribute("content") !== next) meta!.setAttribute("content", next);
    }
    document.documentElement.classList.add("is-tablet");
    apply();
    window.addEventListener("orientationchange", apply);
    return () => {
      window.removeEventListener("orientationchange", apply);
      meta.setAttribute("content", original);
      document.documentElement.classList.remove("is-tablet");
    };
  }, []);
  return null;
}
