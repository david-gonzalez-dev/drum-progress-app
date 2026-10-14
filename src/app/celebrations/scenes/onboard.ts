// POLISH 4: Onboarding finished, "You're ready". The logo forms, both sticks twirl over a short roll, and the catch lands the message.
// Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, ORANGE, R, bump, decayOsc, drawSparks, drawWave, eInOut, eOutCubic, f1, f3, fadeUp, lerp, logoRig, makeSparks, makeWave, poseStick, revealSeg, seg, springTo, txt } from "../core";
import type { SceneDef } from "../core";

export type OnboardCfg = { title: string; sub: string; cont: string };

export const onboardScene: SceneDef<OnboardCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, shake } = env;
    const LY = -280, LS = 0.6, HIT = 0.34, HS = 0.03, TW = [0.62, 0.68], TWD = 0.56, CATCH = TW[1] + TWD;
    $("stage").innerHTML = `<g id="root">
    <circle id="aGlow" cx="0" cy="${LY}" r="650" fill="url(#cel-aglow)" opacity="0"/>
    <g id="waves"></g><g id="sparks"></g>
    <g id="logo"></g>
    ${txt(0, 300, 76, 800, CREAM, "", `id="title" text-anchor="middle" letter-spacing="-1" opacity="0"`)}
    ${txt(0, 378, 38, 600, CREAM, "", `id="sub" text-anchor="middle" opacity="0"`)}
  </g>`;
    $("title").textContent = cfg.title; $("sub").textContent = cfg.sub;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "logo", "title", "sub"].forEach((id) => (E[id] = $(id)));
    const rig = logoRig(E.logo, "cel-ob");
    const sparks = makeSparks($("sparks"), 14, CATCH, 0, LY, R * LS + 24, 170, [BR.light, CREAM, ORANGE], 6);
    const W = $("waves");
    const waves = [makeWave(W, CATCH, 0, LY, R * LS, 720, 7, BR.light, 0.6), makeWave(W, CATCH + 0.06, 0, LY, R * LS, 560, 3, CREAM, 0.55)];
    return {
      END: CATCH + 0.5, cont: cfg.cont,
      haptics: [[20, HIT], [40, CATCH]],
      audio(b, S) {
        const { wood, roll, whoosh, kick, crash, ting, bell } = S;
        wood(b + HIT, 0.6, 1500); roll(b + 0.74, b + CATCH - 0.03, 0.04, 0.38);
        TW.forEach((tw) => whoosh(b + tw, TWD * 0.9, 0.18));
        kick(b + CATCH, 0.8); crash(b + CATCH, 0.45, 1.6); wood(b + CATCH, 0.8); ting(b + CATCH + 0.05, 0.7, 1318.5); bell(b + CATCH + 0.3, 0.12, 3136, 0.7);
      },
      render(t) {
        const idle = seg(t, CATCH + 0.3, CATCH + 1.1), stop = t >= HIT && t < HIT + HS;
        E.logo.setAttribute("transform", `translate(0 ${f1(LY + Math.sin(t * 1.7) * 6 * idle)}) scale(${f3(LS * (1 + 0.06 * bump(t - CATCH, 0.06)))})`);
        rig.sticks.forEach((s, i) => {
          const ip = eOutCubic(seg(t, i * 0.04, 0.24 + i * 0.04));
          let rot: number; if (t < 0.24) rot = -20; else if (t < HIT) rot = lerp(-20, 3, Math.pow(seg(t, 0.24, HIT), 2)); else if (stop) rot = 3; else rot = 3 * decayOsc(t - HIT - HS, 22, 8);
          const p = seg(t, TW[i], TW[i] + TWD), tw = 360 * eInOut(p) * (i ? -1 : 1), hop = -200 * Math.sin(Math.PI * p);
          const uc = t - (TW[i] + TWD); if (uc > 0) rot += 8 * Math.exp(-9 * uc) * Math.sin(24 * uc);
          rot += Math.sin(t * 2.4 + i * 1.3) * 1.6 * idle;
          poseStick(s, rot, -900 * (1 - ip), tw, hop);
          s.g.setAttribute("opacity", String(ip > 0 ? 1 : 0));
        });
        const pr = eOutCubic(seg(t, HIT + 0.02, 0.64));
        revealSeg(rig.segs[0], pr, false); revealSeg(rig.segs[2], pr, true); revealSeg(rig.segs[1], eOutCubic(seg(t, 0.5, 0.66)), false);
        rig.segs.forEach((e) => { const d = 50 * bump(t - CATCH, 0.07); e.g.setAttribute("transform", `translate(${f1(Math.cos(e.mid) * d)} ${f1(Math.sin(e.mid) * d)})`); });
        E.aGlow.setAttribute("opacity", f3(0.12 * seg(t, 0.2, 0.5) + (t > CATCH ? 0.2 + 0.5 * Math.exp(-3 * (t - CATCH)) : 0)));
        const tu = t - CATCH - 0.02, ts = lerp(1.3, 1, tu > 0 ? springTo(tu, 14, 8) : 0);
        E.title.setAttribute("opacity", f3(seg(t, CATCH + 0.02, CATCH + 0.1)));
        E.title.setAttribute("transform", `translate(0 276) scale(${f3(ts)}) translate(0 -276)`);
        const sp = seg(t, CATCH + 0.2, CATCH + 0.45); fadeUp(E.sub, sp, 22); E.sub.setAttribute("opacity", f3(0.55 * sp));
        drawSparks(sparks, t); waves.forEach((v) => drawWave(v, t));
        setFlash(t >= CATCH ? 0.1 * Math.exp(-14 * (t - CATCH)) : 0, BR.light);
        shake(E.root, [[t - CATCH, 8]]);
      },
    };
  },
};
