// Celebrations core: easing, brand values, shape helpers (arc, stick, sparks, waves), shake / glint / flash. Ported unchanged from the approved reference
// (celebrations-reference.html): every number is the same. Only the global document lookups became an `Env` object.

import { KL } from "./logo-shapes";

export const NS = "http://www.w3.org/2000/svg";
export type Attrs = Record<string, string | number>;
export const mk = (tag: string, attrs: Attrs, parent?: Element | null): SVGElement => {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  if (parent) parent.appendChild(e);
  return e;
};

/* ---------- easing ---------- */
export const clamp = (x: number, a = 0, b = 1) => Math.min(b, Math.max(a, x));
export const seg = (t: number, a: number, b: number) => clamp((t - a) / (b - a));
export const lerp = (a: number, b: number, p: number) => a + (b - a) * p;
export const eOutCubic = (p: number) => 1 - Math.pow(1 - p, 3);
export const eInCubic = (p: number) => p * p * p;
export const eInOut = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
export const eInOutQuad = (p: number) => (p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2);
export const eOutBack = (p: number, s = 1.7) => 1 + (s + 1) * Math.pow(p - 1, 3) + s * Math.pow(p - 1, 2);
export const springTo = (u: number, f: number, d: number) => (u <= 0 ? 0 : 1 - Math.exp(-d * u) * Math.cos(f * u));
export const decayOsc = (u: number, f: number, d: number) => (u < 0 ? 0 : Math.exp(-d * u) * Math.cos(f * u));
export const bump = (u: number, peak: number) => (u <= 0 ? 0 : (u / peak) * Math.exp(1 - u / peak));
export const rad = (d: number) => (d * Math.PI) / 180;
export const polar = (r: number, a: number): [number, number] => [r * Math.cos(rad(a)), r * Math.sin(rad(a))];
export const f1 = (x: number) => x.toFixed(1);
export const f3 = (x: number) => x.toFixed(3);

/* ---------- brand ---------- */
export const BR = { orange: "#ff6b1a", light: "#ff9b50", cream: "#f6e6d6", deep: "#b9470a", white: "#ffffff", hot: "#ffd3b4", dim: "#3a3531" };
export const CREAM = BR.cream;
export const ORANGE = BR.orange;
export const R = 400;
export const SW = 72;
export const SEGS = [{ a0: 150, a1: 278, c: CREAM }, { a0: 291, a1: 350, c: ORANGE }, { a0: 362, a1: 482, c: CREAM }];
export const STICKS = [{ bx: -324, by: 270, ang: -40.3, L: 640 }, { bx: -234, by: 350, ang: -37.7, L: 556 }];
// The reference uses Manrope (adults) and Nunito 900 (kids), which the app does not ship. The app's own fonts are used instead, as the brief allows:
// DM Sans for adult text and numbers, Barlow Condensed (the app's chunky number font) for the kids' numbers.
export const MAN = "'DM Sans', system-ui, -apple-system, sans-serif";
export const KIDS_FONT = "'Barlow Condensed', 'DM Sans', system-ui, sans-serif";

export function arc(r: number, a0: number, a1: number): string {
  const span = Math.min(a1 - a0, 359.8);
  a1 = a0 + span;
  const [x0, y0] = polar(r, a0), [x1, y1] = polar(r, a1);
  return `M${f1(x0)} ${f1(y0)} A${r} ${r} 0 ${span > 180 ? 1 : 0} 1 ${f1(x1)} ${f1(y1)}`;
}
/* Real 5A-style proportions: shaft about 1/25 of the length, taper over the last quarter down to a thin neck, oval tip about 0.9x shaft long and 0.6x wide.
   Butt at x=0, tip centre at x=L. */
