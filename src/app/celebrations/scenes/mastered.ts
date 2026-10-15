// BIG 1: Rudiment mastered, "Level up". The level's tempo ladder fills its last rung, the rungs curl into a ring, the sticks clash on top and the new level
// chevron slams into the medallion. Ported from the approved reference; with 5 rungs and 2 chevrons every number is the same as the reference.
// More or fewer rungs (a level can have 4 to 13 tempos) spread the same shape and timing over that many pieces.
import { BR, CREAM, MAN, ORANGE, addStick, arc, bump, decayOsc, drawSparks, drawWave, eInCubic, eInOut, eOutCubic, f1, f3, fadeUp, lerp, makeRays, makeSparks, makeWave, mk, polar, rad, seg, springTo, txt } from "../core";
import type { SceneDef } from "../core";

export type MasteredCfg = {
  name: string;        // rudiment name, upper case
  rungs: number[];     // the level's tempos (BPM), lowest first
  levelName: string;   // finished level, e.g. "Beginner" (used in the title by the caller)
  nextName: string;    // the new level, upper case, e.g. "INTERMEDIATE"
  chevrons: number;    // the new level's chevron count (Intermediate 2, Advanced 3, Legend 4)
  gold?: boolean;      // the final level (Legend): the new chevron and the level name are gold
  title: string;       // "Beginner mastered"
  sub: string;         // "Flams moves up to Intermediate"
};

