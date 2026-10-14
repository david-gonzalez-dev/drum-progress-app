// SMALL: Rating improved (adult `rated`, kids `ratedKids`). Plays after Save on the rating sheet when the new rating beats the best rating before at the same exercise
// and tempo, and no new tempo unlocks. A marker climbs the rating ladder from the old rating to the new one, taking on each colour, and lands with one clear hit and a chime.
// No snare roll (small tier). Ported from the approved reference; every timing, curve and sound is unchanged.
import { BR, CREAM, KIDS_FONT, MAN, ORANGE, addStick, arc, bump, clamp, decayOsc, drawSparks, drawWave, eInCubic, eInOut, eOutBack, eOutCubic, f1, f3, fadeUp, lerp, makeSparks, makeWave, mk, polar, poseStick, rad, seg, springTo } from "../core";
import type { SceneDef } from "../core";
import { KL } from "../logo-shapes";

export type RatedCfg = {
  kids: boolean;
  from: number; to: number;       // rating index 0 (Not ready) to 4 (Mastered)
  days: number;                   // whole days since the old best (0 = same day)
  exercise: string; bpm: number;
  labels: string[];               // the 5 rating names, already translated
  title: string;                  // "Rating improved" / "Getting better!"
  words: { a: string; b: string; today: string; before: string; day: string; days: string }; // "From" "to" "today" "in" "day" "days"
};

const RCOL = ["#E5484D", "#F0883E", "#F2D24B", "#46C37B", "#F5C542"];
const RATING_PITCH = [987.8, 1046.5, 1174.7, 1318.5, 1568];
const DMS = MAN, BAR = KIDS_FONT;
function starPath(r: number, ri = r * 0.46) { let d = ""; for (let i = 0; i < 10; i++) { const [x, y] = polar(i % 2 ? ri : r, -90 + i * 36); d += (i ? "L" : "M") + f1(x) + " " + f1(y) + " "; } return d + "Z"; }
function mixHex(a: string, b: string, p: number) { const A = [1, 3, 5].map((i) => parseInt(a.substr(i, 2), 16)), B = [1, 3, 5].map((i) => parseInt(b.substr(i, 2), 16)); return "#" + A.map((v, i) => Math.round(lerp(v, B[i], p)).toString(16).padStart(2, "0")).join(""); }
function ratingColorAt(lv: number) { lv = clamp(lv, 0, 4); const i = Math.min(3, Math.floor(lv)); return mixHex(RCOL[i], RCOL[i + 1], lv - i); }
// where the marker is on the ladder (as a float level) and how stretched it is
function climb(t: number, from: number, k: number, H0: number, HD: number) {
  let lv = from, st = 0;
  for (let j = 0; j < k; j++) {
    const p = seg(t, H0 + j * HD, H0 + (j + 1) * HD);
    if (p <= 0) break;
    lv = from + j + (j === k - 1 ? eOutBack(p, 1.5) : eInOut(p));
    if (p < 1) { st = Math.sin(Math.PI * p); break; }
  }
  return { lv, st };
}
function ratingSub(cfg: RatedCfg, numFont: string) {
  const W = cfg.words, d = cfg.days;
  const dd = d === 0 ? W.today : `${W.before} <tspan font-family="${numFont}" font-weight="700">${d}</tspan> ${d === 1 ? W.day : W.days}`;
  return `${W.a} <tspan fill="${RCOL[cfg.from]}">${cfg.labels[cfg.from]}</tspan> ${W.b} <tspan fill="${RCOL[cfg.to]}" font-weight="700">${cfg.labels[cfg.to]}</tspan> ${dd}`;
}