export function addStick(g: Element, L: number, fill: string, D: number) {
  const r = D / 2, ts = L * 0.76, nr = r * 0.4, rx = D * 0.46, ry = D * 0.31, ne = L - rx * 0.6, tl = ne - ts;
  const p = (x: number, y: number) => `${f1(x)} ${f1(y)}`;
  const d = `M${p(r * 0.3, -r)} L${p(ts, -r)} C${p(ts + tl * 0.55, -r)} ${p(ne - tl * 0.3, -nr)} ${p(ne, -nr)}` +
    ` L${p(ne, nr)} C${p(ne - tl * 0.3, nr)} ${p(ts + tl * 0.55, r)} ${p(ts, r)} L${p(r * 0.3, r)}` +
    ` Q${p(-r * 0.25, r)} ${p(-r * 0.25, 0)} Q${p(-r * 0.25, -r)} ${p(r * 0.3, -r)} Z`;
  mk("path", { d, fill }, g);
  mk("ellipse", { cx: f1(L), cy: 0, rx: f1(rx), ry: f1(ry), fill }, g);
  mk("line", { x1: f1(D), y1: f1(-r * 0.4), x2: f1(ts), y2: f1(-r * 0.4), stroke: "#ffffff", "stroke-width": f1(r * 0.32), "stroke-linecap": "round", opacity: 0.22 }, g);
}

/* thin spark lines */
export type Spark = { el: SVGElement; a: number; d: number; dur: number; t0: number; cx: number; cy: number; r0: number; w: number };
export function makeSparks(parent: Element, n: number, t0: number, cx: number, cy: number, r0: number, dist: number, colors: string[], w = 6, spread: [number, number] = [0, 360]): Spark[] {
  const out: Spark[] = [];
  for (let i = 0; i < n; i++) {
    const a = lerp(spread[0], spread[1], (i + Math.random() * 0.7) / n);
    out.push({ el: mk("line", { stroke: colors[i % colors.length], "stroke-width": w, "stroke-linecap": "round", opacity: 0 }, parent),
      a, d: dist * (0.6 + Math.random() * 0.6), dur: 0.32 + Math.random() * 0.18, t0, cx, cy, r0, w });
  }
  return out;
}
export function drawSparks(arr: Spark[], t: number) {
  arr.forEach((s) => {
    const p = seg(t, s.t0, s.t0 + s.dur);
    if (p <= 0 || p >= 1) { s.el.setAttribute("opacity", "0"); return; }
    const h = s.r0 + s.d * eOutCubic(p), tl = s.r0 + s.d * eOutCubic(Math.max(0, p - 0.25));
    const [hx, hy] = polar(h, s.a), [tx, ty] = polar(tl, s.a);
    s.el.setAttribute("x1", f1(s.cx + tx)); s.el.setAttribute("y1", f1(s.cy + ty));
    s.el.setAttribute("x2", f1(s.cx + hx)); s.el.setAttribute("y2", f1(s.cy + hy));
    s.el.setAttribute("opacity", f3(1 - p * p)); s.el.setAttribute("stroke-width", f1(s.w * (1 - p * 0.6)));
  });
}
export type Wave = { el: SVGElement; t0: number; r0: number; r1: number; w: number; dur: number };
export function makeWave(parent: Element, t0: number, cx: number, cy: number, r0: number, r1: number, w: number, color: string, dur: number): Wave {
  return { el: mk("circle", { cx, cy, r: r0, fill: "none", stroke: color, "stroke-width": w, opacity: 0 }, parent), t0, r0, r1, w, dur };
}
export function drawWave(v: Wave, t: number) {
  const p = seg(t, v.t0, v.t0 + v.dur);
  v.el.setAttribute("opacity", p > 0 && p < 1 ? f3(Math.pow(1 - p, 1.5)) : "0");
  v.el.setAttribute("r", f1(lerp(v.r0, v.r1, eOutCubic(p))));
  v.el.setAttribute("stroke-width", f1(lerp(v.w, 0.5, p)));
}

/* ---------- scene environment (replaces the reference's global $ lookups) ---------- */
export type Env = {
  svg: SVGSVGElement;
  $: (id: string) => SVGElement;
  setFlash: (o: number, c?: string) => void;
  glint: (o: number) => void;
  shake: (root: Element, list: [number, number][]) => void;
};
export function makeEnv(svg: SVGSVGElement): Env {
  const cache = new Map<string, SVGElement>();
  const $ = (id: string): SVGElement => {
    let e = cache.get(id);
    if (!e || !e.isConnected) { e = svg.querySelector(`#${id}`) as SVGElement; cache.set(id, e); }
    return e;
  };
  return {
    svg, $,
    setFlash(o, c) { const f = $("flash"); f.setAttribute("opacity", f3(o)); if (c) f.setAttribute("fill", c); },
    // the metal gradient lives once in the page (CelDefs), so its shine stops are looked up there
    glint(o) { [o - 0.08, o, o + 0.08].map((x) => clamp(x)).forEach((x, i) => document.getElementById("cel-m" + (i + 1))?.setAttribute("offset", f3(x))); },
    shake(root, list) {
      let sx = 0, sy = 0;
      list.forEach(([u, amp]) => { if (u >= 0 && u < 0.4) { const A = amp * Math.exp(-14 * u); sx += A * Math.sin(u * 95); sy += A * Math.cos(u * 77); } });
      root.setAttribute("transform", `translate(${f1(sx)} ${f1(sy)})`);
    },
  };
}

