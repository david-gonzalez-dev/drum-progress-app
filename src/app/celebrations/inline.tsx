"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { addStick, bump, eInOut, eOutCubic, f1, f3, lerp, seg, springTo } from "./core";
import type { SceneDef } from "./core";
import { fireHaptic, makeEnv, playCustom, type AudioPlay } from "./engine";
import { logoEmptyScene } from "./scenes/logo-empty";
import { metroScene } from "./scenes/metro";

// The small moments and polish pieces that live INSIDE the app's own screens (no full-screen overlay, no Continue button):
// Practice saved (the Save button), Cheer received (the toast), the empty-state drum, the loading metronome, and the session count-in.
// Same timings, curves and sounds as the reference. Sounds here never create or wake the audio context: with the phone's sound asleep they are simply silent.

const reducedMotion = () => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
type Peek = () => AudioContext | null;

/* ---------- looping scenes (empty-state drum, loading metronome) ---------- */
function LoopScene({ def, className, viewBox, label }: { def: SceneDef<Record<string, never>>; className: string; viewBox: string; label?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    const svg = ref.current; if (!svg) return;
    const st = def.build(makeEnv(svg), {});
    if (reducedMotion()) { st.render(0.9); return; } // one still picture (the drum / metronome at rest)
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => { st.render((now - t0) / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [def]);
  return <svg ref={ref} className={className} viewBox={viewBox} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}><g id="stage" /></svg>;
}
/* The logo as a thin outline that draws itself in and taps and glows every 3.2 seconds. One for every empty screen. */
export function EmptyLogo() { return <LoopScene def={logoEmptyScene} className="cel-empty-logo" viewBox="-290 -500 740 600" />; }
/* A metronome swinging at 100 BPM, instead of a spinner. Only appears if the wait lasts longer than about 0.3 seconds, so it never flashes. */
export function LoadingMetronome({ delayMs = 300 }: { delayMs?: number }) {
  const [on, setOn] = useState(false);
  useEffect(() => { const h = window.setTimeout(() => setOn(true), delayMs); return () => window.clearTimeout(h); }, [delayMs]);
  if (!on) return <div className="cel-loading" aria-hidden="true" />;
  return <div className="cel-loading" role="status" aria-label="Loading"><LoopScene def={metroScene} className="cel-loading-svg" viewBox="-210 -590 420 650" /></div>;
}

/* ---------- Practice saved: the Save button folds into a circle and a check draws itself ---------- */
export function SaveButton({ saved, onClick, disabled, label, savedLabel, peekAudio }: { saved: boolean; onClick: () => void; disabled?: boolean; label: ReactNode; savedLabel: ReactNode; peekAudio?: Peek }) {
  const btn = useRef<HTMLButtonElement>(null);
  const chk = useRef<SVGPathElement>(null);
  const rip = useRef<HTMLElement>(null);
  const lab = useRef<HTMLSpanElement>(null);
  const [morph, setMorph] = useState(false);
  useEffect(() => {
    const b = btn.current, c = chk.current, r = rip.current, l = lab.current;
    if (!b || !c || !r || !l) return;
    const reset = () => { ["width", "marginLeft", "marginRight", "borderRadius", "transform", "transition", "paddingLeft", "paddingRight"].forEach((k) => ((b.style as unknown as Record<string, string>)[k] = "")); l.style.opacity = ""; c.style.strokeDashoffset = "1"; r.style.opacity = "0"; };
    if (!saved || reducedMotion()) { setMorph(false); reset(); return; }
    setMorph(true);
    const w0 = b.offsetWidth, h = b.offsetHeight;
    const ctx = peekAudio?.() ?? null;
    let audio: AudioPlay | null = null, gone = false;
    if (ctx && ctx.state === "running") playCustom(ctx, true, (base, S) => { S.wood(base, 0.45, 1800); S.ting(base + 0.46, 0.45, 1568); }).then((a) => { if (gone) a.stop(); else audio = a; }).catch(() => {});
    const hap = [window.setTimeout(() => void fireHaptic(12), 0), window.setTimeout(() => void fireHaptic(20), 460)];
    b.style.transition = "none";
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => {
      const t = (now - t0) / 1000;
      const m = eInOut(seg(t, 0.06, 0.3));
      const sc = 1 - 0.04 * bump(t, 0.03) + 0.12 * bump(t - 0.46, 0.05);
      b.style.width = `${f1(lerp(w0, h, m))}px`; b.style.marginLeft = b.style.marginRight = "auto";
      b.style.paddingLeft = b.style.paddingRight = "0px";
      b.style.borderRadius = `${f1(lerp(h * 0.2615, h * 0.5, m))}px`;
      b.style.transform = `scale(${f3(sc)})`;
      l.style.opacity = f3(1 - seg(t, 0.04, 0.14));
      c.style.strokeDashoffset = String(1 - eOutCubic(seg(t, 0.26, 0.46)));
      const rp = seg(t, 0.46, 0.95), rr = lerp(h / 2, (h / 2) * (200 / 65), eOutCubic(rp));
      r.style.width = r.style.height = `${f1(rr * 2)}px`; r.style.opacity = rp > 0 && rp < 1 ? f3(0.6 * (1 - rp)) : "0";
      if (t < 1.0) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { gone = true; cancelAnimationFrame(raf); hap.forEach(clearTimeout); audio?.stop(); b.style.transition = "width .25s ease, border-radius .25s ease"; reset(); b.style.transition = "width .25s ease, border-radius .25s ease"; setMorph(false); };
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  return <button ref={btn} type="button" className={`${saved ? "save saved" : "save"} cel-save${morph ? " cel-morph" : ""}`} onClick={onClick} disabled={disabled}>
    <span ref={lab} className="cel-save-label">{saved ? savedLabel : label}</span>
    <svg className="cel-save-check" viewBox="-40 -40 80 80" aria-hidden="true"><path ref={chk} d="M-32 2 L-9 25 L33 -22" fill="none" stroke="#120a05" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray="1 1" strokeDashoffset={1} /></svg>
    <i ref={rip} className="cel-save-rip" aria-hidden="true" />
  </button>;
}

/* ---------- Cheer received: the toast lands like a stick tap, the little stick icon taps twice ---------- */
export function CheerToast({ name, title, text, onOpen, peekAudio }: { name: string; title: string; text: string; onOpen: () => void; peekAudio?: Peek }) {
  const root = useRef<HTMLButtonElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const mini = useRef<SVGGElement>(null);
  const rip = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = root.current, ic = icon.current, mg = mini.current, r = rip.current;
    if (!el || !ic || !mg || !r) return;
    mg.innerHTML = "";
    ([[-26, 24, -58], [26, 24, -122]] as [number, number, number][]).forEach(([x, y, a]) => { const g = document.createElementNS("http://www.w3.org/2000/svg", "g"); g.setAttribute("transform", `translate(${x} ${y}) rotate(${a})`); mg.appendChild(g); addStick(g, 62, "#120a05", 9); });
    if (reducedMotion()) return;
    const TAPS = [0.32, 0.44];
    const ctx = peekAudio?.() ?? null;
    let audio: AudioPlay | null = null, gone = false;
    if (ctx && ctx.state === "running") playCustom(ctx, true, (b, S) => { S.wood(b + 0.12, 0.4, 1200); TAPS.forEach((tp) => S.wood(b + tp, 0.38, 2300)); S.ting(b + 0.5, 0.35, 1760); }).then((a) => { if (gone) a.stop(); else audio = a; }).catch(() => {});
    const hap = window.setTimeout(() => void fireHaptic(15), 120);
    let raf = 0; const t0 = performance.now();
    const loop = (now: number) => {
      const u = (now - t0) / 1000;
      const y = lerp(-150, 0, u > 0 ? springTo(u, 13, 9) : 0), sq = bump(u - 0.12, 0.04);
      el.style.transform = `translate(-50%, ${f1(y)}px) scale(${f3(1 + 0.025 * sq)}, ${f3(1 - 0.06 * sq)})`;
      let tap = 0, k = 1; TAPS.forEach((tp) => { const v = u - tp; tap = Math.max(tap, v < -0.03 ? 0 : v < 0 ? (v + 0.03) / 0.03 : Math.exp(-v / 0.05)); k += 0.14 * bump(v, 0.04); });
      mg.setAttribute("transform", `rotate(${f1(-14 * tap)})`);
      ic.style.transform = `scale(${f3(k)})`;
      const rp = seg(u, TAPS[1], TAPS[1] + 0.45);
      r.style.transform = `translate(-50%, -50%) scale(${f3(lerp(1, 110 / 46, eOutCubic(rp)))})`; r.style.opacity = rp > 0 && rp < 1 ? f3(0.7 * (1 - rp)) : "0";
      if (u < 1.2) raf = requestAnimationFrame(loop); else { el.style.transform = ""; }
    };
    el.style.transform = `translate(-50%, -150px)`;
    raf = requestAnimationFrame(loop);
    return () => { gone = true; cancelAnimationFrame(raf); clearTimeout(hap); audio?.stop(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <button ref={root} type="button" className="cheer-incoming cel-cheer" onClick={onOpen}>
    <span className="cel-cheer-avatar" aria-hidden="true">{(name[0] || "?").toUpperCase()}</span>
    <span className="cel-cheer-text"><strong>{title}</strong><span>{text}</span></span>
    <span ref={icon} className="cel-cheer-icon" aria-hidden="true"><i ref={rip} className="cel-cheer-rip" /><svg viewBox="-46 -46 92 92"><circle r="46" fill="url(#cel-btnG)" /><g ref={mini} /></svg></span>
  </button>;
}
