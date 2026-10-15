// "Hold it a little longer": shown after a Comfortable or Mastered session that was shorter than the time a tempo needs (1 or 2 minutes, non-stop).
// A ring fills to how far the player got; the lines say what to do next time. Calm and encouraging, not a celebration.
import { BR, CREAM, MAN, ORANGE, arc, eInOut, eOutCubic, f1, f3, lerp, mk, polar, seg } from "../core";
import type { SceneDef } from "../core";

export type ShortCfg = {
  seconds: number;   // how long the session lasted
  need: number;      // seconds needed (60 or 120)
  title: string;     // "Almost there"
  unit: string;      // "SEC"
  of: string;        // "of 1 min"
  lines: string[];   // up to 3 short lines
};

export const shortScene: SceneDef<ShortCfg> = {
  adult: true,
  build(env, cfg) {
    const { $ } = env;
    const CY = -150, RR = 230, SWD = 40;
    const frac = Math.max(0.02, Math.min(0.97, cfg.seconds / cfg.need));
    const [dx, dy] = polar(RR, -90);
    $("stage").innerHTML = `<g id="root">
      <circle id="glow" cx="0" cy="${CY}" r="520" fill="url(#cel-aglow)" opacity="0"/>
      <g transform="translate(0 ${CY})">
        <circle r="${RR}" fill="none" stroke="${BR.dim}" stroke-width="${SWD}"/>
        <path id="prog" fill="none" stroke="url(#cel-ofill)" stroke-width="${SWD}" stroke-linecap="round" opacity="0"/>
        <circle id="goalDot" cx="${f1(dx)}" cy="${f1(dy)}" r="22" fill="${CREAM}" opacity="0"/>
      </g>
      <text id="num" x="0" y="${CY + 60}" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="170" letter-spacing="-6" fill="${CREAM}" opacity="0">0</text>
      <text id="unit" x="0" y="${CY + 132}" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="34" letter-spacing="10" fill="${BR.light}" opacity="0">${cfg.unit}</text>
      <text id="of" x="0" y="${CY + 184}" text-anchor="middle" font-family="${MAN}" font-weight="700" font-size="34" fill="${CREAM}" opacity="0">${cfg.of}</text>
      <text id="title" x="0" y="250" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="72" letter-spacing="-1" fill="${CREAM}" opacity="0">${cfg.title}</text>
      <g id="lines"></g>
    </g>`;
    const lineEls = cfg.lines.slice(0, 3).map((l, i) => mk("text", { x: 0, y: 334 + i * 56, "text-anchor": "middle", "font-family": MAN, "font-weight": 600, "font-size": 38, fill: i === 0 ? BR.hot : BR.light, opacity: 0 }, $("lines")) as SVGElement);
    cfg.lines.slice(0, 3).forEach((l, i) => { lineEls[i].textContent = l; });
    const E: Record<string, SVGElement> = {};
    ["glow", "prog", "goalDot", "num", "unit", "of", "title"].forEach((id) => (E[id] = $(id)));
    const T0 = 0.35, T1 = 1.35;
    const nTicks = Math.min(6, Math.max(2, Math.round(cfg.seconds / 10)));
    const ticks = Array.from({ length: nTicks }, (_, i) => T0 + ((i + 1) / nTicks) * (T1 - T0));
    return {
      END: 2.2,
      haptics: [...ticks.map((t): [number, number] => [8, t]), [16, T1]],
      audio(base, S) {
        ticks.forEach((t, k) => S.wood(base + t, 0.3 + k * 0.04, 1300 + k * 90));
        S.bell(base + T1, 0.4, 523.25, 1.4);
      },
      render(t) {
        const c = eInOut(seg(t, T0, T1));
        const sweep = 360 * frac * c;
        if (sweep > 1) { E.prog.setAttribute("d", arc(RR, -90, -90 + Math.min(sweep, 359))); E.prog.setAttribute("opacity", "1"); }
        else E.prog.setAttribute("opacity", "0");
        const nIn = seg(t, 0.1, 0.4);
        E.num.setAttribute("opacity", f3(nIn)); E.unit.setAttribute("opacity", f3(nIn)); E.of.setAttribute("opacity", f3(seg(t, 0.25, 0.55)));
        const val = Math.round(cfg.seconds * c);
        if (E.num.textContent !== String(val)) E.num.textContent = String(val);
        const dp = seg(t, 0.2, 0.5), pulse = 1 + 0.35 * Math.max(0, Math.sin(Math.max(0, t - T1) * 5)) * seg(t, T1, T1 + 0.3);
        E.goalDot.setAttribute("opacity", f3(dp * 0.9)); E.goalDot.setAttribute("r", f1(22 * pulse));
        const tp = seg(t, 0.3, 0.7);
        E.title.setAttribute("opacity", f3(tp)); E.title.setAttribute("transform", `translate(0 ${f1(lerp(26, 0, eOutCubic(tp)))})`);
        lineEls.forEach((el, i) => { const p = seg(t, T1 + 0.05 + i * 0.18, T1 + 0.45 + i * 0.18); el.setAttribute("opacity", f3(p)); el.setAttribute("transform", `translate(0 ${f1(lerp(22, 0, eOutCubic(p)))})`); });
        E.glow.setAttribute("opacity", f3(0.12 * seg(t, 0.2, 0.9) + 0.2 * seg(t, T1, T1 + 0.5)));
      },
    };
  },
};
