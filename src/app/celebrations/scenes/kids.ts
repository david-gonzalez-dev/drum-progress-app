// KIDS: "The Big Hit". Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, KIDS_FONT, ORANGE, R, arc, bump, clamp, decayOsc, eInCubic, eInOut, eOutBack, eOutCubic, f1, f3, lerp, makeWave, drawWave, mk, rad, seg, springTo } from "../core";
import type { SceneDef } from "../core";
import { KL } from "../logo-shapes";

export type KidsCfg = { n: number; m: boolean; label: string };

const K_HIT = 0.72, K_HS = 0.045, K_REV = 0.78, K_TWD = 0.62;

function kidsTimeline(n: number, milestone: boolean) {
  const T = { ticks: [] as number[], countEnd: 0, tw: [0, null] as [number, number | null], twDir: [1, -1], catch2: null as number | null, END: 0 };
  if (n > 1) { const gap = Math.min(0.16, 1.1 / (n - 1)); for (let k = 0; k < n - 1; k++) T.ticks.push(1.25 + k * gap); }
  T.countEnd = n > 1 ? T.ticks[T.ticks.length - 1] : 1.15;
  T.tw = [T.countEnd + 0.14, milestone ? T.countEnd + 0.23 : null];
  T.catch2 = milestone ? (T.tw[1] as number) + K_TWD : null;
  T.END = (milestone ? (T.tw[1] as number) : T.tw[0]) + K_TWD + 0.35;
  return T;
}

type Chip = { el: SVGElement; t0: number; cx: number; cy: number; r0: number; a: number; v: number; rot0: number; spin: number; ph: number; size: number };
function makeChips(parent: Element, n: number, t0: number, cx: number, cy: number, r0: number, speed: number): Chip[] {
  const out: Chip[] = [];
  for (let i = 0; i < n; i++) {
    const span = 30 + Math.random() * 55;
    const el = mk("path", { d: arc(58, -span / 2, span / 2), fill: "none", stroke: Math.random() < 0.72 ? ORANGE : CREAM, "stroke-width": 22, "stroke-linecap": "round", opacity: 0 }, parent);
    out.push({ el, t0, cx, cy, r0, a: (i / n) * Math.PI * 2 + Math.random() * 0.45, v: speed * (0.6 + Math.random() * 0.55),
      rot0: Math.random() * 360, spin: (Math.random() - 0.5) * 1000, ph: Math.random() * 6.28, size: 0.7 + Math.random() * 0.6 });
  }
  return out;
}

