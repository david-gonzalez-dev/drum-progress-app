"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { CEL_TEXT, type Lang } from "./text";
import { buildScene, fireHaptic, isAdult, makeEnv, playChime, sizeOf, startAudio, thinHaptics, type AudioPlay, type Celebration } from "./engine";

// The full-screen celebration moment: runs the requestAnimationFrame loop for one scene, handles tap-to-skip, shows Continue at the end,
// and the hook below queues several celebrations (smallest first, biggest last, one Continue each, at most 3 at a time).

type Item = Celebration & { id: number };

function Overlay({ item, getAudio, language, onDone, silent }: { item: Item; getAudio: () => AudioContext; language: Lang; onDone: () => void; silent?: boolean }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const skipRef = useRef<() => void>(() => {});
  const [ready, setReady] = useState(false);
  const [showCont, setShowCont] = useState(false);
  const [contText, setContText] = useState<string | null>(null);
  const [noCont, setNoCont] = useState(false);
  const adult = isAdult(item);
  const T = CEL_TEXT[language];

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    let raf = 0, cancelled = false, shown = false, start = 0, END = 0;
    let audio: AudioPlay | null = null;
    const hapticTimers: number[] = [];
    const env = makeEnv(svg);
    const reduced = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    // scenes without a Continue button (app launch) close by themselves a moment after the end frame
    const finish = () => { hapticTimers.push(window.setTimeout(onDone, 300)); };
    const killAudio = () => { audio?.stop(); audio = null; hapticTimers.forEach((h) => window.clearTimeout(h)); hapticTimers.length = 0; };
    skipRef.current = () => { if (END && (performance.now() - start) / 1000 < END) { killAudio(); start = performance.now() - END * 1000; } };
    (async () => {
      // the fonts are lazy: wait (briefly) so the first frame is not drawn in a fallback font
      try { if (document.fonts) await Promise.race([Promise.all([document.fonts.load("800 60px 'DM Sans'"), document.fonts.load("800 60px 'Barlow Condensed'")]), new Promise((r) => window.setTimeout(r, 450))]); } catch { /* fine */ }
      if (cancelled) return;
      env.$("bg").setAttribute("fill", adult ? "url(#cel-abg)" : "#111111");
      env.glint(-0.2); env.setFlash(0);
      const st = buildScene(item, env);
      END = st.END;
      setContText(st.cont ?? null); setNoCont(!!st.noContinue);
      // The shared audio context is woken up in the tap that led here; if it is still asleep, give it a moment before the sound starts.
      let ctx: AudioContext | null = null;
      try { if (!silent) { ctx = getAudio(); if (ctx.state !== "running") await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => window.setTimeout(r, 300))]); } } catch { ctx = null; }
      if (cancelled) return;
      const audible = !!ctx && ctx.state === "running";
      const hap = thinHaptics(st.haptics);
      if (reduced) {
        // Reduced motion: only the end frame (a 150 ms fade), the closing chime and one haptic tap. No shake, flash or particles.
        st.render(END);
        setReady(true); shown = true;
        if (st.noContinue) finish(); else setShowCont(true);
        if (audible && ctx) audio = playChime(ctx, adult);
        const strongest = hap.reduce((m, h) => Math.max(m, h[0]), 0);
        if (strongest) void fireHaptic(strongest);
        // keep the idle motion off as well: the end frame stays still
        return;
      }
      let lead = 0;
      if (audible && ctx) { lead = 0.04; audio = startAudio(ctx, adult, st); }
      hap.forEach(([ms, at]) => hapticTimers.push(window.setTimeout(() => void fireHaptic(ms), at * 1000)));
      start = performance.now() + lead * 1000;
      st.render(0);
      setReady(true);
      const loop = (now: number) => {
        const t = Math.max(0, (now - start) / 1000);
        st.render(t);
        if (t >= END && !shown) { shown = true; if (st.noContinue) finish(); else setShowCont(true); }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    })();
    return () => { cancelled = true; cancelAnimationFrame(raf); killAudio(); };
  }, [item.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div className={`cel-overlay ${adult ? "adult" : "kids"}${ready ? " ready" : ""}`} role="dialog" aria-modal="true" onClick={() => skipRef.current()}>
    <div className="cel-frame">
      <svg ref={svgRef} className="cel-svg" viewBox="-500 -1000 1000 2000" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        {/* bigger than the 1:2 picture, so the background also fills the bars on tall or wide screens */}
        <rect id="bg" x="-3000" y="-3000" width="6000" height="6000" fill="#111111" />
        <g id="stage" />
        <rect id="flash" x="-3000" y="-3000" width="6000" height="6000" fill="#ff6b1a" opacity="0" pointerEvents="none" />
      </svg>
      <div className="cel-cont-wrap">
        {!noCont && <button type="button" className={showCont ? "cel-continue show" : "cel-continue"} tabIndex={showCont ? 0 : -1} onClick={(e) => { e.stopPropagation(); onDone(); }}>{contText ?? (adult ? T.cont : T.contKids)}</button>}
      </div>
    </div>
  </div>;
}

