// POLISH 3: Loading. A metronome swinging at 100 BPM instead of a spinner. Loops, silent. Every number is the reference's (without the mock "Loading" text).
import { CREAM, f1, f3, seg } from "../core";
import type { SceneDef } from "../core";

export const metroScene: SceneDef<Record<string, never>> = {
  adult: true,
  build(env) {
    const { $ } = env;
    const MY = -150;
    const ticks = [...Array(8)].map((_, k) => `<line x1="-16" y1="${-330 + k * 48}" x2="16" y2="${-330 + k * 48}" stroke="#3a3531" stroke-width="3" stroke-linecap="round"/>`).join("");
    const armSvg = (id: string, op: number) => `<g id="${id}" opacity="${op}"><line x1="0" y1="0" x2="0" y2="-470" stroke="${CREAM}" stroke-width="10" stroke-linecap="round"/><rect x="-34" y="-330" width="68" height="46" rx="12" fill="url(#cel-btnG)"/></g>`;
    $("stage").innerHTML = `<g id="root" opacity="0">
    <g transform="translate(0 ${MY})">
      <path d="M-80 -420 L80 -420 L185 160 L-185 160 Z" fill="url(#cel-shellG)" stroke="url(#cel-metal)" stroke-width="4" stroke-linejoin="round"/>
      <path d="M-46 -380 L46 -380 L118 110 L-118 110 Z" fill="#1a1c1b"/>
      ${ticks}
      <g transform="translate(0 80)">${armSvg("tr2", 0.07)}${armSvg("tr1", 0.16)}${armSvg("arm", 1)}</g>
      <circle id="piv" cx="0" cy="80" r="16" fill="url(#cel-metal)"/>
      <rect x="-200" y="160" width="400" height="36" rx="12" fill="url(#cel-metal)" opacity=".85"/>
    </g>
  </g>`;
    const A = (t: number) => 26 * Math.sin((2 * Math.PI * t) / 1.2);
    return {
      END: 0, noContinue: true, haptics: [], audio() {},
      render(t) {
        $("root").setAttribute("opacity", f3(seg(t, 0, 0.3)));
        $("arm").setAttribute("transform", `rotate(${f3(A(t))})`);
        $("tr1").setAttribute("transform", `rotate(${f3(A(t - 0.05))})`);
        $("tr2").setAttribute("transform", `rotate(${f3(A(t - 0.1))})`);
        const ph = t % 0.6; $("piv").setAttribute("r", f1(16 * (1 + 0.25 * Math.exp(-ph / 0.06))));
      },
    };
  },
};
