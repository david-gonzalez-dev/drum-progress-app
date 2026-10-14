// Celebrations engine: which scene belongs to which celebration, the audio rig (compressor + master gain, same numbers as the reference),
// and haptics through Capacitor.
import { Capacitor } from "@capacitor/core";
import { createSynth } from "./synth";
import { makeEnv } from "./core";
import type { Env, SceneInstance, Synth } from "./core";
import { kidsScene, type KidsCfg } from "./scenes/kids";
import { tempoScene, type TempoCfg } from "./scenes/tempo";
import { goalScene, type GoalCfg } from "./scenes/goal";
import { streakScene, type StreakCfg } from "./scenes/streak";
import { rankScene, type RankCfg } from "./scenes/rank";
import { masteredScene, type MasteredCfg } from "./scenes/mastered";
import { challengeScene, type ChallengeCfg } from "./scenes/challenge";
import { onboardScene, type OnboardCfg } from "./scenes/onboard";
import { launchScene, type LaunchCfg } from "./scenes/launch";
import { ratedScene, ratedKidsScene, type RatedCfg } from "./scenes/rated";

export type Celebration =
  | { kind: "kids"; cfg: KidsCfg }
  | { kind: "tempo"; cfg: TempoCfg }
  | { kind: "goal"; cfg: GoalCfg }
  | { kind: "streak"; cfg: StreakCfg }
  | { kind: "rank"; cfg: RankCfg }
  | { kind: "mastered"; cfg: MasteredCfg }
  | { kind: "challenge"; cfg: ChallengeCfg }
  | { kind: "onboard"; cfg: OnboardCfg }
  | { kind: "rated"; cfg: RatedCfg } // adult or kids version (cfg.kids)
  | { kind: "launch"; cfg: LaunchCfg }; // plays on its own at app start, never queued

/* 1 = normal, 2 = medium, 3 = big. The queue plays the smallest first and the biggest last. */
export function sizeOf(c: Celebration): number {
  if (c.kind === "kids") return c.cfg.m ? 3 : 1;
  if (c.kind === "rated") return 1;
  if (c.kind === "streak") return c.cfg.n >= 30 ? 3 : 2;
  if (c.kind === "mastered" || c.kind === "challenge") return 3;
  return 2;
}
export const isAdult = (c: Celebration) => c.kind === "rated" ? !c.cfg.kids : c.kind !== "kids";

export function buildScene(c: Celebration, env: Env): SceneInstance {
  switch (c.kind) {
    case "kids": return kidsScene.build(env, c.cfg);
    case "tempo": return tempoScene.build(env, c.cfg);
    case "goal": return goalScene.build(env, c.cfg);
    case "streak": return streakScene.build(env, c.cfg);
    case "rank": return rankScene.build(env, c.cfg);
    case "mastered": return masteredScene.build(env, c.cfg);
    case "challenge": return challengeScene.build(env, c.cfg);
    case "onboard": return onboardScene.build(env, c.cfg);
    case "launch": return launchScene.build(env, c.cfg);
    case "rated": return (c.cfg.kids ? ratedKidsScene : ratedScene).build(env, c.cfg);
  }
}
export { makeEnv };