export function useCelebrations({ getAudio, language }: { getAudio: () => AudioContext; language: Lang }) {
  const [queue, setQueue] = useState<Item[]>([]);
  const [waiting, setWaiting] = useState(false);
  const pending = useRef<Item[]>([]);
  const timer = useRef<number | null>(null);
  const firstAt = useRef(0);
  const nextId = useRef(1);
  // How many celebrations are still to be shown (waiting or on screen); whenIdle() resolves when it is zero again.
  const outstanding = useRef(0);
  const idleWaiters = useRef<(() => void)[]>([]);
  const settle = useCallback(() => { if (outstanding.current <= 0) { outstanding.current = 0; const w = idleWaiters.current; idleWaiters.current = []; w.forEach((r) => r()); } }, []);
  // A short pause first: the streak celebration is queued by an effect that runs just after the save is committed.
  const whenIdle = useCallback(() => new Promise<void>((resolve) => window.setTimeout(() => { if (outstanding.current <= 0) resolve(); else idleWaiters.current.push(resolve); }, 80)), []);

  const flush = useCallback(() => {
    timer.current = null;
    const list = pending.current; pending.current = [];
    setWaiting(false);
    if (!list.length) return;
    // One of each kind (a later one replaces an earlier one unless the earlier one is bigger), then smallest first, biggest last, at most 3 (the smallest are dropped).
    const byKind = new Map<string, Item>();
    list.forEach((c) => { const key = c.kind === "challenge" ? `challenge-${c.id}` : c.kind; const old = byKind.get(key); if (!old || sizeOf(c) >= sizeOf(old)) byKind.set(key, c); });
    const order = ["rated", "kids", "tempo", "goal", "rank", "streak", "onboard", "mastered", "challenge"];
    const sorted = [...byKind.values()].sort((a, b) => sizeOf(a) - sizeOf(b) || order.indexOf(a.kind) - order.indexOf(b.kind)).slice(-3);
    outstanding.current -= list.length - sorted.length;
    setQueue((q) => [...q, ...sorted]);
    settle();
  }, [settle]);

  // Celebrations that fire together (after one save) are collected for a moment so they can be ordered and capped.
  const celebrate = useCallback((c: Celebration) => {
    pending.current.push({ ...c, id: nextId.current++ } as Item);
    outstanding.current += 1;
    setWaiting(true);
    const now = performance.now();
    if (!firstAt.current || !timer.current) firstAt.current = now;
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(flush, Math.max(0, Math.min(300, 2500 - (now - firstAt.current))));
  }, [flush]);
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const done = useCallback(() => { outstanding.current -= 1; setQueue((q) => q.slice(1)); settle(); }, [settle]);
  const overlay = queue.length ? <Overlay key={queue[0].id} item={queue[0]} getAudio={getAudio} language={language} onDone={done} /> : null;
  return { celebrate, overlay, busy: queue.length > 0 || waiting, whenIdle };
}

// The app-start animation: plays once over everything, silent, closes by itself.
export function LaunchSplash({ onDone }: { onDone: () => void }) {
  return <Overlay item={{ kind: "launch", cfg: { word: "DrumSkills" }, id: 0 }} getAudio={() => { throw new Error("silent"); }} language="en" onDone={onDone} silent />;
}
