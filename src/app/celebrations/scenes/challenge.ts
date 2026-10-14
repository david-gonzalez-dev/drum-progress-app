// BIG 2: Challenge won, "The medal". A medal drops in on its ribbon and swings, the sticks strike it, it spins and lands face up showing the logo.
// Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, ORANGE, addStick, bump, decayOsc, drawSparks, drawWave, eInCubic, eOutBack, eOutCubic, f1, f3, fadeUp, lerp, makeRays, makeSparks, makeWave, mk, rad, seg, txt } from "../core";
import type { SceneDef } from "../core";
import { KL } from "../logo-shapes";

export type ChallengeCfg = { title: string; sub: string; sub2?: string };

export const challengeScene: SceneDef<ChallengeCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, glint, shake } = env;
    const MY = -150, RM = 210, HIT = 1.0, HS = 0.035, LAND = 1.65, BOT = MY - RM + 6;
    $("stage").innerHTML = `<g id="root">
    <defs><linearGradient id="cel-ribG" gradientUnits="userSpaceOnUse" x1="0" y1="-1000" x2="0" y2="${BOT}"><stop offset="0" stop-color="${BR.light}"/><stop offset="1" stop-color="${ORANGE}"/></linearGradient></defs>
    <circle id="aGlow" cx="0" cy="${MY}" r="720" fill="url(#cel-aglow)" opacity="0"/>
    <g id="raysW" transform="translate(0 ${MY})" opacity="0"><g id="rays"></g></g>
    <g id="waves"></g>
    <g id="hang">
      <path d="M130 -1000 L250 -1000 L64 ${BOT} L-56 ${BOT} Z" fill="#c4500d"/>
      <path d="M190 -1000 L4 ${BOT}" stroke="${BR.light}" stroke-width="12" opacity=".5"/>
      <path d="M-250 -1000 L-130 -1000 L56 ${BOT} L-64 ${BOT} Z" fill="url(#cel-ribG)"/>
      <path d="M-190 -1000 L-4 ${BOT}" stroke="${CREAM}" stroke-width="12" opacity=".5"/>
      <circle cx="0" cy="${MY - RM - 14}" r="30" fill="none" stroke="url(#cel-metal)" stroke-width="12"/>
      <g id="medal">
        <circle id="edge" r="${RM}" fill="#7d6e61"/>
        <g id="back"><circle r="${RM}" fill="url(#cel-metal)"/><circle r="${RM - 28}" fill="none" stroke="#bfae9c" stroke-width="5"/><circle r="${RM - 70}" fill="none" stroke="#cdbcaa" stroke-width="2"/></g>
        <g id="front" opacity="0"><circle r="${RM}" fill="#151716"/><circle r="${RM - 12}" fill="none" stroke="url(#cel-ofill)" stroke-width="22"/><g id="emb" transform="scale(.36)"></g></g>
      </g>
    </g>
    <g id="sparks"></g>
    <g id="stick0"></g><g id="stick1"></g>
    ${txt(0, 420, 66, 800, CREAM, "", `id="title" text-anchor="middle" letter-spacing="-1" opacity="0"`)}
    ${txt(0, 494, 38, 600, CREAM, "", `id="sub" text-anchor="middle" opacity="0"`)}
    ${txt(0, 552, 32, 600, BR.light, "", `id="sub2" text-anchor="middle" opacity="0"`)}
  </g>`;
    $("title").textContent = cfg.title; $("sub").textContent = cfg.sub; $("sub2").textContent = cfg.sub2 ?? "";
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "raysW", "rays", "hang", "medal", "edge", "back", "front", "title", "sub", "sub2"].forEach((id) => (E[id] = $(id)));
    makeRays(E.rays, 16);
    const emb = $("emb");
    ([["A", "url(#cel-metal)"], ["B", ORANGE], ["C", "url(#cel-metal)"]] as [keyof typeof KL, string][]).forEach(([k, f]) => mk("path", { d: (KL[k] as { d: string }).d, fill: f }, emb));
    [KL.S2, KL.S1].forEach((k) => { const g = mk("g", { transform: `translate(${k.bx} ${k.by}) rotate(${k.ang})` }, emb); mk("path", { d: k.d, fill: "url(#cel-metal)" }, g); });
    const C = [[-148, MY + 148], [148, MY + 148]];
    const STK = C.map(([cx, cy], i) => { const bx = i ? 470 : -470, by = MY + 500, ang = (Math.atan2(cy - by, cx - bx) * 180) / Math.PI; return { bx, by, ang, m: i ? -1 : 1, L: Math.hypot(cx - bx, cy - by) - 9 }; });
    const stickEls = STK.map((k, i) => { const g = $("stick" + i); addStick(g, k.L, "url(#cel-metal)", 20); return g; });
    const sparks = [...makeSparks($("sparks"), 6, HIT + HS, C[0][0], C[0][1], 10, 130, [BR.light, CREAM], 5, [100, 250]), ...makeSparks($("sparks"), 6, HIT + HS, C[1][0], C[1][1], 10, 130, [BR.light, CREAM], 5, [-70, 80])];
    const W = $("waves");
    const waves = [makeWave(W, LAND, 0, MY, RM, 720, 9, ORANGE, 0.7), makeWave(W, LAND + 0.06, 0, MY, RM, 560, 4, CREAM, 0.6)];
    return {
      END: LAND + 0.7,
      haptics: [[40, HIT], [45, LAND]],
      audio(b, S) {
        const { whoosh, bell, roll, kick, rimshot, crash, ting } = S;
        whoosh(b + 0.05, 0.4, 0.12); bell(b + 0.48, 0.22, 2637, 0.5);
        roll(b + 0.6, b + 0.98, 0.05, 0.4);
        kick(b + HIT, 0.65); rimshot(b + HIT, 0.85); bell(b + HIT + 0.01, 0.3, 1760, 1.0); whoosh(b + HIT + 0.03, 0.55, 0.18);
        kick(b + LAND, 0.6); crash(b + LAND, 0.6, 2.2);
        bell(b + LAND, 0.7, 523.25, 2.0); bell(b + LAND + 0.02, 0.45, 659.3, 1.8); bell(b + LAND + 0.04, 0.4, 784, 1.6); ting(b + LAND + 0.08, 0.55, 1568);
      },
      render(t) {
        const u = t - HIT - HS, idle = seg(t, LAND + 0.4, LAND + 1.2), stop = t >= HIT && t < HIT + HS;
        // drop in on the ribbon, swing like a pendulum, a little hop when struck
        const dy = -900 * (1 - eOutBack(seg(t, 0.05, 0.5), 1.3)) - 14 * bump(u, 0.05);
        const rot = t > 0.05 ? 12 * decayOsc(t - 0.05, 7, 2.6) + 0.6 * Math.sin(t * 1.3) * idle : 12;
        E.hang.setAttribute("transform", `rotate(${f3(rot)} 0 -1000) translate(0 ${f1(dy)})`);
        // the spin: 1.5 turns, ending face up
        const a = 540 * eOutBack(seg(t, HIT + HS, LAND), 1.1), c = Math.cos(rad(a)), sx = Math.max(Math.abs(c), 0.015);
        E.medal.setAttribute("transform", `translate(0 ${MY})`);
        E.back.setAttribute("transform", `scale(${f3(sx)} 1)`); E.front.setAttribute("transform", `scale(${f3(sx)} 1)`);
        E.back.setAttribute("opacity", String(c >= 0 ? 1 : 0)); E.front.setAttribute("opacity", String(c < 0 ? 1 : 0));
        E.edge.setAttribute("transform", `translate(${f1(10 * Math.sin(rad(a)))} 0) scale(${f3(sx)} 1)`);
        (E.back.firstChild as Element).setAttribute("fill", stop ? BR.white : "url(#cel-metal)");
        STK.forEach((k, i) => {
          const ip = eOutCubic(seg(t, 0.5 + i * 0.04, 0.75 + i * 0.04));
          let Rr: number;
          if (t < 0.75) Rr = 8; else if (t < 0.96) Rr = lerp(8, 22, eOutCubic(seg(t, 0.75, 0.96)));
          else if (t < HIT) Rr = lerp(22, -3, Math.pow(seg(t, 0.96, HIT), 2)); else if (stop) Rr = -3;
          else Rr = -3 * decayOsc(u, 22, 8) + 12 * eOutCubic(seg(t, HIT + 0.05, HIT + 0.25));
          const dr = eInCubic(seg(t, HIT + 0.25, HIT + 0.55));
          const ar = rad(k.ang), off = -700 * (1 - ip);
          stickEls[i].setAttribute("transform", `translate(${f1(k.bx + Math.cos(ar) * off)} ${f1(k.by + Math.sin(ar) * off + 650 * dr)}) rotate(${f3(k.ang + k.m * Rr)})`);
          stickEls[i].setAttribute("opacity", String(ip > 0 && dr < 1 ? 1 : 0));
        });
        E.raysW.setAttribute("opacity", f3(0.08 * seg(t, LAND - 0.05, LAND + 0.35)));
        E.rays.setAttribute("transform", `rotate(${f1(t * 6)})`);
        E.aGlow.setAttribute("opacity", f3(t < LAND ? 0.15 * seg(t, 0.3, 0.9) : 0.35 + 0.6 * Math.exp(-3 * (t - LAND))));
        drawSparks(sparks, t); waves.forEach((v) => drawWave(v, t));
        fadeUp(E.title, seg(t, LAND + 0.05, LAND + 0.4), 30);
        const s1 = seg(t, LAND + 0.17, LAND + 0.5), s2 = seg(t, LAND + 0.27, LAND + 0.6);
        fadeUp(E.sub, s1, 24); E.sub.setAttribute("opacity", f3(0.6 * s1));
        fadeUp(E.sub2, s2, 20); E.sub2.setAttribute("opacity", f3(0.85 * s2));
        glint(lerp(-0.2, 1.2, seg(t, LAND + 0.05, LAND + 0.7)));
        let fl = 0; if (t >= HIT) fl += stop ? 0.06 : 0.06 * Math.exp(-14 * u); if (t >= LAND) fl += 0.1 * Math.exp(-12 * (t - LAND));
        setFlash(fl, BR.light);
        shake(E.root, [[t - HIT, 8], [t - LAND, 6]]);
      },
    };
  },
};
