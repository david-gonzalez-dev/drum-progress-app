// ADULT 3: Streak milestone, "Ignite". Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, MAN, ORANGE, addStick, bump, decayOsc, drawSparks, drawWave, eInCubic, eInOut, eOutBack, eOutCubic, f1, f3, lerp, makeSparks, makeWave, mk, rad, seg, springTo } from "../core";
import type { SceneDef } from "../core";

export type StreakCfg = {
  n: number;       // the new streak count (a milestone day: 3, 7, 14, 30, 100)
  label: string;   // "DAY STREAK"
  sub: string;     // subtitle under the label
};

export const streakScene: SceneDef<StreakCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, glint, shake } = env;
    const big = cfg.n >= 30, to = cfg.n, from = to - 1;
    const FY = -250, CL = 0.62, HS = 0.035, IGN = 0.88, FLIP = 0.95, TWD = 0.62;
    const TWS = [1.3, 1.36], CATCH = 1.95;
    const P = [0, -700];
    const STK = [{ bx: -340, by: -420 }, { bx: 340, by: -420 }].map((k) => {
      const ang = (Math.atan2(P[1] - k.by, P[0] - k.bx) * 180) / Math.PI;
      return { ...k, ang, L: Math.hypot(P[0] - k.bx, P[1] - k.by) - 2 };
    });
    const FLAME = "M0 -260 C70 -170 200 -70 200 70 C200 185 112 260 0 260 C-112 260 -200 185 -200 70 C-200 -15 -150 -85 -105 -130 C-100 -70 -78 -35 -40 -15 C-60 -120 -35 -200 0 -260 Z";
    // 3 digits (100) are wider than the reference's 2: the number shrinks a little so it still sits in the clip
    const numSize = to >= 100 ? 220 : 250;
    $("stage").innerHTML = `<g id="root">
    <circle id="aGlow" cx="0" cy="-230" r="700" fill="url(#cel-aglow)" opacity="0"/>
    <g id="waves"></g>
    <g id="embers"></g>
    <g id="flame" opacity="0">
      <path id="fGlow" d="${FLAME}" fill="${ORANGE}" filter="url(#cel-blur18)" opacity=".6" transform="translate(0 20) scale(1.1)"/>
      <path d="${FLAME}" fill="url(#cel-flameG)"/>
      <path id="fMid" d="${FLAME}" fill="url(#cel-midG)"/>
      <path id="fCore" d="${FLAME}" fill="${CREAM}"/>
    </g>
    <g id="sparks"></g>
    <g id="drop" opacity="0"><circle r="26" fill="${ORANGE}" filter="url(#cel-blur10)"/><circle r="9" fill="#fff4ea"/></g>
    <line id="trail" stroke="${BR.light}" stroke-width="6" stroke-linecap="round" opacity="0"/>
    <g id="stick0"></g><g id="stick1"></g>
    <circle id="clashFlash" cx="${P[0]}" cy="${P[1]}" r="40" fill="${BR.white}" opacity="0"/>
    <g clip-path="url(#cel-numClip)">
      <text id="oldNum" x="0" y="340" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="${numSize}" letter-spacing="-8" fill="${CREAM}" opacity="0">${from}</text>
      <text id="numGlow" x="0" y="340" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="${numSize}" letter-spacing="-8" fill="${ORANGE}" filter="url(#cel-blur18)" opacity="0">${to}</text>
      <text id="newNum" x="0" y="340" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="${numSize}" letter-spacing="-8" fill="${CREAM}" opacity="0">${to}</text>
    </g>
    <text id="label" x="0" y="440" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="40" letter-spacing="12" fill="${BR.light}" opacity="0"></text>
    <text id="sub" x="0" y="530" text-anchor="middle" font-family="${MAN}" font-weight="600" font-size="38" fill="${CREAM}" opacity="0"></text>
  </g>`;
    $("label").textContent = cfg.label; $("sub").textContent = cfg.sub;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "flame", "fGlow", "fMid", "fCore", "drop", "trail", "clashFlash", "oldNum", "numGlow", "newNum", "label", "sub"].forEach((id) => (E[id] = $(id)));
    const stickEls = STK.map((k, i) => { const g = $("stick" + i); addStick(g, k.L, "url(#cel-metal)", 18); return g; });
    const sparks = makeSparks($("sparks"), 11, CL + HS, P[0], P[1], 20, 150, [BR.light, CREAM, ORANGE, CREAM], 5);
    const W = $("waves");
    const waves = [makeWave(W, IGN, 0, -200, 120, 700, 7, BR.light, 0.6)];
    if (big) waves.push(makeWave(W, CATCH, 0, -200, 160, 850, 10, ORANGE, 0.65), makeWave(W, CATCH + 0.06, 0, -200, 160, 650, 4, CREAM, 0.55));
    const nE = big ? 30 : 16;
    const embers = [...Array(nE)].map(() => ({
      el: mk("circle", { r: 5, fill: [ORANGE, BR.light, CREAM][Math.floor(Math.random() * 3)], opacity: 0 }, $("embers")),
      life: 1.3 + Math.random() * 0.9, off: Math.random() * 1.4, x0: (Math.random() - 0.5) * 260, rise: 380 + Math.random() * 420, sway: 8 + Math.random() * 22, f: 2 + Math.random() * 3, ph: Math.random() * 6.28, r: 4 + Math.random() * 6,
    }));
    const END = big ? CATCH + 0.4 : FLIP + 0.8;
    return {
      END,
      haptics: [[25, CL], [40, IGN], ...(big ? [[45, CATCH] as [number, number]] : [])],
      audio(base, S) {
        const { roll, wood, crackle, whoomp, bell, whoosh, kick, crash } = S;
        roll(base + 0.3, base + 0.6, 0.04, 0.32);
        wood(base + CL, 1, 1500); wood(base + CL + 0.004, 0.7, 2300); crackle(base + CL, 0.6, 0.22);
        whoomp(base + IGN - 0.03, 0.9);
        bell(base + FLIP + 0.03, 0.45, 1046.5, 1.2); bell(base + FLIP + 0.06, 0.25, 1568, 1.0);
        if (big) {
          whoosh(base + TWS[0], TWD * 0.9, 0.25); wood(base + TWS[1] + TWD, 0.8);
          kick(base + CATCH, 0.8); crash(base + CATCH, 0.45, 1.8); whoomp(base + CATCH - 0.02, 0.8); bell(base + CATCH + 0.05, 0.4, 1318.5, 1.4);
        }
      },
      render(t) {
        const idle = seg(t, END - 0.3, END + 0.8);
        // flame: a small ember until the spark lands, then it flares
        let sc = 0.3, sx = 1, sy = 1;
        const ui = t - IGN;
        if (ui >= 0) { sc = lerp(0.3, 1, springTo(ui, 14, 6)); const b = bump(ui, 0.1); sy *= 1 + 0.25 * b; sx *= 1 - 0.08 * b; }
        if (big && t >= CATCH) { const u2 = t - CATCH; sc += 0.18 * springTo(u2, 14, 6); const b = bump(u2, 0.1); sy *= 1 + 0.15 * b; }
        if (ui < 0) { sc *= 1 + 0.06 * Math.sin(t * 17) + 0.04 * Math.sin(t * 29); }
        else { sy *= 1 + 0.025 * Math.sin(t * 13) + 0.018 * Math.sin(t * 23.3); sx *= 1 + 0.012 * Math.sin(t * 11.1); }
        const skew = Math.sin(t * 7.3) * 2.5 + Math.sin(t * 12.1) * 1.2;
        E.flame.setAttribute("transform", `translate(0 ${FY + 260}) scale(${f3(sc * sx)} ${f3(sc * sy)}) skewX(${f1(skew)}) translate(0 -260)`);
        E.flame.setAttribute("opacity", f3(ui < 0 ? 0.5 * seg(t, 0, 0.3) : lerp(0.5, 1, seg(t, IGN, IGN + 0.08))));
        const sway = Math.sin(t * 9.2) * 7 + Math.sin(t * 5.1) * 4;
        E.fMid.setAttribute("transform", `translate(${f1(sway)} 0) translate(0 260) scale(.64 ${f3(0.64 * (1 + 0.04 * Math.sin(t * 15)))}) translate(0 -260)`);
        E.fCore.setAttribute("transform", `translate(${f1(sway * 1.6)} 0) translate(0 250) scale(.32 ${f3(0.34 * (1 + 0.06 * Math.sin(t * 19)))}) translate(0 -260)`);
        E.fGlow.setAttribute("opacity", f3(ui < 0 ? 0.3 : 0.5 + 0.5 * Math.exp(-3 * ui)));
        E.aGlow.setAttribute("opacity", f3(ui < 0 ? 0.15 * seg(t, 0, 0.4) : 0.4 + 0.6 * Math.exp(-2.5 * ui) + (big && t > CATCH ? 0.4 * Math.exp(-2.5 * (t - CATCH)) : 0)));
        E.aGlow.setAttribute("r", f1(700 * Math.max(sc, 0.5)));
        // sticks: slide in, part, clash together (the spark), drift out
        STK.forEach((k, i) => {
          const a = i === 0 ? -1 : 1;
          const ip = seg(t, 0.05 + i * 0.04, 0.4 + i * 0.04), s = 700 * (1 - eOutBack(ip, 1.3));
          let Rr: number, pull = 0;
          if (t < 0.4) Rr = 6;
          else if (t < 0.6) Rr = lerp(6, 26, eOutCubic(seg(t, 0.4, 0.6)));
          else if (t < CL) Rr = lerp(26, -3, Math.pow(seg(t, 0.6, CL), 2));
          else if (t < CL + HS) Rr = -3;
          else Rr = -3 * decayOsc(t - CL - HS, 22, 8) + 14 * eOutCubic(seg(t, 0.95, 1.35));
          pull = -40 * eOutCubic(seg(t, 0.95, 1.35));
          let tw = 0, hop = 0;
          if (big) {
            const p = seg(t, TWS[i], TWS[i] + TWD); tw = 360 * eInOut(p) * a; hop = -150 * Math.sin(Math.PI * p);
            const uc = t - (TWS[i] + TWD); if (uc > 0) Rr += 8 * Math.exp(-9 * uc) * Math.sin(24 * uc);
          }
          Rr += Math.sin(t * 2.4 + i * 1.7) * 2 * idle;
          const ar = rad(k.ang), off = pull - s;
          stickEls[i].setAttribute("transform", `translate(${f1(k.bx + Math.cos(ar) * off)} ${f1(k.by + Math.sin(ar) * off + hop)}) rotate(${f3(k.ang + a * Rr)}) translate(${k.L / 2} 0) rotate(${f3(tw)}) translate(${-k.L / 2} 0)`);
          stickEls[i].setAttribute("opacity", String(ip > 0 ? 1 : 0));
        });
        const cf = t >= CL ? (t < CL + HS ? 1 : Math.exp(-18 * (t - CL - HS))) : 0;
        E.clashFlash.setAttribute("opacity", f3(cf)); E.clashFlash.setAttribute("r", f1(30 + 40 * (1 - cf)));
        // the falling spark
        const dp = seg(t, CL + 0.04, IGN), yy = (p: number) => lerp(P[1], -110, p * p);
        const dOn = dp > 0 && dp < 1;
        E.drop.setAttribute("opacity", dOn ? "1" : "0"); E.drop.setAttribute("transform", `translate(0 ${f1(yy(dp))})`);
        E.trail.setAttribute("opacity", dOn ? "0.7" : "0");
        E.trail.setAttribute("x1", "0"); E.trail.setAttribute("x2", "0");
        E.trail.setAttribute("y1", f1(yy(Math.max(0, dp - 0.12)))); E.trail.setAttribute("y2", f1(yy(dp)));
        drawSparks(sparks, t); waves.forEach((w) => drawWave(w, t));
        // embers rise once it is lit
        embers.forEach((e) => {
          const age = t - IGN - 0.02 - e.off;
          if (age < 0) { e.el.setAttribute("opacity", "0"); return; }
          const ph = (age % e.life) / e.life;
          const x = e.x0 * sc + Math.sin(age * e.f + e.ph) * e.sway;
          const y = FY + 260 - 520 * sc * 0.42 - ph * e.rise * Math.max(sc, 0.6);
          e.el.setAttribute("cx", f1(x)); e.el.setAttribute("cy", f1(y));
          e.el.setAttribute("r", f1(e.r * (1 - ph * 0.5)));
          e.el.setAttribute("opacity", f3((ph < 0.15 ? ph / 0.15 : Math.pow(1 - ph, 1.2)) * 0.85));
        });
        // number flip: old rolls up and out, new rolls in from below
        const oIn = seg(t, 0.15, 0.35), oOut = eInCubic(seg(t, FLIP, FLIP + 0.15));
        E.oldNum.setAttribute("opacity", f3(0.5 * oIn * (1 - oOut)));
        E.oldNum.setAttribute("transform", `translate(0 ${f1(-180 * oOut)})`);
        const nu = t - FLIP - 0.03, np = springTo(nu, 16, 8);
        const nb = big && t >= CATCH ? 1 + 0.1 * bump(t - CATCH, 0.06) : 1;
        const nT = `translate(0 ${f1(lerp(220, 0, np))}) translate(0 250) scale(${f3(nb * (1 + 0.01 * Math.sin(t * 2.2) * idle))}) translate(0 -250)`;
        E.newNum.setAttribute("transform", nT); E.numGlow.setAttribute("transform", nT);
        E.newNum.setAttribute("opacity", f3(seg(t, FLIP + 0.03, FLIP + 0.08)));
        E.numGlow.setAttribute("opacity", f3(nu < 0 ? 0 : 0.3 + 0.5 * Math.exp(-3 * nu)));
        const lp = seg(t, FLIP + 0.1, FLIP + 0.4), sp = seg(t, FLIP + 0.25, FLIP + 0.55);
        E.label.setAttribute("opacity", f3(lp)); E.label.setAttribute("transform", `translate(0 ${f1(lerp(26, 0, eOutCubic(lp)))})`);
        E.sub.setAttribute("opacity", f3(0.55 * sp)); E.sub.setAttribute("transform", `translate(0 ${f1(lerp(22, 0, eOutCubic(sp)))})`);
        glint(lerp(-0.2, 1.2, seg(t, 1.1, 1.75)));
        let fl = 0;
        if (t >= CL) fl += t < CL + HS ? 0.05 : 0.05 * Math.exp(-14 * (t - CL - HS));
        if (ui >= 0) fl += 0.1 * Math.exp(-10 * ui);
        if (big && t >= CATCH) fl += 0.1 * Math.exp(-10 * (t - CATCH));
        setFlash(fl, BR.light);
        shake(E.root, [[t - CL, 5], [t - IGN, 8], ...(big ? [[t - CATCH, 10] as [number, number]] : [])]);
      },
    };
  },
};
