// ADULT 1: Tempo unlocked, "The dial". Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, MAN, ORANGE, addStick, arc, bump, decayOsc, drawSparks, drawWave, eInCubic, eOutBack, eOutCubic, f1, f3, lerp, makeSparks, makeWave, mk, polar, rad, seg, springTo } from "../core";
import type { SceneDef } from "../core";

export type TempoCfg = {
  name: string;       // rudiment name, already upper case
  from: number;       // previous unlocked BPM (or the ladder minimum)
  to: number;         // the BPM that just unlocked
  min: number; max: number; step: number; // dial range and tick spacing
  tickValues?: number[]; // the BPMs that get a tick (the app passes real ladder rungs, which are not evenly spaced); default: min to max in `step`s
  title: string;      // "Tempo unlocked"
  sub: string;        // "Next up: 110 BPM"
  bpm: string;        // "BPM"
};

export const tempoScene: SceneDef<TempoCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, glint, shake } = env;
    const { from, to, min, max, step, name } = cfg;
    const CY = -210, RR = 330, TW = 26, HIT = 0.85, HS = 0.035;
    const ang = (v: number) => 135 + (270 * (v - min)) / (max - min);
    // long rudiment names shrink to stay inside the dial (the reference name is short)
    const nameSize = Math.min(40, Math.max(20, (500 / Math.max(name.length, 1) - 9) / 0.66));
    const nameSpacing = nameSize < 40 ? Math.max(3, 9 * (nameSize / 40)) : 9;
    $("stage").innerHTML = `<g id="root">
    <circle id="aGlow" cx="0" cy="${CY}" r="620" fill="url(#cel-aglow)" opacity="0"/>
    <g id="dial">
      <path id="edgeO" d="${arc(RR + 38, 135, 405)}" fill="none" stroke="url(#cel-metal)" stroke-width="3" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1"/>
      <path id="track" d="${arc(RR, 135, 405)}" fill="none" stroke="#221f1d" stroke-width="${TW}" stroke-linecap="round" pathLength="1" stroke-dasharray="1 1"/>
      <g id="ticks"></g>
      <path id="fillGlow" fill="none" stroke="${ORANGE}" stroke-width="${TW + 14}" stroke-linecap="round" filter="url(#cel-blur18)" opacity="0"/>
      <path id="fill" fill="none" stroke="url(#cel-ofill)" stroke-width="${TW}" stroke-linecap="round" opacity="0"/>
      <circle id="knobGlow" r="50" fill="${ORANGE}" filter="url(#cel-blur18)" opacity="0"/>
      <circle id="knob" r="16" fill="${CREAM}" opacity="0"/>
      <g id="lock" opacity="0">
        <g id="lockIn">
          <path id="shackle" d="M-15 0 V-22 A15 15 0 0 1 15 -22 V0" fill="none" stroke="url(#cel-metal)" stroke-width="9" stroke-linecap="round"/>
          <rect id="lockBody" x="-27" y="-6" width="54" height="44" rx="11" fill="url(#cel-metal)"/>
          <circle cx="0" cy="12" r="6" fill="#151817"/><rect x="-2.5" y="13" width="5" height="13" rx="2.5" fill="#151817"/>
        </g>
      </g>
      <text id="rname" x="0" y="-128" text-anchor="middle" font-family="${MAN}" font-weight="700" font-size="${f1(nameSize)}" letter-spacing="${f1(nameSpacing)}" fill="${CREAM}" opacity="0"></text>
      <text id="numGlow" x="0" y="72" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="230" letter-spacing="-8" fill="${ORANGE}" filter="url(#cel-blur18)" opacity="0">${from}</text>
      <text id="num" x="0" y="72" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="230" letter-spacing="-8" fill="${CREAM}" opacity="0">${from}</text>
      <text id="bpm" x="0" y="142" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="38" letter-spacing="12" fill="${BR.light}" opacity="0"></text>
    </g>
    <g id="sparks"></g><g id="waves"></g>
    <g id="stick"></g>
    <text id="title" x="0" y="400" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="68" letter-spacing="-1" fill="${CREAM}" opacity="0"></text>
    <text id="sub" x="0" y="476" text-anchor="middle" font-family="${MAN}" font-weight="600" font-size="38" fill="${CREAM}" opacity="0"></text>
  </g>`;
    $("rname").textContent = name; $("bpm").textContent = cfg.bpm; $("title").textContent = cfg.title; $("sub").textContent = cfg.sub;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "dial", "edgeO", "track", "fillGlow", "fill", "knobGlow", "knob", "lock", "lockIn", "shackle", "lockBody", "rname", "numGlow", "num", "bpm", "title", "sub", "stick"].forEach((id) => (E[id] = $(id)));
    const ticks: { v: number; el: SVGElement }[] = [];
    const tickVals: number[] = cfg.tickValues ?? []; if (!cfg.tickValues) for (let v = min; v <= max; v += step) tickVals.push(v);
    for (const v of tickVals) {
      const a = ang(v), [x1, y1] = polar(RR - 58, a), [x2, y2] = polar(RR - 40, a);
      ticks.push({ v, el: mk("line", { x1: f1(x1), y1: f1(y1), x2: f1(x2), y2: f1(y2), "stroke-width": 6, "stroke-linecap": "round", stroke: v <= from ? BR.light : BR.dim, opacity: 0 }, $("ticks")) });
    }
    const lockA = ang(to), [lx, ly] = polar(RR, lockA);
    E.lock.setAttribute("transform", `translate(${f1(lx)} ${f1(ly)})`);
    const out = [Math.cos(rad(lockA)), Math.sin(rad(lockA))];
    // one stick strikes the lock from above
    const tip = [lx, CY + ly - 36], butt = [tip[0] + 190, tip[1] - 390];
    const SA = (Math.atan2(tip[1] - butt[1], tip[0] - butt[0]) * 180) / Math.PI;
    const SL = Math.hypot(tip[0] - butt[0], tip[1] - butt[1]) - 9;
    addStick(E.stick, SL, "url(#cel-metal)", 18);
    const sparks = makeSparks($("sparks"), 10, HIT + HS, lx, CY + ly, 36, 170, [BR.light, CREAM, ORANGE], 6);
    const W = $("waves");
    const waves = [makeWave(W, HIT + HS, lx, CY + ly, 30, 250, 8, BR.light, 0.5), makeWave(W, HIT + HS + 0.05, 0, CY, RR + 38, RR + 190, 3, CREAM, 0.6)];
    return {
      END: HIT + 0.95,
      haptics: [[35, HIT]],
      audio(base, S) {
        const { roll, rimshot, kick, lockClick, ting, bell } = S;
        roll(base + 0.5, base + 0.84, 0.05, 0.4);
        rimshot(base + HIT, 0.9); kick(base + HIT, 0.5);
        lockClick(base + HIT + 0.05, 0.8);
        ting(base + HIT + 0.09, 0.6, 1318.5);
        bell(base + HIT + 0.35, 0.12, 3136, 0.8);
      },
      render(t) {
        const u = t - HIT - HS, idle = seg(t, HIT + 0.6, HIT + 1.4);
        const dp = eOutCubic(seg(t, 0, 0.42));
        [E.track, E.edgeO].forEach((el) => { el.style.strokeDashoffset = String(1 - dp); el.setAttribute("opacity", String(dp > 0.001 ? (el === E.edgeO ? 0.5 : 1) : 0)); });
        ticks.forEach((tk, i) => {
          const p = seg(t, 0.1 + i * 0.025, 0.3 + i * 0.025);
          let op = p * (tk.v <= from ? 0.9 : 0.8), w = 6;
          if (tk.v === to && t >= HIT) { tk.el.setAttribute("stroke", ORANGE); op = 1; w = 6 + 5 * bump(u, 0.06); }
          else tk.el.setAttribute("stroke", tk.v <= from ? BR.light : BR.dim);
          tk.el.setAttribute("opacity", f3(op)); tk.el.setAttribute("stroke-width", f1(w));
        });
        let v: number;
        if (t < 0.1) v = min; else if (t < 0.42) v = lerp(min, from, eOutCubic(seg(t, 0.1, 0.42)));
        else if (t < 0.48) v = from; else if (t < HIT) v = lerp(from, to, Math.pow(seg(t, 0.48, HIT), 2.2)); else v = to;
        const a = ang(v);
        if (a - 135 > 0.6) { const d = arc(RR, 135, a); E.fill.setAttribute("d", d); E.fillGlow.setAttribute("d", d); E.fill.setAttribute("opacity", "1"); }
        else E.fill.setAttribute("opacity", "0");
        E.fillGlow.setAttribute("opacity", f3(t < HIT ? 0.3 * seg(t, 0.1, 0.4) : 0.3 + 0.6 * Math.exp(-4 * Math.max(u, 0))));
        const [kx, ky] = polar(RR, a);
        E.knob.setAttribute("cx", f1(kx)); E.knob.setAttribute("cy", f1(ky));
        E.knob.setAttribute("opacity", f3(seg(t, 0.1, 0.2)));
        E.knob.setAttribute("r", f1(16 * (1 + 0.5 * bump(u - 0.12, 0.08))));
        E.knobGlow.setAttribute("cx", f1(kx)); E.knobGlow.setAttribute("cy", f1(ky));
        E.knobGlow.setAttribute("opacity", f3(t < HIT ? 0.3 * seg(t, 0.1, 0.3) : 0.35 + 0.65 * Math.exp(-3.5 * Math.max(u, 0)) + 0.08 * Math.sin(t * 2.4) * idle));
        // lock: pops in, flashes, shackle springs open, then floats away
        const lp = eOutBack(seg(t, 0.25, 0.45), 2.2);
        let ls = lp * (1 + 0.22 * bump(u, 0.05)), lo = seg(t, 0.25, 0.3), dx = 0, dy = 0;
        const fly = eInCubic(seg(t, HIT + 0.32, HIT + 0.62));
        dx = out[0] * 80 * fly; dy = out[1] * 80 * fly - 50 * fly; ls *= 1 - 0.35 * fly; lo *= 1 - fly;
        E.lockIn.setAttribute("transform", `translate(${f1(dx)} ${f1(dy)}) scale(${f3(ls)})`);
        E.lock.setAttribute("opacity", f3(lo));
        const open = u > 0 ? springTo(u, 18, 9) : 0;
        E.shackle.setAttribute("transform", `translate(0 ${f1(-16 * open)}) rotate(${f1(-38 * open)} 15 0)`);
        const stop = t >= HIT && t < HIT + HS;
        E.lockBody.setAttribute("fill", stop ? BR.white : "url(#cel-metal)");
        E.shackle.setAttribute("stroke", stop ? BR.white : "url(#cel-metal)");
        // number counts with the sweep, then pops
        const nIn = seg(t, 0.18, 0.38);
        const val = t < 0.48 ? from : (t < HIT ? Math.round(v) : to);
        if (E.num.textContent !== String(val)) { E.num.textContent = String(val); E.numGlow.textContent = String(val); }
        const ns = 1 + 0.13 * bump(u, 0.06) + 0.01 * Math.sin(t * 2.2) * idle;
        const nT = `translate(0 ${f1(lerp(26, 0, eOutCubic(nIn)))}) translate(0 20) scale(${f3(ns)}) translate(0 -20)`;
        E.num.setAttribute("transform", nT); E.numGlow.setAttribute("transform", nT);
        E.num.setAttribute("opacity", f3(nIn));
        E.numGlow.setAttribute("opacity", f3(t < HIT ? 0 : 0.3 + 0.55 * Math.exp(-4 * Math.max(u, 0))));
        E.rname.setAttribute("opacity", f3(0.55 * seg(t, 0.25, 0.42)));
        E.bpm.setAttribute("opacity", f3(seg(t, 0.28, 0.45)));
        // dial: tiny squeeze before, springy ring after
        let ds = 1 - 0.012 * eInCubic(seg(t, 0.6, HIT));
        if (u > 0) ds = 1 + 0.022 * Math.exp(-6 * u) * Math.sin(24 * u);
        E.dial.setAttribute("transform", `translate(0 ${CY}) scale(${ds.toFixed(4)})`);
        E.aGlow.setAttribute("opacity", f3(t < HIT ? 0.35 * seg(t, 0.1, 0.6) : 0.5 + 0.5 * Math.exp(-3 * Math.max(u, 0))));
        // stick: enters, winds up, strikes the lock, bounces back, leaves
        const ip = seg(t, 0.28, 0.55), s = 800 * (1 - eOutBack(ip, 1.3));
        let rot: number;
        if (t < 0.55) rot = 10;
        else if (t < 0.82) rot = lerp(10, 26, eOutCubic(seg(t, 0.55, 0.82)));
        else if (t < HIT) rot = lerp(26, -3, Math.pow(seg(t, 0.82, HIT), 2));
        else if (t < HIT + HS) rot = -3;
        else rot = -3 * decayOsc(u, 22, 8) + 14 * eOutCubic(seg(t, HIT + 0.05, HIT + 0.3));
        const ex = eInCubic(seg(t, HIT + 0.3, HIT + 0.6)), off = -s - 800 * ex;
        const sa = rad(SA);
        E.stick.setAttribute("transform", `translate(${f1(butt[0] + Math.cos(sa) * off)} ${f1(butt[1] + Math.sin(sa) * off)}) rotate(${f3(SA + rot)})`);
        E.stick.setAttribute("opacity", String(ip > 0 && ex < 1 ? 1 : 0));
        drawSparks(sparks, t); waves.forEach((w) => drawWave(w, t));
        const tp = seg(t, HIT + 0.1, HIT + 0.45), sp = seg(t, HIT + 0.22, HIT + 0.55);
        E.title.setAttribute("opacity", f3(tp)); E.title.setAttribute("transform", `translate(0 ${f1(lerp(30, 0, eOutCubic(tp)))})`);
        E.sub.setAttribute("opacity", f3(0.55 * sp)); E.sub.setAttribute("transform", `translate(0 ${f1(lerp(24, 0, eOutCubic(sp)))})`);
        glint(lerp(-0.2, 1.2, seg(t, HIT + 0.2, HIT + 0.85)));
        let fl = 0; if (t >= HIT) fl = t < HIT + HS ? 0.1 : 0.1 * Math.exp(-14 * u);
        setFlash(fl, BR.light);
        shake(E.root, [[t - HIT, 7]]);
      },
    };
  },
};
