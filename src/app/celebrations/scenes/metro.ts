// Loading: a metronome swinging at 100 BPM instead of a spinner. Loops, silent.
// Glowing orange weight with a fading light trail, a ripple at every end of the swing, and four beat lights on top that count 1 2 3 4.
import { BR, CREAM, ORANGE, eOutCubic, f1, f3, lerp, seg } from "../core";
import type { SceneDef } from "../core";

export const metroScene: SceneDef<Record<string, never>> = {
  adult: true,
  build(env) {
    const { $ } = env;
    const MY = -150;
    const ticks = [...Array(8)].map((_, k) => `<line x1="-16" y1="${-330 + k * 48}" x2="16" y2="${-330 + k * 48}" stroke="#3a3531" stroke-width="3" stroke-linecap="round"/>`).join("");
    const TRAIL = 6;
    const armSvg = (id: string, op: number, glow: boolean) => `<g id="${id}" opacity="${op}"><line x1="0" y1="0" x2="0" y2="-470" stroke="${glow ? CREAM : ORANGE}" stroke-width="${glow ? 10 : 8}" stroke-linecap="round"/>${glow ? `<circle id="wglow" cx="0" cy="-307" r="62" fill="${ORANGE}" filter="url(#cel-blur18)" opacity=".55"/>` : ""}<rect x="-34" y="-330" width="68" height="46" rx="12" fill="${glow ? "url(#cel-ofill)" : ORANGE}"/></g>`;
    const trail = [...Array(TRAIL)].map((_, k) => armSvg(`tr${k}`, 0, false)).join("");
    const dots = [...Array(4)].map((_, k) => `<circle id="bd${k}" cx="${-66 + k * 44}" cy="-399" r="9" fill="${BR.dim}"/>`).join("");
    $("stage").innerHTML = `<g id="root" opacity="0">
    <circle id="halo" cx="0" cy="${MY - 70}" r="330" fill="url(#cel-aglow)" opacity="0"/>
    <g transform="translate(0 ${MY})">
      <path d="M-80 -420 L80 -420 L185 160 L-185 160 Z" fill="url(#cel-shellG)" stroke="url(#cel-metal)" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-46 -380 L46 -380 L118 110 L-118 110 Z" fill="#1a1c1b"/>
      ${ticks}
      <g transform="translate(0 80)">${trail}${armSvg("arm", 1, true)}</g>
      <circle id="piv" cx="0" cy="80" r="16" fill="url(#cel-metal)"/>
      <rect x="-200" y="160" width="400" height="36" rx="12" fill="url(#cel-metal)" opacity=".85"/>
      <circle id="rip" cx="0" cy="0" r="10" fill="none" stroke="${ORANGE}" stroke-width="7" opacity="0"/>
      <circle id="rip2" cx="0" cy="0" r="10" fill="none" stroke="${BR.light}" stroke-width="4" opacity="0"/>
      ${dots}
    </g>
  </g>`;
    const P = 1.2, AMP = 26, WEIGHT = 307;
    const A = (t: number) => AMP * Math.sin((2 * Math.PI * t) / P);
    const dotEls = [...Array(4)].map((_, k) => $("bd" + k));
    return {
      END: 0, noContinue: true, haptics: [], audio() {},
      render(t) {
        $("root").setAttribute("opacity", f3(seg(t, 0, 0.3)));
        $("arm").setAttribute("transform", `rotate(${f3(A(t))})`);
        for (let k = 0; k < TRAIL; k++) {
          const el = $("tr" + k);
          el.setAttribute("transform", `rotate(${f3(A(t - 0.022 * (k + 1)))})`);
          el.setAttribute("opacity", f3(0.34 * Math.pow(0.62, k)));
        }
        // an end of the swing every 0.6 s (the weight is furthest out at t = 0.3, 0.9, 1.5 ...)
        const e = t - 0.3, k = Math.floor(e / 0.6), u = e - k * 0.6;
        const side = k % 2 === 0 ? 1 : -1;
        const near = e >= 0 ? u : 0.6 + e;           // time since the last end of the swing
        const tipX = side * Math.sin((AMP * Math.PI) / 180) * WEIGHT, tipY = 80 - Math.cos((AMP * Math.PI) / 180) * WEIGHT;
        const p = seg(u, 0, 0.5);
        $("rip").setAttribute("cx", f1(tipX)); $("rip").setAttribute("cy", f1(tipY)); $("rip").setAttribute("r", f1(lerp(18, 120, eOutCubic(p))));
        $("rip").setAttribute("opacity", e >= 0 && p < 1 ? f3(0.75 * (1 - p)) : "0");
        $("rip2").setAttribute("cx", f1(tipX)); $("rip2").setAttribute("cy", f1(tipY)); $("rip2").setAttribute("r", f1(lerp(10, 70, eOutCubic(p))));
        $("rip2").setAttribute("opacity", e >= 0 && p < 1 ? f3(0.9 * (1 - p)) : "0");
        const hit = Math.exp(-near / 0.12);
        $("wglow").setAttribute("opacity", f3(0.45 + 0.5 * hit));
        $("piv").setAttribute("r", f1(16 * (1 + 0.3 * hit)));
        $("halo").setAttribute("opacity", f3(0.18 + 0.28 * hit));
        // four beat lights: they count 1 2 3 4 with every end of the swing
        const beat = e >= 0 ? ((k % 4) + 4) % 4 : -1;
        dotEls.forEach((d, i) => { const on = i === beat; d.setAttribute("fill", on ? ORANGE : BR.dim); d.setAttribute("r", on ? f1(9 + 3.5 * hit) : "9"); });
      },
    };
  },
};
