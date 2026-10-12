// Timing for the stroke guide. The metronome's audio scheduler calls enqueueTick() for every click tick with that tick's audio
// time, so strokes are placed on exactly the same clock as the clicks (never a separate timer). Each grid slot is one step; rests
// are steps too, so the position marker keeps moving through them.
import type { Grid } from "./rudiment-grid";

// `grace` is the position of a grace note within its slot's grace list (0 = first); undefined = the main stroke.
export type StrokeEvent = { time: number; index: number; grace?: number };

// Grace notes are tiny, quick strokes just before their main stroke: 45 ms apart, but the whole group never takes more than 60% of
// a slot, so they stay in front of the previous slot's stroke at fast tempos. A flam has one grace, a drag has two.
export const GRACE_SPACING_SECONDS = 0.045;
export function graceSpacing(slotSeconds: number, count: number): number { return Math.min(GRACE_SPACING_SECONDS, (slotSeconds * 0.6) / Math.max(1, count)); }

// Slots per click tick = grid resolution / clicks per beat (a whole number because only compatible clicks are offered).
// Returns the running slot counter; the pattern loops by counter % length, so the loop point never skips or repeats a slot.
// Every grace note is its own event, timed backwards from its main stroke.
export function enqueueTick(queue: StrokeEvent[], counter: number, grid: Grid, clicksPerBeat: number, tickTime: number, bpm: number): number {
  const perTick = grid.perBeat / clicksPerBeat;
  const slotSeconds = 60 / bpm / grid.perBeat;
  for (let j = 0; j < perTick; j++) {
    const index = counter % grid.slots.length;
    const time = tickTime + j * slotSeconds;
    const slot = grid.slots[index];
    if (slot && slot.graces.length) {
      const gap = graceSpacing(slotSeconds, slot.graces.length);
      slot.graces.forEach((_, g) => queue.push({ time: time - (slot.graces.length - g) * gap, index, grace: g }));
    }
    queue.push({ time, index });
    counter += 1;
  }
  return counter;
}

// The latest event already due (its time plus the device's output latency has passed); removes everything up to and including it.
export function dueEvent(queue: StrokeEvent[], now: number, latency: number): StrokeEvent | null {
  let hit: StrokeEvent | null = null;
  while (queue.length && queue[0].time + latency <= now) hit = queue.shift()!;
  return hit;
}