export const ratedScene: SceneDef<RatedCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, glint, shake } = env;
    const from = cfg.from, to = cfg.to, k = Math.max(1, to - from);
    const RY = (i: number) => 10 - i * 120, DX = 140, H0 = 0.45, HD = k === 1 ? 0.28 : Math.min(0.2, 0.6 / k), L = H0 + k * HD, HS = 0.03;
    const newC = RCOL[to];
    $("stage").innerHTML = `<g id="root">
    <defs><radialGradient id="cel-rglow"><stop offset="0" stop-color="${newC}" stop-opacity=".4"/><stop offset="1" stop-color="${newC}" stop-opacity="0"/></radialGradient></defs>
    <circle id="cGlow" cx="${DX}" cy="${RY(to)}" r="300" fill="url(#cel-rglow)" opacity="0"/>
    <text id="meta" x="0" y="-690" text-anchor="middle" font-family="${DMS}" font-weight="600" font-size="36" fill="${CREAM}" opacity="0"></text>
    <line x1="${DX}" y1="${RY(0)}" x2="${DX}" y2="${RY(4)}" stroke="url(#cel-metal)" stroke-width="3" opacity=".35"/>
    <g id="rows"></g>
    <g id="waves"></g><g id="sparks"></g>
    <g id="marker" opacity="0"><circle id="mGlow" r="42" fill="none" stroke-width="14" filter="url(#cel-blur10)" opacity=".5"/><circle id="mRing" r="40" fill="none" stroke-width="5"/></g>
    <g id="stick"></g>
    <text id="title" x="0" y="220" text-anchor="middle" font-family="${DMS}" font-weight="700" font-size="64" letter-spacing="-1" fill="${CREAM}" opacity="0"></text>
    <text id="sub" x="0" y="292" text-anchor="middle" font-family="${DMS}" font-weight="500" font-size="36" fill="${CREAM}" opacity="0">${ratingSub(cfg, DMS)}</text>
  </g>`;
    $("meta").textContent = `${cfg.exercise} · ${cfg.bpm} BPM`; $("title").textContent = cfg.title;
    const E: Record<string, SVGElement> = {};
    ["root", "cGlow", "meta", "marker", "mGlow", "mRing", "stick", "title", "sub"].forEach((id) => (E[id] = $(id)));
    const rows = RCOL.map((c, i) => {
      const g = mk("g", { opacity: 0 }, $("rows"));
      const dot = i === 4 ? mk("path", { d: starPath(31), fill: c }, g) : mk("circle", { r: 22, fill: c }, g);
      const lb = mk("text", { x: DX - 60, y: 13, "text-anchor": "end", "font-family": DMS, "font-weight": 600, "font-size": 40, fill: CREAM }, g); lb.textContent = cfg.labels[i];
      return { g, dot, lb, i };
    });
    // one realistic stick taps the new rating's dot on landing
    const tip = [DX + 26, RY(to)], butt = [DX + 26 + 300, RY(to) + 330];
    const SA = (Math.atan2(tip[1] - butt[1], tip[0] - butt[0]) * 180) / Math.PI, SL = Math.hypot(tip[0] - butt[0], tip[1] - butt[1]) - 8;
    addStick(E.stick, SL, "url(#cel-metal)", 16);
    const sparks = makeSparks($("sparks"), 8, L + HS, DX, RY(to), 30, 120, [newC, CREAM], 5);
    const W = $("waves"); const waves = [makeWave(W, L + HS, DX, RY(to), 40, 220, 6, newC, 0.5)];
    const pass = (i: number) => H0 + (i - from) * HD;
    return {
      END: L + 0.6,
      haptics: [...[...Array(k - 1)].map((_, j): [number, number] => [10, H0 + (j + 1) * HD]), [25, L]],
      audio(b, S) {
        for (let j = 1; j < k; j++) S.wood(b + H0 + j * HD, 0.3, 1400 + (from + j) * 150);
        S.wood(b + L, 0.75, 1750); S.snare(b + L, 0.22);
        S.ting(b + L + 0.03, 0.5, RATING_PITCH[to]);
        if (to === 4) S.bell(b + L + 0.06, 0.22, 2637, 0.9);
      },
      render(t) {
        const u = t - L - HS, stop = t >= L && t < L + HS, idle = seg(t, L + 0.5, L + 1.3);
        const { lv, st } = climb(t, from, k, H0, HD);
        E.meta.setAttribute("opacity", f3(0.55 * seg(t, 0, 0.25)));
        rows.forEach((r) => {
          const ip = eOutCubic(seg(t, 0.02 + r.i * 0.035, 0.27 + r.i * 0.035));
          let op = 0.22;
          if (r.i === from && t < H0) op = 1;
          else if (r.i === to && t >= L) op = 1;
          else if (r.i >= from && r.i < to && t >= pass(r.i)) { const tp = r.i === from ? H0 : pass(r.i); op = 0.45 + 0.5 * Math.exp(-(t - tp) / 0.15); }
          r.dot.setAttribute("opacity", f3(op));
          let ds = 1; if (r.i === to && t >= L) ds = stop ? 1.5 : lerp(1.5, 1, springTo(u, 16, 7));
          if (r.i === to && r.dot.tagName === "path" && t >= L) r.dot.setAttribute("transform", `translate(${DX} 0) rotate(${f1(144 * eOutCubic(seg(t, L, L + 0.45)))}) scale(${f3(ds)})`);
          else r.dot.setAttribute("transform", `translate(${DX} 0) scale(${f3(ds)})`);
          r.dot.setAttribute("fill", stop && r.i === to ? BR.white : RCOL[r.i]);
          const isNew = r.i === to && t >= L, isOld = r.i === from && t < L;
          r.lb.setAttribute("fill", isNew ? RCOL[r.i] : CREAM);
          r.lb.setAttribute("font-weight", String(isNew ? 800 : 600));
          r.lb.setAttribute("opacity", String(isNew ? 1 : isOld ? 0.9 : 0.4));
          r.lb.setAttribute("transform", isNew ? `translate(${DX - 60} 0) scale(${f3(1 + 0.08 * bump(u, 0.06))}) translate(${60 - DX} 0)` : "");
          r.g.setAttribute("opacity", f3(ip));
          r.g.setAttribute("transform", `translate(${f1(lerp(20, 0, ip))} ${RY(r.i)})`);
        });
        // the marker: pops on the old rating, crouches, climbs, lands
        const mp = eOutBack(seg(t, 0.12, 0.32), 2), aq = bump(t - 0.36, 0.05);
        const sx = (1 + 0.1 * aq - 0.08 * st) * mp, sy = (1 - 0.15 * aq + 0.18 * st) * mp;
        const col = ratingColorAt(lv);
        E.marker.setAttribute("opacity", String(mp > 0 ? 1 : 0));
        E.marker.setAttribute("transform", `translate(${DX} ${f1(10 - lv * 120 + 8 * aq)}) scale(${f3(sx)} ${f3(sy)})`);
        E.mRing.setAttribute("stroke", stop ? BR.white : col); E.mGlow.setAttribute("stroke", col);
        E.mRing.setAttribute("r", f1(40 * (1 + 0.35 * bump(u, 0.05))));
        E.mGlow.setAttribute("opacity", f3(0.45 + (u > 0 ? 0.4 * Math.exp(-4 * u) : 0) + 0.06 * Math.sin(t * 2.4) * idle));
        E.cGlow.setAttribute("opacity", f3(u > 0 ? 0.5 + 0.5 * Math.exp(-3 * u) : 0));
        // the stick: slides in, lifts, taps once on landing, leaves
        const ip = eOutCubic(seg(t, 0.2, 0.45)), w0 = Math.max(0.45, L - 0.32);
        let Rr: number;
        if (t < w0) Rr = 8; else if (t < L - 0.05) Rr = lerp(8, 24, eOutCubic(seg(t, w0, L - 0.05)));
        else if (t < L) Rr = lerp(24, -3, Math.pow(seg(t, L - 0.05, L), 2)); else if (stop) Rr = -3;
        else Rr = -3 * decayOsc(u, 22, 8) + 12 * eOutCubic(seg(t, L + 0.04, L + 0.22));
        const ex = eInCubic(seg(t, L + 0.22, L + 0.5)), off = -600 * (1 - ip) - 600 * ex, ar = rad(SA);
        E.stick.setAttribute("transform", `translate(${f1(butt[0] + Math.cos(ar) * off)} ${f1(butt[1] + Math.sin(ar) * off)}) rotate(${f3(SA + Rr)})`);
        E.stick.setAttribute("opacity", String(ip > 0 && ex < 1 ? 1 : 0));
        drawSparks(sparks, t); waves.forEach((v) => drawWave(v, t));
        fadeUp(E.title, seg(t, L + 0.08, L + 0.4), 26);
        const sp = seg(t, L + 0.18, L + 0.5); fadeUp(E.sub, sp, 22); E.sub.setAttribute("opacity", f3(0.85 * sp));
        glint(lerp(-0.2, 1.2, seg(t, L + 0.1, L + 0.7)));
        setFlash(t >= L ? (stop ? 0.05 : 0.05 * Math.exp(-14 * u)) : 0, newC);
        shake(E.root, [[t - L, 4]]);
      },
    };
  },
};

