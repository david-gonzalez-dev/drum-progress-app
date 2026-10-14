// ADULT 2: Daily goal, "The ring closes". Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, MAN, ORANGE, R, SEGS, STICKS, SW, addStick, arc, bump, decayOsc, drawSparks, drawWave, eInCubic, eInOut, eInOutQuad, eOutBack, eOutCubic, f1, f3, lerp, makeSparks, makeWave, mk, polar, rad, seg } from "../core";
import type { SceneDef } from "../core";

export type GoalCfg = {
  from: number;   // minutes practised today before this session
  goal: number;   // the daily goal in minutes
  unit: string;   // "MIN TODAY"
  title: string;  // "Daily goal reached"
};

export const goalScene: SceneDef<GoalCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, glint, shake } = env;
    const { from, goal } = cfg;
    const LY = -230, LS = 0.84, FUSE = 1.0, HIT = 1.35, HS = 0.035;
    const OFF = [[-14, 6.5], [-6.5, 6], [-6, 14]];
    $("stage").innerHTML = `<g id="root">
    <circle id="aGlow" cx="0" cy="${LY}" r="640" fill="url(#cel-aglow)" opacity="0"/>
    <g id="logo" transform="translate(0 ${LY}) scale(${LS})">
      <g id="ringG">
        <circle id="ringGlow" r="${R}" fill="none" stroke="${ORANGE}" stroke-width="120" filter="url(#cel-blur18)" opacity="0"/>
        <g id="segs"></g>
        <path id="flood" fill="none" stroke="url(#cel-ofill)" stroke-width="${SW + 2}" stroke-linecap="round" opacity="0"/>
        <circle id="full" r="${R}" fill="none" stroke="url(#cel-ofill)" stroke-width="${SW}" opacity="0"/>
        <circle id="edge" r="${R + 50}" fill="none" stroke="url(#cel-metal)" stroke-width="3.5" pathLength="1" stroke-dasharray="1 1" opacity="0" transform="rotate(140)"/>
        <g id="joints"></g>
      </g>
      <g id="stick1"></g><g id="stick0"></g>
    </g>
    <g id="sparks"></g><g id="waves"></g>
    <text id="numGlow" x="0" y="350" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="210" letter-spacing="-8" fill="${ORANGE}" filter="url(#cel-blur18)" opacity="0">${goal}</text>
    <text id="num" x="0" y="350" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="210" letter-spacing="-8" fill="${CREAM}" opacity="0">${from}</text>
    <text id="unit" x="0" y="425" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="36" letter-spacing="12" fill="${BR.light}" opacity="0"></text>
    <text id="title" x="0" y="570" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="66" letter-spacing="-1" fill="${CREAM}" opacity="0"></text>
  </g>`;
    $("unit").textContent = cfg.unit; $("title").textContent = cfg.title;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "logo", "ringG", "ringGlow", "flood", "full", "edge", "num", "numGlow", "unit", "title"].forEach((id) => (E[id] = $(id)));
    const segEls = SEGS.map((s, i) => ({ s, o: OFF[i], p: mk("path", { fill: "none", stroke: i === 1 ? ORANGE : "url(#cel-metal)", "stroke-width": SW, "stroke-linecap": "round", pathLength: 1, "stroke-dasharray": "1 1" }, $("segs")) }));
    const stickEls = STICKS.map((k, i) => { const g = $("stick" + i); addStick(g, k.L, "url(#cel-metal)", 25); return g; });
    const joints = [284.5, 356, 136].map((a) => { const [x, y] = polar(R, a); return mk("circle", { cx: f1(x), cy: f1(y), r: 40, fill: BR.white, opacity: 0 }, $("joints")); });
    const sparks = makeSparks($("sparks"), 14, HIT + HS, 0, LY, R * LS + 30, 170, [BR.light, CREAM, ORANGE], 6);
    const W = $("waves");
    const waves = [makeWave(W, HIT + HS, 0, LY, R * LS, 780, 8, CREAM, 0.6), makeWave(W, HIT + HS + 0.06, 0, LY, R * LS, 660, 5, BR.light, 0.55)];
    const closeAt = (c: number) => Math.round(lerp(from, goal, c));
    const tickTimes: number[] = [];
    { let last = from; for (let t = 0.5; t <= 1.0; t += 0.002) { const v = closeAt(eInOut(seg(t, 0.5, 1.0))); if (v !== last) { tickTimes.push(t); last = v; } } }
    // A big gap (e.g. 0 to 45 min) would give a tick every few milliseconds: the number still counts every minute, the sounds / bumps / haptics use at most 8.
    const stepK = Math.max(1, Math.ceil(tickTimes.length / 8));
    const feel = tickTimes.filter((_, i) => i % stepK === stepK - 1 || i === tickTimes.length - 1);
    return {
      END: HIT + 0.7,
      haptics: [...feel.map((t): [number, number] => [10, t]), [18, FUSE], [40, HIT]],
      audio(base, S) {
        const { swell, wood, lockClick, bell, roll, kick } = S;
        swell(base + 0.45, 0.55, 0.35);
        feel.forEach((t, k) => wood(base + t, 0.35 + k * 0.06, 1500 + k * 120));
        lockClick(base + FUSE, 0.6); bell(base + FUSE, 0.25, 2093, 0.5);
        roll(base + 1.06, base + 1.33, 0.04, 0.3);
        kick(base + HIT, 0.75); bell(base + HIT, 0.9, 523.25, 2.0); bell(base + HIT + 0.02, 0.45, 784, 1.6);
        bell(base + HIT + 0.2, 0.12, 3136, 0.7);
      },
      render(t) {
        const u = t - HIT - HS, idle = seg(t, HIT + 0.4, HIT + 1.2);
        const c = eInOut(seg(t, 0.5, FUSE));
        const before = t < HIT;
        segEls.forEach((e, i) => {
          const p = eOutCubic(seg(t, 0.02 + i * 0.06, 0.3 + i * 0.06));
          e.p.setAttribute("d", arc(R, e.s.a0 + e.o[0] * c, e.s.a1 + e.o[1] * c));
          e.p.style.strokeDashoffset = String(1 - p);
          e.p.setAttribute("opacity", String(p > 0.001 && before ? 1 : 0));
        });
        // orange floods round the closed ring from the orange slice
        const fp = seg(t, FUSE + 0.02, HIT);
        if (fp > 0 && before) { const d = Math.max(0.5, 180 * eInOutQuad(fp)); E.flood.setAttribute("d", arc(R, 320.5 - d, 320.5 + d)); E.flood.setAttribute("opacity", "1"); }
        else E.flood.setAttribute("opacity", "0");
        const stop = t >= HIT && t < HIT + HS;
        E.full.setAttribute("opacity", before ? "0" : "1");
        E.full.setAttribute("stroke", stop ? "#fff3e6" : "url(#cel-ofill)");
        E.ringGlow.setAttribute("opacity", f3(before ? 0.4 * fp : 0.45 + 0.55 * Math.exp(-4 * Math.max(u, 0)) + 0.07 * Math.sin(t * 2.4) * idle));
        const ep = eOutCubic(seg(t, HIT + 0.1, HIT + 0.6));
        E.edge.style.strokeDashoffset = String(1 - ep); E.edge.setAttribute("opacity", String(ep > 0 ? 0.5 : 0));
        joints.forEach((j) => { const p = seg(t, FUSE, FUSE + 0.28); j.setAttribute("opacity", p > 0 && p < 1 ? f3(1 - p) : "0"); j.setAttribute("r", f1(40 * lerp(0.5, 1.5, eOutCubic(p)))); });
        let rs: number;
        if (t < FUSE) rs = 1 - 0.035 * eInCubic(seg(t, 0.6, FUSE));
        else if (t < HIT) rs = 1 - 0.035 * decayOsc(t - FUSE, 22, 9);
        else if (t < HIT + HS) rs = 0.97;
        else rs = 1 - 0.03 * decayOsc(u, 20, 7);
        rs *= 1 + 0.006 * Math.sin(t * 2.4) * idle;
        E.ringG.setAttribute("transform", `scale(${rs.toFixed(4)})`);
        // sticks: same moves as the kids version, a bit tighter
        STICKS.forEach((k, i) => {
          const ip = seg(t, 0.08 + i * 0.06, 0.45 + i * 0.06), s = 900 * (1 - eOutBack(ip, 1.3));
          let rot: number, pull: number;
          if (t < 1.33) { const w = eOutCubic(seg(t, 1.08, 1.33)); rot = -14 * w; pull = -30 * w; }
          else if (t < HIT) { const q = seg(t, 1.33, HIT); rot = lerp(-14, 5, q * q); pull = lerp(-30, 8, q * q); }
          else if (t < HIT + HS) { rot = 5; pull = 8; }
          else { rot = 5 * decayOsc(u, 22, 9); pull = 8 * Math.exp(-12 * u); }
          rot += Math.sin(t * 2.4 + i * 1.3) * 1.6 * idle;
          const a = rad(k.ang), off = pull - s;
          stickEls[i].setAttribute("transform", `translate(${f1(k.bx + Math.cos(a) * off)} ${f1(k.by + Math.sin(a) * off)}) rotate(${f3(k.ang + rot)})`);
          stickEls[i].setAttribute("opacity", String(ip > 0 ? 1 : 0));
        });
        const val = t < 0.5 ? from : closeAt(c);
        if (E.num.textContent !== String(val)) E.num.textContent = String(val);
        const nIn = seg(t, 0.25, 0.45);
        let ns = 1 + 0.12 * bump(u, 0.06) + 0.01 * Math.sin(t * 2.2) * idle;
        feel.forEach((tk) => { if (t >= tk) ns *= 1 + 0.04 * Math.exp(-16 * (t - tk)); });
        const nT = `translate(0 ${f1(lerp(26, 0, eOutCubic(nIn)))}) translate(0 280) scale(${f3(ns)}) translate(0 -280)`;
        E.num.setAttribute("transform", nT); E.numGlow.setAttribute("transform", nT);
        E.num.setAttribute("opacity", f3(nIn));
        E.numGlow.setAttribute("opacity", f3(before ? 0 : 0.3 + 0.55 * Math.exp(-4 * Math.max(u, 0))));
        E.unit.setAttribute("opacity", f3(seg(t, 0.3, 0.5)));
        const tp = seg(t, HIT + 0.1, HIT + 0.45);
        E.title.setAttribute("opacity", f3(tp)); E.title.setAttribute("transform", `translate(0 ${f1(lerp(30, 0, eOutCubic(tp)))})`);
        E.aGlow.setAttribute("opacity", f3(before ? 0.15 * seg(t, 0.3, 0.8) + 0.3 * fp : 0.45 + 0.55 * Math.exp(-3 * Math.max(u, 0))));
        drawSparks(sparks, t); waves.forEach((w) => drawWave(w, t));
        glint(lerp(-0.2, 1.2, seg(t, HIT + 0.15, HIT + 0.85)));
        let fl = 0; if (t >= HIT) fl = t < HIT + HS ? 0.1 : 0.1 * Math.exp(-14 * u);
        setFlash(fl, BR.light);
        shake(E.root, [[t - HIT, 6]]);
      },
    };
  },
};
