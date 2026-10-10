"use client";
import { useEffect } from "react";

// On an iPad the phone layout would otherwise sit small in the middle of a huge screen. This tells the
// browser the page is only ~590-767 px wide, so iOS scales the whole phone layout up (text, photo and
// buttons together) to fill the tablet. Phones and desktop browsers are left alone.
const SCALE = 1.75;
export default function TabletScale() {
  useEffect(() => {
    const isTablet = navigator.maxTouchPoints > 1 && Math.min(window.screen.width, window.screen.height) >= 700;
    if (!isTablet) return;
    const meta = document.querySelector('meta[name="viewport"]');
    if (!meta) return;
    const original = meta.getAttribute("content") ?? "width=device-width, initial-scale=1";
    const cover = original.includes("viewport-fit=cover") ? ", viewport-fit=cover" : "";
    function apply() {
      const short = Math.min(window.screen.width, window.screen.height);
      const long = Math.max(window.screen.width, window.screen.height);
      const portrait = window.matchMedia("(orientation: portrait)").matches;
      // Stay under 768 so the old desktop-style tablet column rules never kick in.
      const width = Math.min(767, Math.round((portrait ? short : long) / SCALE));
      meta!.setAttribute("content", `width=${width}${cover}`);
    }
    document.documentElement.classList.add("is-tablet");
    apply();
    window.addEventListener("orientationchange", apply);
    window.addEventListener("resize", apply);
    return () => {
      window.removeEventListener("orientationchange", apply);
      window.removeEventListener("resize", apply);
      meta.setAttribute("content", original);
      document.documentElement.classList.remove("is-tablet");
    };
  }, []);
  return null;
}