export const masteredScene: SceneDef<MasteredCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, glint, shake } = env;
    const CY = -260, RR = 280, SWD = 26, RUNG = 0.9, M0 = 0.95, M1 = 1.35, HIT = 1.45, HS = 0.035;
    const T5 = cfg.rungs, n = T5.length;
    const nameSize = Math.min(34, Math.max(18, (440 / Math.max(cfg.name.length, 1) - 9) / 0.66));
    const nameSpacing = nameSize < 34 ? Math.max(3, 9 * (nameSize / 34)) : 9;
    const chev = Math.max(2, Math.min(4, cfg.chevrons)), sp = chev === 4 ? 44 : chev === 3 ? 56 : 72, finalY = 62 - sp * (chev - 1);
    const GOLD = "#F5C542", newCol = cfg.gold ? GOLD : ORANGE;
    const statics = [...Array(chev - 1)].map((_, k) => `<path d="M-92 26 L0 -36 L92 26" transform="translate(0 ${62 - sp * k})" fill="none" stroke="url(#cel-metal)" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    $("stage").innerHTML = `<g id="root">
    <circle id="aGlow" cx="0" cy="${CY}" r="720" fill="url(#cel-aglow)" opacity="0"/>
    <g id="raysW" transform="translate(0 ${CY})" opacity="0"><g id="rays"></g></g>
    <g id="waves"></g>
    <g id="stick0"></g><g id="stick1"></g>
    <g id="med">
      <circle id="disc" r="252" fill="#141615" opacity="0"/>
      <circle id="discEdge" r="254" fill="none" stroke="url(#cel-metal)" stroke-width="3" pathLength="1" stroke-dasharray="1 1" opacity="0" transform="rotate(-90)"/>
      <g id="rungs"></g><g id="labels"></g>
      <g id="emblem" opacity="0">
        ${txt(0, -118, f1(nameSize) as unknown as number, 700, CREAM, "", `id="ename" text-anchor="middle" letter-spacing="${f1(nameSpacing)}" opacity=".6"`)}
        ${statics}
        <path id="chev2" d="M-92 26 L0 -36 L92 26" fill="none" stroke="${newCol}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round" opacity="0"/>
        ${txt(0, 168, 34, 800, cfg.gold ? GOLD : BR.light, "", `id="nextName" text-anchor="middle" letter-spacing="9"`)}
      </g>
    </g>
    <g id="sparks"></g>
    ${txt(0, 400, 66, 800, CREAM, "", `id="title" text-anchor="middle" letter-spacing="-1" opacity="0"`)}
    ${txt(0, 474, 38, 600, CREAM, "", `id="sub" text-anchor="middle" opacity="0"`)}
  </g>`;
    $("ename").textContent = cfg.name; $("nextName").textContent = cfg.nextName; $("title").textContent = cfg.title; $("sub").textContent = cfg.sub;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "raysW", "rays", "med", "disc", "discEdge", "emblem", "chev2", "title", "sub"].forEach((id) => (E[id] = $(id)));
    makeRays(E.rays, 14);
    const gap = n > 8 ? 12 : 32, w = (778 - (n - 1) * gap) / n, step = w + gap, span = 360 / n, half = n === 5 ? 29 : span * 0.4;
    const labelSize = Math.min(34, w * 0.5);
    const rungs = T5.map((v, i) => {
      const x0 = -389 + i * step, x1 = x0 + w, c = -90 + (i - (n - 1)) * span, cn = ((c % 360) + 360) % 360, rev = cn > 0 && cn < 180;
      const tr = mk("path", { fill: "none", stroke: "#2a2724", "stroke-width": SWD, "stroke-linecap": "round" }, $("rungs"));
      const fl = mk("path", { fill: "none", stroke: "url(#cel-ofill)", "stroke-width": SWD, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1" }, $("rungs"));
      const lb = mk("text", { x: f1((x0 + x1) / 2), y: 80, "text-anchor": "middle", "font-family": MAN, "font-weight": 700, "font-size": f1(labelSize), fill: CREAM, opacity: 0 }, $("labels")); lb.textContent = String(v);
      return { i, x0, x1, c, rev, tr, fl, lb };
    });
    // a rung is a 14-point line that can morph into its arc of the ring
    const rungPath = (r: (typeof rungs)[number], p: number, dy: number) => {
      const pts: string[] = [];
      for (let k = 0; k < 14; k++) { const s = k / 13, [ax, ay] = polar(RR, r.rev ? lerp(r.c + half, r.c - half, s) : lerp(r.c - half, r.c + half, s)); pts.push(`${f1(lerp(lerp(r.x0, r.x1, s), ax, p))} ${f1(lerp(0, ay, p) + dy)}`); }
      return "M" + pts.join(" L");
    };
    const STK = [{ bx: -300, by: CY + 340, ang: -48.58, m: 1 }, { bx: 300, by: CY + 340, ang: -131.42, m: -1 }];
    const stickEls = STK.map((_, i) => { const g = $("stick" + i); addStick(g, 800, "url(#cel-metal)", 22); return g; });
    const sparks = makeSparks($("sparks"), 12, HIT + HS, 0, CY - 394, 20, 160, [BR.light, CREAM, ORANGE], 6);
    const W = $("waves");
    const waves = [makeWave(W, HIT + HS, 0, CY, RR, 700, 9, ORANGE, 0.65), makeWave(W, HIT + HS + 0.06, 0, CY, RR, 560, 4, CREAM, 0.55)];
    return {
      END: 2.3,
      haptics: [[20, RUNG], [45, HIT]],
      audio(b, S) {
        const { roll, rimshot, ting, whoosh, kick, crash, wood, bell } = S;
        roll(b + 0.45, b + 0.86, 0.05, 0.4); rimshot(b + RUNG, 0.7); ting(b + RUNG + 0.03, 0.4, 1318.5);
        whoosh(b + M0, 0.42, 0.16); roll(b + 1.22, b + 1.43, 0.05, 0.35);
        kick(b + HIT, 1); crash(b + HIT, 0.7, 2.2); wood(b + HIT, 0.9, 2000);
        bell(b + HIT, 0.8, 523.25, 2.2); bell(b + HIT + 0.02, 0.5, 659.3, 2.0); bell(b + HIT + 0.04, 0.45, 784, 1.8); ting(b + HIT + 0.1, 0.55, 1568);
        bell(b + 1.85, 0.12, 3136, 0.8);
      },
      render(t) {
        const u = t - HIT - HS, idle = seg(t, 2.0, 2.8);
        const stop = t >= HIT && t < HIT + HS;
        rungs.forEach((r) => {
          const ip = eOutCubic(seg(t, 0.05 + r.i * (0.2 / Math.max(1, n - 1)), 0.35 + r.i * (0.2 / Math.max(1, n - 1))));
          const mp = eInOut(seg(t, M0 + r.i * (0.12 / Math.max(1, n - 1)), M1 - 0.12 + r.i * (0.12 / Math.max(1, n - 1))));
          const dy = 40 * (1 - ip) - 70 * Math.sin(Math.PI * mp);
          const d = rungPath(r, mp, dy);
          r.tr.setAttribute("d", d); r.fl.setAttribute("d", d);
          r.tr.setAttribute("opacity", f3(ip)); r.fl.setAttribute("opacity", f3(ip));
          const last = r.i === n - 1;
          const fp = !last ? 1 : Math.pow(seg(t, 0.45, 0.88), 1.3);
          r.fl.style.strokeDashoffset = String(1 - fp);
          let sw = SWD; if (last) sw += 8 * bump(t - RUNG, 0.05);
          r.fl.setAttribute("stroke-width", f1(sw));
          r.fl.setAttribute("stroke", stop || (last && t >= RUNG && t < RUNG + 0.03) ? BR.white : "url(#cel-ofill)");
          r.lb.setAttribute("opacity", f3(ip * 0.6 * (1 - seg(t, M0, M0 + 0.15))));
          r.lb.setAttribute("fill", last && t >= RUNG ? BR.light : CREAM);
        });
        let ms = 1 - 0.03 * eInCubic(seg(t, 1.2, HIT));
        if (stop) ms = 0.96; else if (u > 0) ms = 1 - 0.04 * decayOsc(u, 20, 7);
        E.med.setAttribute("transform", `translate(0 ${CY}) scale(${f3(ms)})`);
        const dsc = u > 0 ? springTo(u, 14, 8) : 0;
        E.disc.setAttribute("opacity", f3(seg(t, HIT, HIT + 0.08)));
        E.disc.setAttribute("transform", `scale(${f3(lerp(0.7, 1, dsc))})`);
        const ep = eOutCubic(seg(t, HIT + 0.05, HIT + 0.5));
        E.discEdge.style.strokeDashoffset = String(1 - ep); E.discEdge.setAttribute("opacity", String(ep > 0 ? 0.6 : 0));
        E.emblem.setAttribute("opacity", f3(seg(t, HIT + 0.02, HIT + 0.12)));
        E.emblem.setAttribute("transform", `scale(${f3(lerp(0.85, 1, dsc) * (1 + 0.01 * Math.sin(t * 2.2) * idle))})`);
        const cs = springTo(u - 0.06, 16, 8);
        E.chev2.setAttribute("opacity", f3(seg(t, HIT + HS + 0.06, HIT + HS + 0.1)));
        E.chev2.setAttribute("transform", `translate(0 ${f1(lerp(-140, finalY, cs))}) scale(${f3(lerp(1.6, 1, cs))})`);
        E.raysW.setAttribute("opacity", f3(0.07 * seg(t, HIT, HIT + 0.4)));
        E.rays.setAttribute("transform", `rotate(${f1(t * 7)})`);
        E.aGlow.setAttribute("opacity", f3(t < HIT ? 0.12 * seg(t, 0.2, 0.8) + 0.2 * seg(t, M0, M1) : 0.4 + 0.6 * Math.exp(-3 * Math.max(u, 0))));
        STK.forEach((k, i) => {
          const ip = eOutCubic(seg(t, 1.0 + i * 0.04, 1.3 + i * 0.04));
          let Rr: number;
          if (t < 1.28) Rr = 0; else if (t < 1.42) Rr = lerp(0, 14, eOutCubic(seg(t, 1.28, 1.42)));
          else if (t < HIT) Rr = lerp(14, -18, Math.pow(seg(t, 1.42, HIT), 2)); else if (stop) Rr = -18;
          else Rr = -18 * decayOsc(u, 16, 7);
          Rr += Math.sin(t * 2.3 + i * 1.4) * 1.2 * idle;
          const ar = rad(k.ang), off = -700 * (1 - ip);
          stickEls[i].setAttribute("transform", `translate(${f1(k.bx + Math.cos(ar) * off)} ${f1(k.by + Math.sin(ar) * off)}) rotate(${f3(k.ang + k.m * Rr)})`);
          stickEls[i].setAttribute("opacity", String(ip > 0 ? 1 : 0));
        });
        drawSparks(sparks, t); waves.forEach((v) => drawWave(v, t));
        fadeUp(E.title, seg(t, HIT + 0.25, HIT + 0.6), 30);
        const spp = seg(t, HIT + 0.37, HIT + 0.7); fadeUp(E.sub, spp, 24); E.sub.setAttribute("opacity", f3(0.55 * spp));
        glint(lerp(-0.2, 1.2, seg(t, 1.75, 2.35)));
        let fl = 0; if (t >= HIT) fl = stop ? 0.12 : 0.12 * Math.exp(-14 * u);
        setFlash(fl, BR.light);
        shake(E.root, [[t - RUNG, 4], [t - HIT, 10]]);
      },
    };
  },
};
