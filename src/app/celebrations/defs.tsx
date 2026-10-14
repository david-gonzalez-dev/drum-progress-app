"use client";
// The gradients and filters every celebration scene draws with, once for the whole page (the scenes refer to them as url(#cel-...)).
// It must stay a normal, zero-size SVG: a hidden (display:none) one would stop the gradients working on iPhone.
export function CelDefs() {
  return <svg width="0" height="0" style={{ position: "absolute", pointerEvents: "none" }} aria-hidden="true" focusable="false">
    <defs>
      <radialGradient id="cel-glow"><stop offset="0" stopColor="#ff6b1a" stopOpacity=".55" /><stop offset=".45" stopColor="#ff6b1a" stopOpacity=".16" /><stop offset="1" stopColor="#ff6b1a" stopOpacity="0" /></radialGradient>
      <radialGradient id="cel-aglow"><stop offset="0" stopColor="#ff6b1a" stopOpacity=".42" /><stop offset=".4" stopColor="#ff6b1a" stopOpacity=".12" /><stop offset="1" stopColor="#ff6b1a" stopOpacity="0" /></radialGradient>
      <radialGradient id="cel-abg" gradientUnits="userSpaceOnUse" cx="0" cy="-250" r="1300"><stop offset="0" stopColor="#151817" /><stop offset="1" stopColor="#090909" /></radialGradient>
      <linearGradient id="cel-metal" gradientUnits="userSpaceOnUse" x1="-450" y1="-450" x2="450" y2="450">
        <stop id="cel-m0" offset="0" stopColor="#d8c5b2" /><stop id="cel-m1" offset="0" stopColor="#f6e6d6" /><stop id="cel-m2" offset="0" stopColor="#ffffff" /><stop id="cel-m3" offset="0" stopColor="#f6e6d6" /><stop id="cel-m4" offset="1" stopColor="#e6d3c0" />
      </linearGradient>
      <linearGradient id="cel-ofill" gradientUnits="userSpaceOnUse" x1="-400" y1="-400" x2="400" y2="400"><stop offset="0" stopColor="#ff9b50" /><stop offset="1" stopColor="#ff6b1a" /></linearGradient>
      <linearGradient id="cel-flameG" gradientUnits="userSpaceOnUse" x1="0" y1="-260" x2="0" y2="260"><stop offset="0" stopColor="#ff9b50" /><stop offset=".55" stopColor="#ff6b1a" /><stop offset="1" stopColor="#e2540f" /></linearGradient>
      <linearGradient id="cel-midG" gradientUnits="userSpaceOnUse" x1="0" y1="-260" x2="0" y2="260"><stop offset="0" stopColor="#ffc99e" /><stop offset="1" stopColor="#ff9b50" /></linearGradient>
      <linearGradient id="cel-btnG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#ff9b50" /><stop offset="1" stopColor="#ff6b1a" /></linearGradient>
      <linearGradient id="cel-shellG" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#101211" /><stop offset=".5" stopColor="#252827" /><stop offset="1" stopColor="#101211" /></linearGradient>
      <filter id="cel-blur18" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="18" /></filter>
      <filter id="cel-blur10" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="10" /></filter>
      <clipPath id="cel-numClip"><rect x="-480" y="90" width="960" height="300" /></clipPath>
    </defs>
  </svg>;
}
