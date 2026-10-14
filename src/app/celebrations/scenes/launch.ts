// POLISH 1: App launch. The logo sticks strike and the ring draws out from the hit. Plays in the web view right after the native splash (plain black).
// Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, R, bump, decayOsc, drawWave, eOutCubic, f1, f3, fadeUp, logoRig, makeWave, poseStick, revealSeg, seg, txt } from "../core";
import type { SceneDef } from "../core";
import { KL } from "../logo-shapes";

export type LaunchCfg = { word: string };

export const launchScene: SceneDef<LaunchCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash } = env;
    const LY = -120, LS = 0.62, HIT = 0.4, HS = 0.03;
    $("stage").innerHTML = `<g id="root">
    <circle id="aGlow" cx="0" cy="${LY}" r="600" fill="url(#cel-aglow)" opacity="0"/>
    <g id="logo" transform="translate(0 ${LY}) scale(${LS})"></g>
    <g id="waves"></g>
    ${txt(0, 330, 92, 800, CREAM, "", `id="word" text-anchor="middle" letter-spacing="-2" opacity="0"`)}
  </g>`;
    $("word").textContent = cfg.word;
    const rig = logoRig($("logo"), "cel-la");
    const W = $("waves");
    const waves = [makeWave(W, HIT + HS, KL.S1.bx * LS, LY + KL.S1.by * LS, 20, 260, 6, BR.light, 0.5)];
    return {
      END: 1.25, noContinue: true,
      haptics: [[20, HIT]],
      audio(b, S) { S.rimshot(b + HIT, 0.5); S.bell(b + 0.8, 0.16, 1046.5, 0.9); },
      render(t) {
        const u = t - HIT - HS, stop = t >= HIT && t < HIT + HS;
        rig.sticks.forEach((s, i) => {
          const ip = eOutCubic(seg(t, i * 0.04, 0.26 + i * 0.04));
          let rot: number; if (t < 0.28) rot = -22; else if (t < HIT) rot = -22 + 25 * Math.pow(seg(t, 0.28, HIT), 2); else if (stop) rot = 3; else rot = 3 * decayOsc(u, 22, 8);
          poseStick(s, rot, -900 * (1 - ip));
          s.g.setAttribute("opacity", String(ip > 0 ? 1 : 0));
          (s.g.firstChild as Element).setAttribute("fill", stop ? BR.white : CREAM);
        });
        const pr = eOutCubic(seg(t, HIT + 0.02, 0.74));
        revealSeg(rig.segs[0], pr, false); revealSeg(rig.segs[2], pr, true); revealSeg(rig.segs[1], eOutCubic(seg(t, 0.6, 0.8)), false);
        const b = rig.segs[1], [mx, my] = [Math.cos(b.mid) * R, Math.sin(b.mid) * R], bs = 1 + 0.08 * bump(t - 0.8, 0.06);
        b.g.setAttribute("transform", `translate(${f1(mx)} ${f1(my)}) scale(${f3(bs)}) translate(${f1(-mx)} ${f1(-my)})`);
        $("aGlow").setAttribute("opacity", f3(0.12 * seg(t, 0.2, 0.5) + (t > 0.8 ? 0.45 * Math.exp(-3 * (t - 0.8)) : 0)));
        waves.forEach((v) => drawWave(v, t));
        fadeUp($("word"), seg(t, 0.82, 1.1), 24);
        setFlash(t >= HIT ? (stop ? 0.06 : 0.06 * Math.exp(-14 * u)) : 0, BR.light);
      },
    };
  },
};
