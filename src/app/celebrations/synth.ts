// The celebration voices (snare, kick, crash, ting, tom, whoosh, wood, bell, rimshot, lock click, swell, whoomp, crackle), all synthesized with Web Audio.
// Ported unchanged from the approved reference: every number is the same. `ctx` is the app-wide audio context, `bus` the gain every voice goes through.

const lerp = (a: number, b: number, p: number) => a + (b - a) * p;

export function createSynth(ctx: AudioContext, bus: AudioNode, noiseBuf: AudioBuffer) {
  function env(g: GainNode, t: number, peak: number, att: number, dec: number) {
    g.gain.value = 0.0001; g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + att);
    g.gain.exponentialRampToValueAtTime(0.0001, t + att + dec);
  }
  function noise(t: number, dur: number) { const s = ctx.createBufferSource(); s.buffer = noiseBuf; s.start(t, Math.random() * 0.7); s.stop(t + dur); return s; }
  function filt(type: BiquadFilterType, f: number, q?: number) { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; if (q) b.Q.value = q; return b; }
  function osc(type: OscillatorType, t: number, dur: number) { const o = ctx.createOscillator(); o.type = type; o.start(t); o.stop(t + dur); return o; }
  function gainNode() { const g = ctx.createGain(); g.gain.value = 0.0001; return g; }

  function snare(t: number, v: number) {
    const g = ctx.createGain(); env(g, t, v * 0.5, 0.002, 0.11); noise(t, 0.2).connect(filt("highpass", 1500)).connect(g).connect(bus);
    const o = osc("triangle", t, 0.15); o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(165, t + 0.06);
    const g2 = ctx.createGain(); env(g2, t, v * 0.3, 0.002, 0.07); o.connect(g2).connect(bus);
  }
  function roll(t0: number, t1: number, v0: number, v1: number) { let t = t0, gap = 0.075; while (t < t1) { snare(t, lerp(v0, v1, (t - t0) / (t1 - t0))); t += gap; gap = Math.max(0.032, gap * 0.9); } }
  function kick(t: number, v: number) {
    const o = osc("sine", t, 0.5); o.frequency.setValueAtTime(170, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    const g = ctx.createGain(); env(g, t, v, 0.003, 0.42); o.connect(g).connect(bus);
    const g2 = ctx.createGain(); env(g2, t, v * 0.25, 0.001, 0.02); noise(t, 0.05).connect(filt("highpass", 3000)).connect(g2).connect(bus);
  }
  function crash(t: number, v: number, dur: number) {
    const g = ctx.createGain(); env(g, t, v * 0.42, 0.004, dur); noise(t, dur + 0.1).connect(filt("highpass", 3800)).connect(g).connect(bus);
    const hp = filt("highpass", 6500), g2 = ctx.createGain(); env(g2, t, v * 0.09, 0.002, dur * 0.6); hp.connect(g2).connect(bus);
    [205.3, 304.4, 369.6, 522.7, 540, 800].forEach((f) => { const o = osc("square", t, dur); o.frequency.value = f * 2.2; o.connect(hp); });
  }
  function ting(t: number, v: number, base: number) {
    ([[base, 0], [base * 1.335, 0.085]] as [number, number][]).forEach(([f, dt]) => {
      const o = osc("sine", t + dt, 0.7); o.frequency.value = f; const g = ctx.createGain(); env(g, t + dt, v * 0.28, 0.004, 0.5); o.connect(g).connect(bus);
      const o2 = osc("sine", t + dt, 0.4); o2.frequency.value = f * 2; const g2 = ctx.createGain(); env(g2, t + dt, v * 0.07, 0.003, 0.25); o2.connect(g2).connect(bus);
    });
  }
  function tom(t: number, v: number, f: number) {
    const o = osc("sine", t, 0.4); o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.07);
    const g = ctx.createGain(); env(g, t, v * 0.7, 0.003, 0.26); o.connect(g).connect(bus);
    const g2 = ctx.createGain(); env(g2, t, v * 0.12, 0.001, 0.03); noise(t, 0.05).connect(filt("bandpass", 2500, 1)).connect(g2).connect(bus);
  }
  function whoosh(t: number, dur: number, v: number) {
    const bp = filt("bandpass", 300, 1.3); bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(3800, t + dur);
    const g = gainNode(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(v, t + dur * 0.75); g.gain.linearRampToValueAtTime(0.0001, t + dur);
    noise(t, dur + 0.05).connect(bp).connect(g).connect(bus);
  }
  function wood(t: number, v: number, f = 1650) {
    ([[f, 0.4], [f * 1.52, 0.15]] as [number, number][]).forEach(([ff, a]) => { const o = osc("sine", t, 0.1); o.frequency.value = ff; const g = ctx.createGain(); env(g, t, v * a, 0.001, 0.05); o.connect(g).connect(bus); });
  }
  function bell(t: number, v: number, f: number, dur = 1.6) {
    ([[1, 1], [2, 0.45], [3.01, 0.2], [4.2, 0.1]] as [number, number][]).forEach(([m, a]) => { const o = osc("sine", t, dur + 0.1); o.frequency.value = f * m; const g = ctx.createGain(); env(g, t, v * a * 0.25, 0.006, dur / (m * 0.6 + 0.4)); o.connect(g).connect(bus); });
  }
  function rimshot(t: number, v: number) {
    snare(t, v * 0.85); wood(t, v * 0.9, 1400);
    const o = osc("square", t, 0.06); o.frequency.value = 880; const g = ctx.createGain(); env(g, t, v * 0.08, 0.001, 0.04); o.connect(filt("bandpass", 950, 4)).connect(g).connect(bus);
  }
  function lockClick(t: number, v: number) {
    wood(t, v * 0.7, 2300);
    const g = ctx.createGain(); env(g, t, v * 0.18, 0.001, 0.025); noise(t, 0.05).connect(filt("bandpass", 3200, 3)).connect(g).connect(bus);
  }
  function swell(t: number, dur: number, v: number) {
    const lp = filt("lowpass", 300, 2); lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(3000, t + dur);
    const g = gainNode(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.45, t + dur); g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.08);
    noise(t, dur + 0.1).connect(lp).connect(g).connect(bus);
    [220, 277.2, 329.6].forEach((f) => {
      const o = osc("sine", t, dur + 0.12); o.frequency.setValueAtTime(f * 0.94, t); o.frequency.exponentialRampToValueAtTime(f, t + dur);
      const g2 = gainNode(); g2.gain.setValueAtTime(0.0001, t); g2.gain.exponentialRampToValueAtTime(v * 0.06, t + dur); g2.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.1);
      o.connect(g2).connect(bus);
    });
  }
  function whoomp(t: number, v: number) {
    const lp = filt("lowpass", 160, 1.5); lp.frequency.setValueAtTime(160, t); lp.frequency.exponentialRampToValueAtTime(2600, t + 0.16); lp.frequency.exponentialRampToValueAtTime(350, t + 0.7);
    const g = gainNode(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v * 0.7, t + 0.08); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.75);
    noise(t, 0.8).connect(lp).connect(g).connect(bus);
    const o = osc("sine", t, 0.5); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.3);
    const g2 = ctx.createGain(); env(g2, t, v * 0.6, 0.03, 0.4); o.connect(g2).connect(bus);
  }
  function crackle(t: number, v: number, dur: number) {
    for (let i = 0; i < 10; i++) { const tt = t + Math.random() * dur; const g = ctx.createGain(); env(g, tt, v * (0.25 + Math.random() * 0.6) * 0.35, 0.001, 0.01 + Math.random() * 0.025); noise(tt, 0.06).connect(filt("highpass", 4500)).connect(g).connect(bus); }
  }
  return { snare, roll, kick, crash, ting, tom, whoosh, wood, bell, rimshot, lockClick, swell, whoomp, crackle };
}