/* ---------- scene shape ---------- */
export type Synth = ReturnType<typeof import("./synth").createSynth>;
// noContinue: plays inline / on its own, no Continue button. cont: the Continue button text when it is not the usual one.
export type SceneInstance = { END: number; haptics: [number, number][]; audio: (base: number, S: Synth) => void; render: (t: number) => void; noContinue?: boolean; cont?: string };
export type SceneDef<C> = { adult: boolean; build: (env: Env, cfg: C) => SceneInstance };

/* ---------- shared by the newer scenes ---------- */
export const txt = (x: number, y: number, size: number, weight: number, fill: string, content: string, extra = "") => `<text x="${x}" y="${y}" font-family="${MAN}" font-weight="${weight}" font-size="${size}" fill="${fill}" ${extra}>${content}</text>`;
export function fadeUp(el: Element, p: number, dist = 26) { el.setAttribute("opacity", f3(p)); el.setAttribute("transform", `translate(0 ${f1(lerp(dist, 0, eOutCubic(p)))})`); }
export function makeRays(g: Element, n: number) { for (let i = 0; i < n; i++) { const a = (i * 360) / n, [x1, y1] = polar(760, a - 2.6), [x2, y2] = polar(760, a + 2.6); mk("path", { d: `M0 0 L${f1(x1)} ${f1(y1)} L${f1(x2)} ${f1(y2)} Z`, fill: BR.light }, g); } }
/* The exact logo as a rig. Masks let the traced ring pieces "draw in". */
export type LogoSeg = { g: SVGElement; p: SVGElement; mp: SVGElement; c: string; mid: number };
export function logoRig(parent: Element, pfx: string) {
  const defs = mk("defs", {}, parent);
  const ringG = mk("g", {}, parent);
  const segs: LogoSeg[] = [KL.A, KL.B, KL.C].map((piece, i) => {
    const c = i === 1 ? ORANGE : CREAM;
    const m = mk("mask", { id: pfx + "m" + i, maskUnits: "userSpaceOnUse", x: -700, y: -700, width: 1400, height: 1400 }, defs);
    const mp = mk("path", { d: arc(R, piece.ang[0] - 8, piece.ang[1] + 8), fill: "none", stroke: "#fff", "stroke-width": 220, pathLength: 1, "stroke-dasharray": "1 1" }, m);
    const g = mk("g", {}, ringG);
    const p = mk("path", { d: piece.d, fill: c, mask: `url(#${pfx}m${i})` }, g);
    return { g, p, mp, c, mid: rad((piece.ang[0] + piece.ang[1]) / 2) };
  });
  const s2 = mk("g", {}, parent), s1 = mk("g", {}, parent);
  mk("path", { d: KL.S2.d, fill: CREAM }, s2); mk("path", { d: KL.S1.d, fill: CREAM }, s1);
  return { ringG, segs, sticks: [{ g: s1, k: KL.S1 }, { g: s2, k: KL.S2 }] };
}
export function poseStick(s: { g: SVGElement; k: { bx: number; by: number; ang: number; L: number } }, rot: number, off: number, tw = 0, hop = 0) {
  const k = s.k, a = rad(k.ang);
  s.g.setAttribute("transform", `translate(${f1(k.bx + Math.cos(a) * off)} ${f1(k.by + Math.sin(a) * off + hop)}) rotate(${f3(k.ang + rot)}) translate(${f1(k.L / 2)} 0) rotate(${f3(tw)}) translate(${f1(-k.L / 2)} 0)`);
}
// reverse = draws the piece from its far end back to its start
export function revealSeg(e: LogoSeg, p: number, reverse: boolean) { e.mp.style.strokeDashoffset = String(reverse ? p - 1 : 1 - p); e.p.setAttribute("opacity", String(p > 0.001 ? 1 : 0)); }