export const ratedKidsScene: SceneDef<RatedCfg> = {
  adult: false,
  build(env, cfg) {
    const { $, setFlash, shake } = env;
    const from = cfg.from, to = cfg.to, k = Math.max(1, to - from);
    const RY = (i: number) => -10 - i * 132, H0 = 0.42, HD = k === 1 ? 0.3 : Math.min(0.22, 0.66 / k), L = H0 + k * HD, HS = 0.04, TAP2 = L + 0.09, KS = 0.34;
    const newC = RCOL[to];
    $("stage").innerHTML = `<g id="root">
    <defs><radialGradient id="cel-rglowK"><stop offset="0" stop-color="${newC}" stop-opacity=".5"/><stop offset="1" stop-color="${newC}" stop-opacity="0"/></radialGradient></defs>
    <circle id="cGlow" cx="0" cy="${RY(to)}" r="460" fill="url(#cel-rglowK)" opacity="0"/>
    <text id="meta" x="0" y="-730" text-anchor="middle" font-family="${DMS}" font-weight="700" font-size="40" fill="${CREAM}" opacity="0">${cfg.exercise.replace(/&/g, "&amp;").replace(/</g, "&lt;")} · <tspan font-family="${BAR}" font-size="50">${cfg.bpm}</tspan> BPM</text>
    <g id="waves"></g><g id="chips"></g>
    <g id="rows"></g>
    <g id="marker" opacity="0"><rect id="mGlow" x="-314" y="-64" width="628" height="128" rx="64" fill="none" stroke-width="18" filter="url(#cel-blur10)" opacity=".55"/><rect id="mRing" x="-314" y="-64" width="628" height="128" rx="64" fill="none" stroke-width="9"/></g>
    <g id="pair"><g id="ks1"></g><g id="ks0"></g></g>
    <text id="title" x="0" y="250" text-anchor="middle" font-family="${DMS}" font-weight="800" font-size="78" letter-spacing="-1" fill="${CREAM}" opacity="0"></text>
    <text id="sub" x="0" y="330" text-anchor="middle" font-family="${DMS}" font-weight="600" font-size="38" fill="${CREAM}" opacity="0">${ratingSub(cfg, BAR)}</text>
  </g>`;
    $("title").textContent = cfg.title;
    const E: Record<string, SVGElement> = {};
    ["root", "cGlow", "meta", "marker", "mGlow", "mRing", "pair", "title", "sub"].forEach((id) => (E[id] = $(id)));
    const rows = RCOL.map((c, i) => {
      const g = mk("g", { opacity: 0 }, $("rows"));
      const pill = mk("rect", { x: -300, y: -52, width: 600, height: 104, rx: 52, fill: c, opacity: 0.16 }, g);
      const dot = i === 4 ? mk("path", { d: starPath(34), fill: c, transform: "translate(-232 0)" }, g) : mk("circle", { cx: -232, cy: 0, r: 24, fill: c }, g);
      const lb = mk("text", { x: -186, y: 15, "font-family": DMS, "font-weight": 800, "font-size": 44, fill: CREAM, opacity: 0.55 }, g); lb.textContent = cfg.labels[i];
      return { g, pill, dot, lb, i };
    });
    // the exact logo sticks wait at the new rating and play "ba-dum" on landing
    const sticks = [{ g: $("ks0"), k: KL.S1 }, { g: $("ks1"), k: KL.S2 }];
    sticks.forEach((s) => mk("path", { d: s.k.d, fill: CREAM }, s.g));
    const PX = -372, PY = RY(to) + 22, PA = rad(-40);
    // chunky chips in the rating colours
    const chips: { el: SVGElement; a: number; v: number; rot0: number; spin: number; ph: number; size: number }[] = [];
    for (let i = 0; i < 14; i++) {
      const span = 30 + Math.random() * 50, r = Math.random();
      const el = mk("path", { d: arc(58, -span / 2, span / 2), fill: "none", stroke: r < 0.5 ? newC : r < 0.8 ? ORANGE : CREAM, "stroke-width": 22, "stroke-linecap": "round", opacity: 0 }, $("chips"));
      chips.push({ el, a: (i / 14) * Math.PI * 2 + Math.random() * 0.4, v: 420 * (0.6 + Math.random() * 0.6), rot0: Math.random() * 360, spin: (Math.random() - 0.5) * 900, ph: Math.random() * 6.28, size: 0.6 + Math.random() * 0.5 });
    }
    const W = $("waves");
    const pw = [{ t0: L + HS, c: newC, w: 22, d: 0.5, gx: 1.35, gy: 2.1 }, { t0: L + HS + 0.06, c: CREAM, w: 8, d: 0.45, gx: 1.25, gy: 1.7 }].map((o) => ({ ...o, el: mk("rect", { x: -300, y: -52, width: 600, height: 104, rx: 52, fill: "none", stroke: o.c, "stroke-width": o.w, opacity: 0 }, W) }));
    const pass = (i: number) => H0 + (i - from) * HD;
    const pent = [110, 123.5, 146.8, 164.8, 196];
    return {
      END: L + 0.75,
      haptics: [...[...Array(k - 1)].map((_, j): [number, number] => [12, H0 + (j + 1) * HD]), [30, L], [15, TAP2]],
      audio(b, S) {
        for (let j = 1; j < k; j++) S.tom(b + H0 + j * HD, 0.55, pent[from + j]);
        S.kick(b + L, 0.6); S.snare(b + L, 0.55); S.snare(b + TAP2, 0.7);
        S.ting(b + TAP2 + 0.03, 0.85, RATING_PITCH[to]);
        if (to === 4) S.bell(b + TAP2 + 0.06, 0.3, 2637, 1.0);
      },
      render(t) {
        const u = t - L - HS, stop = t >= L && t < L + HS, idle = seg(t, L + 0.5, L + 1.3);
        const { lv, st } = climb(t, from, k, H0, HD);
        E.meta.setAttribute("opacity", f3(0.6 * seg(t, 0, 0.25)));
        rows.forEach((r) => {
          const ip = eOutBack(seg(t, 0.02 + r.i * 0.04, 0.3 + r.i * 0.04), 1.6);
          const isNew = r.i === to && t >= L, isOld = r.i === from && t < L;
          let fo = 0.16;
          if (isNew) fo = 1; else if (isOld) fo = 0.4;
          else if (r.i >= from && r.i < to && t >= pass(r.i)) { const tp = r.i === from ? H0 : pass(r.i); fo = 0.22 + 0.5 * Math.exp(-(t - tp) / 0.15); }
          r.pill.setAttribute("opacity", f3(fo));
          r.pill.setAttribute("fill", stop && r.i === to ? BR.white : RCOL[r.i]);
          r.dot.setAttribute("fill", isNew ? "#111111" : RCOL[r.i]);
          if (r.dot.tagName === "path") r.dot.setAttribute("transform", `translate(-232 0) rotate(${f1(isNew ? 216 * eOutCubic(seg(t, L, L + 0.5)) : 0)}) scale(${f3(isNew ? 1 + 0.4 * bump(u, 0.06) : 1)})`);
          r.lb.setAttribute("fill", isNew ? "#111111" : CREAM);
          r.lb.setAttribute("opacity", String(isNew || isOld ? 1 : 0.55));
          let s = ip; if (isNew) s *= stop ? 1.12 : 1 + 0.12 * decayOsc(u, 18, 7);
          r.g.setAttribute("opacity", f3(clamp(ip)));
          r.g.setAttribute("transform", `translate(0 ${RY(r.i)}) scale(${f3(s)})`);
        });
        // the marker: a chunky outline that crouches, jumps and lands with a squash
        const mp = eOutBack(seg(t, 0.12, 0.32), 2.2), aq = bump(t - 0.34, 0.05), lq = bump(u, 0.05);
        const sx = (1 + 0.06 * aq - 0.06 * st + 0.05 * lq) * mp, sy = (1 - 0.25 * aq + 0.3 * st - 0.2 * lq) * mp;
        const col = ratingColorAt(lv);
        E.marker.setAttribute("opacity", String(mp > 0 && t < L + 0.5 ? 1 - seg(t, L + 0.3, L + 0.5) : 0));
        E.marker.setAttribute("transform", `translate(0 ${f1(-10 - lv * 132 + 10 * aq)}) scale(${f3(sx)} ${f3(sy)})`);
        E.mRing.setAttribute("stroke", stop ? BR.white : col); E.mGlow.setAttribute("stroke", col);
        E.cGlow.setAttribute("opacity", f3(u > 0 ? 0.45 + 0.55 * Math.exp(-3 * u) + 0.08 * Math.sin(t * 2.2) * idle : 0));
        // logo sticks: slide in to the destination, lift, "ba-dum", then bob
        const ip = eOutCubic(seg(t, 0.25, 0.5)), off = -700 * (1 - ip);
        E.pair.setAttribute("transform", `translate(${f1(PX + Math.cos(PA) * off)} ${f1(PY + Math.sin(PA) * off)}) scale(${KS})`);
        E.pair.setAttribute("opacity", String(ip > 0 ? 1 : 0));
        sticks.forEach((s, i) => {
          const hit = i === 0 ? L : TAP2, lift = Math.max(0.5, hit - 0.3);
          let rot: number;
          if (t < lift) rot = -6; else if (t < hit - 0.05) rot = lerp(-6, -20, eOutCubic(seg(t, lift, hit - 0.05)));
          else if (t < hit) rot = lerp(-20, 4, Math.pow(seg(t, hit - 0.05, hit), 2)); else if (t < hit + HS) rot = 4;
          else rot = 4 * decayOsc(t - hit - HS, 22, 8) - 3 * eOutCubic(seg(t, hit + 0.05, hit + 0.25));
          rot += Math.sin(t * 2.6 + i * 1.3) * 2 * idle;
          poseStick(s, rot, 0);
          (s.g.firstChild as Element).setAttribute("fill", t >= hit && t < hit + HS ? BR.white : CREAM);
        });
        chips.forEach((c) => {
          const uu = t - L - HS;
          if (uu < 0) { c.el.setAttribute("opacity", "0"); return; }
          const tau = 0.2, r = 60 + c.v * tau * (1 - Math.exp(-uu / tau)), f = clamp((uu - 0.4) / 1);
          const x = Math.cos(c.a) * r * 1.15 + Math.sin(t * 0.9 + c.ph) * 12 * f, y = RY(to) + Math.sin(c.a) * r * 0.95 + Math.cos(t * 0.7 + c.ph) * 16 * f;
          const sc = c.size * (uu < 0.08 ? uu / 0.08 : lerp(1, 0.7, clamp((uu - 0.08) / 0.6)));
          c.el.setAttribute("transform", `translate(${f1(x)} ${f1(y)}) rotate(${f1(c.rot0 + c.spin * tau * (1 - Math.exp(-uu / tau)))}) scale(${f3(sc)})`);
          c.el.setAttribute("opacity", f3(lerp(1, 0, clamp((uu - 0.35) / 0.6))));
        });
        pw.forEach((w) => {
          const p = seg(t, w.t0, w.t0 + w.d);
          w.el.setAttribute("opacity", p > 0 && p < 1 ? f3(Math.pow(1 - p, 1.5)) : "0");
          w.el.setAttribute("transform", `translate(0 ${RY(to)}) scale(${f3(lerp(1, w.gx, eOutCubic(p)))} ${f3(lerp(1, w.gy, eOutCubic(p)))})`);
          w.el.setAttribute("stroke-width", f1(lerp(w.w, 0.5, p)));
        });
        const tu = t - L - 0.06, ts = lerp(1.3, 1, tu > 0 ? springTo(tu, 14, 8) : 0);
        E.title.setAttribute("opacity", f3(seg(t, L + 0.06, L + 0.14)));
        E.title.setAttribute("transform", `translate(0 222) scale(${f3(ts)}) translate(0 -222)`);
        const sp = seg(t, L + 0.2, L + 0.5); fadeUp(E.sub, sp, 22); E.sub.setAttribute("opacity", f3(0.9 * sp));
        setFlash(t >= L ? (stop ? 0.16 : 0.16 * Math.exp(-12 * u)) : 0, newC);
        shake(E.root, [[t - L, 12], [t - TAP2, 6]]);
      },
    };
  },
};
