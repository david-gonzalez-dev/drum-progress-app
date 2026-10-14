// POLISH 2: Empty state, "Waiting logo". The logo drawn as a thin outline, empty and waiting to be filled. Every 3.2 s the front stick gives a small tap, the orange
// slice glows and a light runs once around the ring. Loops, silent. Only the logo (the reference's mock screen text is replaced by the app's own text).
// Ported from the approved reference; every number is the same.
import { BR, CREAM, ORANGE, R, arc, clamp, eInOut, eOutCubic, f1, f3, lerp, mk, poseStick, seg } from "../core";
import type { SceneDef } from "../core";
import { KL } from "../logo-shapes";

export const logoEmptyScene: SceneDef<Record<string, never>> = {
  adult: true,
  build(env) {
    const { $ } = env;
    const LY = -210, LS = 0.55, CYC = 3.2, T0 = 1.0, TAP = 0.42;
    $("stage").innerHTML = `<g id="root" opacity="0">
    <circle id="aGlow" cx="0" cy="${LY}" r="520" fill="url(#cel-aglow)" opacity="0"/>
    <circle id="rip" cx="0" cy="${LY}" r="250" fill="none" stroke="${CREAM}" stroke-width="2" opacity="0"/>
    <g id="logo">
      <path id="bFill" d="${KL.B.d}" fill="${ORANGE}" opacity="0"/>
      <g id="outline"></g>
      <path id="comet" fill="none" stroke="${BR.light}" stroke-width="12" stroke-linecap="round" opacity="0"/>
      <g id="st0"></g>
    </g>
  </g>`;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "rip", "logo", "bFill", "comet", "st0"].forEach((id) => (E[id] = $(id)));
    const line = (d: string, stroke: string, op: number, parent: Element) => mk("path", { d, fill: "none", stroke, "stroke-width": 5, "stroke-linejoin": "round", opacity: op, pathLength: 1, "stroke-dasharray": "1 1", "stroke-dashoffset": 1 }, parent);
    const outl = [line(KL.A.d, "url(#cel-metal)", 0.55, $("outline")), line(KL.B.d, ORANGE, 0.95, $("outline")), line(KL.CS.d, "url(#cel-metal)", 0.55, $("outline"))];
    const st = { g: E.st0, k: KL.S1 }; const stl = line(KL.S1.d, "url(#cel-metal)", 0.6, E.st0);
    return {
      END: 0, noContinue: true, haptics: [], audio() {},
      render(t) {
        E.root.setAttribute("opacity", f3(seg(t, 0, 0.3)));
        outl.forEach((p, i) => { p.style.strokeDashoffset = String(1 - eInOut(seg(t, 0.1 + i * 0.12, 0.85 + i * 0.12))); });
        stl.style.strokeDashoffset = String(1 - eInOut(seg(t, 0.35, 0.95)));
        const tt = t < T0 ? -1 : (t - T0) % CYC;
        let rot = 0;
        if (tt >= 0 && tt < 0.35) rot = -9 * eOutCubic(tt / 0.35);
        else if (tt >= 0.35 && tt < TAP) rot = lerp(-9, 1.5, Math.pow((tt - 0.35) / (TAP - 0.35), 2));
        else if (tt >= TAP) rot = 1.5 * Math.exp(-(tt - TAP) / 0.08);
        poseStick(st, rot, 0);
        const after = tt >= TAP ? tt - TAP : -1;
        E.bFill.setAttribute("opacity", f3(after >= 0 ? 0.5 * Math.exp(-after / 0.5) : 0));
        const cp = after >= 0 ? clamp(after / 1.4) : -1;
        if (cp >= 0 && cp < 1) { const a = 320.5 + 360 * eInOut(cp); E.comet.setAttribute("d", arc(R, a - 38, a)); E.comet.setAttribute("opacity", f3(0.75 * (1 - cp))); }
        else E.comet.setAttribute("opacity", "0");
        const rp = after >= 0 ? clamp(after / 0.9) : -1;
        E.rip.setAttribute("r", f1(lerp(R * LS + 20, R * LS + 110, eOutCubic(Math.max(rp, 0)))));
        E.rip.setAttribute("opacity", rp >= 0 && rp < 1 ? f3(0.22 * (1 - rp)) : "0");
        E.aGlow.setAttribute("opacity", f3(0.06 + 0.04 * Math.sin(t * 1.6) + (after >= 0 ? 0.14 * Math.exp(-after / 0.6) : 0)));
        E.logo.setAttribute("transform", `translate(0 ${LY}) scale(${f3(LS * (1 + 0.006 * Math.sin(t * 1.6)))})`);
      },
    };
  },
};
