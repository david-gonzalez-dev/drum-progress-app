// ADULT 4: Leaderboard, "Overtake". The sticks drum a roll under your row, then one accent pushes it past.
// Ported from the approved reference; every timing, curve and sound is unchanged. Played ONCE with the final rank, however many people were passed.
import { BR, CREAM, MAN, ORANGE, addStick, bump, decayOsc, drawSparks, drawWave, eInCubic, eInOut, eOutBack, eOutCubic, f1, f3, lerp, makeSparks, makeWave, mk, rad, seg, springTo } from "../core";
import type { SceneDef } from "../core";

export type RankRow = { rank: number; name: string; score: number };
export type RankCfg = {
  oldRank: number; newRank: number;   // the real ranks: the big number rolls from one to the other
  passed: number;                     // players passed (can be more than 3; the animation shows at most 3 rows)
  rows: RankRow[];                    // up to 3 rows just above you (as they were before you passed them), top to bottom
  meName: string;                     // "You"
  scoreBefore: number; scoreAfter: number; unit: string; // "412 days"
  label: string;                      // "LEADERBOARD"
  title: string;                      // "You passed Mila" / "You passed 3 people"
  sub: string;                        // "Up to #4 this month"
};

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

export const rankScene: SceneDef<RankCfg> = {
  adult: true,
  build(env, cfg) {
    const { $, setFlash, shake } = env;
    const HIT = 0.88, HS = 0.035;
    // n = how many rows move in the animation (1 to 3). One celebration, final rank only.
    const n = Math.max(1, Math.min(3, cfg.passed || 1));
    const { oldRank, newRank } = cfg;
    const above = cfg.rows.slice(-3);
    const offset = 3 - above.length; // rows missing above you leave their slots empty
    type R = { r: number; name: string; score: number; me?: boolean; slot: number };
    const ROWS: R[] = above.map((d, j) => ({ r: d.rank, name: d.name, score: d.score, slot: j + offset }));
    const me: R = { r: oldRank, name: cfg.meName, score: cfg.scoreBefore, me: true, slot: 3 };
    ROWS.push(me);
    const goalScore = cfg.scoreAfter;
    const firstPassed = 3 - n;
    const slotY = (s: number) => -300 + s * 136;
    $("stage").innerHTML = `<g id="root">
    <defs>
      <clipPath id="cel-heroClip"><rect x="-480" y="-800" width="960" height="290"/></clipPath>
      <clipPath id="cel-rowClip"><rect x="-420" y="-60" width="840" height="120" rx="28"/></clipPath>
    </defs>
    <circle id="aGlow" cx="0" cy="-640" r="560" fill="url(#cel-aglow)" opacity="0"/>
    <g id="waves"></g>
    <g clip-path="url(#cel-heroClip)">
      <text id="heroOld" x="0" y="-560" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="250" letter-spacing="-8" fill="${CREAM}" opacity="0"><tspan font-size="150" fill="${BR.light}">#</tspan>${oldRank}</text>
      <text id="heroGlow" x="0" y="-560" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="250" letter-spacing="-8" fill="${ORANGE}" filter="url(#cel-blur18)" opacity="0"><tspan font-size="150">#</tspan>${newRank}</text>
      <text id="heroNew" x="0" y="-560" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="250" letter-spacing="-8" fill="${CREAM}" opacity="0"><tspan font-size="150" fill="${BR.light}">#</tspan>${newRank}</text>
    </g>
    <text id="lbl" x="0" y="-462" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="34" letter-spacing="12" fill="${BR.light}" opacity="0"></text>
    <g id="rows"></g>
    <g id="sparks"></g>
    <g id="stick0"></g><g id="stick1"></g>
    <text id="title" x="0" y="560" text-anchor="middle" font-family="${MAN}" font-weight="800" font-size="66" letter-spacing="-1" fill="${CREAM}" opacity="0"></text>
    <text id="sub" x="0" y="634" text-anchor="middle" font-family="${MAN}" font-weight="600" font-size="38" fill="${CREAM}" opacity="0"></text>
  </g>`;
    $("lbl").textContent = cfg.label; $("title").textContent = cfg.title; $("sub").textContent = cfg.sub;
    const E: Record<string, SVGElement> = {};
    ["root", "aGlow", "heroOld", "heroGlow", "heroNew", "lbl", "title", "sub"].forEach((id) => (E[id] = $(id)));
    const rowsG = $("rows");
    const unit = cfg.unit;
    const rows = ROWS.map((d) => {
      const g = mk("g", { opacity: 0 }, rowsG);
      let glow: SVGElement | null = null, sheen: SVGElement | null = null;
      if (d.me) glow = mk("rect", { x: -420, y: -60, width: 840, height: 120, rx: 28, fill: ORANGE, filter: "url(#cel-blur18)", opacity: 0.35 }, g);
      mk("rect", { x: -420, y: -60, width: 840, height: 120, rx: 28, fill: d.me ? "#24150c" : "#151716", stroke: d.me ? "url(#cel-ofill)" : "#262827", "stroke-width": d.me ? 3 : 1.5 }, g);
      const rank = mk("text", { x: -366, y: 14, "text-anchor": "middle", "font-family": MAN, "font-weight": 800, "font-size": 38, fill: d.me ? BR.light : CREAM, opacity: d.me ? 1 : 0.55 }, g); rank.textContent = "#" + d.r;
      mk("circle", { cx: -276, cy: 0, r: 34, fill: d.me ? ORANGE : "#2a2e2c" }, g);
      const ini = mk("text", { x: -276, y: 12, "text-anchor": "middle", "font-family": MAN, "font-weight": 800, "font-size": 32, fill: d.me ? "#160b04" : CREAM }, g); ini.textContent = (d.name[0] || "?").toUpperCase();
      const nm = mk("text", { x: -218, y: 15, "font-family": MAN, "font-weight": 700, "font-size": 44, fill: CREAM }, g); nm.textContent = clip(d.name, 12);
      const sc = mk("text", { x: 388, y: 14, "text-anchor": "end", "font-family": MAN, "font-weight": 700, "font-size": 38, fill: CREAM, opacity: d.me ? 0.95 : 0.6 }, g); sc.textContent = d.score + " " + unit;
      if (d.me) { const cg = mk("g", { "clip-path": "url(#cel-rowClip)" }, g); sheen = mk("rect", { x: -35, y: -90, width: 70, height: 180, fill: "#ffffff", opacity: 0 }, cg); }
      return { d, g, rank, sc, glow, sheen, slot: d.slot };
    });
    rowsG.appendChild(rows[rows.length - 1].g); // your row draws on top
    // the two sticks sit under your row, tips just below its edge
    const STK = [{ bx: -330, by: 560, tx: -130, m: 1 }, { bx: 330, by: 560, tx: 130, m: -1 }].map((k) => {
      const ty = slotY(3) + 60 + 11;
      return { ...k, ang: (Math.atan2(ty - k.by, k.tx - k.bx) * 180) / Math.PI, L: Math.hypot(k.tx - k.bx, ty - k.by) };
    });
    const stickEls = STK.map((_, i) => { const g = $("stick" + i); addStick(g, STK[i].L, "url(#cel-metal)", 18); return g; });
    // roll: alternating taps, speeding up (same times drive the snare sound)
    const taps: { t: number; k: number }[] = [];
    { let t = 0.42, gap = 0.085, k = 0; while (t < 0.78) { taps.push({ t, k: k % 2 }); t += gap; gap = Math.max(0.036, gap * 0.88); k++; } }
    const lineY = slotY(firstPassed) + 68;
    const sparks = [...makeSparks($("sparks"), 5, HIT + HS, -420, lineY, 0, 130, [BR.light, CREAM], 5, [150, 210]),
      ...makeSparks($("sparks"), 5, HIT + HS, 420, lineY, 0, 130, [BR.light, CREAM], 5, [-30, 30])];
    const W = $("waves");
    const waves = [makeWave(W, HIT + HS + 0.03, 0, -640, 140, 560, 6, BR.light, 0.6)];
    return {
      END: HIT + 0.85,
      haptics: [[35, HIT]],
      audio(base, S) {
        const { snare, kick, rimshot, whoosh, ting, bell } = S;
        taps.forEach((tp, i) => snare(base + tp.t, lerp(0.08, 0.45, i / (taps.length - 1))));
        kick(base + HIT, 0.7); rimshot(base + HIT, 0.9); whoosh(base + HIT - 0.04, 0.24, 0.16);
        ting(base + HIT + 0.06, 0.6, 1568); bell(base + HIT + 0.32, 0.12, 3136, 0.7);
      },
      render(t) {
        const u = t - HIT - HS, idle = seg(t, HIT + 0.6, HIT + 1.4);
        const swapUp = u > 0 ? springTo(u, n === 1 ? 14 : 11, n === 1 ? 8 : 7) : 0;
        // each passed row drops one slot as you go by it, nearest first
        const swapDown = (i: number) => eOutCubic(seg(t, HIT + HS + (2 - i) * 0.05, HIT + 0.4 + (2 - i) * 0.05));
        rows.forEach((r) => {
          const i = r.slot;
          const ip = eOutCubic(seg(t, 0.05 + i * 0.06, 0.38 + i * 0.06));
          let y = slotY(i) + lerp(70, 0, ip), s = 1, op = ip;
          if (r.d.me) {
            const lift = eOutCubic(seg(t, 0.42, 0.86));
            s = 1 + 0.03 * lift;
            taps.forEach((tp, j) => { y -= lerp(4, 12, j / (taps.length - 1)) * bump(t - tp.t, 0.025); });
            y -= 136 * n * swapUp;
            if (t >= HIT && t < HIT + HS) s = 1.05;
            if (u > 0) s = 1 + 0.03 * (1 - swapDown(2)) + 0.04 * bump(u, 0.05);
            const val = t < 0.42 ? r.d.score : Math.round(lerp(r.d.score, goalScore, Math.pow(seg(t, 0.42, HIT), 1.6)));
            const st = val + " " + unit; if (r.sc.textContent !== st) r.sc.textContent = st;
            r.rank.textContent = "#" + (t < HIT + 0.05 ? oldRank : newRank);
            r.glow!.setAttribute("opacity", f3(0.2 + 0.25 * lift + (u > 0 ? 0.45 * Math.exp(-3 * u) : 0) + 0.06 * Math.sin(t * 2.4) * idle));
            const sp = seg(t, HIT + 0.25, HIT + 0.75);
            r.sheen!.setAttribute("opacity", sp > 0 && sp < 1 ? "0.13" : "0");
            r.sheen!.setAttribute("transform", `translate(${f1(lerp(-520, 520, eInOut(sp)))} 0) skewX(-20)`);
          } else if (i >= firstPassed) {
            const sd = swapDown(i);
            y += 136 * sd;
            op *= lerp(1, 0.7, sd);
            r.rank.textContent = "#" + (sd > 0.5 ? r.d.r + 1 : r.d.r);
            // the row right above you gets nudged as your row presses on it
            if (i === 2) taps.forEach((tp, j) => { y -= lerp(1, 4, j / (taps.length - 1)) * bump(t - tp.t - 0.01, 0.03); });
          }
          r.g.setAttribute("transform", `translate(0 ${f1(y)}) scale(${f3(s)})`);
          r.g.setAttribute("opacity", f3(op));
        });
        // sticks: rise in, tap a roll, wind up, one hard accent, then drop away
        STK.forEach((k, i) => {
          const ip = seg(t, 0.2 + i * 0.04, 0.42 + i * 0.04), s = 650 * (1 - eOutBack(ip, 1.2));
          let Rr = 7;
          let sh = 0; taps.forEach((tp) => { if (tp.k !== i) return; const v = t - tp.t; const x = v < -0.022 ? 0 : v < 0 ? (v + 0.022) / 0.022 : Math.exp(-v / 0.035); sh = Math.max(sh, x); });
          Rr -= 8 * sh;
          if (t >= 0.78 && t < 0.86) Rr = lerp(7, 20, eOutCubic(seg(t, 0.78, 0.86)));
          else if (t >= 0.86 && t < HIT) Rr = lerp(20, -4, Math.pow(seg(t, 0.86, HIT), 2));
          else if (t >= HIT && t < HIT + HS) Rr = -4;
          else if (u > 0) Rr = -4 * decayOsc(u, 22, 8) + 10 * eOutCubic(seg(t, HIT + 0.05, HIT + 0.25));
          const drop = eInCubic(seg(t, HIT + 0.12, HIT + 0.42));
          const ar = rad(k.ang), off = -s;
          stickEls[i].setAttribute("transform", `translate(${f1(k.bx + Math.cos(ar) * off)} ${f1(k.by + Math.sin(ar) * off + 520 * drop)}) rotate(${f3(k.ang + k.m * Rr)})`);
          stickEls[i].setAttribute("opacity", String(ip > 0 && drop < 1 ? 1 : 0));
        });
        // the big rank number rolls from the old rank to the new one
        const oIn = seg(t, 0.12, 0.32), oOut = eInCubic(seg(t, HIT, HIT + 0.15));
        E.heroOld.setAttribute("opacity", f3(0.5 * oIn * (1 - oOut)));
        E.heroOld.setAttribute("transform", `translate(0 ${f1(-200 * oOut)})`);
        const nu = t - HIT - 0.03, np = springTo(nu, 16, 8);
        const hT = `translate(0 ${f1(lerp(230, 0, np))}) translate(0 -640) scale(${f3(1 + 0.01 * Math.sin(t * 2.2) * idle)}) translate(0 640)`;
        E.heroNew.setAttribute("transform", hT); E.heroGlow.setAttribute("transform", hT);
        E.heroNew.setAttribute("opacity", f3(seg(t, HIT + 0.03, HIT + 0.08)));
        E.heroGlow.setAttribute("opacity", f3(nu < 0 ? 0 : 0.3 + 0.5 * Math.exp(-3 * nu)));
        E.lbl.setAttribute("opacity", f3(seg(t, 0.2, 0.4)));
        E.aGlow.setAttribute("opacity", f3(t < HIT ? 0.12 * seg(t, 0.1, 0.5) : 0.4 + 0.6 * Math.exp(-3 * Math.max(u, 0))));
        drawSparks(sparks, t); waves.forEach((w) => drawWave(w, t));
        const tp = seg(t, HIT + 0.15, HIT + 0.5), sp = seg(t, HIT + 0.27, HIT + 0.6);
        E.title.setAttribute("opacity", f3(tp)); E.title.setAttribute("transform", `translate(0 ${f1(lerp(30, 0, eOutCubic(tp)))})`);
        E.sub.setAttribute("opacity", f3(0.55 * sp)); E.sub.setAttribute("transform", `translate(0 ${f1(lerp(24, 0, eOutCubic(sp)))})`);
        let fl = 0; if (t >= HIT) fl = t < HIT + HS ? 0.08 : 0.08 * Math.exp(-14 * u);
        setFlash(fl, BR.light);
        shake(E.root, [[t - HIT, 6]]);
      },
    };
  },
};
