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
type Rig = { comp: DynamicsCompressorNode; noise: AudioBuffer };
const rigs = new WeakMap<AudioContext, Rig>();
function rigFor(ctx: AudioContext): Rig {
  let rig = rigs.get(ctx);
  if (!rig) {
    const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
    const master = ctx.createGain(); master.gain.value = 0.85 * 0.3; // all celebrations at 30% of the reference volume
    comp.connect(master).connect(ctx.destination);
    // the deep "boom" (kick, whoomp, low toms) is cut below about 140 Hz; the sounds keep their snap and everything else
    const lowCut = ctx.createBiquadFilter(); lowCut.type = "highpass"; lowCut.frequency.value = 140; lowCut.Q.value = 0.7;
    lowCut.connect(comp);
    rig = { comp: lowCut as unknown as DynamicsCompressorNode, noise }; rigs.set(ctx, rig);
  }
  return rig;
}
export type AudioPlay = { stop: () => void; base?: number }; // base: the audio-clock time the scene's t=0 is scheduled at
/* Schedules the whole scene on the audio clock, 40 ms ahead; the visual clock starts at the same moment. Adults play on a quieter bus (0.8). */
export function startAudio(ctx: AudioContext, adult: boolean, scene: SceneInstance): AudioPlay {
  const rig = rigFor(ctx);
  const bus = ctx.createGain(); bus.gain.value = adult ? 0.8 : 1; bus.connect(rig.comp);
  const base = ctx.currentTime + 0.04;
  scene.audio(base, createSynth(ctx, bus, rig.noise));
  return { base, stop() { try { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); window.setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, 400); } catch { /* nothing to stop */ } } };
}
/* A few sounds on the shared context for the small inline moments (they never create or wake the context themselves: no sound is fine). */
export function playCustom(ctx: AudioContext, adult: boolean, fn: (base: number, S: Synth) => void): AudioPlay {
  const rig = rigFor(ctx);
  const bus = ctx.createGain(); bus.gain.value = adult ? 0.8 : 1; bus.connect(rig.comp);
  fn(ctx.currentTime + 0.04, createSynth(ctx, bus, rig.noise));
  return { stop() { try { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); window.setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, 400); } catch { /* nothing to stop */ } } };
}
/* Reduced motion: only the closing chime. */
export function playChime(ctx: AudioContext, adult: boolean): AudioPlay {
  const rig = rigFor(ctx);
  const bus = ctx.createGain(); bus.gain.value = adult ? 0.8 : 1; bus.connect(rig.comp);
  createSynth(ctx, bus, rig.noise).ting(ctx.currentTime + 0.04, 0.8, 1318.5);
  return { stop() { try { bus.gain.setTargetAtTime(0, ctx.currentTime, 0.03); window.setTimeout(() => { try { bus.disconnect(); } catch { /* already gone */ } }, 400); } catch { /* nothing to stop */ } } };
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