export const kidsScene: SceneDef<KidsCfg> = {
  adult: false,
  build(env, cfg) {
    const { $, setFlash, shake } = env;
    // The reference's Nunito 900 is not shipped with the app; Barlow Condensed (the app's chunky number font) takes its place, a little bigger.
    $("stage").innerHTML = `<g id="root">
    <circle id="glowC" cx="0" cy="0" r="700" fill="url(#cel-glow)" opacity="0"/>
    <g id="waves"></g><g id="chips"></g>
    <g id="logo"><g id="ring"></g><g id="stick1"></g><g id="stick0"></g></g>
    <g id="num" opacity="0">
      <text id="numShadow" x="0" y="121" text-anchor="middle" font-family="${KIDS_FONT}" font-weight="800" font-size="340" fill="${BR.deep}">+1</text>
      <text id="numMain" x="0" y="105" text-anchor="middle" font-family="${KIDS_FONT}" font-weight="800" font-size="340" fill="${ORANGE}">+1</text>
    </g>
    <text id="label" x="0" y="560" text-anchor="middle" font-family="${KIDS_FONT}" font-weight="800" font-size="62" letter-spacing="10" fill="${CREAM}" opacity="0">POINT</text>
  </g>`;
    // ring pieces are the traced logo shapes, revealed by an animated mask so they still "draw in"
    const kdefs = mk("defs", {}, $("ring"));
    const segEls = [KL.A, KL.B, KL.C].map((piece, i) => {
      const c = i === 1 ? ORANGE : CREAM;
      const m = mk("mask", { id: "cel-km" + i, maskUnits: "userSpaceOnUse", x: -700, y: -700, width: 1400, height: 1400 }, kdefs);
      const mp = mk("path", { d: arc(R, piece.ang[0] - 8, piece.ang[1] + 8), fill: "none", stroke: "#fff", "stroke-width": 220, pathLength: 1, "stroke-dasharray": "1 1" }, m);
      const g = mk("g", {}, $("ring"));
      const p = mk("path", { d: piece.d, fill: c, mask: `url(#cel-km${i})` }, g);
      return { g, p, mp, s: { a0: piece.ang[0], a1: piece.ang[1], c } };
    });
    const KST = [KL.S1, KL.S2];
    const stickEls = KST.map((k, i) => { const g = $("stick" + i); mk("path", { d: k.d, fill: CREAM }, g); return g; });
    const T = kidsTimeline(cfg.n, cfg.m);
    const chips = makeChips($("chips"), cfg.m ? 20 : 13, K_HIT + K_HS, 0, -60, 370, cfg.m ? 820 : 680);
    if (cfg.m) chips.push(...makeChips($("chips"), 11, T.catch2 as number, 0, -400, 230, 560));
    const W = $("waves");
    const waves = [makeWave(W, K_HIT + K_HS, 0, -60, 370, 1150, 44, ORANGE, 0.6), makeWave(W, K_HIT + K_HS + 0.07, 0, -60, 370, 880, 16, CREAM, 0.55)];
    if (T.ticks.length) waves.push(makeWave(W, T.ticks[T.ticks.length - 1], 0, 290, 150, 560, 20, ORANGE, 0.5));
    if (cfg.m) waves.push(makeWave(W, T.catch2 as number, 0, -400, 224, 900, 34, ORANGE, 0.6), makeWave(W, (T.catch2 as number) + 0.07, 0, -400, 224, 650, 12, CREAM, 0.5));
    $("label").textContent = cfg.label;
    $("label").setAttribute("letter-spacing", String(cfg.m ? 6 : 10));
    const E = { root: $("root"), logo: $("logo"), ring: $("ring"), glowC: $("glowC"), num: $("num"), numMain: $("numMain"), numShadow: $("numShadow"), label: $("label") };
    const HIT = K_HIT, HS = K_HS, REV = K_REV, TWD = K_TWD;
    return {
      END: T.END,
      haptics: [[15, 0.4], [40, HIT], ...T.ticks.map((tk): [number, number] => [12, tk])],
      audio(base, S) {
        const { roll, kick, snare, crash, ting, tom, whoosh, wood } = S;
        roll(base, base + 0.68, 0.12, 0.75);
        kick(base + HIT, 1); snare(base + HIT, 0.9); crash(base + HIT, cfg.m ? 1 : 0.8, cfg.m ? 2.4 : 1.6);
        ting(base + 0.8, 0.9, 1318.5);
        const pent = [110, 123.5, 146.8, 164.8, 196, 220, 246.9, 293.7, 329.6, 392];
        T.ticks.forEach((tk, k) => { tom(base + tk, 0.8, pent[Math.min(k, pent.length - 1)]); if (k === T.ticks.length - 1) { ting(base + tk, 0.95, 1760); crash(base + tk, 0.45, 1.1); } });
        T.tw.forEach((tw) => { if (tw != null) { whoosh(base + tw, TWD * 0.9, 0.3); wood(base + tw + TWD, 0.9); } });
        if (cfg.m) { const c2 = T.catch2 as number; kick(base + c2, 0.9); crash(base + c2, 0.9, 2.2); ting(base + c2 + 0.05, 0.9, 2093); }
      },
      render(t) {
        const idle = seg(t, T.END - 0.3, T.END + 0.8);
        const pm = t < REV ? 0 : springTo(t - REV, 12, 8.5);
        const ly = lerp(-60, -400, pm) + Math.sin(t * 1.7) * 8 * idle;
        let ls = lerp(0.92, 0.56, pm);
        if (T.catch2) { const u = t - T.catch2; if (u > 0) ls *= 1 + 0.08 * decayOsc(u, 20, 7) * (u < 0.02 ? u / 0.02 : 1); }
        E.logo.setAttribute("transform", `translate(0 ${f1(ly)}) scale(${ls.toFixed(4)})`);
        let rs: number;
        if (t < HIT) rs = 1 - 0.07 * eInCubic(seg(t, 0.45, HIT));
        else if (t < HIT + HS) rs = 0.9;
        else rs = 1 - 0.1 * decayOsc(t - HIT - HS, 20, 7);
        T.ticks.forEach((tk) => { if (t >= tk) rs *= 1 + 0.04 * Math.exp(-16 * (t - tk)); });
        E.ring.setAttribute("transform", `scale(${rs.toFixed(4)})`);
        const stop = t >= HIT && t < HIT + HS;
        segEls.forEach((e, i) => {
          const p = eOutCubic(seg(t, 0.02 + i * 0.07, 0.34 + i * 0.07));
          e.mp.style.strokeDashoffset = String(1 - p);
          e.p.setAttribute("opacity", String(p > 0.001 ? 1 : 0));
          e.p.setAttribute("fill", stop ? (i === 1 ? BR.hot : BR.white) : e.s.c);
          const u = t - HIT - HS;
          let d = u > 0 ? 130 * bump(u, 0.07) : 0;
          if (T.catch2) { const u2 = t - T.catch2; if (u2 > 0) d += 80 * bump(u2, 0.07); }
          const m = rad((e.s.a0 + e.s.a1) / 2);
          e.g.setAttribute("transform", `translate(${f1(Math.cos(m) * d)} ${f1(Math.sin(m) * d)})`);
        });
        KST.forEach((k, i) => {
          const ip = seg(t, 0.1 + i * 0.07, 0.52 + i * 0.07);
          const s = 950 * (1 - eOutBack(ip, 1.4));
          let rot: number, pull: number;
          if (t < 0.70) { const w = eOutCubic(seg(t, 0.45, 0.70)); rot = -17 * w; pull = -38 * w; }
          else if (t < HIT) { const q = seg(t, 0.70, HIT); rot = lerp(-17, 6, q * q); pull = lerp(-38, 10, q * q); }
          else if (t < HIT + HS) { rot = 6; pull = 10; }
          else { const u = t - HIT - HS; rot = 6 * decayOsc(u, 22, 8); pull = 10 * Math.exp(-12 * u); }
          let tw = 0, hop = 0;
          const twt = T.tw[i];
          if (twt != null) {
            const p = seg(t, twt, twt + TWD);
            tw = 360 * eInOut(p) * T.twDir[i]; hop = -180 * Math.sin(Math.PI * p);
            const uc = t - (twt + TWD); if (uc > 0) rot += 10 * Math.exp(-9 * uc) * Math.sin(24 * uc);
          }
          rot += Math.sin(t * 2.6 + i * 1.3) * 2.2 * idle;
          const a = rad(k.ang), off = pull - s;
          const x = k.bx + Math.cos(a) * off, y = k.by + Math.sin(a) * off + hop;
          stickEls[i].setAttribute("transform", `translate(${f1(x)} ${f1(y)}) rotate(${f3(k.ang + rot)}) translate(${k.L / 2} 0) rotate(${f3(tw)}) translate(${-k.L / 2} 0)`);
          stickEls[i].setAttribute("opacity", String(ip > 0 ? 1 : 0));
        });
        const glowO = t < HIT ? 0.18 * seg(t, 0.3, 0.7) : 0.32 + 0.68 * Math.exp(-5 * (t - HIT));
        E.glowC.setAttribute("opacity", f3(glowO)); E.glowC.setAttribute("cy", f1(ly)); E.glowC.setAttribute("r", f1(760 * ls));
        let fl = 0; if (t >= HIT) fl = t < HIT + HS ? 0.3 : 0.3 * Math.exp(-14 * (t - HIT - HS));
        setFlash(fl, ORANGE);
        shake(E.root, [[t - HIT, cfg.m ? 22 : 16], ...(T.catch2 ? [[t - T.catch2, 12] as [number, number]] : [])]);
        waves.forEach((v) => drawWave(v, t));
        chips.forEach((c) => {
          const u = t - c.t0;
          if (u < 0) { c.el.setAttribute("opacity", "0"); return; }
          const tau = 0.22, r = c.r0 + c.v * tau * (1 - Math.exp(-u / tau)), f = clamp((u - 0.4) / 1);
          const x = c.cx + Math.cos(c.a) * r * 0.88 + Math.sin(t * 0.9 + c.ph) * 16 * f;
          const y = c.cy + Math.sin(c.a) * r * 1.35 + Math.cos(t * 0.7 + c.ph) * 22 * f;
          const rot = c.rot0 + c.spin * tau * (1 - Math.exp(-u / tau)) + Math.sin(t * 0.6 + c.ph) * 12 * f;
          const sc = c.size * (u < 0.08 ? u / 0.08 : lerp(1, 0.72, clamp((u - 0.08) / 0.6)));
          c.el.setAttribute("transform", `translate(${f1(x)} ${f1(y)}) rotate(${f1(rot)}) scale(${f3(sc)})`);
          c.el.setAttribute("opacity", f3(lerp(1, 0.45, clamp((u - 0.3) / 0.9))));
        });
        const pn = springTo(t - REV, 14, 8);
        let value = 1, last = REV, big = 0.18;
        T.ticks.forEach((tk, k) => { if (t >= tk) { value = k + 2; last = tk; big = k === T.ticks.length - 1 ? 0.3 : 0.14; } });
        let ns = lerp(0.15, 1, pn);
        if (last > REV) ns *= 1 + big * Math.exp(-14 * (t - last));
        ns *= 1 + Math.sin(t * 2.2) * 0.015 * idle;
        const ny = lerp(-60, 290, clamp(pn, 0, 1.2));
        E.num.setAttribute("transform", `translate(0 ${f1(ny)}) scale(${Math.max(ns, 0).toFixed(4)})`);
        E.num.setAttribute("opacity", f3(seg(t, REV, REV + 0.05)));
        const txt = "+" + value;
        if (E.numMain.textContent !== txt) { E.numMain.textContent = txt; E.numShadow.textContent = txt; }
        const lp = eOutBack(seg(t, 1.0, 1.35), 2);
        E.label.setAttribute("opacity", f3(seg(t, 1.0, 1.15)));
        E.label.setAttribute("transform", `translate(0 ${f1(lerp(40, 0, lp))})`);
      },
    };
  },
};