/* ---------- audio ---------- */
// Each animation's sound is first rendered offline (same voices, same numbers) into one audio buffer, which is then scaled so its loudest point is a fixed, quiet level,
// and only that buffer is played. So the loudness no longer depends on how many voices a scene stacks, on a compressor or on a master knob.
// PEAK_BIG: full-screen celebrations. PEAK_SMALL: the little inline sounds (save, cheer).
const PEAK_BIG = 0.1, PEAK_SMALL = 0.05;
export type AudioPlay = { stop: () => void; base?: number }; // base: the audio-clock time the scene's t=0 is scheduled at
type OfflineCtor = new (channels: number, length: number, sampleRate: number) => OfflineAudioContext;
async function renderSound(sampleRate: number, seconds: number, adult: boolean, peak: number, fn: (base: number, S: Synth) => void): Promise<AudioBuffer> {
  const Off: OfflineCtor = (window as unknown as { OfflineAudioContext?: OfflineCtor; webkitOfflineAudioContext?: OfflineCtor }).OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: OfflineCtor }).webkitOfflineAudioContext;
  const off = new Off(1, Math.ceil(sampleRate * seconds), sampleRate);
  const noise = off.createBuffer(1, off.sampleRate * 2, off.sampleRate);
  const nd = noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
  // the same chain as the reference (compressor), plus a cut of the deep "boom" below about 140 Hz
  const comp = off.createDynamicsCompressor();
  comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
  const lowCut = off.createBiquadFilter(); lowCut.type = "highpass"; lowCut.frequency.value = 140; lowCut.Q.value = 0.7;
  lowCut.connect(comp); comp.connect(off.destination);
  const bus = off.createGain(); bus.gain.value = adult ? 0.8 : 1; bus.connect(lowCut);
  fn(0.04, createSynth(off as unknown as AudioContext, bus, noise));
  const buf = await off.startRendering();
  const d = buf.getChannelData(0); let top = 0;
  for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > top) top = a; }
  const k = top > 0 ? Math.min(1, peak / top) : 1; // never louder than rendered, always no louder than the fixed peak
  for (let i = 0; i < d.length; i++) d[i] *= k;
  return buf;
}
function playBuffer(ctx: AudioContext, buf: AudioBuffer): AudioPlay {
  const src = ctx.createBufferSource(); src.buffer = buf;
  const g = ctx.createGain(); g.gain.value = 1;
  src.connect(g).connect(ctx.destination);
  const t0 = ctx.currentTime;
  src.start(t0); // the buffer already has the scene's t=0 at 0.04 s
  return { base: t0 + 0.04, stop() { try { g.gain.setTargetAtTime(0, ctx.currentTime, 0.03); window.setTimeout(() => { try { src.stop(); src.disconnect(); g.disconnect(); } catch { /* already gone */ } }, 400); } catch { /* nothing to stop */ } } };
}
export async function startAudio(ctx: AudioContext, adult: boolean, scene: SceneInstance): Promise<AudioPlay> {
  const buf = await renderSound(ctx.sampleRate, Math.min(8, scene.END + 3), adult, PEAK_BIG, (base, S) => scene.audio(base, S));
  return playBuffer(ctx, buf);
}
/* A few sounds on the shared context for the small inline moments (they never create or wake the context themselves: no sound is fine). */
export async function playCustom(ctx: AudioContext, adult: boolean, fn: (base: number, S: Synth) => void): Promise<AudioPlay> {
  return playBuffer(ctx, await renderSound(ctx.sampleRate, 2.5, adult, PEAK_SMALL, fn));
}
/* Reduced motion: only the closing chime. */
export async function playChime(ctx: AudioContext, adult: boolean): Promise<AudioPlay> {
  return playBuffer(ctx, await renderSound(ctx.sampleRate, 2, adult, PEAK_SMALL * 1.5, (base, S) => S.ting(base, 0.8, 1318.5)));
}

/* ---------- haptics ---------- */
// 10-20 ms Light, 25-35 ms Medium, 40 ms or more Heavy (the reference's vibrate durations).
export async function fireHaptic(ms: number) {
  try {
    if (Capacitor.isNativePlatform()) {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      await Haptics.impact({ style: ms >= 40 ? ImpactStyle.Heavy : ms >= 25 ? ImpactStyle.Medium : ImpactStyle.Light });
    } else if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(ms);
  } catch { /* haptics are a nicety */ }
}
/* A long count-up (one tick every few milliseconds) would buzz the phone: ticks closer than 45 ms to the previous one are dropped. */
export function thinHaptics(list: [number, number][]): [number, number][] {
  const out: [number, number][] = []; let last = -1;
  [...list].sort((a, b) => a[1] - b[1]).forEach(([ms, at]) => { if (ms >= 25 || last < 0 || at - last >= 0.045) { out.push([ms, at]); last = at; } });
  return out;
}
